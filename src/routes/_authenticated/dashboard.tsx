import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Cpu, FileCheck2, FileText, Users, type LucideIcon } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { InvitationsPanel } from "@/components/organization/InvitationsPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { hasPermission, roleLabels } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const ctx = useRouteContext({ from: "/_authenticated" });
  const hasOrganization = Boolean(ctx.organization);
  const canCreateArticles = hasPermission(ctx.permissions, "create_articles");
  const canReview = hasPermission(ctx.permissions, "review_articles");
  const canManageTeam = hasPermission(ctx.permissions, "manage_team");

  useEffect(() => {
    if (ctx.pendingInvitationCount > 0) {
      toast.info(`You have ${ctx.pendingInvitationCount} pending organization invitation(s).`);
    }
  }, [ctx.pendingInvitationCount]);

  const { data: newspapers } = useQuery({
    queryKey: ["dash-newspapers", ctx.organization?.id],
    enabled: hasOrganization,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newspapers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  const editionRows = newspapers ?? [];
  const counts = {
    total: editionRows.length,
    pending: editionRows.filter((n) => n.status === "pending_approval").length,
    published: editionRows.filter((n) => n.status === "published").length,
  };

  const roleLabel = ctx.role ? roleLabels[ctx.role] : "New workspace";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">
            {roleLabel} workspace - {ctx.user.email}
          </div>
          <h1 className="mt-1 font-serif text-4xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dashboardDescription(ctx.role, hasOrganization)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!hasOrganization && (
            <Link
              to="/team"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Users className="h-4 w-4" />
              Create team
            </Link>
          )}
          {canManageTeam && (
            <Link
              to="/team"
              className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              <Users className="h-4 w-4" />
              Manage team
            </Link>
          )}
        </div>
      </div>

      <InvitationsPanel compact />

      <div className="grid gap-4 md:grid-cols-3">
        <Stat icon={FileText} label="Recent editions" value={counts.total} />
        <Stat
          icon={FileCheck2}
          label={canReview ? "Awaiting review" : "Pending approval"}
          value={counts.pending}
        />
        <Stat icon={Cpu} label="Published" value={counts.published} />
      </div>

      {!hasOrganization ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">Create your team workspace</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
            Add your organization details first, then you can invite editors, assign roles, and
            start managing newsroom work from the dashboard.
          </p>
          <Link
            to="/team"
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Users className="h-4 w-4" />
            Create team
          </Link>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent editions</h2>
            <Link to="/editions" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          {editionRows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              No editions yet.{" "}
              {canCreateArticles ? (
                <Link to="/editions" className="text-primary hover:underline">
                  Create your first edition
                </Link>
              ) : (
                "Assigned editions will appear here."
              )}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {editionRows.map((n) => (
                <Link
                  key={n.id}
                  to="/editions/$id"
                  params={{ id: n.id }}
                  className="group flex items-center justify-between rounded-lg border bg-card p-4 hover:border-primary/40 hover:shadow-sm"
                >
                  <div className="min-w-0">
                    <div className="font-serif text-lg font-semibold">{n.edition_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(n.edition_date).toLocaleDateString()} - {n.number_of_pages} pages
                    </div>
                    <div className="mt-2">
                      <StatusBadge status={n.status} />
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function dashboardDescription(role: string | null, hasOrganization: boolean) {
  if (!hasOrganization) {
    return "Start from the dashboard, create your team, then add organization details and invite your newsroom.";
  }
  if (role === "owner") {
    return "Manage the organization, team access, invitations, AI tools, and editorial operations.";
  }
  if (role === "chief_editor") {
    return "Review, approve, publish, and coordinate editorial workflow across the newsroom.";
  }
  return "Create articles, generate AI content and layouts, and manage draft newsroom work.";
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 font-serif text-3xl font-bold">{value}</div>
    </div>
  );
}
