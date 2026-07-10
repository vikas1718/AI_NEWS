CREATE OR REPLACE FUNCTION public.leave_organization(p_member_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member public.organization_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_member
  FROM public.organization_members
  WHERE id = p_member_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active organization membership not found';
  END IF;

  UPDATE public.organization_members
  SET status = 'removed', updated_at = now()
  WHERE id = v_member.id;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, target_table, target_id)
  VALUES (
    v_member.organization_id,
    auth.uid(),
    'member.left',
    'organization_members',
    v_member.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.leave_organization(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_organization(UUID) TO authenticated, service_role;
