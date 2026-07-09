import { createFileRoute, Link, useRouteContext, useNavigate, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { aiFn, type Article, type Newspaper } from "@/lib/api";
import { getPrintPageCount, NewspaperPage } from "@/components/NewspaperPage";
import {
  hasSavedEditorLayout,
  savedLayoutPageNumbers,
  SavedLayoutPreviewPage,
} from "@/components/SavedLayoutPreviewPage";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Check, X, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/review/$id")({
  beforeLoad: ({ context }) => {
    if (context.role !== "chief_editor") throw redirect({ to: "/dashboard" });
  },
  component: ReviewEdition,
});

function ReviewEdition() {
  const { id } = Route.useParams();
  const { user } = useRouteContext({ from: "/_authenticated" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [comment, setComment] = useState("");
  const [publishing, setPublishing] = useState<string | null>(null);

  const { data: newspaper } = useQuery({
    queryKey: ["newspaper", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("newspapers").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Newspaper;
    },
  });
  const { data: articles = [] } = useQuery({
    queryKey: ["articles", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("articles").select("*").eq("newspaper_id", id);
      if (error) throw error;
      return (data ?? []) as unknown as Article[];
    },
  });
  const { data: latestLayout } = useQuery({
    queryKey: ["saved-layout", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("layouts")
        .select("layout_json")
        .eq("newspaper_id", id)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.layout_json ?? null;
    },
  });

  async function runPublishPipeline() {
    setPublishing("Locking edition…");
    await new Promise((r) => setTimeout(r, 500));
    setPublishing("Generating print PDF…");
    await new Promise((r) => setTimeout(r, 800));
    setPublishing("Generating e-paper viewer…");
    await new Promise((r) => setTimeout(r, 600));
    setPublishing("Generating Kannada audio (simulated)…");
    const headlines = articles.map((a) => `${a.headline}. ${a.summary ?? ""}`).join(" ");
    const tts = await aiFn.tts(headlines).catch(() => ({ audio_url: "" }));
    setPublishing("Rendering social media kit…");
    await new Promise((r) => setTimeout(r, 500));

    await supabase.from("publications").insert({
      newspaper_id: id,
      print_pdf_url: "/generated-pdf",
      epaper_url: `/published/${id}`,
      audio_url: tts.audio_url,
      instagram_card_url: "/social/instagram",
      facebook_post_url: "/social/facebook",
      whatsapp_share_url: "/social/whatsapp",
    });
    await supabase.from("newspapers").update({ status: "published" }).eq("id", id);
    setPublishing(null);
  }

  const approve = useMutation({
    mutationFn: async () => {
      await supabase.from("reviews").insert({ newspaper_id: id, chief_editor_id: user.id, decision: "approved", comment });
      await supabase.from("newspapers").update({ status: "approved" }).eq("id", id);
      await runPublishPipeline();
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Approved and published"); navigate({ to: "/published/$id", params: { id } }); },
    onError: (e: any) => { setPublishing(null); toast.error(e.message); },
  });

  const reject = useMutation({
    mutationFn: async () => {
      if (!comment.trim()) throw new Error("Add a comment explaining the rejection");
      await supabase.from("reviews").insert({ newspaper_id: id, chief_editor_id: user.id, decision: "rejected", comment });
      await supabase.from("newspapers").update({ status: "rejected" }).eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Sent back to editor"); navigate({ to: "/review" }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!newspaper) return <div>Loading…</div>;
  const savedPreviewPages = savedLayoutPageNumbers(latestLayout);
  const hasSavedPreview = hasSavedEditorLayout(latestLayout);
  const totalPages = hasSavedPreview
    ? savedPreviewPages.length
    : getPrintPageCount(articles, newspaper.number_of_pages);
  const pages = hasSavedPreview ? savedPreviewPages : Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <Link to="/review" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Queue</Link>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <h1 className="font-serif text-3xl font-bold">{newspaper.edition_name}</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <span>{new Date(newspaper.edition_date).toDateString()}</span>
              <StatusBadge status={newspaper.status} />
            </div>
          </div>
        </div>
        <div className="mt-6 space-y-8">
          {pages.map((p) => (
            <div key={p}>
              <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Page {p}</div>
              {hasSavedPreview ? (
                <SavedLayoutPreviewPage
                  newspaper={newspaper}
                  articles={articles}
                  layoutJson={latestLayout}
                  pageNumber={p}
                  totalPages={totalPages}
                />
              ) : (
                <NewspaperPage newspaper={newspaper} articles={articles} pageNumber={p} totalPages={totalPages} />
              )}
            </div>
          ))}
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Summary</h3>
          <ul className="mt-2 space-y-1 text-sm">
            <li>{articles.length} articles</li>
            <li>{totalPages} pages</li>
            <li>Categories: {[...new Set(articles.map((a) => a.category).filter(Boolean))].join(", ") || "—"}</li>
          </ul>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Article list</h3>
          <div className="mt-2 space-y-1 text-xs">
            {articles.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b py-1 last:border-0">
                <span className="line-clamp-1 font-kannada">{a.headline}</span>
                <span className="shrink-0 text-muted-foreground">P{a.priority_score}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Decision</h3>
          <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment (required for reject)" className="mt-2" />
          <div className="mt-3 flex flex-col gap-2">
            <Button onClick={() => approve.mutate()} disabled={approve.isPending || !!publishing} className="w-full">
              {publishing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{publishing}</> : <><Check className="mr-2 h-4 w-4" /> Approve & publish</>}
            </Button>
            <Button variant="outline" onClick={() => reject.mutate()} disabled={reject.isPending || !!publishing} className="w-full">
              <X className="mr-2 h-4 w-4" /> Reject
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground"><Sparkles className="inline h-3 w-3" /> Approval triggers PDF + e-paper + audio + social kit generation.</p>
        </div>
      </aside>
    </div>
  );
}
