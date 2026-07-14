import {
  createFileRoute,
  Link,
  redirect,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, MailPlus, Settings, Shield, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { InvitationsPanel } from "@/components/organization/InvitationsPanel";
import { OrganizationSetupForm } from "@/components/organization/OrganizationSetupForm";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { hasPermission, roleLabels, type OrganizationRole } from "@/lib/rbac";
import { supabaseUntyped } from "@/lib/supabase-untyped";

export const Route = createFileRoute("/_authenticated/team")({
  beforeLoad: ({ context }) => {
    if (context.organization && !hasPermission(context.permissions, "manage_team")) {
      throw redirect({ to: "/access-denied" });
    }
  },
  component: TeamPage,
});

type MemberRow = {
  id: string;
  user_id: string;
  role: OrganizationRole;
  status: "active" | "removed" | "suspended";
  joined_at: string;
  profiles: {
    full_name: string | null;
    email: string;
  } | null;
};

type InvitationRow = {
  id: string;
  email: string;
  role: OrganizationRole;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
};

function TeamPage() {
  const ctx = useRouteContext({ from: "/_authenticated" });
  const organization = ctx.organization;
  const db = supabaseUntyped;
  const qc = useQueryClient();
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<{
    email: string;
    role: Exclude<OrganizationRole, "owner">;
  }>({
    email: "",
    role: "editor",
  });

  const canManageTeam = hasPermission(ctx.permissions, "manage_team");
  const canManageOrganization = hasPermission(ctx.permissions, "manage_organization");
  const canInvite = hasPermission(ctx.permissions, "invite_members");
  const canChangeRoles = hasPermission(ctx.permissions, "change_roles");
  const canRemove = hasPermission(ctx.permissions, "remove_members");
  const canRemoveMember = (member: MemberRow) =>
    canRemove && member.role !== "owner" && (ctx.role === "owner" || member.role === "editor");

  const { data: members = [] } = useQuery({
    queryKey: ["organization-members", organization?.id],
    enabled: Boolean(organization?.id),
    queryFn: async () => {
      const { data, error } = await db
        .from("organization_members")
        .select(
          "id,user_id,role,status,joined_at,profiles!organization_members_user_id_fkey(full_name,email)",
        )
        .eq("organization_id", organization!.id)
        .neq("status", "removed")
        .order("joined_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MemberRow[];
    },
  });

  const { data: invitations = [] } = useQuery({
    queryKey: ["organization-sent-invitations", organization?.id],
    enabled: Boolean(organization?.id) && canInvite,
    queryFn: async () => {
      const { data, error } = await db
        .from("organization_invitations")
        .select("id,email,role,status,created_at")
        .eq("organization_id", organization!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InvitationRow[];
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      const invitationEmail = inviteForm.email.trim().toLowerCase();
      if (!invitationEmail) throw new Error("Email address is required");

      console.info("[Invitations][send:start]", {
        authenticatedEmail: ctx.user.email?.toLowerCase() ?? null,
        invitationEmail,
        organizationId: organization!.id,
        reason: "Owner is sending an invitation; invitation will be stored in Supabase.",
      });

      const { data: invitationId, error } = await db.rpc("create_organization_invitation", {
        p_organization_id: organization!.id,
        p_email: invitationEmail,
        p_role: inviteForm.role,
      });
      if (error) throw error;

      console.info("[Invitations][send:stored]", {
        authenticatedEmail: ctx.user.email?.toLowerCase() ?? null,
        invitationEmail,
        returnedInvitations: [
          {
            id: invitationId,
            email: invitationEmail,
            organizationId: organization!.id,
          },
        ],
        organizationId: organization!.id,
        reason:
          "Invitation stored in Supabase organization_invitations; receiver lookup is by authenticated email.",
      });
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["organization-sent-invitations", organization?.id] });
      await router.invalidate();
      setInviteOpen(false);
      setInviteForm({ email: "", role: "editor" });
      toast.success("Invitation sent");
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error, "Could not send invitation")),
  });

  const changeRole = useMutation({
    mutationFn: async ({
      memberId,
      role,
    }: {
      memberId: string;
      role: Exclude<OrganizationRole, "owner">;
    }) => {
      const { error } = await db.rpc("update_organization_member_role", {
        p_member_id: memberId,
        p_role: role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organization-members", organization?.id] });
      toast.success("Role updated");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not update role"),
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await db.rpc("remove_organization_member", { p_member_id: memberId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organization-members", organization?.id] });
      toast.success("Member removed");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not remove member"),
  });

  const visibleMembers: MemberRow[] = members;

  if (!organization) {
    return (
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-primary">
            <Users className="h-4 w-4" />
            Team Setup
          </div>
          <h1 className="mt-1 font-serif text-3xl font-bold">Create your team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add all organization details here first. After creation, this page becomes your team,
            roles, and invitation hub.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <OrganizationSetupForm
            title="Create team organization"
            description="Create the newsroom workspace that will hold your organization details, members, roles, and editorial access."
            submitLabel="Create team"
            successMessage="Team organization created. You are now the Owner."
          />
          <div className="space-y-4">
            <InvitationsPanel />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-primary">
            <Users className="h-4 w-4" />
            Team Management
          </div>
          <h1 className="mt-1 font-serif text-3xl font-bold">{organization.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View organization membership, assigned roles, status, and invitations.
          </p>
        </div>

        {canInvite && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button>
                <MailPlus className="h-4 w-4" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Email address</Label>
                  <Input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select
                    value={inviteForm.role}
                    onValueChange={(role) =>
                      setInviteForm({
                        ...inviteForm,
                        role: role as Exclude<OrganizationRole, "owner">,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chief_editor">Chief Editor</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  disabled={invite.isPending}
                  onClick={() => invite.mutate()}
                >
                  {invite.isPending ? "Sending..." : "Send Invitation"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-lg p-5 lg:col-span-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Building2 className="h-5 w-5 text-primary" />
              <h2 className="mt-3 text-lg font-semibold">Organization Details</h2>
            </div>
            {canManageOrganization && (
              <Link
                to="/organization-settings"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label="Edit organization details"
              >
                <Settings className="h-4 w-4" />
              </Link>
            )}
          </div>
          {organization.logo_url && (
            <img
              src={organization.logo_url}
              alt={`${organization.name} logo`}
              className="mt-4 h-16 w-16 rounded-lg border object-cover"
            />
          )}
          <dl className="mt-4 space-y-3 text-sm">
            <Info label="Name" value={organization.name} />
            <Info label="Description" value={organization.description} />
            <Info label="Logo URL" value={organization.logo_url} />
            <Info label="Email" value={organization.email} />
            <Info label="Phone" value={organization.phone_number} />
            <Info label="Address" value={organization.address} />
            <Info label="Created" value={new Date(organization.created_at).toLocaleDateString()} />
          </dl>
        </Card>

        <Card className="rounded-lg p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Team Members</h2>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-3 pr-4">Member</th>
                  <th className="py-3 pr-4">Role</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Joined</th>
                  {canManageTeam && <th className="py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleMembers.map((member) => (
                  <tr key={member.id}>
                    <td className="py-3 pr-4">
                      <div className="font-medium">
                        {member.profiles?.full_name || member.profiles?.email}
                      </div>
                      <div className="text-xs text-muted-foreground">{member.profiles?.email}</div>
                    </td>
                    <td className="py-3 pr-4">
                      {canChangeRoles && member.role !== "owner" ? (
                        <Select
                          value={member.role}
                          onValueChange={(role) =>
                            changeRole.mutate({
                              memberId: member.id,
                              role: role as Exclude<OrganizationRole, "owner">,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="chief_editor">Chief Editor</SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        roleLabels[member.role]
                      )}
                    </td>
                    <td className="py-3 pr-4 capitalize">{member.status}</td>
                    <td className="py-3 pr-4">{new Date(member.joined_at).toLocaleDateString()}</td>
                    {canManageTeam && (
                      <td className="py-3 text-right">
                        {canRemoveMember(member) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeMember.mutate(member.id)}
                            disabled={removeMember.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {canInvite && (
        <Card className="rounded-lg p-5">
          <h2 className="text-lg font-semibold">Invitations</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-3 pr-4">Email Address</th>
                  <th className="py-3 pr-4">Assigned Role</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Created Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invitations.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      No invitations have been sent yet.
                    </td>
                  </tr>
                ) : (
                  invitations.map((invitation) => (
                    <tr key={invitation.id}>
                      <td className="py-3 pr-4">{invitation.email}</td>
                      <td className="py-3 pr-4">{roleLabels[invitation.role]}</td>
                      <td className="py-3 pr-4 capitalize">{invitation.status}</td>
                      <td className="py-3 pr-4">
                        {new Date(invitation.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value || "Not provided"}</dd>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}
