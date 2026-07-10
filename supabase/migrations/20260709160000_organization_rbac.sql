CREATE TYPE public.organization_role AS ENUM ('owner', 'chief_editor', 'editor');
CREATE TYPE public.organization_member_status AS ENUM ('active', 'removed', 'suspended');
CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'declined', 'cancelled');

CREATE TABLE public.roles (
  key public.organization_role PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.permissions (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.role_permissions (
  role_key public.organization_role NOT NULL REFERENCES public.roles(key) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_key, permission_key)
);

CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  description TEXT,
  email TEXT,
  phone_number TEXT,
  address TEXT,
  organization_type TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.organization_role NOT NULL,
  status public.organization_member_status NOT NULL DEFAULT 'active',
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE UNIQUE INDEX organization_members_one_owned_org_per_user
  ON public.organization_members(user_id)
  WHERE role = 'owner' AND status = 'active';

CREATE INDEX organization_members_org_idx ON public.organization_members(organization_id);
CREATE INDEX organization_members_user_idx ON public.organization_members(user_id);

CREATE TABLE public.organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.organization_role NOT NULL,
  status public.invitation_status NOT NULL DEFAULT 'pending',
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitee_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  CHECK (role <> 'owner')
);

CREATE UNIQUE INDEX organization_invitations_pending_email_idx
  ON public.organization_invitations(organization_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX organization_invitations_email_idx ON public.organization_invitations(lower(email));
CREATE INDEX organization_invitations_invitee_idx ON public.organization_invitations(invitee_user_id);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_org_idx ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx ON public.audit_logs(actor_id, created_at DESC);

INSERT INTO public.roles (key, name, description)
VALUES
  ('owner', 'Owner', 'Organization owner with full administrative and newsroom access.'),
  ('chief_editor', 'Chief Editor', 'Editorial leader who can review, approve, publish, and manage editorial workflow.'),
  ('editor', 'Editor', 'Editorial team member who can create, edit, and draft AI-assisted newsroom content.')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO public.permissions (key, name, description)
VALUES
  ('create_organization', 'Create Organization', 'Create the initial newsroom organization.'),
  ('manage_organization', 'Manage Organization', 'Update organization profile and workspace details.'),
  ('invite_members', 'Invite Members', 'Invite users into the organization.'),
  ('remove_members', 'Remove Members', 'Remove users from the organization.'),
  ('change_roles', 'Change Roles', 'Change organization member roles.'),
  ('manage_team', 'Manage Team', 'Access team management controls.'),
  ('view_dashboard', 'View Dashboard', 'Access the authenticated dashboard.'),
  ('create_articles', 'Create Articles', 'Create newsroom editions and article content.'),
  ('edit_articles', 'Edit Articles', 'Edit articles and edition content.'),
  ('review_articles', 'Review Articles', 'Review submitted editions and articles.'),
  ('approve_articles', 'Approve Articles', 'Approve editorial work.'),
  ('publish_articles', 'Publish Articles', 'Publish approved editions.'),
  ('manage_editorial_workflow', 'Manage Editorial Workflow', 'Move content through the editorial workflow.'),
  ('access_ai_generation', 'Access AI Generation', 'Use AI article, image, OCR, and content generation tools.'),
  ('access_layout_generation', 'Access Layout Generation', 'Generate and edit newspaper layouts.'),
  ('access_assigned_pages', 'Access Assigned Pages', 'Access assigned pages and editions.'),
  ('save_drafts', 'Save Drafts', 'Save article and edition drafts.'),
  ('organization_settings', 'Organization Settings', 'Manage organization settings.'),
  ('user_management', 'User Management', 'Manage organization users.')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_key, permission_key)
SELECT 'owner'::public.organization_role, key FROM public.permissions
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_key, permission_key)
VALUES
  ('chief_editor', 'view_dashboard'),
  ('chief_editor', 'create_articles'),
  ('chief_editor', 'edit_articles'),
  ('chief_editor', 'review_articles'),
  ('chief_editor', 'approve_articles'),
  ('chief_editor', 'publish_articles'),
  ('chief_editor', 'manage_editorial_workflow'),
  ('chief_editor', 'access_ai_generation'),
  ('chief_editor', 'access_layout_generation'),
  ('chief_editor', 'access_assigned_pages'),
  ('chief_editor', 'save_drafts'),
  ('editor', 'view_dashboard'),
  ('editor', 'create_articles'),
  ('editor', 'edit_articles'),
  ('editor', 'access_ai_generation'),
  ('editor', 'access_layout_generation'),
  ('editor', 'access_assigned_pages'),
  ('editor', 'save_drafts')
