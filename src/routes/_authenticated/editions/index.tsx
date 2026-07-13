import { createFileRoute, redirect, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type MouseEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { hasPermission } from "@/lib/rbac";
import { supabaseUntyped } from "@/lib/supabase-untyped";

export const Route = createFileRoute("/_authenticated/editions/")({
  beforeLoad: ({ context }) => {
    if (!hasPermission(context.permissions, "access_assigned_pages")) {
      throw redirect({ to: "/access-denied" });
    }
  },
  component: EditionsList,
});

function EditionsList() {
  const ctx = useRouteContext({ from: "/_authenticated" });
  const { user, organization } = ctx;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    edition_name: "City Edition",
    edition_date: new Date().toISOString().slice(0, 10),
    number_of_pages: 1,
    template: "classic",
  });
  const canCreateArticles = hasPermission(ctx.permissions, "create_articles");
  const canDeleteNewspaper =
    ctx.role === "owner" ||
    ctx.role === "editor" ||
    hasPermission(ctx.permissions, "delete_newspapers");

  const { data: newspapers, isLoading } = useQuery({
    queryKey: ["newspapers", organization?.id],
    enabled: Boolean(organization?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newspapers")
        .select("*")
        .eq("organization_id", organization!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!organization) throw new Error("Organization required");
      const { data, error } = await supabase
        .from("newspapers")
        .insert({
          ...form,
          language: "Kannada",
          status: "draft",
          created_by: user.id,
          organization_id: organization.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["newspapers", organization?.id] });
      toast.success("Edition created");
      setOpen(false);
      window.location.href = `/editions/${n.id}`;
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error, "Could not create edition")),
  });

  const deleteEdition = useMutation({
    mutationFn: async (newspaperId: string) => {
      const { data, error } = await supabaseUntyped.rpc("delete_newspaper_edition", {
        p_newspaper_id: newspaperId,
      });
      if (error) throw error;
      if (!data) throw new Error("Edition was not deleted. Please refresh and try again.");
    },
    onSuccess: async (_, newspaperId) => {
      qc.setQueryData(["newspapers", organization?.id], (current: unknown) =>
        Array.isArray(current) ? current.filter((item) => item?.id !== newspaperId) : current,
      );
      await qc.invalidateQueries({ queryKey: ["newspapers", organization?.id] });
      toast.success("Edition deleted");
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error, "Could not delete edition")),
  });

  function openEdition(newspaperId: string) {
    navigate({ to: "/editions/$id", params: { id: newspaperId } });
  }

  function isRowActionEvent(event: MouseEvent<HTMLTableRowElement>) {
    return Boolean((event.target as HTMLElement | null)?.closest("[data-row-action]"));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold">Editions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Newspaper editions available to your organization role.
          </p>
        </div>
        {canCreateArticles && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" /> Create newspaper
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New newspaper edition</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Edition name</Label>
                  <Input
                    value={form.edition_name}
                    onChange={(e) => setForm({ ...form, edition_name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={form.edition_date}
                      onChange={(e) => setForm({ ...form, edition_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Language</Label>
                    <Input value="Kannada" disabled />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Number of pages</Label>
                    <Input
                      type="number"
                      min={1}
                      max={32}
                      value={form.number_of_pages}
                      onChange={(e) =>
                        setForm({ ...form, number_of_pages: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Template</Label>
                    <Select
                      value={form.template}
                      onValueChange={(v) => setForm({ ...form, template: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="classic">Classic broadsheet</SelectItem>
                        <SelectItem value="modern">Modern compact</SelectItem>
                        <SelectItem value="tabloid">Tabloid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => create.mutate()}
                  disabled={create.isPending}
                >
                  {create.isPending ? "…" : "Create edition"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : newspapers && newspapers.length > 0 ? (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Edition</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Pages</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {newspapers.map((n) => (
                <tr
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${n.edition_name}`}
                  className="cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={(event) => {
                    if (isRowActionEvent(event)) return;
                    openEdition(n.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    openEdition(n.id);
                  }}
                >
                  <td className="px-4 py-3 font-serif text-base font-semibold">{n.edition_name}</td>
                  <td className="px-4 py-3">{format(new Date(n.edition_date), "dd MMM yyyy")}</td>
                  <td className="px-4 py-3">{n.number_of_pages}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={n.status} />
                  </td>
                  <td
                    className="px-4 py-3"
                    data-row-action
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-3">
                      {canDeleteNewspaper && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-destructive hover:text-destructive"
                              disabled={deleteEdition.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {n.edition_name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This permanently deletes the edition, its articles, and saved
                                layouts. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={deleteEdition.isPending}>
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteEdition.mutate(n.id)}
                                disabled={deleteEdition.isPending}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete edition
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No editions yet.
        </div>
      )}
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const detail = "message" in error ? error.message : "details" in error ? error.details : null;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}
