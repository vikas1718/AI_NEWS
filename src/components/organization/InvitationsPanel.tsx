import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, useRouter, useRouteContext } from "@tanstack/react-router";
import { Building2, Check, Mail, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  acceptInvitationBackend,
  declineInvitationBackend,
  getPendingInvitationsBackend,
} from "@/lib/organization-backend";
import { roleLabels, type OrganizationRole } from "@/lib/rbac";
import { supabaseUntyped } from "@/lib/supabase-untyped";

type Invitation = {
  id: string;
  email: string;
  role: OrganizationRole;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
  organizations: { name: string } | null;
  inviter: { full_name: string | null; email: string } | null;
  source: "database" | "local";
};

export function InvitationsPanel({ compact = false }: { compact?: boolean }) {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const db = supabaseUntyped;
  const qc = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const getPendingInvitations = useServerFn(getPendingInvitationsBackend);
  const acceptInvitation = useServerFn(acceptInvitationBackend);
  const declineInvitation = useServerFn(declineInvitationBackend);

  const { data: invitations = [], isLoading } = useQuery({
    queryKey: ["organization-invitations", user.id],
    queryFn: async () => {
      const [databaseInvitations, localInvitations] = await Promise.all([
        getDatabasePendingInvitations(db, user.id, user.email ?? null),
        getPendingInvitations().catch(() => []),
      ]);

      const merged = new Map<string, Invitation>();
      for (const invitation of databaseInvitations) merged.set(invitation.id, invitation);
      for (const invitation of localInvitations as Omit<Invitation, "source">[]) {
        merged.set(invitation.id, { ...invitation, source: "local" });
      }
      return Array.from(merged.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });

  const accept = useMutation({
    mutationFn: async (invitation: Invitation) => {
      if (invitation.source === "database") {
        const { error } = await db.rpc("accept_organization_invitation", {
          p_invitation_id: invitation.id,
        });
        if (error) throw error;
        return;
      }

      const result = await acceptInvitation({ data: { invitationId: invitation.id } });
      if (!result.ok) throw new Error(result.error);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["organization-invitations"] });
      await router.invalidate();
      toast.success("Invitation accepted");
      navigate({ to: "/dashboard" });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not accept invitation"),
  });

  const decline = useMutation({
    mutationFn: async (invitation: Invitation) => {
      if (invitation.source === "database") {
        const { error } = await db.rpc("decline_organization_invitation", {
          p_invitation_id: invitation.id,
        });
        if (error) throw error;
        return;
      }

      const result = await declineInvitation({ data: { invitationId: invitation.id } });
      if (!result.ok) throw new Error(result.error);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["organization-invitations"] });
      await router.invalidate();
      toast.success("Invitation declined");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not decline invitation"),
  });

  if (isLoading) {
    return (
      <Card className="rounded-lg p-5">
        <div className="text-sm text-muted-foreground">Checking invitations...</div>
      </Card>
    );
  }

  if (invitations.length === 0) {
    if (compact) return null;
    return (
      <Card className="rounded-lg border-dashed p-6 text-center">
        <Mail className="mx-auto h-6 w-6 text-muted-foreground" />
        <div className="mt-3 font-semibold">No pending invitations</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Invitations sent to your email address will appear here after you sign in.
        </p>
      </Card>
    );
  }

  return (
    <Card className="rounded-lg p-5">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Invitations</h2>
      </div>
      <div className="mt-4 grid gap-3">
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="flex flex-col gap-4 rounded-lg border bg-background p-4 md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-semibold">
                <Building2 className="h-4 w-4 text-primary" />
                {invitation.organizations?.name ?? "Organization"}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Invited by{" "}
                {invitation.inviter?.full_name || invitation.inviter?.email || "the owner"} as{" "}
                {roleLabels[invitation.role]}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {new Date(invitation.created_at).toLocaleDateString()}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                onClick={() => accept.mutate(invitation)}
                disabled={accept.isPending || decline.isPending}
              >
                <Check className="h-4 w-4" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => decline.mutate(invitation)}
                disabled={accept.isPending || decline.isPending}
              >
                <X className="h-4 w-4" />
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

async function getDatabasePendingInvitations(
  db: typeof supabaseUntyped,
  userId: string,
  email: string | null,
): Promise<Invitation[]> {
  const normalizedEmail = email?.trim().toLowerCase();
  const fields = "id,email,role,status,created_at,organization_id,invited_by";
  const query = db.from("organization_invitations").select(fields).eq("status", "pending");
  const filteredQuery = normalizedEmail
    ? query.or(`invitee_user_id.eq.${userId},email.eq.${normalizedEmail}`)
    : query.eq("invitee_user_id", userId);

  const { data, error } = await filteredQuery.order("created_at", { ascending: false });
  if (error) {
    if (isMissingOrganizationSchemaError(error)) return [];
    throw error;
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const organizationIds = uniqueStrings(
    rows.map((row: DatabaseInvitationRow) => row.organization_id),
  );
  const inviterIds = uniqueStrings(rows.map((row: DatabaseInvitationRow) => row.invited_by));
  const [organizations, profiles] = await Promise.all([
    getOrganizationNames(db, organizationIds),
    getInviterProfiles(db, inviterIds),
  ]);

  return rows.map((row: DatabaseInvitationRow) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    created_at: row.created_at,
    organizations: organizations.get(row.organization_id) ?? null,
    inviter: profiles.get(row.invited_by) ?? null,
    source: "database",
  }));
}

type DatabaseInvitationRow = {
  id: string;
  email: string;
  role: OrganizationRole;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
  organization_id: string;
  invited_by: string;
};

async function getOrganizationNames(db: typeof supabaseUntyped, ids: string[]) {
  const organizations = new Map<string, { name: string }>();
  if (ids.length === 0) return organizations;

  const { data, error } = await db.from("organizations").select("id,name").in("id", ids);
  if (error) {
    if (isMissingOrganizationSchemaError(error)) return organizations;
    throw error;
  }

  for (const row of data ?? []) {
    organizations.set(row.id, { name: row.name });
  }
  return organizations;
}

async function getInviterProfiles(db: typeof supabaseUntyped, ids: string[]) {
  const profiles = new Map<string, { full_name: string | null; email: string }>();
  if (ids.length === 0) return profiles;

  const { data, error } = await db.from("profiles").select("id,full_name,email").in("id", ids);
  if (error) throw error;

  for (const row of data ?? []) {
    profiles.set(row.id, { full_name: row.full_name, email: row.email });
  }
  return profiles;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

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