ON CONFLICT DO NOTHING;

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
RETURNS public.organization_role
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

CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id UUID, _organization_id UUID, _permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.role_permissions rp ON rp.role_key = om.role
    WHERE om.organization_id = _organization_id
      AND om.user_id = _user_id
      AND om.status = 'active'
      AND rp.permission_key = _permission_key
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_permission(_organization_id UUID, _permission_key TEXT)
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
  ORDER BY CASE WHEN om.role = 'owner' THEN 0 ELSE 1 END, om.joined_at ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
    OR EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = _user_id
        AND om.status = 'active'
        AND (
          (_role = 'chief_editor'::public.app_role AND om.role = 'chief_editor'::public.organization_role)
          OR (_role = 'editor'::public.app_role AND om.role = 'editor'::public.organization_role)
        )
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

CREATE OR REPLACE FUNCTION public.create_organization_invitation(
  p_organization_id UUID,
  p_email TEXT,
  p_role public.organization_role
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation_id UUID;
  v_invitee_user_id UUID;
  v_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.user_has_permission(auth.uid(), p_organization_id, 'invite_members') THEN
    RAISE EXCEPTION 'You do not have permission to invite members';
  END IF;

  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'Owners cannot be invited through this workflow';
  END IF;

  v_email := lower(trim(coalesce(p_email, '')));
  IF v_email = '' THEN
    RAISE EXCEPTION 'Email address is required';
  END IF;

  SELECT id INTO v_invitee_user_id
  FROM public.profiles
  WHERE lower(email) = v_email
  LIMIT 1;

  INSERT INTO public.organization_invitations (
    organization_id,
    email,
    role,
    invited_by,
    invitee_user_id
  )
  VALUES (
    p_organization_id,
    v_email,
    p_role,
    auth.uid(),
    v_invitee_user_id
  )
  RETURNING id INTO v_invitation_id;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, target_table, target_id, metadata)
  VALUES (
    p_organization_id,
    auth.uid(),
    'invitation.created',
    'organization_invitations',
    v_invitation_id,
    jsonb_build_object('email', v_email, 'role', p_role)
  );

  RETURN v_invitation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_organization_invitation(p_invitation_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation public.organization_invitations%ROWTYPE;
  v_profile_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT lower(email) INTO v_profile_email
  FROM public.profiles
  WHERE id = auth.uid();

  SELECT *
  INTO v_invitation
  FROM public.organization_invitations
  WHERE id = p_invitation_id
    AND status = 'pending'
    AND (invitee_user_id = auth.uid() OR lower(email) = v_profile_email)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    role,
    status,
    invited_by,
    joined_at
  )
  VALUES (
    v_invitation.organization_id,
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

  UPDATE public.organization_invitations
  SET status = 'accepted',
      invitee_user_id = auth.uid(),
      responded_at = now()
  WHERE id = p_invitation_id;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, target_table, target_id)
  VALUES (
    v_invitation.organization_id,
    auth.uid(),
    'invitation.accepted',
    'organization_invitations',
    p_invitation_id
  );

  RETURN v_invitation.organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_organization_invitation(p_invitation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation public.organization_invitations%ROWTYPE;
  v_profile_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT lower(email) INTO v_profile_email
  FROM public.profiles
  WHERE id = auth.uid();

  SELECT *
  INTO v_invitation
  FROM public.organization_invitations
  WHERE id = p_invitation_id
    AND status = 'pending'
    AND (invitee_user_id = auth.uid() OR lower(email) = v_profile_email)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  UPDATE public.organization_invitations
  SET status = 'declined',
      invitee_user_id = auth.uid(),
      responded_at = now()
  WHERE id = p_invitation_id;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, target_table, target_id)
  VALUES (
    v_invitation.organization_id,
    auth.uid(),
    'invitation.declined',
    'organization_invitations',
    p_invitation_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_organization_member_role(
  p_member_id UUID,
  p_role public.organization_role
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

  SELECT * INTO v_member
  FROM public.organization_members
  WHERE id = p_member_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF NOT public.user_has_permission(auth.uid(), v_member.organization_id, 'change_roles') THEN
    RAISE EXCEPTION 'You do not have permission to change roles';
  END IF;

  IF v_member.role = 'owner' OR p_role = 'owner' THEN
    RAISE EXCEPTION 'Owner role cannot be changed through this workflow';
  END IF;

  UPDATE public.organization_members
  SET role = p_role, updated_at = now()
  WHERE id = p_member_id;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, target_table, target_id, metadata)
  VALUES (
    v_member.organization_id,
    auth.uid(),
    'member.role_changed',
    'organization_members',
    p_member_id,
    jsonb_build_object('role', p_role)
  );
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

  IF NOT public.user_has_permission(auth.uid(), v_member.organization_id, 'remove_members') THEN
    RAISE EXCEPTION 'You do not have permission to remove members';
  END IF;

  IF v_member.role = 'owner' THEN
    RAISE EXCEPTION 'The organization owner cannot be removed';
  END IF;

  UPDATE public.organization_members
  SET status = 'removed', updated_at = now()
  WHERE id = p_member_id;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, target_table, target_id)
  VALUES (
    v_member.organization_id,
    auth.uid(),
    'member.removed',
    'organization_members',
    p_member_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, lower(NEW.email), COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'editor'::public.app_role))
  ON CONFLICT DO NOTHING;

  UPDATE public.organization_invitations
  SET invitee_user_id = NEW.id
  WHERE invitee_user_id IS NULL
    AND status = 'pending'
    AND lower(email) = lower(NEW.email);

  RETURN NEW;
