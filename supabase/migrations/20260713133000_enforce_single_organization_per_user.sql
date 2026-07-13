-- MVP workspace rule: one account can belong to one active organization only.
-- This prevents future multi-organization memberships without rewriting existing history.

CREATE OR REPLACE FUNCTION public.user_has_active_organization(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.user_id = _user_id
      AND om.status = 'active'
  );
$$;

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
  v_email TEXT;
  v_full_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF length(trim(coalesce(p_name, ''))) = 0 THEN
    RAISE EXCEPTION 'Organization name is required';
  END IF;

  IF public.user_has_active_organization(auth.uid()) THEN
    RAISE EXCEPTION 'This account already has an organization workspace';
  END IF;

  v_email := lower(trim(coalesce(auth.jwt()->>'email', auth.uid()::TEXT)));
  v_full_name := COALESCE(
    NULLIF(trim(auth.jwt()->'user_metadata'->>'full_name'), ''),
    NULLIF(trim(auth.jwt()->'user_metadata'->>'name'), ''),
    v_email
  );

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (auth.uid(), v_email, v_full_name)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name);

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

  RETURN v_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_organization_invitation(
  p_organization_id TEXT,
  p_organization_name TEXT,
  p_email TEXT,
  p_role TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation_id UUID;
  v_existing_invitation_id UUID;
  v_invitee_user_id UUID;
  v_organization_uuid UUID;
  v_organization_name TEXT;
  v_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_email := lower(trim(coalesce(p_email, '')));
  IF v_email = '' THEN
    RAISE EXCEPTION 'Email address is required';
  END IF;

  IF p_role NOT IN ('chief_editor', 'editor') THEN
    RAISE EXCEPTION 'Invalid invitation role';
  END IF;

  BEGIN
    v_organization_uuid := nullif(trim(coalesce(p_organization_id, '')), '')::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'A valid organization id is required';
  END;

  IF NOT public.user_has_permission(auth.uid(), v_organization_uuid, 'invite_members') THEN
    RAISE EXCEPTION 'You do not have permission to invite members';
  END IF;

  SELECT name INTO v_organization_name
  FROM public.organizations
  WHERE id = v_organization_uuid;

  SELECT id INTO v_invitee_user_id
  FROM public.profiles
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_invitee_user_id IS NOT NULL AND public.user_has_active_organization(v_invitee_user_id) THEN
    RAISE EXCEPTION 'This user already belongs to an organization workspace';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_invitations
    WHERE lower(email) = v_email
      AND status = 'pending'
      AND organization_id <> v_organization_uuid::TEXT
  ) THEN
    RAISE EXCEPTION 'This email already has a pending organization invitation';
  END IF;

  SELECT id INTO v_existing_invitation_id
  FROM public.organization_invitations
  WHERE organization_id = v_organization_uuid::TEXT
    AND lower(email) = v_email
    AND status = 'pending'
  LIMIT 1;

  IF v_existing_invitation_id IS NOT NULL THEN
    UPDATE public.organization_invitations
    SET role = p_role,
        organization_name = COALESCE(
          nullif(trim(coalesce(p_organization_name, '')), ''),
          v_organization_name
        ),
        invited_by = auth.uid(),
        invitee_user_id = v_invitee_user_id,
        updated_at = now()
    WHERE id = v_existing_invitation_id
    RETURNING id INTO v_invitation_id;
  ELSE
    INSERT INTO public.organization_invitations (
      organization_id,
      organization_name,
      email,
      role,
      invited_by,
      invitee_user_id
    )
    VALUES (
      v_organization_uuid::TEXT,
      COALESCE(nullif(trim(coalesce(p_organization_name, '')), ''), v_organization_name),
      v_email,
      p_role,
      auth.uid(),
      v_invitee_user_id
    )
    RETURNING id INTO v_invitation_id;
  END IF;

  RETURN v_invitation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_organization_invitation(
  p_organization_id UUID,
  p_email TEXT,
  p_role TEXT
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.create_organization_invitation(p_organization_id::TEXT, NULL, p_email, p_role);
$$;

CREATE OR REPLACE FUNCTION public.accept_organization_invitation(p_invitation_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation public.organization_invitations%ROWTYPE;
  v_auth_email TEXT;
  v_full_name TEXT;
  v_organization_uuid UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF public.user_has_active_organization(auth.uid()) THEN
    RAISE EXCEPTION 'This account already has an organization workspace';
  END IF;

  v_auth_email := lower(trim(coalesce(auth.jwt()->>'email', '')));
  IF v_auth_email = '' THEN
    RAISE EXCEPTION 'Authenticated email is required to accept an invitation';
  END IF;

  SELECT *
  INTO v_invitation
  FROM public.organization_invitations
  WHERE id = p_invitation_id
    AND status = 'pending'
    AND lower(email) = v_auth_email
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found for authenticated email';
  END IF;

  v_full_name := COALESCE(
    NULLIF(trim(auth.jwt()->'user_metadata'->>'full_name'), ''),
    NULLIF(trim(auth.jwt()->'user_metadata'->>'name'), ''),
    v_auth_email
  );

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (auth.uid(), v_auth_email, v_full_name)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name);

  BEGIN
    v_organization_uuid := v_invitation.organization_id::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_organization_uuid := NULL;
  END;

  IF v_organization_uuid IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.organizations WHERE id = v_organization_uuid) THEN
    INSERT INTO public.organization_members (
      organization_id,
      user_id,
      role,
      status,
      invited_by,
      joined_at
    )
    VALUES (
      v_organization_uuid,
      auth.uid(),
      v_invitation.role,
      'active',
      v_invitation.invited_by,
      now()
    );
  END IF;

  UPDATE public.organization_invitations
  SET status = 'accepted',
      invitee_user_id = auth.uid(),
      responded_at = now(),
      updated_at = now()
  WHERE id = p_invitation_id;

  RETURN COALESCE(v_organization_uuid, v_invitation.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_multiple_active_organization_memberships()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = NEW.user_id
        AND om.status = 'active'
        AND om.organization_id <> NEW.organization_id
        AND (TG_OP = 'INSERT' OR om.id <> NEW.id)
    ) THEN
    RAISE EXCEPTION 'This account already has an organization workspace';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_multiple_active_organization_memberships
  ON public.organization_members;
CREATE TRIGGER prevent_multiple_active_organization_memberships
  BEFORE INSERT OR UPDATE OF organization_id, user_id, status
  ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_multiple_active_organization_memberships();

NOTIFY pgrst, 'reload schema';
