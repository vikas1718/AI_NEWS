import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter, useRouteContext } from "@tanstack/react-router";
import { Building2, Check, Mail, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
};

export function InvitationsPanel({ compact = false }: { compact?: boolean }) {
  const { user, organization } = useRouteContext({ from: "/_authenticated" });
  const db = supabaseUntyped;
  const qc = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();

  const { data: invitations = [], isLoading } = useQuery({
    queryKey: ["organization-invitations", user.id],
    enabled: !organization,
    queryFn: async () => {
      return getDatabasePendingInvitations(db, user.email ?? null);
    },
  });

  if (organization) {
    if (compact) return null;
    return (
      <Card className="rounded-lg border-dashed p-6 text-center">
        <Building2 className="mx-auto h-6 w-6 text-muted-foreground" />
        <div className="mt-3 font-semibold">Single workspace active</div>
        <p className="mt-1 text-sm text-muted-foreground">
          This account already belongs to an organization. Use a different account for a different workspace.
        </p>
      </Card>
    );
  }

  const accept = useMutation({
    mutationFn: async (invitation: Invitation) => {
      const { error } = await db.rpc("accept_organization_invitation", {
        p_invitation_id: invitation.id,
      });
      if (error) throw error;
      window.localStorage.removeItem("ai-news-active-organization-id");
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
      const { error } = await db.rpc("decline_organization_invitation", {
        p_invitation_id: invitation.id,
      });
      if (error) throw error;
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
  email: string | null,
): Promise<Invitation[]> {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) {
    console.info("[Invitations][query:skip]", {
      authenticatedEmail: null,
      returnedInvitations: [],
      organizationId: null,
      reason: "No authenticated email is available, so pending invitations cannot be matched.",
    });
    return [];
  }

  console.info("[Invitations][query:start]", {
    authenticatedEmail: normalizedEmail,
    invitationEmail: normalizedEmail,
    organizationId: null,
    reason: "Email-only pending invitation lookup; no active organization or membership required.",
  });

  const fields = "id,email,role,status,created_at,organization_id,organization_name,invited_by";
  const { data, error } = await db
    .from("organization_invitations")
    .select(fields)
    .eq("status", "pending")
    .eq("email", normalizedEmail)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) {
    console.info("[Invitations][query:result]", {
      authenticatedEmail: normalizedEmail,
      invitationEmail: normalizedEmail,
      returnedInvitations: [],
      organizationId: null,
      reason:
        "No pending Supabase invitations matched the authenticated email. No organization filters were used.",
    });
    return [];
  }

  const inviterIds = uniqueStrings(rows.map((row: DatabaseInvitationRow) => row.invited_by));
  const profiles = await getInviterProfiles(db, inviterIds);

  const invitations = rows.map((row: DatabaseInvitationRow) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    created_at: row.created_at,
    organizations: row.organization_name ? { name: row.organization_name } : null,
    inviter: profiles.get(row.invited_by) ?? null,
  }));

  console.info("[Invitations][query:result]", {
    authenticatedEmail: normalizedEmail,
    invitationEmail: normalizedEmail,
    returnedInvitations: rows.map((row: DatabaseInvitationRow) => ({
      id: row.id,
      email: row.email,
      organizationId: row.organization_id,
      source: "database",
    })),
    organizationId: null,
    reason: "Returned pending invitations filtered only by authenticated email and status=pending.",
  });

  return invitations;
}

type DatabaseInvitationRow = {
  id: string;
  email: string;
  role: OrganizationRole;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
  organization_id: string;
  organization_name: string | null;
  invited_by: string;
};

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