END;
$$;

ALTER TABLE public.newspapers
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS newspapers_organization_idx ON public.newspapers(organization_id);

GRANT SELECT ON public.roles TO authenticated;
GRANT SELECT ON public.permissions TO authenticated;
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.organization_members TO authenticated;
GRANT SELECT ON public.organization_invitations TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.roles TO service_role;
GRANT ALL ON public.permissions TO service_role;
GRANT ALL ON public.role_permissions TO service_role;
GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.organization_members TO service_role;
GRANT ALL ON public.organization_invitations TO service_role;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles readable by authenticated" ON public.roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "permissions readable by authenticated" ON public.permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "role permissions readable by authenticated" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "organizations readable by members" ON public.organizations
  FOR SELECT TO authenticated USING (public.is_org_member(id, auth.uid()));

CREATE POLICY "organizations updatable by owners" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.current_user_has_permission(id, 'manage_organization'))
  WITH CHECK (public.current_user_has_permission(id, 'manage_organization'));

CREATE POLICY "organization members readable by members" ON public.organization_members
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "organization invitations visible to owners and invitees" ON public.organization_invitations
  FOR SELECT TO authenticated
  USING (
    public.current_user_has_permission(organization_id, 'invite_members')
    OR invitee_user_id = auth.uid()
    OR lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
  );

CREATE POLICY "audit logs visible to owners" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.current_user_has_permission(organization_id, 'manage_organization'));

DROP POLICY IF EXISTS "editor sees own newspapers" ON public.newspapers;
DROP POLICY IF EXISTS "editor creates newspapers" ON public.newspapers;
DROP POLICY IF EXISTS "editor updates own newspapers" ON public.newspapers;
DROP POLICY IF EXISTS "editor deletes own drafts" ON public.newspapers;

CREATE POLICY "newspapers visible by organization" ON public.newspapers
  FOR SELECT TO authenticated
  USING (
    (organization_id IS NULL AND created_by = auth.uid())
    OR public.is_org_member(organization_id, auth.uid())
  );

CREATE POLICY "newspapers create by permitted members" ON public.newspapers
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND organization_id IS NOT NULL
    AND public.current_user_has_permission(organization_id, 'create_articles')
  );

CREATE POLICY "newspapers update by permitted members" ON public.newspapers
  FOR UPDATE TO authenticated
  USING (
    (organization_id IS NULL AND created_by = auth.uid())
    OR public.current_user_has_permission(organization_id, 'edit_articles')
    OR public.current_user_has_permission(organization_id, 'approve_articles')
    OR public.current_user_has_permission(organization_id, 'publish_articles')
  )
  WITH CHECK (
    (
      (organization_id IS NULL AND created_by = auth.uid())
      OR public.current_user_has_permission(organization_id, 'edit_articles')
      OR public.current_user_has_permission(organization_id, 'approve_articles')
      OR public.current_user_has_permission(organization_id, 'publish_articles')
    )
    AND (
      status NOT IN ('approved', 'published')
      OR public.current_user_has_permission(organization_id, 'publish_articles')
    )
  );

