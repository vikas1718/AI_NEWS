import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";

import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
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
  organizations: Array<{
    organization: Organization;
    membership: OrganizationMember;
  }>;
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
      .order("joined_at", { ascending: true });
    const membershipRows = isMissingOrganizationSchemaError(membershipsResult.error)
      ? []
      : membershipsResult.data;

    const organizations = (membershipRows ?? [])
      .map((row) => {
        const organization = row.organizations as Organization | null;
        if (!organization) return null;
        return {
          organization,
          membership: {
            id: row.id,
            organization_id: row.organization_id,
            user_id: row.user_id,
            role: row.role,
            status: row.status,
            invited_by: row.invited_by,
            joined_at: row.joined_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
          } satisfies OrganizationMember,
        };
      })
      .filter((row): row is { organization: Organization; membership: OrganizationMember } =>
        Boolean(row),
      )
      .sort((a, b) => {
        if (a.membership.role === "owner" && b.membership.role !== "owner") return -1;
        if (a.membership.role !== "owner" && b.membership.role === "owner") return 1;
        return a.membership.joined_at.localeCompare(b.membership.joined_at);
      });

    const selectedOrganization = organizations[0] ?? null;
    const activeOrganizations = selectedOrganization ? [selectedOrganization] : [];
    const membership = selectedOrganization?.membership ?? null;
    const organization = selectedOrganization?.organization ?? null;
    const role = membership?.role ?? null;
    const permissionResult = role
      ? await db.from("role_permissions").select("permission_key").eq("role_key", role)
      : { data: null, error: null };
    const permissionRows = isMissingOrganizationSchemaError(permissionResult.error)
      ? null
      : permissionResult.data;
    const permissions =
      permissionRows && permissionRows.length > 0
        ? permissionRows.map((row: { permission_key: PermissionKey }) => row.permission_key)
        : getPermissionsForRole(role);

    const pendingInvitationCount = organization
      ? 0
      : await getDatabasePendingInvitationCount(db, user.email ?? null);

    const pathname = location.pathname;
    const isOnboarding = pathname === "/onboarding";
    if (organization && isOnboarding) throw redirect({ to: "/dashboard" });

    return {
      user,
      profile: profile ?? null,
      organizations: activeOrganizations,
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
      message.includes("organizations") ||
      message.includes("organization_invitations") ||
      message.includes("role_permissions"))
  ) || message.includes('relation "public.organizations" does not exist');
}

async function getDatabasePendingInvitationCount(db: typeof supabaseUntyped, email: string | null) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) {
    console.info("[Invitations][count:skip]", {
      authenticatedEmail: null,
      returnedInvitations: 0,
      organizationId: null,
      reason: "No authenticated email is available, so pending invitations cannot be counted.",
    });
    return 0;
  }

  const query = db
    .from("organization_invitations")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("email", normalizedEmail);

  const { count, error } = await query;
  if (error) {
    if (isMissingOrganizationSchemaError(error)) {
      console.info("[Invitations][count:schema-missing]", {
        authenticatedEmail: normalizedEmail,
        invitationEmail: normalizedEmail,
        returnedInvitations: 0,
        organizationId: null,
        reason: "Organization invitation schema is unavailable; database count skipped.",
      });
      return 0;
    }
    throw error;
  }

  console.info("[Invitations][count:result]", {
    authenticatedEmail: normalizedEmail,
    invitationEmail: normalizedEmail,
    returnedInvitations: count ?? 0,
    organizationId: null,
    reason: "Pending invitation count filtered only by authenticated email and status=pending.",
  });

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
