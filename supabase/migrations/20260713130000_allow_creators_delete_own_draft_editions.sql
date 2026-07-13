-- Let editors delete their own editable editions from My Editions.
-- Owners/admins keep full delete access through delete_newspapers.

DROP POLICY IF EXISTS "newspapers deletable by organization owners" ON public.newspapers;

CREATE POLICY "newspapers deletable by organization owners"
  ON public.newspapers
  FOR DELETE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      public.current_user_has_permission(organization_id::UUID, 'delete_newspapers')
      OR (
        created_by = auth.uid()
        AND status IN ('draft', 'rejected')
        AND public.current_user_has_permission(organization_id::UUID, 'edit_articles')
      )
    )
  );

NOTIFY pgrst, 'reload schema';
