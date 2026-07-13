-- Allow editors to save draft and submitted social posts for chief editor review.
-- This is a follow-up policy refresh in case the original social_posts migration
-- has already been applied in Supabase.

DROP POLICY IF EXISTS "social posts insertable by social editors"
  ON public.social_posts;
DROP POLICY IF EXISTS "social posts updatable by social editors"
  ON public.social_posts;

CREATE POLICY "social posts insertable by social editors"
  ON public.social_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_org_member(organization_id, auth.uid())
    AND (
      public.current_user_has_permission(organization_id, 'create_articles')
      OR public.current_user_has_permission(organization_id, 'submit_for_review')
      OR public.current_user_has_permission(organization_id, 'publish_articles')
    )
    AND (
      newspaper_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.newspapers n
        WHERE n.id = newspaper_id
          AND n.organization_id = organization_id::TEXT
      )
    )
    AND (
      status NOT IN ('under_review', 'approved', 'rejected', 'scheduled', 'published')
      OR (
        status IN ('under_review', 'approved', 'rejected')
        AND public.current_user_has_permission(organization_id, 'approve_articles')
      )
      OR (
        status IN ('scheduled', 'published')
        AND public.current_user_has_permission(organization_id, 'publish_articles')
      )
    )
  );

CREATE POLICY "social posts updatable by social editors"
  ON public.social_posts
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(organization_id, auth.uid())
    AND (
      public.current_user_has_permission(organization_id, 'create_articles')
      OR public.current_user_has_permission(organization_id, 'submit_for_review')
      OR public.current_user_has_permission(organization_id, 'publish_articles')
    )
  )
  WITH CHECK (
    public.is_org_member(organization_id, auth.uid())
    AND (
      public.current_user_has_permission(organization_id, 'create_articles')
      OR public.current_user_has_permission(organization_id, 'submit_for_review')
      OR public.current_user_has_permission(organization_id, 'publish_articles')
    )
    AND (
      newspaper_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.newspapers n
        WHERE n.id = newspaper_id
          AND n.organization_id = organization_id::TEXT
      )
    )
    AND (
      status NOT IN ('under_review', 'approved', 'rejected', 'scheduled', 'published')
      OR (
        status IN ('under_review', 'approved', 'rejected')
        AND public.current_user_has_permission(organization_id, 'approve_articles')
      )
      OR (
        status IN ('scheduled', 'published')
        AND public.current_user_has_permission(organization_id, 'publish_articles')
      )
    )
  );

NOTIFY pgrst, 'reload schema';
