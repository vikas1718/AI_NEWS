DROP POLICY IF EXISTS "organizations readable by pending invitees" ON public.organizations;

CREATE POLICY "organizations readable by pending invitees" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_invitations oi
      WHERE oi.organization_id = id
        AND oi.status = 'pending'
        AND (
          oi.invitee_user_id = auth.uid()
          OR lower(oi.email) = lower(coalesce(auth.jwt()->>'email', ''))
        )
    )
  );

GRANT EXECUTE ON FUNCTION public.decline_organization_invitation(UUID) TO authenticated, service_role;
