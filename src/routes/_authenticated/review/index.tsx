import { createFileRoute, Link, useRouteContext, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/review/")({
  beforeLoad: ({ context }) => {
    if (!hasPermission(context.permissions, "review_articles")) {
      throw redirect({ to: "/access-denied" });
    }
  },
  component: ReviewQueue,
});

function ReviewQueue() {
  const ctx = useRouteContext({ from: "/_authenticated" });
  const organizationId = ctx.organization?.id;

  const { data: queue = [] } = useQuery({
    queryKey: ["review-queue", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newspapers")
        .select("*")
        .eq("organization_id", organizationId!)
        .neq("status", "published")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">Newspapers in progress</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Draft, layout, rejected, and approval-stage editions from your organization.
        </p>
      </div>
      {queue.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No in-progress newspapers right now.
        </div>
      ) : (
        <div className="grid gap-3">
          {queue.map((n) => (
            <Link
              key={n.id}
              to="/review/$id"
              params={{ id: n.id }}
              className="flex items-center justify-between rounded-lg border bg-card p-4 hover:border-primary/40"
            >
              <div>
                <div className="font-serif text-lg font-semibold">{n.edition_name}</div>
                <div className="text-sm text-muted-foreground">
                  {format(new Date(n.edition_date), "dd MMM yyyy")} · {n.number_of_pages} pages
                </div>
              </div>
              <StatusBadge status={n.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
