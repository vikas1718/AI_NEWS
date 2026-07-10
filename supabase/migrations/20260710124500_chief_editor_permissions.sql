DELETE FROM public.role_permissions
WHERE role_key = 'chief_editor'
  AND permission_key IN (
    'create_articles',
    'edit_articles',
    'access_assigned_pages',
    'save_drafts'
  );

INSERT INTO public.role_permissions (role_key, permission_key)
VALUES
  ('chief_editor', 'manage_organization'),
  ('chief_editor', 'invite_members'),
  ('chief_editor', 'remove_members'),
  ('chief_editor', 'change_roles'),
  ('chief_editor', 'manage_team'),
  ('chief_editor', 'organization_settings'),
  ('chief_editor', 'user_management')
ON CONFLICT DO NOTHING;
