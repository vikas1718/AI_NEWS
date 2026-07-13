-- Enforce organization-based data isolation across editorial tables.
-- This removes old global-role policies that could expose data outside the
-- organization membership model.

ALTER TABLE public.newspapers
  ADD COLUMN IF NOT EXISTS organization_id TEXT;

CREATE INDEX IF NOT EXISTS newspapers_organization_idx
  ON public.newspapers(organization_id);

DROP POLICY IF EXISTS "editor sees own newspapers" ON public.newspapers;
DROP POLICY IF EXISTS "editor creates newspapers" ON public.newspapers;
DROP POLICY IF EXISTS "editor updates own newspapers" ON public.newspapers;
DROP POLICY IF EXISTS "editor deletes own drafts" ON public.newspapers;
DROP POLICY IF EXISTS "newspapers readable by organization members" ON public.newspapers;
DROP POLICY IF EXISTS "newspapers insertable by organization editors" ON public.newspapers;
DROP POLICY IF EXISTS "newspapers updatable by organization editors and reviewers" ON public.newspapers;
DROP POLICY IF EXISTS "newspapers deletable by organization owners" ON public.newspapers;

CREATE POLICY "newspapers readable by organization members"
  ON public.newspapers
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_org_member(organization_id::UUID, auth.uid())
  );

CREATE POLICY "newspapers insertable by organization editors"
  ON public.newspapers
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND organization_id IS NOT NULL
    AND organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.current_user_has_permission(organization_id::UUID, 'create_articles')
  );

CREATE POLICY "newspapers updatable by organization editors and reviewers"
  ON public.newspapers
  FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      public.current_user_has_permission(organization_id::UUID, 'edit_articles')
      OR public.current_user_has_permission(organization_id::UUID, 'review_articles')
      OR public.current_user_has_permission(organization_id::UUID, 'publish_articles')
    )
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      public.current_user_has_permission(organization_id::UUID, 'edit_articles')
      OR public.current_user_has_permission(organization_id::UUID, 'review_articles')
      OR public.current_user_has_permission(organization_id::UUID, 'publish_articles')
    )
  );

CREATE POLICY "newspapers deletable by organization owners"
  ON public.newspapers
  FOR DELETE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.current_user_has_permission(organization_id::UUID, 'delete_newspapers')
  );

DROP POLICY IF EXISTS "articles visible via parent" ON public.articles;
DROP POLICY IF EXISTS "articles insertable by owner" ON public.articles;
DROP POLICY IF EXISTS "articles updatable by owner or chief" ON public.articles;
DROP POLICY IF EXISTS "articles deletable by owner" ON public.articles;
DROP POLICY IF EXISTS "articles readable by organization members" ON public.articles;
DROP POLICY IF EXISTS "articles insertable by organization editors" ON public.articles;
DROP POLICY IF EXISTS "articles updatable by organization editors" ON public.articles;
DROP POLICY IF EXISTS "articles deletable by organization editors" ON public.articles;

CREATE POLICY "articles readable by organization members"
  ON public.articles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.is_org_member(n.organization_id::UUID, auth.uid())
    )
  );

CREATE POLICY "articles insertable by organization editors"
  ON public.articles
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'create_articles')
    )
  );

CREATE POLICY "articles updatable by organization editors"
  ON public.articles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'edit_articles')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'edit_articles')
    )
  );

CREATE POLICY "articles deletable by organization editors"
  ON public.articles
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'edit_articles')
    )
  );

DROP POLICY IF EXISTS "layouts visible via parent" ON public.layouts;
DROP POLICY IF EXISTS "layouts writable by owner" ON public.layouts;
DROP POLICY IF EXISTS "layouts readable by organization members" ON public.layouts;
DROP POLICY IF EXISTS "layouts writable by organization layout editors" ON public.layouts;

CREATE POLICY "layouts readable by organization members"
  ON public.layouts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.is_org_member(n.organization_id::UUID, auth.uid())
    )
  );

CREATE POLICY "layouts writable by organization layout editors"
  ON public.layouts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'access_layout_generation')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'access_layout_generation')
    )
  );

DROP POLICY IF EXISTS "reviews visible via parent" ON public.reviews;
DROP POLICY IF EXISTS "reviews insertable by chief" ON public.reviews;
DROP POLICY IF EXISTS "reviews readable by organization members" ON public.reviews;
DROP POLICY IF EXISTS "reviews insertable by organization reviewers" ON public.reviews;

CREATE POLICY "reviews readable by organization members"
  ON public.reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.is_org_member(n.organization_id::UUID, auth.uid())
    )
  );

CREATE POLICY "reviews insertable by organization reviewers"
  ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    chief_editor_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'review_articles')
    )
  );

DROP POLICY IF EXISTS "publications visible via parent" ON public.publications;
DROP POLICY IF EXISTS "publications writable via parent" ON public.publications;
DROP POLICY IF EXISTS "publications readable by organization members" ON public.publications;
DROP POLICY IF EXISTS "publications writable by organization publishers" ON public.publications;

CREATE POLICY "publications readable by organization members"
  ON public.publications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.is_org_member(n.organization_id::UUID, auth.uid())
    )
  );

CREATE POLICY "publications writable by organization publishers"
  ON public.publications
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'publish_articles')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'publish_articles')
    )
  );
