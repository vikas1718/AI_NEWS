import {
  createFileRoute,
  Link,
  useRouteContext,
  useNavigate,
  redirect,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseUntyped } from "@/lib/supabase-untyped";
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
import { ArrowLeft, Check, X, Loader2, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/review/$id")({
  beforeLoad: ({ context }) => {
    if (!hasPermission(context.permissions, "review_articles")) {
      throw redirect({ to: "/access-denied" });
    }
  },
  component: ReviewEdition,
});

type ReviewCommentScope = "page" | "article" | "general";

type ReviewComment = {
  id: string;
  newspaper_id: string;
  article_id: string | null;
  page_number: number | null;
  scope: ReviewCommentScope;
  comment: string;
  created_at: string;
  created_by: string;
};

function getReviewCommentLabel(reviewComment: ReviewComment, articles: Article[]) {
  if (reviewComment.scope === "page") {
    return `Page ${reviewComment.page_number ?? ""}`;
  }

  if (reviewComment.scope === "article") {
    const articleIndex = articles.findIndex((article) => article.id === reviewComment.article_id);
    const article = articles[articleIndex];
    const articleNumber = articleIndex >= 0 ? articleIndex + 1 : "";
    return `Article ${articleNumber}${article?.headline ? `: ${article.headline}` : ""}`;
  }

  return "General";
}

