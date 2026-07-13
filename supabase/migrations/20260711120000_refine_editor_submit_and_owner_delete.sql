INSERT INTO public.roles (key, name, description)
VALUES
  ('owner', 'Owner/Admin', 'Full organization administration access'),
  ('chief_editor', 'Chief Editor', 'Reviews, approves, rejects, and publishes editions'),
  ('editor', 'Editor', 'Creates newspapers, adds articles, edits layouts, and submits for review')
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description;

INSERT INTO public.permissions (key, name, description)
VALUES
  ('submit_for_review', 'Submit for Review', 'Submit editable newspaper editions to chief editor review'),
  ('delete_newspapers', 'Delete Newspapers', 'Delete newspaper editions and their dependent content')
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_key, permission_key)
VALUES
  ('owner', 'submit_for_review'),
  ('owner', 'delete_newspapers'),
  ('editor', 'submit_for_review')
ON CONFLICT (role_key, permission_key) DO NOTHING;

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
            'submit_for_review',
            'access_ai_generation',
            'access_layout_generation',
            'access_assigned_pages',
            'save_drafts'
          )
        )
      )
  );
$$;

DROP POLICY IF EXISTS "newspapers deletable by organization owners" ON public.newspapers;
CREATE POLICY "newspapers deletable by organization owners"
  ON public.newspapers
  FOR DELETE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.current_user_has_permission(organization_id::UUID, 'delete_newspapers')
  );
