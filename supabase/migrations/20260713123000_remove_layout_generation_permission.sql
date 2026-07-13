DROP POLICY IF EXISTS "layouts writable by organization layout editors" ON public.layouts;

CREATE POLICY "layouts writable by organization layout editors"
  ON public.layouts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'edit_articles')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.newspapers n
      WHERE n.id = newspaper_id
        AND n.organization_id IS NOT NULL
        AND n.organization_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.current_user_has_permission(n.organization_id::UUID, 'edit_articles')
    )
  );

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
            'access_ai_generation',
            'access_assigned_pages',
            'save_drafts'
          )
        )
      )
  );
$$;

DELETE FROM public.role_permissions
WHERE permission_key = 'access_layout_generation';

DELETE FROM public.permissions
WHERE key = 'access_layout_generation';
