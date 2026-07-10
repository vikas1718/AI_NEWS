CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.roles (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.permissions (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_key TEXT NOT NULL REFERENCES public.roles(key),
  permission_key TEXT NOT NULL REFERENCES public.permissions(key),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_key, permission_key)
);

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  description TEXT,
  email TEXT,
  phone_number TEXT,
  address TEXT,
  organization_type TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.organizations
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS organization_type TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'chief_editor', 'editor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed', 'suspended')),
  invited_by UUID REFERENCES public.profiles(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

ALTER TABLE IF EXISTS public.organization_members
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT,
  organization_name TEXT,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('chief_editor', 'editor')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'declined', 'cancelled')
  ),
  invited_by UUID NOT NULL REFERENCES public.profiles(id),
  invitee_user_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

ALTER TABLE IF EXISTS public.organization_invitations
  ADD COLUMN IF NOT EXISTS organization_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS organization_members_one_owner_per_org
  ON public.organization_members(organization_id)
  WHERE role = 'owner' AND status = 'active';

CREATE INDEX IF NOT EXISTS organization_members_org_idx
  ON public.organization_members(organization_id);

CREATE INDEX IF NOT EXISTS organization_members_user_idx
  ON public.organization_members(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_pending_email_idx
  ON public.organization_invitations (coalesce(organization_id, ''), lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS organization_invitations_email_idx
  ON public.organization_invitations(lower(email));

CREATE INDEX IF NOT EXISTS organization_invitations_org_idx
  ON public.organization_invitations(organization_id);

CREATE INDEX IF NOT EXISTS organization_invitations_invitee_idx
  ON public.organization_invitations(invitee_user_id);

CREATE OR REPLACE FUNCTION public.is_org_member(_organization_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = _organization_id
      AND om.user_id = _user_id
      AND om.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_org_role(_organization_id UUID, _user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.role
  FROM public.organization_members om
  WHERE om.organization_id = _organization_id
    AND om.user_id = _user_id
    AND om.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_has_permission(
  _user_id UUID,
  _organization_id UUID,
  _permission_key TEXT
)
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
      AND om.organization_id = _organization_id
      AND om.status = 'active'
      AND (
        om.role = 'owner'
        OR (
          om.role = 'chief_editor'
          AND _permission_key IN (
            'manage_organization',
            'invite_members',
            'remove_members',
            'change_roles',
            'manage_team',
            'view_dashboard',
            'review_articles',
            'approve_articles',
            'publish_articles',
            'manage_editorial_workflow',
            'access_ai_generation',
            'access_layout_generation',
            'organization_settings',
            'user_management'
          )
        )
        OR (
          om.role = 'editor'
          AND _permission_key IN (
            'view_dashboard',
            'create_articles',
            'edit_articles',
            'access_ai_generation',
            'access_layout_generation',
            'access_assigned_pages',
            'save_drafts'
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_permission(
  _organization_id UUID,
  _permission_key TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_permission(auth.uid(), _organization_id, _permission_key);
$$;

CREATE OR REPLACE FUNCTION public.user_default_organization(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.organization_id
  FROM public.organization_members om
  WHERE om.user_id = _user_id
    AND om.status = 'active'
  ORDER BY
    CASE WHEN om.role = 'owner' THEN 0 ELSE 1 END,
    om.joined_at
  LIMIT 1;
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

  IF EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = auth.uid()
      AND role = 'owner'
      AND status = 'active'
  ) THEN
    SELECT organization_id INTO v_organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
      AND role = 'owner'
      AND status = 'active'
    ORDER BY joined_at
    LIMIT 1;

    RETURN v_organization_id;
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
    )
    ON CONFLICT (organization_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          status = 'active',
          invited_by = EXCLUDED.invited_by,
          joined_at = now(),
          updated_at = now();
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

CREATE OR REPLACE FUNCTION public.decline_organization_invitation(p_invitation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_auth_email := lower(trim(coalesce(auth.jwt()->>'email', '')));
  IF v_auth_email = '' THEN
    RAISE EXCEPTION 'Authenticated email is required to decline an invitation';
  END IF;

  UPDATE public.organization_invitations
  SET status = 'declined',
      invitee_user_id = auth.uid(),
      responded_at = now(),
      updated_at = now()
  WHERE id = p_invitation_id
    AND status = 'pending'
    AND lower(email) = v_auth_email;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found for authenticated email';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_organization_member_role(
  p_member_id UUID,
  p_role TEXT
)
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

  IF p_role NOT IN ('chief_editor', 'editor') THEN
    RAISE EXCEPTION 'Invalid member role';
  END IF;

  SELECT * INTO v_member
  FROM public.organization_members
  WHERE id = p_member_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF v_member.role = 'owner' THEN
    RAISE EXCEPTION 'Owner role cannot be changed';
  END IF;

  IF NOT public.user_has_permission(auth.uid(), v_member.organization_id, 'change_roles') THEN
    RAISE EXCEPTION 'You do not have permission to change roles';
  END IF;

  UPDATE public.organization_members
  SET role = p_role,
      updated_at = now()
  WHERE id = p_member_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_organization_member(p_member_id UUID)
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
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF v_member.role = 'owner' THEN
    RAISE EXCEPTION 'The organization owner cannot be removed';
  END IF;

  IF NOT public.user_has_permission(auth.uid(), v_member.organization_id, 'remove_members') THEN
    RAISE EXCEPTION 'You do not have permission to remove members';
  END IF;

  UPDATE public.organization_members
  SET status = 'removed',
      updated_at = now()
  WHERE id = p_member_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_organization(p_member_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.organization_members
  SET status = 'removed',
      updated_at = now()
  WHERE id = p_member_id
    AND user_id = auth.uid()
    AND status = 'active'
    AND role <> 'owner';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active non-owner organization membership not found';
  END IF;
END;
$$;

ALTER TABLE IF EXISTS public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.organization_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles readable by authenticated" ON public.roles;
CREATE POLICY "roles readable by authenticated"
  ON public.roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "permissions readable by authenticated" ON public.permissions;
CREATE POLICY "permissions readable by authenticated"
  ON public.permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "role permissions readable by authenticated" ON public.role_permissions;
CREATE POLICY "role permissions readable by authenticated"
  ON public.role_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "organizations readable by members" ON public.organizations;
CREATE POLICY "organizations readable by members"
  ON public.organizations
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_org_member(id, auth.uid()));

DROP POLICY IF EXISTS "organizations insertable by creator" ON public.organizations;
CREATE POLICY "organizations insertable by creator"
  ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND length(trim(coalesce(name, ''))) > 0);

DROP POLICY IF EXISTS "organizations updatable by managers" ON public.organizations;
CREATE POLICY "organizations updatable by managers"
  ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.current_user_has_permission(id, 'manage_organization'))
  WITH CHECK (public.current_user_has_permission(id, 'manage_organization'));

DROP POLICY IF EXISTS "organization members readable by members" ON public.organization_members;
CREATE POLICY "organization members readable by members"
  ON public.organization_members
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "owner membership insertable by creator" ON public.organization_members;
CREATE POLICY "owner membership insertable by creator"
  ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND invited_by = auth.uid()
    AND role = 'owner'
    AND status = 'active'
  );

DROP POLICY IF EXISTS "organization invitations visible to sender and invited email"
  ON public.organization_invitations;
CREATE POLICY "organization invitations visible to sender and invited email"
  ON public.organization_invitations
  FOR SELECT TO authenticated
  USING (
    invited_by = auth.uid()
    OR invitee_user_id = auth.uid()
    OR lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
    OR (
      organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.current_user_has_permission(organization_id::UUID, 'invite_members')
    )
  );

DROP POLICY IF EXISTS "organization invitations insertable by inviters"
  ON public.organization_invitations;
CREATE POLICY "organization invitations insertable by inviters"
  ON public.organization_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    invited_by = auth.uid()
    AND organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.current_user_has_permission(organization_id::UUID, 'invite_members')
  );

DROP POLICY IF EXISTS "organization invitations updatable by invited email"
  ON public.organization_invitations;
CREATE POLICY "organization invitations updatable by invited email"
  ON public.organization_invitations
  FOR UPDATE TO authenticated
  USING (
    lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
    OR (
      organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.current_user_has_permission(organization_id::UUID, 'invite_members')
    )
  )
  WITH CHECK (
    lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
    OR (
      organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.current_user_has_permission(organization_id::UUID, 'invite_members')
    )
  );
