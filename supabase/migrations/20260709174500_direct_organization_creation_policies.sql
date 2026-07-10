GRANT INSERT ON public.organizations TO authenticated;
GRANT INSERT ON public.organization_members TO authenticated;

DROP POLICY IF EXISTS "organizations readable by creator" ON public.organizations;
CREATE POLICY "organizations readable by creator" ON public.organizations
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "organizations insertable by creator" ON public.organizations;
CREATE POLICY "organizations insertable by creator" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND length(trim(coalesce(name, ''))) > 0
  );

DROP POLICY IF EXISTS "owner membership insertable by organization creator" ON public.organization_members;
CREATE POLICY "owner membership insertable by organization creator" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND invited_by = auth.uid()
    AND role = 'owner'
    AND status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = organization_id
        AND o.created_by = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