CREATE POLICY "newspapers delete by permitted members" ON public.newspapers
  FOR DELETE TO authenticated
  USING (
    status = 'draft'
    AND (
      (organization_id IS NULL AND created_by = auth.uid())
      OR public.current_user_has_permission(organization_id, 'manage_editorial_workflow')
    )
  );

DROP POLICY IF EXISTS "articles visible via parent" ON public.articles;
DROP POLICY IF EXISTS "articles insertable by owner" ON public.articles;
DROP POLICY IF EXISTS "articles updatable by owner or chief" ON public.articles;
DROP POLICY IF EXISTS "articles deletable by owner" ON public.articles;

CREATE POLICY "articles visible via organization parent" ON public.articles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND ((n.organization_id IS NULL AND n.created_by = auth.uid()) OR public.is_org_member(n.organization_id, auth.uid()))
    )
  );

CREATE POLICY "articles insertable by permitted members" ON public.articles
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND (
          (n.organization_id IS NULL AND n.created_by = auth.uid())
          OR public.current_user_has_permission(n.organization_id, 'create_articles')
        )
    )
  );

CREATE POLICY "articles updatable by permitted members" ON public.articles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND (
          (n.organization_id IS NULL AND n.created_by = auth.uid())
          OR public.current_user_has_permission(n.organization_id, 'edit_articles')
          OR public.current_user_has_permission(n.organization_id, 'review_articles')
        )
    )
  );

CREATE POLICY "articles deletable by permitted members" ON public.articles
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND (
          (n.organization_id IS NULL AND n.created_by = auth.uid())
          OR public.current_user_has_permission(n.organization_id, 'edit_articles')
        )
    )
  );

DROP POLICY IF EXISTS "layouts visible via parent" ON public.layouts;
DROP POLICY IF EXISTS "layouts writable by owner" ON public.layouts;

CREATE POLICY "layouts visible via organization parent" ON public.layouts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND ((n.organization_id IS NULL AND n.created_by = auth.uid()) OR public.is_org_member(n.organization_id, auth.uid()))
    )
  );

CREATE POLICY "layouts writable by layout members" ON public.layouts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND (
          (n.organization_id IS NULL AND n.created_by = auth.uid())
          OR public.current_user_has_permission(n.organization_id, 'access_layout_generation')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND (
          (n.organization_id IS NULL AND n.created_by = auth.uid())
          OR public.current_user_has_permission(n.organization_id, 'access_layout_generation')
        )
    )
  );

DROP POLICY IF EXISTS "reviews visible via parent" ON public.reviews;
DROP POLICY IF EXISTS "reviews insertable by chief" ON public.reviews;

CREATE POLICY "reviews visible via organization parent" ON public.reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND ((n.organization_id IS NULL AND n.created_by = auth.uid()) OR public.is_org_member(n.organization_id, auth.uid()))
    )
  );

CREATE POLICY "reviews insertable by approvers" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = chief_editor_id
    AND EXISTS (
      SELECT 1 FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND (
          n.organization_id IS NULL
          OR public.current_user_has_permission(n.organization_id, 'approve_articles')
        )
    )
  );

DROP POLICY IF EXISTS "publications visible via parent" ON public.publications;
DROP POLICY IF EXISTS "publications writable via parent" ON public.publications;

CREATE POLICY "publications visible via organization parent" ON public.publications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND ((n.organization_id IS NULL AND n.created_by = auth.uid()) OR public.is_org_member(n.organization_id, auth.uid()))
    )
  );

CREATE POLICY "publications writable by publishers" ON public.publications
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND (
          n.organization_id IS NULL
          OR public.current_user_has_permission(n.organization_id, 'publish_articles')
        )
    )
  );

CREATE TRIGGER organizations_touch
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TRIGGER organization_members_touch
BEFORE UPDATE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

REVOKE ALL ON FUNCTION public.is_org_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_org_role(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_has_permission(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_has_permission(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_default_organization(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_organization(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_organization_invitation(UUID, TEXT, public.organization_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_organization_invitation(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_organization_invitation(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_organization_member_role(UUID, public.organization_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_organization_member(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_org_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_org_role(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_permission(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_default_organization(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_organization_invitation(UUID, TEXT, public.organization_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decline_organization_invitation(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_organization_member_role(UUID, public.organization_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_organization_member(UUID) TO authenticated, service_role;
