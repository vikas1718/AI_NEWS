export type OrganizationRole = "owner" | "chief_editor" | "editor";

export type PermissionKey =
  | "create_organization"
  | "manage_organization"
  | "invite_members"
  | "remove_members"
  | "change_roles"
  | "manage_team"
  | "view_dashboard"
  | "create_articles"
  | "edit_articles"
  | "review_articles"
  | "approve_articles"
  | "publish_articles"
  | "manage_editorial_workflow"
  | "access_ai_generation"
  | "access_layout_generation"
  | "access_assigned_pages"
  | "save_drafts"
  | "organization_settings"
  | "user_management";

export type Organization = {
  id: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  email: string | null;
  phone_number: string | null;
  address: string | null;
  organization_type: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type OrganizationMember = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  status: "active" | "removed" | "suspended";
  invited_by: string | null;
  joined_at: string;
  created_at: string;
  updated_at: string;
};

const ownerPermissions: PermissionKey[] = [
  "create_organization",
  "manage_organization",
  "invite_members",
  "remove_members",
  "change_roles",
  "manage_team",
  "view_dashboard",
  "create_articles",
  "edit_articles",
  "review_articles",
  "approve_articles",
  "publish_articles",
  "manage_editorial_workflow",
  "access_ai_generation",
  "access_layout_generation",
  "access_assigned_pages",
  "save_drafts",
  "organization_settings",
  "user_management",
];

export const rolePermissions: Record<OrganizationRole, PermissionKey[]> = {
  owner: ownerPermissions,
  chief_editor: [
    "manage_organization",
    "invite_members",
    "remove_members",
    "change_roles",
    "manage_team",
    "view_dashboard",
    "review_articles",
    "approve_articles",
    "publish_articles",
    "manage_editorial_workflow",
    "access_ai_generation",
    "access_layout_generation",
    "organization_settings",
    "user_management",
  ],
  editor: [
    "view_dashboard",
    "create_articles",
    "edit_articles",
    "access_ai_generation",
    "access_layout_generation",
    "access_assigned_pages",
    "save_drafts",
  ],
};

export const roleLabels: Record<OrganizationRole, string> = {
  owner: "Owner",
  chief_editor: "Chief Editor",
  editor: "Editor",
};

export function getPermissionsForRole(role: OrganizationRole | null | undefined) {
  return role ? rolePermissions[role] : [];
}

export function hasPermission(
  permissions: PermissionKey[] | null | undefined,
  permission: PermissionKey,
) {
  return Boolean(permissions?.includes(permission));
}

export function hasAnyPermission(
  permissions: PermissionKey[] | null | undefined,
  required: PermissionKey[],
) {
  return required.some((permission) => hasPermission(permissions, permission));
}
