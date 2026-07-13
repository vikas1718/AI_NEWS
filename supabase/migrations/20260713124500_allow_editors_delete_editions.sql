INSERT INTO public.role_permissions (role_key, permission_key)
VALUES ('editor', 'delete_newspapers')
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
            'delete_newspapers',
            'access_ai_generation',
            'access_assigned_pages',
            'save_drafts'
          )
        )
      )
  );
$$;
