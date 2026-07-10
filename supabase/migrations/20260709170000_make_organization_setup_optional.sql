CREATE OR REPLACE FUNCTION public.create_organization(
  p_name TEXT,
  p_logo_url TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_phone_number TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_organization_type TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF length(trim(coalesce(p_name, ''))) = 0 THEN
    RAISE EXCEPTION 'Organization name is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = auth.uid()
      AND role = 'owner'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Each user can initially own only one organization';
  END IF;

  INSERT INTO public.organizations (
    name,
    logo_url,
    description,
    email,
    phone_number,
    address,
    organization_type,
    created_by
  )
  VALUES (
    trim(p_name),
    nullif(trim(coalesce(p_logo_url, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_phone_number, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_organization_type, '')), ''),
    auth.uid()
  )
  RETURNING id INTO v_organization_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, status, invited_by)
  VALUES (v_organization_id, auth.uid(), 'owner', 'active', auth.uid());

  INSERT INTO public.audit_logs (organization_id, actor_id, action, target_table, target_id)
  VALUES (v_organization_id, auth.uid(), 'organization.created', 'organizations', v_organization_id);

  RETURN v_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