function ReviewEdition() {
  const { id } = Route.useParams();
  const ctx = useRouteContext({ from: "/_authenticated" });
  const { user } = ctx;
  const organizationId = ctx.organization?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [comment, setComment] = useState("");
  const [publishing, setPublishing] = useState<string | null>(null);
  const [reviewCommentScope, setReviewCommentScope] = useState<ReviewCommentScope>("page");
  const [reviewCommentPage, setReviewCommentPage] = useState("1");
  const [reviewCommentArticleId, setReviewCommentArticleId] = useState("");
  const [reviewCommentText, setReviewCommentText] = useState("");

  const { data: newspaper } = useQuery({
    queryKey: ["review-newspaper", id, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newspapers")
        .select("*")
        .eq("id", id)
        .eq("organization_id", organizationId!)
        .single();
      if (error) throw error;
      return data as Newspaper;
    },
  });
  const { data: articles = [] } = useQuery({
    queryKey: ["review-articles", id, newspaper?.id],
    enabled: Boolean(newspaper?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from("articles").select("*").eq("newspaper_id", id);
      if (error) throw error;
      return (data ?? []) as unknown as Article[];
    },
  });
  const { data: latestLayout } = useQuery({
    queryKey: ["review-saved-layout", id, newspaper?.id],
    enabled: Boolean(newspaper?.id),
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

  const { data: reviewComments = [] } = useQuery({
    queryKey: ["review-comments", id, newspaper?.id],
    enabled: Boolean(newspaper?.id),
    refetchInterval: 3000,
    queryFn: async () => {
      const { data, error } = await supabaseUntyped
        .from("review_comments")
        .select("id,newspaper_id,article_id,page_number,scope,comment,created_at,created_by")
        .eq("newspaper_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReviewComment[];
    },
  });

  const addReviewComment = useMutation({
    mutationFn: async () => {
      const trimmedComment = reviewCommentText.trim();
      if (!trimmedComment) throw new Error("Write a review comment first");

      const selectedArticleId = reviewCommentArticleId || articles[0]?.id || "";
      if (reviewCommentScope === "article" && !selectedArticleId) {
        throw new Error("Select an article for this comment");
      }

      const pageNumber = Number.parseInt(reviewCommentPage, 10);
      if (reviewCommentScope === "page" && (!Number.isFinite(pageNumber) || pageNumber < 1)) {
        throw new Error("Select a valid page number");
      }

      const { error } = await supabaseUntyped.from("review_comments").insert({
        newspaper_id: id,
        created_by: user.id,
        scope: reviewCommentScope,
        page_number: reviewCommentScope === "page" ? pageNumber : null,
        article_id: reviewCommentScope === "article" ? selectedArticleId : null,
        comment: trimmedComment,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReviewCommentText("");
      qc.invalidateQueries({ queryKey: ["review-comments", id] });
      toast.success("Review comment added");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not add review comment"),
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
    await supabase
      .from("newspapers")
      .update({ status: "published" })
      .eq("id", id)
      .eq("organization_id", organizationId!);
    setPublishing(null);
  }

  const approve = useMutation({
    mutationFn: async () => {
      await supabase
        .from("reviews")
        .insert({ newspaper_id: id, chief_editor_id: user.id, decision: "approved", comment });
      await supabase
        .from("newspapers")
        .update({ status: "approved" })
        .eq("id", id)
        .eq("organization_id", organizationId!);
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Approved. Moved to approved queue.");
      navigate({ to: "/review" });
    },
    onError: (error: unknown) => {
      setPublishing(null);
      toast.error(error instanceof Error ? error.message : "Could not approve edition");
    },
  });

  const reject = useMutation({
    mutationFn: async () => {
      if (!comment.trim()) throw new Error("Add a comment explaining the rejection");
      await supabase
        .from("reviews")
        .insert({ newspaper_id: id, chief_editor_id: user.id, decision: "rejected", comment });
      await supabase
        .from("newspapers")
        .update({ status: "rejected" })
        .eq("id", id)
        .eq("organization_id", organizationId!);
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Sent back to editor");
      navigate({ to: "/review" });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not reject edition"),
  });

  if (!newspaper) return <div>Loading…</div>;
  const savedPreviewPages = savedLayoutPageNumbers(latestLayout);
  const hasSavedPreview = hasSavedEditorLayout(latestLayout);
  const totalPages = hasSavedPreview
    ? savedPreviewPages.length
    : getPrintPageCount(articles, newspaper.number_of_pages);
  const pages = hasSavedPreview
    ? savedPreviewPages
    : Array.from({ length: totalPages }, (_, i) => i + 1);
  const canDecide = newspaper.status === "pending_approval";
  const monitoringMessage =
    newspaper.status === "approved"
      ? "This edition is approved and waiting in the approved queue. Publish it when the organization is ready."
      : newspaper.status === "published"
        ? "This edition has already been published."
        : "This edition is still being edited. Decision controls appear after an editor sends it for approval.";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <Link
          to="/review"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Queue
        </Link>
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
              <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                Page {p}
              </div>
              {hasSavedPreview ? (
                <SavedLayoutPreviewPage
                  newspaper={newspaper}
                  articles={articles}
                  layoutJson={latestLayout}
                  pageNumber={p}
                  totalPages={totalPages}
                />
              ) : (
                <NewspaperPage
                  newspaper={newspaper}
                  articles={articles}
                  pageNumber={p}
                  totalPages={totalPages}
                />
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
            <li>
              Categories:{" "}
              {[...new Set(articles.map((a) => a.category).filter(Boolean))].join(", ") || "—"}
            </li>
          </ul>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Article list</h3>
          <div className="mt-2 space-y-1 text-xs">
            {articles.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between border-b py-1 last:border-0"
              >
                <span className="line-clamp-1 font-kannada">{a.headline}</span>
                <span className="shrink-0 text-muted-foreground">P{a.priority_score}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Review comments</h3>
          {canDecide && (
            <form
              className="mt-3 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                addReviewComment.mutate();
              }}
            >
              <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
                {(["page", "article", "general"] as ReviewCommentScope[]).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => setReviewCommentScope(scope)}
                    className={`rounded px-2 py-1.5 text-xs font-medium capitalize transition ${
                      reviewCommentScope === scope
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {scope}
                  </button>
                ))}
              </div>

              {reviewCommentScope === "page" && (
                <select
                  value={reviewCommentPage}
                  onChange={(event) => setReviewCommentPage(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {pages.map((page) => (
                    <option key={page} value={page}>
                      Page {page}
                    </option>
                  ))}
                </select>
              )}

              {reviewCommentScope === "article" && (
                <select
                  value={reviewCommentArticleId || articles[0]?.id || ""}
                  onChange={(event) => setReviewCommentArticleId(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {articles.map((article, index) => (
                    <option key={article.id} value={article.id}>
                      Article {index + 1}: {article.headline}
                    </option>
                  ))}
                </select>
              )}

              <Textarea
                rows={3}
                value={reviewCommentText}
                onChange={(event) => setReviewCommentText(event.target.value)}
                placeholder="Write a specific review comment"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={addReviewComment.isPending}
                className="w-full"
              >
                {addReviewComment.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquarePlus className="mr-2 h-4 w-4" />
                )}
                Add comment
              </Button>
            </form>
          )}

          <div className="mt-4 space-y-2">
            {reviewComments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No review comments yet.</p>
            ) : (
              reviewComments.map((reviewComment) => (
                <div key={reviewComment.id} className="rounded-md border bg-muted/30 p-3">
                  <div className="line-clamp-1 text-xs font-semibold">
                    {getReviewCommentLabel(reviewComment, articles)}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{reviewComment.comment}</p>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    {new Date(reviewComment.created_at).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {canDecide ? (
          <div className="rounded-lg border bg-card p-4">
            <h3 className="font-semibold">Decision</h3>
            <Textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional comment (required for reject)"
              className="mt-2"
            />
            <div className="mt-3 flex flex-col gap-2">
              <Button
                onClick={() => approve.mutate()}
                disabled={approve.isPending || !!publishing}
                className="w-full"
              >
                {publishing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {publishing}
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" /> Approve
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => reject.mutate()}
                disabled={reject.isPending || !!publishing}
                className="w-full"
              >
                <X className="mr-2 h-4 w-4" /> Reject
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Approved editions move to the approved queue. Publish from there when the
              organization is ready.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-4">
            <h3 className="font-semibold">Monitoring</h3>
            <p className="mt-2 text-sm text-muted-foreground">{monitoringMessage}</p>
          </div>
        )}
      </aside>
    </div>
  );
}
