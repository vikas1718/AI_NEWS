-- Allow newspaper access through the active organization role model.
-- The original policies used the old global user_roles table, which can block
-- organization owners/editors from creating editions.
ALTER TABLE public.newspapers
  ADD COLUMN IF NOT EXISTS organization_id TEXT;

CREATE INDEX IF NOT EXISTS newspapers_organization_idx
  ON public.newspapers(organization_id);

DROP POLICY IF EXISTS "newspapers readable by organization members" ON public.newspapers;
CREATE POLICY "newspapers readable by organization members"
  ON public.newspapers
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.is_org_member(organization_id::UUID, auth.uid())
  );

DROP POLICY IF EXISTS "newspapers insertable by organization editors" ON public.newspapers;
CREATE POLICY "newspapers insertable by organization editors"
  ON public.newspapers
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND organization_id IS NOT NULL
    AND organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.current_user_has_permission(organization_id::UUID, 'create_articles')
  );

DROP POLICY IF EXISTS "newspapers updatable by organization editors and reviewers" ON public.newspapers;
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
