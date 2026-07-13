import { createFileRoute, Link, redirect, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Layout as LayoutIcon,
  Loader2,
  MessageSquareText,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AddArticleFlow } from "@/components/AddArticleFlow";
import { ArticleCard } from "@/components/ArticleCard";
import {
  createGeneratedEditorLayout,
  NewspaperLayoutEditor,
} from "@/components/NewspaperLayoutEditor";
import { Card } from "@/components/ui/card";
import { getPrintPageCount, NewspaperPage } from "@/components/NewspaperPage";
import {
  hasSavedEditorLayout,
  savedLayoutPageNumbers,
  SavedLayoutPreviewPage,
} from "@/components/SavedLayoutPreviewPage";
import { StatusBadge } from "@/components/StatusBadge";
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
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { Article, Newspaper } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { supabaseUntyped } from "@/lib/supabase-untyped";

export const Route = createFileRoute("/_authenticated/editions/$id")({
  beforeLoad: ({ context }) => {
    if (!hasPermission(context.permissions, "access_assigned_pages")) {
      throw redirect({ to: "/access-denied" });
    }
  },
  component: EditionWorkspace,
});

type SavedPlacement = {
  articleId: string;
  pageNumber: number;
  slotKind: string;
  slotWidth: number;
};

type PageTurnPreviewProps = {
  newspaper: Newspaper;
  articles: Article[];
  latestLayout: unknown;
  pages: number[];
  totalPages: number;
  hasSavedPreview: boolean;
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function savedEditorPlacements(layoutJson: unknown): SavedPlacement[] {
  if (!isRecord(layoutJson) || !isRecord(layoutJson.pages)) return [];

  const placements: SavedPlacement[] = [];
  for (const [pageNumber, pageState] of Object.entries(layoutJson.pages)) {
    if (!isRecord(pageState) || !Array.isArray(pageState.slots) || !isRecord(pageState.assignments))
      continue;

    for (const slot of pageState.slots) {
      if (!isRecord(slot) || typeof slot.id !== "string") continue;
      const assignment = pageState.assignments[slot.id];
      if (!isRecord(assignment) || typeof assignment.articleId !== "string") continue;

      placements.push({
        articleId: assignment.articleId,
        pageNumber: Number(pageNumber),
        slotKind: typeof slot.kind === "string" ? slot.kind : "story",
        slotWidth: typeof slot.w === "number" ? slot.w : 4,
      });
    }
  }

  return placements;
}

function PageTurnPreview({
  newspaper,
  articles,
  latestLayout,
  pages,
  totalPages,
  hasSavedPreview,
}: PageTurnPreviewProps) {
  const firstPage = pages[0] ?? 1;
  const pagesKey = pages.join(",");
  const [visiblePage, setVisiblePage] = useState(firstPage);
  const [turnTargetPage, setTurnTargetPage] = useState<number | null>(null);
  const [turnDirection, setTurnDirection] = useState<1 | -1>(1);
  const isTurning = turnTargetPage !== null;
  const activePage = turnTargetPage ?? visiblePage;
  const activeIndex = Math.max(0, pages.indexOf(visiblePage));

  useEffect(() => {
    if (pages.includes(visiblePage)) return;
    setVisiblePage(firstPage);
    setTurnTargetPage(null);
  }, [firstPage, pagesKey, visiblePage]);

  useEffect(() => {
    if (turnTargetPage === null) return;

    const timeout = window.setTimeout(() => {
      setVisiblePage(turnTargetPage);
      setTurnTargetPage(null);
    }, 680);

    return () => window.clearTimeout(timeout);
  }, [turnTargetPage]);

  function renderPage(page: number) {
    return hasSavedPreview ? (
      <SavedLayoutPreviewPage
        newspaper={newspaper}
        articles={articles}
        layoutJson={latestLayout}
        pageNumber={page}
        totalPages={totalPages}
      />
    ) : (
      <NewspaperPage
        newspaper={newspaper}
        articles={articles}
        pageNumber={page}
        totalPages={totalPages}
      />
    );
  }

  function openPage(page: number) {
    if (page === visiblePage || isTurning) return;
    setTurnDirection(page > visiblePage ? 1 : -1);
    setTurnTargetPage(page);
  }

  function stepPage(direction: 1 | -1) {
    const nextPage = pages[activeIndex + direction];
    if (nextPage) openPage(nextPage);
  }

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes newspaper-page-turn-next {
          0% {
            transform: rotateY(0deg) translateX(0);
            box-shadow: 0 20px 45px rgba(15, 23, 42, 0.18);
            filter: brightness(1);
          }
          45% {
            transform: rotateY(-58deg) translateX(-10px);
            box-shadow: -32px 24px 50px rgba(15, 23, 42, 0.3);
            filter: brightness(0.96);
          }
          100% {
            transform: rotateY(-112deg) translateX(-28px);
            box-shadow: -46px 28px 58px rgba(15, 23, 42, 0.18);
            filter: brightness(0.9);
          }
        }

        @keyframes newspaper-page-turn-previous {
          0% {
            transform: rotateY(0deg) translateX(0);
            box-shadow: 0 20px 45px rgba(15, 23, 42, 0.18);
            filter: brightness(1);
          }
          45% {
            transform: rotateY(58deg) translateX(10px);
            box-shadow: 32px 24px 50px rgba(15, 23, 42, 0.3);
            filter: brightness(0.96);
          }
          100% {
            transform: rotateY(112deg) translateX(28px);
            box-shadow: 46px 28px 58px rgba(15, 23, 42, 0.18);
            filter: brightness(0.9);
          }
        }

        @keyframes newspaper-page-arrive {
          0% {
            opacity: 0.72;
            transform: translateX(var(--page-arrive-offset, 18px)) scale(0.985);
          }
          100% {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .newspaper-page-turn-out,
          .newspaper-page-turn-in {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Page preview</div>
          <div className="text-xs text-muted-foreground">
            Page {activePage} of {totalPages}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => stepPage(-1)}
            disabled={isTurning || activeIndex <= 0}
            title="Previous page"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => stepPage(1)}
            disabled={isTurning || activeIndex >= pages.length - 1}
            title="Next page"
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => openPage(page)}
            disabled={isTurning}
            className={`h-8 min-w-12 rounded border px-2 text-xs font-semibold transition ${
              activePage === page
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Page {page}
          </button>
        ))}
      </div>

      <div
        className="relative overflow-x-auto py-4"
        style={{
          perspective: 1800,
          perspectiveOrigin: "50% 42%",
        }}
      >
        <div
          className="relative mx-auto"
          style={{
            width: 780,
            maxWidth: "100%",
            minHeight: 1120,
            transformStyle: "preserve-3d",
          }}
        >
          <div
            key={`page-in-${activePage}`}
            className={isTurning ? "newspaper-page-turn-in" : ""}
            style={{
              animation: isTurning ? "newspaper-page-arrive 680ms ease-out both" : undefined,
              ["--page-arrive-offset" as string]: turnDirection === 1 ? "22px" : "-22px",
            }}
          >
            {renderPage(activePage)}
          </div>

          {isTurning && (
            <div
              key={`page-out-${visiblePage}-${turnTargetPage}`}
              className="newspaper-page-turn-out pointer-events-none absolute inset-x-0 top-0"
              style={{
                animation:
                  turnDirection === 1
                    ? "newspaper-page-turn-next 680ms cubic-bezier(0.2, 0.7, 0.2, 1) both"
                    : "newspaper-page-turn-previous 680ms cubic-bezier(0.2, 0.7, 0.2, 1) both",
                backfaceVisibility: "hidden",
                transformOrigin: turnDirection === 1 ? "left center" : "right center",
                transformStyle: "preserve-3d",
                zIndex: 2,
              }}
            >
              {renderPage(visiblePage)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditionWorkspace() {
  const { id } = Route.useParams();
  const ctx = useRouteContext({ from: "/_authenticated" });
  const organizationId = ctx.organization?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"articles" | "layout" | "preview">("articles");

  const { data: newspaper } = useQuery({
    queryKey: ["newspaper", id, organizationId],
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
    queryKey: ["articles", id, newspaper?.id],
    enabled: Boolean(newspaper?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("newspaper_id", id)
        .order("priority_score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Article[];
    },
  });

  const { data: latestLayout } = useQuery({
    queryKey: ["saved-layout", id, newspaper?.id],
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

  const genLayout = useMutation({
    mutationFn: async () => {
      if (!newspaper) return;
      const ready = articles.filter((article) => article.workflow_status?.ready_for_layout);
      if (ready.length === 0)
        throw new Error("Mark image step complete on at least one article first.");

      const { data: savedLayout, error: savedLayoutError } = await supabase
        .from("layouts")
        .select("layout_json")
        .eq("newspaper_id", id)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (savedLayoutError) throw savedLayoutError;

      const savedPlacements = savedEditorPlacements(savedLayout?.layout_json);
      if (savedPlacements.length > 0) {
        let priority = 100;
        const placedArticleIds = new Set(savedPlacements.map((placement) => placement.articleId));

        for (const placement of savedPlacements) {
          const { error } = await supabase
            .from("articles")
            .update({
              page_number: placement.pageNumber,
              position: placement.slotKind === "lead" ? "top" : "body",
              headline_size:
                placement.slotKind === "lead"
                  ? "big"
                  : placement.slotWidth >= 6
                    ? "medium"
                    : "small",
              image_size:
                placement.slotKind === "image" || placement.slotKind === "lead" ? "large" : "small",
              column_count: Math.min(3, Math.max(1, Math.floor(placement.slotWidth / 4))),
              priority_score: priority,
            })
            .eq("id", placement.articleId)
            .eq("newspaper_id", id);
          if (error) throw error;
          priority -= 1;
        }

        const unplacedArticleIds = articles
          .map((article) => article.id)
          .filter((articleId) => !placedArticleIds.has(articleId));
        if (unplacedArticleIds.length > 0) {
          const { error } = await supabase
            .from("articles")
            .update({
              page_number: null,
              position: null,
              headline_size: null,
              image_size: null,
              column_count: null,
            })
            .in("id", unplacedArticleIds)
            .eq("newspaper_id", id);
          if (error) throw error;
        }

        await supabase
          .from("newspapers")
          .update({ status: "pending_layout" })
          .eq("id", id)
          .eq("organization_id", organizationId!);
        return "saved";
      }

      const layoutJson = createGeneratedEditorLayout(ready, newspaper.number_of_pages);
      const generatedPlacements = savedEditorPlacements(layoutJson);
      let priority = 100;

      for (const placement of generatedPlacements) {
        const { error } = await supabase
          .from("articles")
          .update({
            page_number: placement.pageNumber,
            position: placement.slotKind === "lead" ? "top" : "body",
            headline_size:
              placement.slotKind === "lead" ? "big" : placement.slotWidth >= 6 ? "medium" : "small",
            image_size:
              placement.slotKind === "image" || placement.slotKind === "lead" ? "large" : "small",
            column_count: Math.min(3, Math.max(1, Math.floor(placement.slotWidth / 4))),
            priority_score: priority,
          })
          .eq("id", placement.articleId)
          .eq("newspaper_id", id);
        if (error) throw error;
        priority -= 1;
      }
      await supabase.from("layouts").insert({ newspaper_id: id, layout_json: layoutJson });
      await supabase
        .from("newspapers")
        .update({ status: "pending_layout" })
        .eq("id", id)
        .eq("organization_id", organizationId!);
      return "generated";
    },
    onSuccess: (source) => {
      queryClient.invalidateQueries();
      queryClient.invalidateQueries({ queryKey: ["saved-layout", id] });
      toast.success(source === "saved" ? "Saved editor layout loaded" : "Layout generated");
      setTab("layout");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Layout generation failed"),
  });

  const sendChief = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("newspapers")
        .update({ status: "pending_approval" })
        .eq("id", id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Submitted for approval");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not send for review"),
  });

  const deleteNewspaper = useMutation({
    mutationFn: async () => {
      const { error: layoutError } = await supabase.from("layouts").delete().eq("newspaper_id", id);
      if (layoutError) throw layoutError;

      const { error: articleError } = await supabase.from("articles").delete().eq("newspaper_id", id);
      if (articleError) throw articleError;

      const { error } = await supabase
        .from("newspapers")
        .delete()
        .eq("id", id)
        .eq("organization_id", organizationId!);
      if (error) throw error;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["newspapers", organizationId] });
      queryClient.removeQueries({ queryKey: ["newspaper", id, organizationId] });
      queryClient.removeQueries({ queryKey: ["articles", id] });
      queryClient.removeQueries({ queryKey: ["saved-layout", id] });
      toast.success("Newspaper deleted");
      await navigate({ to: "/editions" });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not delete newspaper"),
  });

  if (!newspaper) return <div className="text-sm text-muted-foreground">Loading...</div>;

  const laidOut = articles.filter((article) => article.page_number);
  const savedPreviewPages = savedLayoutPageNumbers(latestLayout);
  const hasSavedPreview = hasSavedEditorLayout(latestLayout);
  const totalPages = hasSavedPreview
    ? savedPreviewPages.length
    : getPrintPageCount(articles, newspaper.number_of_pages);
  const pages = hasSavedPreview
    ? savedPreviewPages
    : Array.from({ length: totalPages }, (_, index) => index + 1);
  const canEdit =
    hasPermission(ctx.permissions, "edit_articles") &&
    !["pending_approval", "approved", "published"].includes(newspaper.status);
  const canGenerateLayout = canEdit && hasPermission(ctx.permissions, "access_layout_generation");
  const canSendForReview =
    canEdit && (hasPermission(ctx.permissions, "submit_for_review") || ctx.role === "editor");
  const canDeleteNewspaper =
    ctx.role === "owner" || hasPermission(ctx.permissions, "delete_newspapers");
  const approvalPending = newspaper.status === "pending_approval";

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/editions"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Editions
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-bold">{newspaper.edition_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>{format(new Date(newspaper.edition_date), "dd MMM yyyy")}</span>
              <span>{newspaper.language}</span>
              <span>{totalPages} pages</span>
              <StatusBadge status={newspaper.status} />
            </div>
          </div>
          <div className="flex gap-2">
            {canGenerateLayout && (
              <Button
                variant="outline"
                onClick={() => genLayout.mutate()}
                disabled={genLayout.isPending}
              >
                {genLayout.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LayoutIcon className="mr-2 h-4 w-4" />
                )}
                Generate layout
              </Button>
            )}
            {canSendForReview && laidOut.length > 0 && (
              <Button onClick={() => sendChief.mutate()} disabled={sendChief.isPending}>
                <Send className="mr-2 h-4 w-4" />
                Submit for Review
              </Button>
            )}
            {canDeleteNewspaper && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={deleteNewspaper.isPending}>
                    {deleteNewspaper.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Delete newspaper
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {newspaper.edition_name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes the newspaper edition, its articles, and saved
                      layouts. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleteNewspaper.isPending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteNewspaper.mutate()}
                      disabled={deleteNewspaper.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete newspaper
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {newspaper.status === "published" && (
              <Link
                to="/published/$id"
                params={{ id }}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                View outputs
              </Link>
            )}
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "articles" | "layout" | "preview")}
      >
        {approvalPending && (
          <Card className="mb-4 rounded-lg border-amber-500/30 bg-amber-500/10 p-4">
            <div className="text-sm font-semibold">Approval Pending</div>
            <p className="mt-1 text-sm text-muted-foreground">
              This newspaper has been submitted to the chief editor and is waiting for review.
            </p>
          </Card>
        )}
        {tab === "articles" && reviewComments.length > 0 && (
          <Card className="mb-4 rounded-lg border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquareText className="h-4 w-4" />
              Chief editor comments
            </div>
            <div className="mt-3 space-y-2">
              {reviewComments.map((reviewComment) => (
                <div key={reviewComment.id} className="rounded-md border bg-background/80 p-3">
                  <div className="text-xs font-semibold">
                    {getReviewCommentLabel(reviewComment, articles)}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{reviewComment.comment}</p>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    {new Date(reviewComment.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
        <TabsList>
          <TabsTrigger value="articles">Articles ({articles.length})</TabsTrigger>
          <TabsTrigger value="layout">Layout editor</TabsTrigger>
          <TabsTrigger value="preview">Page preview</TabsTrigger>
        </TabsList>

        <TabsContent value="articles" className="mt-4 space-y-6">
          {canEdit ? (
            <AddArticleFlow newspaperId={id} />
          ) : (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              Read-only while edition is under review.
            </div>
          )}
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Article queue</h2>
                <p className="text-sm text-muted-foreground">
                  {articles.length} articles in this edition
                </p>
              </div>
            </div>
            {articles.length === 0 && (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                No articles yet. Add your first article above.
              </div>
            )}
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} editable={canEdit} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="layout" className="mt-4">
          <NewspaperLayoutEditor
            articles={articles}
            pages={pages}
            newspaperId={id}
            canEdit={canEdit}
          />
        </TabsContent>

        <TabsContent value="preview" className="mt-4 space-y-6">
          {laidOut.length === 0 && !hasSavedPreview ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              No layout yet. Click <b>Generate layout</b> above.
            </div>
          ) : (
            <PageTurnPreview
              newspaper={newspaper}
              articles={articles}
              latestLayout={latestLayout}
              pages={pages}
              totalPages={totalPages}
              hasSavedPreview={hasSavedPreview}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
