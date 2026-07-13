DROP POLICY IF EXISTS "newspapers deletable by organization owners" ON public.newspapers;
DROP POLICY IF EXISTS "newspapers deletable by organization editors" ON public.newspapers;

CREATE POLICY "newspapers deletable by organization editors"
  ON public.newspapers
  FOR DELETE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      public.current_user_has_permission(organization_id::UUID, 'edit_articles')
      OR public.current_user_has_permission(organization_id::UUID, 'delete_newspapers')
    )
  );
