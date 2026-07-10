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
  const { user } = useRouteContext({ from: "/_authenticated" });
  const qc = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const getPendingInvitations = useServerFn(getPendingInvitationsBackend);
  const acceptInvitation = useServerFn(acceptInvitationBackend);
  const declineInvitation = useServerFn(declineInvitationBackend);

  const { data: invitations = [], isLoading } = useQuery({
    queryKey: ["organization-invitations", user.id],
    queryFn: async () => (await getPendingInvitations()) as Invitation[],
  });

  const accept = useMutation({
    mutationFn: async (id: string) => {
      const result = await acceptInvitation({ data: { invitationId: id } });
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
    mutationFn: async (id: string) => {
      const result = await declineInvitation({ data: { invitationId: id } });
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
                onClick={() => accept.mutate(invitation.id)}
                disabled={accept.isPending || decline.isPending}
              >
                <Check className="h-4 w-4" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => decline.mutate(invitation.id)}
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
