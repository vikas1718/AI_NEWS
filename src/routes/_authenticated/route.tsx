import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  getOrganizationBackend,
  getPendingInvitationCountBackend,
} from "@/lib/organization-backend";
import {
  getPermissionsForRole,
  type Organization,
  type OrganizationMember,
  type OrganizationRole,
  type PermissionKey,
} from "@/lib/rbac";
import { supabaseUntyped } from "@/lib/supabase-untyped";

type AuthenticatedContext = {
  user: User;
  profile: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  organization: Organization | null;
  membership: OrganizationMember | null;
  role: OrganizationRole | null;
  permissions: PermissionKey[];
  pendingInvitationCount: number;
};

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }): Promise<AuthenticatedContext> => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const db = supabaseUntyped;
    const user = data.user;

    const { data: profile } = await db
      .from("profiles")
      .select("id,email,full_name")
      .eq("id", user.id)
      .maybeSingle();

    const membershipsResult = await db
      .from("organization_members")
      .select("*, organizations(*)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(1);
    const memberships = isMissingOrganizationSchemaError(membershipsResult.error)
      ? []
      : membershipsResult.data;

    const membershipRow = (memberships ?? [])[0] ?? null;
    let membership = membershipRow
      ? ({
          id: membershipRow.id,
          organization_id: membershipRow.organization_id,
          user_id: membershipRow.user_id,
          role: membershipRow.role,
          status: membershipRow.status,
          invited_by: membershipRow.invited_by,
          joined_at: membershipRow.joined_at,
          created_at: membershipRow.created_at,
          updated_at: membershipRow.updated_at,
        } satisfies OrganizationMember)
      : null;
    let organization = (membershipRow?.organizations ?? null) as Organization | null;
    let role = membership?.role ?? null;
    const permissionResult = role
      ? await db.from("role_permissions").select("permission_key").eq("role_key", role)
      : { data: null, error: null };
    const permissionRows = isMissingOrganizationSchemaError(permissionResult.error)
      ? null
      : permissionResult.data;
    let permissions =
      permissionRows && permissionRows.length > 0
        ? permissionRows.map((row: { permission_key: PermissionKey }) => row.permission_key)
        : getPermissionsForRole(role);

    if (!organization) {
      const localOrganization = await getOrganizationBackend().catch(() => null);
      if (localOrganization) {
        organization = localOrganization.organization;
        membership = localOrganization.membership;
        role = membership.role;
        permissions = getPermissionsForRole(role);
      }
    }

    const [databasePendingInvitationCount, localPendingInvitationCount] = await Promise.all([
      getDatabasePendingInvitationCount(db, user.id, user.email ?? null),
      getPendingInvitationCountBackend().catch(() => 0),
    ]);
    const pendingInvitationCount = databasePendingInvitationCount + localPendingInvitationCount;

    const pathname = location.pathname;
    const isOnboarding = pathname === "/onboarding";
    if (organization && isOnboarding) throw redirect({ to: "/dashboard" });

    return {
      user,
      profile: profile ?? null,
      organization,
      membership,
      role,
      permissions,
      pendingInvitationCount,
    };
  },
  component: AuthenticatedLayout,
});

function isMissingOrganizationSchemaError(error: unknown) {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  const message = String(error.message).toLowerCase();
  return (
    message.includes("schema cache") &&
    (message.includes("organization_members") ||
      message.includes("organization_invitations") ||
      message.includes("role_permissions"))
  );
}

async function getDatabasePendingInvitationCount(
  db: typeof supabaseUntyped,
  userId: string,
  email: string | null,
) {
  const normalizedEmail = email?.trim().toLowerCase();
  const query = db
    .from("organization_invitations")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  const filteredQuery = normalizedEmail
    ? query.or(`invitee_user_id.eq.${userId},email.eq.${normalizedEmail}`)
    : query.eq("invitee_user_id", userId);

  const { count, error } = await filteredQuery;
  if (error) {
    if (isMissingOrganizationSchemaError(error)) return 0;
    throw error;
  }
  return count ?? 0;
}

function AuthenticatedLayout() {
  const ctx = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (!ctx.organization && pathname === "/onboarding") {
    return <Outlet />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
