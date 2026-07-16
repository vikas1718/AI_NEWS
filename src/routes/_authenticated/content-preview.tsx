import { createFileRoute, redirect, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { KannadaTtsPlayer } from "@/components/KannadaTtsPlayer";
import { getPrintPageCount, NewspaperPage } from "@/components/NewspaperPage";
import {
  hasSavedEditorLayout,
  savedLayoutPageNumbers,
  SavedLayoutPreviewPage,
} from "@/components/SavedLayoutPreviewPage";
import type { Article, Newspaper } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { supabase } from "@/integrations/supabase/client";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { translateText, type TranslateTargetLanguage } from "@/lib/translate";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Volume2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/content-preview")({
  beforeLoad: ({ context }) => {
    if (!hasPermission(context.permissions, "access_assigned_pages")) {
      throw redirect({ to: "/access-denied" });
    }
  },
  component: ContentPreview,
});

type PageTurnPreviewProps = {
  newspaper: Newspaper;
  articles: Article[];
  latestLayout: unknown;
  pages: number[];
  totalPages: number;
  hasSavedPreview: boolean;
  activeArticleId: string;
  onArticleTap: (articleId: string) => void;
  onTranslateArticle: (articleId: string) => void;
};

function PageTurnPreview({
  newspaper,
  articles,
  latestLayout,
  pages,
  totalPages,
  hasSavedPreview,
  activeArticleId,
  onArticleTap,
  onTranslateArticle,
}: PageTurnPreviewProps) {
  const [visiblePage, setVisiblePage] = useState(pages[0] ?? 1);
  const [turnTargetPage, setTurnTargetPage] = useState<number | null>(null);
  const [turnDirection, setTurnDirection] = useState<1 | -1>(1);
  const isTurning = turnTargetPage !== null;
  const activePage = turnTargetPage ?? visiblePage;
  const activeIndex = Math.max(0, pages.indexOf(visiblePage));

  useEffect(() => {
    if (pages.includes(visiblePage)) return;
    setVisiblePage(pages[0] ?? 1);
    setTurnTargetPage(null);
  }, [pages, visiblePage]);

  useEffect(() => {
    if (turnTargetPage === null) return;
    const timeout = window.setTimeout(() => {
      setVisiblePage(turnTargetPage);
      setTurnTargetPage(null);
    }, 680);
    return () => window.clearTimeout(timeout);
  }, [turnTargetPage]);

  function renderPage(page: number) {
    const commonProps = {
      newspaper,
      articles,
      pageNumber: page,
      totalPages,
      activeArticleId,
      onArticleTap,
      onTranslateArticle,
    };

    if (hasSavedPreview) {
      return (
        <SavedLayoutPreviewPage
          {...commonProps}
          layoutJson={latestLayout}
        />
      );
    }

    return <NewspaperPage {...commonProps} />;
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

      <div className="relative overflow-x-auto py-4" style={{ perspective: 1800 }}>
        <div
          className="relative mx-auto"
          style={{ width: 780, maxWidth: "100%", minHeight: 1120, transformStyle: "preserve-3d" }}
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

function ContentPreview() {
  const ctx = useRouteContext({ from: "/_authenticated" });
  const [selectedEditionId, setSelectedEditionId] = useState<string>("");
  const [translatedText, setTranslatedText] = useState<string>("");
  const [selectedArticleId, setSelectedArticleId] = useState<string>("");
  const [activeArticleId, setActiveArticleId] = useState<string>("");
  const [translateTarget, setTranslateTarget] = useState<TranslateTargetLanguage>("kn");
  const [listenOpen, setListenOpen] = useState(false);

  const { data: editions = [], isLoading: editionsLoading } = useQuery({
    queryKey: ["cp-editions", ctx.organization?.id],
    enabled: Boolean(ctx.organization?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newspapers")
        .select("*")
        .eq("organization_id", ctx.organization!.id)
        .order("updated_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Newspaper[];
    },
  });

  useEffect(() => {
    if (selectedEditionId || editions.length === 0) return;
    setSelectedEditionId(editions[0].id);
  }, [editions, selectedEditionId]);

  const { data: newspaper } = useQuery({
    queryKey: ["cp-newspaper", selectedEditionId],
    enabled: Boolean(selectedEditionId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newspapers")
        .select("*")
        .eq("id", selectedEditionId)
        .single();
      if (error) throw error;
      return data as Newspaper;
    },
  });

  const { data: articles = [], isFetching: articlesLoading } = useQuery({
    queryKey: ["cp-articles", selectedEditionId],
    enabled: Boolean(selectedEditionId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("newspaper_id", selectedEditionId)
        .order("priority_score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Article[];
    },
  });

  const { data: latestLayout } = useQuery({
    queryKey: ["cp-layout", selectedEditionId],
    enabled: Boolean(selectedEditionId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("layouts")
        .select("layout_json")
        .eq("newspaper_id", selectedEditionId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.layout_json ?? null;
    },
  });

  const laidOut = useMemo(() => articles.filter((a) => a.page_number), [articles]);
  const hasSavedPreview = useMemo(
    () => (latestLayout ? hasSavedEditorLayout(latestLayout) : false),
    [latestLayout],
  );

  const totalPages = useMemo(() => {
    if (!newspaper) return 1;
    return hasSavedPreview ? savedLayoutPageNumbers(latestLayout).length : getPrintPageCount(articles, newspaper.number_of_pages);
  }, [articles, hasSavedPreview, latestLayout, newspaper]);

  const pages = useMemo(() => {
    if (hasSavedPreview) return savedLayoutPageNumbers(latestLayout);
    return newspaper
      ? Array.from({ length: totalPages }, (_, idx) => idx + 1)
      : Array.from({ length: totalPages }, (_, idx) => idx + 1);
  }, [hasSavedPreview, latestLayout, newspaper, totalPages]);

  const sourceArticleText = useMemo(() => {
    const a = articles.find((x) => x.id === selectedArticleId);
    return a
      ? a.corrected_text ?? a.ocr_text ?? a.raw_text ?? a.summary ?? ""
      : "";
  }, [articles, selectedArticleId]);

  const translateMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!text.trim()) throw new Error("No article text to translate");
      return translateText({
        text,
        options: { targetLanguage: translateTarget },
      });
    },
    onSuccess: (text) => {
      setTranslatedText(text);
      toast.success("Translated");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Translation failed");
    },
  });

  function articleSourceText(articleId: string) {
    const article = articles.find((a) => a.id === articleId);
    return article
      ? article.corrected_text ?? article.ocr_text ?? article.raw_text ?? article.summary ?? ""
      : "";
  }

  function handleArticleTap(articleId: string) {
    setActiveArticleId(articleId);
    setSelectedArticleId(articleId);
    setTranslatedText("");
  }

  function handleTranslateArticle(articleId: string) {
    setActiveArticleId(articleId);
    setSelectedArticleId(articleId);
    setTranslatedText("");
    const text = articleSourceText(articleId);
    if (!text.trim()) {
      toast.error("No article text to translate");
      return;
    }
    setListenOpen(true);
    translateMutation.mutate(text);
  }

  return (
  <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold">Content Preview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Select an edition, preview pages, translate articles, and listen via TTS.
          </p>
        </div>

        <div className="flex items-end gap-4">
          <div className="space-y-2">
            <Label>Edition</Label>
            <Select value={selectedEditionId} onValueChange={setSelectedEditionId} disabled={editionsLoading}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Select edition" />
              </SelectTrigger>
              <SelectContent>
                {editions.map((ed) => (
                  <SelectItem key={ed.id} value={ed.id}>
                    {ed.edition_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Translate to</Label>
            <Input
              value={translateTarget}
              onChange={(e) => setTranslateTarget(e.target.value as TranslateTargetLanguage)}
              className="w-[160px]"
            />
          </div>
        </div>
      </div>


      {!newspaper ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Select an edition to preview.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="rounded-lg border bg-card p-4">
            <PageTurnPreview
              newspaper={newspaper}
              articles={articles}
              latestLayout={latestLayout}
              pages={pages}
              totalPages={totalPages}
              hasSavedPreview={hasSavedPreview}
              activeArticleId={activeArticleId}
              onArticleTap={handleArticleTap}
              onTranslateArticle={handleTranslateArticle}
            />
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm font-semibold">Article</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Hover or tap an article in the preview, then click Translate.
              </div>
              <div className="mt-3 text-sm font-medium">
                {articles.find((a) => a.id === selectedArticleId)?.headline ?? "—"}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => selectedArticleId && handleTranslateArticle(selectedArticleId)}
                  disabled={
                    translateMutation.isPending || !selectedArticleId || !sourceArticleText.trim()
                  }
                >
                  {translateMutation.isPending ? "Translating…" : "Translate"}
                </Button>
                {translatedText && (
                  <Button type="button" variant="secondary" onClick={() => setListenOpen(true)}>
                    <Volume2 className="mr-2 h-4 w-4" />
                    Listen
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setTranslatedText("");
                    setSelectedArticleId("");
                    setActiveArticleId("");
                    setListenOpen(false);
                  }}
                >
                  Clear
                </Button>
              </div>

              {translatedText && (
                <div className="mt-4 max-h-[260px] overflow-auto whitespace-pre-wrap rounded-md bg-muted/35 p-3 text-sm">
                  {translatedText}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={listenOpen} onOpenChange={setListenOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md sm:max-w-md">
          <DialogHeader className="min-w-0">
            <DialogTitle className="truncate">Listen to Translation</DialogTitle>
            <DialogDescription className="line-clamp-2 break-words">
              {articles.find((a) => a.id === selectedArticleId)?.headline ?? "Article audio"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0">
            <KannadaTtsPlayer
              inputText={translatedText}
              autoGenerate={Boolean(translatedText)}
              title={articles.find((a) => a.id === selectedArticleId)?.headline ?? undefined}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

