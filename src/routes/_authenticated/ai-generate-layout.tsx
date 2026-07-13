import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Newspaper as NewspaperIcon,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { NewspaperArticleBlockContent } from "@/components/NewspaperArticleBlock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Article, Newspaper } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ai-generate-layout")({
  component: AiGenerateLayoutPage,
});

type AiSlotKind = "lead" | "story" | "image" | "sidebar";

type AiLayoutSlot = {
  id: string;
  label: string;
  kind: AiSlotKind;
  tier?: "lead" | "secondary" | "brief" | "feature";
  x: number;
  y: number;
  w: number;
  h: number;
};

type AiLayoutTemplate = {
  id: string;
  name: string;
  description: string;
  strategy: string;
  preferredArticleCount: number;
  imageWeight: number;
  maxStories: number;
  slots: AiLayoutSlot[];
};

type AiAssignment = {
  articleId: string;
  fit: number;
  reason: string;
  text: {
    headlineScale: number;
    bodyScale: number;
  };
  image?: {
    position: "left" | "right" | "center" | "full";
    wrap: "square" | "tight";
    widthPct: number;
    aspectRatio: number;
    margin: number;
    caption: string;
  };
};

type AiGeneratedLayout = {
  template: AiLayoutTemplate;
  assignments: Record<string, AiAssignment>;
  orderedArticles: Article[];
  scoreCards: ArticleScore[];
  pages: number;
  variant: number;
  diagnostics: string[];
};

type ArticleScore = {
  article: Article;
  score: number;
  length: number;
  hasImage: boolean;
  isFeatured: boolean;
};

const PAGE_WIDTH = 780;
const PAGE_HEIGHT = 1084;
const GRID_COLUMNS = 12;
const GRID_ROWS = 18;
const PAGE_GUTTER = 8;
const ARTICLE_FILL_TARGET = 0.96;
const MAX_STORIES_PER_PAGE = 7;

const AI_TEMPLATES: AiLayoutTemplate[] = [
  {
    id: "balanced_broadsheet",
    name: "Balanced Broadsheet",
    description: "Two strong top stories with a dense lower report band.",
    strategy: "Best when the edition has four to six ready articles and at least one strong image.",
    preferredArticleCount: 5,
    imageWeight: 1.1,
    maxStories: 5,
    slots: [
      { id: "lead_left", label: "Lead story", kind: "lead", tier: "lead", x: 1, y: 1, w: 7, h: 8 },
      {
        id: "lead_right",
        label: "Second lead",
        kind: "story",
        tier: "secondary",
        x: 8,
        y: 1,
        w: 5,
        h: 8,
      },
      {
        id: "wide_bottom",
        label: "Long report",
        kind: "story",
        tier: "feature",
        x: 1,
        y: 9,
        w: 7,
        h: 6,
      },
      {
        id: "bottom_right",
        label: "Feature report",
        kind: "story",
        tier: "secondary",
        x: 8,
        y: 9,
        w: 5,
        h: 6,
      },
      {
        id: "briefs",
        label: "Briefs / analysis",
        kind: "sidebar",
        tier: "brief",
        x: 1,
        y: 15,
        w: 12,
        h: 4,
      },
    ],
  },
  {
    id: "lead_and_columns",
    name: "Lead With Deep Reports",
    description: "One dominant lead with three large supporting reports.",
    strategy: "Best when the edition has one clear lead and several long reports.",
    preferredArticleCount: 4,
    imageWeight: 1.2,
    maxStories: 4,
    slots: [
      { id: "hero", label: "Hero story", kind: "lead", tier: "lead", x: 1, y: 1, w: 7, h: 9 },
      {
        id: "right_column",
        label: "Right report",
        kind: "story",
        tier: "secondary",
        x: 8,
        y: 1,
        w: 5,
        h: 9,
      },
      {
        id: "bottom_left",
        label: "Bottom report",
        kind: "story",
        tier: "feature",
        x: 1,
        y: 10,
        w: 6,
        h: 9,
      },
      {
        id: "bottom_right",
        label: "Bottom report",
        kind: "story",
        tier: "feature",
        x: 7,
        y: 10,
        w: 6,
        h: 9,
      },
    ],
  },
  {
    id: "photo_feature",
    name: "Photo Feature",
    description: "Image-led front with compact supporting copy.",
    strategy: "Best when the top story has a strong image and the text queue is shorter.",
    preferredArticleCount: 4,
    imageWeight: 2,
    maxStories: 4,
    slots: [
      {
        id: "photo_lead",
        label: "Image lead",
        kind: "lead",
        tier: "lead",
        x: 1,
        y: 1,
        w: 12,
        h: 8,
      },
      {
        id: "analysis",
        label: "Analysis",
        kind: "story",
        tier: "secondary",
        x: 1,
        y: 9,
        w: 6,
        h: 5,
      },
      {
        id: "reaction",
        label: "Reaction",
        kind: "story",
        tier: "secondary",
        x: 7,
        y: 9,
        w: 6,
        h: 5,
      },
      {
        id: "footer",
        label: "Footer story",
        kind: "story",
        tier: "feature",
        x: 1,
        y: 14,
        w: 12,
        h: 5,
      },
    ],
  },
  {
    id: "dense_news_grid",
    name: "Compact Five Story Page",
    description: "Tighter news page, but with no tiny image boxes or squeezed captions.",
    strategy: "Best when the queue contains several short reports.",
    preferredArticleCount: 5,
    imageWeight: 0.65,
    maxStories: 5,
    slots: [
      { id: "lead", label: "Lead story", kind: "lead", tier: "lead", x: 1, y: 1, w: 7, h: 7 },
      {
        id: "top_right",
        label: "Top report",
        kind: "story",
        tier: "secondary",
        x: 8,
        y: 1,
        w: 5,
        h: 7,
      },
      { id: "mid_a", label: "Report", kind: "story", tier: "secondary", x: 1, y: 8, w: 6, h: 6 },
      { id: "mid_b", label: "Report", kind: "story", tier: "secondary", x: 7, y: 8, w: 6, h: 6 },
      {
        id: "bottom",
        label: "Bottom report",
        kind: "story",
        tier: "feature",
        x: 1,
        y: 14,
        w: 12,
        h: 5,
      },
    ],
  },
  {
    id: "print_column_front",
    name: "Print Column Front",
    description: "Classic newspaper front with a dominant lead, side report, and lower news rail.",
    strategy: "Best when short and medium stories need a page that still feels like newsprint.",
    preferredArticleCount: 7,
    imageWeight: 0.8,
    maxStories: 7,
    slots: [
      { id: "main_lead", label: "Main lead", kind: "lead", tier: "lead", x: 1, y: 1, w: 7, h: 7 },
      {
        id: "side_lead",
        label: "Side lead",
        kind: "story",
        tier: "secondary",
        x: 8,
        y: 1,
        w: 5,
        h: 7,
      },
      { id: "rail_a", label: "News rail", kind: "story", tier: "brief", x: 1, y: 8, w: 4, h: 5 },
      { id: "rail_b", label: "News rail", kind: "story", tier: "brief", x: 5, y: 8, w: 4, h: 5 },
      { id: "rail_c", label: "News rail", kind: "story", tier: "brief", x: 9, y: 8, w: 4, h: 5 },
      {
        id: "bottom_feature",
        label: "Bottom feature",
        kind: "story",
        tier: "feature",
        x: 1,
        y: 13,
        w: 8,
        h: 6,
      },
      {
        id: "bottom_sidebar",
        label: "Bottom sidebar",
        kind: "sidebar",
        tier: "brief",
        x: 9,
        y: 13,
        w: 4,
        h: 6,
      },
    ],
  },
];

function bestArticleText(article: Article) {
  const candidates = [
    article.corrected_text,
    article.ocr_text,
    article.raw_text,
    article.summary,
    article.headline,
  ];

  return candidates.find((value) => value?.replace(/\s+/g, " ").trim())?.trim() ?? "";
}

function hasArticleCopy(article: Article) {
  return Boolean(bestArticleText(article));
}

function articleLength(article: Article) {
  return bestArticleText(article).length + (article.headline?.length ?? 0) * 3;
}

function workflowValue(article: Article, key: string) {
  return (article.workflow_status as Record<string, unknown> | null | undefined)?.[key];
}

function isFeaturedArticle(article: Article) {
  return Boolean(
    workflowValue(article, "featured") ||
    workflowValue(article, "lead_story") ||
    workflowValue(article, "ready_for_layout") ||
    article.position === "top" ||
    article.headline_size === "big",
  );
}

function scoreArticle(article: Article): ArticleScore {
  const length = articleLength(article);
  const hasImage = Boolean(article.image_url);
  const isFeatured = isFeaturedArticle(article);
  const priority = article.priority_score ?? 0;
  const categoryWeight =
    article.category === "Politics"
      ? 8
      : article.category === "Business" || article.category === "Education"
        ? 5
        : article.category === "Sports"
          ? 4
          : 2;
  const lengthWeight = Math.min(22, length / 95);
  const imageWeight = hasImage ? 8 : 0;
  const featuredWeight = isFeatured ? 18 : 0;

  return {
    article,
    score: priority + categoryWeight + lengthWeight + imageWeight + featuredWeight,
    length,
    hasImage,
    isFeatured,
  };
}

function slotCapacity(slot: AiLayoutSlot) {
  const tierWeight =
    slot.tier === "lead" ? 48 : slot.tier === "feature" ? 42 : slot.tier === "brief" ? 28 : 36;
  return slot.w * slot.h * tierWeight;
}

function templateArticleCapacity(template: AiLayoutTemplate) {
  return Math.min(template.slots.length, template.maxStories, MAX_STORIES_PER_PAGE);
}

function sentenceSafeTrim(text: string, maxLength: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;

  const clipped = clean.slice(0, Math.max(80, maxLength));
  const sentenceEnd = Math.max(
    clipped.lastIndexOf("."),
    clipped.lastIndexOf("?"),
    clipped.lastIndexOf("!"),
    clipped.lastIndexOf("|"),
  );
  const trimPoint = sentenceEnd > maxLength * 0.55 ? sentenceEnd + 1 : clipped.lastIndexOf(" ");
  const result = clipped.slice(0, trimPoint > 80 ? trimPoint : maxLength).trim();
  return `${result}...`;
}

function articleForSlot(article: Article, slot: AiLayoutSlot, assignment: AiAssignment): Article {
  const sourceText = bestArticleText(article);
  const imagePenalty = assignment.image
    ? assignment.image.position === "full"
      ? 0.48
      : Math.max(0.52, 1 - assignment.image.widthPct / 100)
    : 1;
  const headlinePenalty = Math.max(0.78, 1 - (article.headline?.length ?? 0) / 360);
  const maxLength = Math.round(slotCapacity(slot) * imagePenalty * headlinePenalty);
  const fittedText = sentenceSafeTrim(sourceText, maxLength);

  return {
    ...article,
    corrected_text: fittedText,
    ocr_text: null,
    raw_text: null,
    summary: article.summary,
  };
}

function rankedTemplates(scoreCards: ArticleScore[]) {
  const articleCount = scoreCards.length;
  const targetStoryCount = Math.min(articleCount, MAX_STORIES_PER_PAGE);
  const imageCount = scoreCards.filter((card) => card.hasImage).length;
  const shortCount = scoreCards.filter((card) => card.length < 650).length;
  const averageLength =
    scoreCards.reduce((total, card) => total + card.length, 0) / Math.max(scoreCards.length, 1);

  return [...AI_TEMPLATES].sort((a, b) => {
    const aSlots = templateArticleCapacity(a);
    const bSlots = templateArticleCapacity(b);
    const aCapacity =
      Math.abs(a.preferredArticleCount - targetStoryCount) +
      Math.max(0, targetStoryCount - aSlots) * 24;
    const bCapacity =
      Math.abs(b.preferredArticleCount - targetStoryCount) +
      Math.max(0, targetStoryCount - bSlots) * 24;
    const aImageFit = Math.abs(imageCount * a.imageWeight - (a.id === "photo_feature" ? 3 : 2));
    const bImageFit = Math.abs(imageCount * b.imageWeight - (b.id === "photo_feature" ? 3 : 2));
    const aLengthFit =
      averageLength > 1500 && a.id === "dense_news_grid"
        ? 8
        : shortCount >= 4 && a.id === "print_column_front"
          ? -4
          : 0;
    const bLengthFit =
      averageLength > 1500 && b.id === "dense_news_grid"
        ? 8
        : shortCount >= 4 && b.id === "print_column_front"
          ? -4
          : 0;
    return aCapacity + aImageFit + aLengthFit - (bCapacity + bImageFit + bLengthFit);
  });
}

function chooseTemplate(scoreCards: ArticleScore[], variant: number) {
  const ranked = rankedTemplates(scoreCards);
  const targetStoryCount = Math.min(scoreCards.length, MAX_STORIES_PER_PAGE);
  const templatesWithRoom = ranked.filter(
    (template) => templateArticleCapacity(template) >= targetStoryCount,
  );
  const candidates = templatesWithRoom.length > 0 ? templatesWithRoom : ranked;
  return candidates[variant % candidates.length] ?? candidates[0] ?? ranked[0];
}

function rotateSecondaryStories(cards: ArticleScore[], variant: number) {
  if (cards.length <= 2 || variant === 0) return cards;

  const [lead, ...secondary] = cards;
  const offset = variant % secondary.length;
  return [lead, ...secondary.slice(offset), ...secondary.slice(0, offset)];
}

function newspaperImagePosition(slot: AiLayoutSlot, ratio: number) {
  if (slot.kind === "lead" && slot.w >= 9 && ratio < 0.8) return "full";
  return slot.x >= 7 ? "right" : "left";
}

function newspaperImageWidth(
  slot: AiLayoutSlot,
  ratio: number,
  position: "left" | "right" | "full",
) {
  if (position === "full") return 100;

  const area = slot.w * slot.h;
  const roomy = area >= 56 || slot.w >= 7;
  const tightCopy = ratio > 1.05;

  if (slot.tier === "lead") {
    return roomy ? (tightCopy ? 40 : 48) : 38;
  }

  if (slot.tier === "feature") {
    return roomy ? (tightCopy ? 34 : 40) : 32;
  }

  if (slot.tier === "secondary") {
    return roomy ? (tightCopy ? 32 : 36) : 30;
  }

  return area >= 30 ? 28 : 0;
}

function fitArticleToSlot(article: Article, slot: AiLayoutSlot) {
  const length = articleLength(article);
  const capacity = slotCapacity(slot);
  const ratio = length / Math.max(capacity, 1);
  const unusedSpace = ratio < ARTICLE_FILL_TARGET;
  const dense = ratio > 1.08;
  const hasImage = Boolean(article.image_url);
  const imagePosition = newspaperImagePosition(slot, ratio);
  const imageWidth = hasImage ? newspaperImageWidth(slot, ratio, imagePosition) : 0;
  const shouldUseImage = hasImage && imageWidth > 0;
  const headlineScale =
    slot.tier === "lead"
      ? unusedSpace
        ? 118
        : dense
          ? 96
          : 112
      : slot.tier === "brief"
        ? dense
          ? 82
          : 92
        : unusedSpace
          ? 104
          : dense
            ? 82
            : 100;
  const bodyScale = unusedSpace
    ? Math.min(slot.tier === "brief" ? 104 : 116, 100 + (ARTICLE_FILL_TARGET - ratio) * 24)
    : dense
      ? 82
      : 100;

  return {
    fit: Math.round(Math.min(1.18, ratio) * 100),
    text: {
      headlineScale: Math.round(headlineScale),
      bodyScale: Math.round(bodyScale),
    },
    image: shouldUseImage
      ? {
          position: imagePosition,
          wrap: imagePosition === "full" ? ("square" as const) : ("tight" as const),
          widthPct: imageWidth,
          aspectRatio: imagePosition === "full" ? 16 / 7 : 4 / 3,
          margin: slot.kind === "lead" ? 9 : 8,
          caption: "",
        }
      : undefined,
  };
}

function generateAiLayout(
  articles: Article[],
  pageCount: number,
  variant: number,
): AiGeneratedLayout | null {
  const scoreCards = articles
    .filter((article) => article.workflow_status?.ready_for_layout || hasArticleCopy(article))
    .map(scoreArticle)
    .sort((a, b) => b.score - a.score);

  if (scoreCards.length === 0) return null;

  const template = chooseTemplate(scoreCards, variant);
  const orderedCards = rotateSecondaryStories(scoreCards, variant);
  const selectedCards = orderedCards.slice(0, templateArticleCapacity(template));
  const assignments: Record<string, AiAssignment> = {};

  template.slots.forEach((slot, index) => {
    const card = selectedCards[index];
    if (!card) return;
    const fit = fitArticleToSlot(card.article, slot);
    assignments[slot.id] = {
      articleId: card.article.id,
      fit: fit.fit,
      reason:
        index === 0
          ? "Highest weighted article selected as lead."
          : card.hasImage
            ? "Image availability and score made this article a strong visual fit."
            : "Priority, length, and category matched this container.",
      text: fit.text,
      image: fit.image,
    };
  });

  const unusedArticles = Math.max(0, scoreCards.length - selectedCards.length);
  const diagnostics = [
    "No advertisement table is present in this schema, so ad placeholders are removed and story containers fill the page.",
    `${selectedCards.length} articles placed from ${scoreCards.length} ready candidates.`,
    selectedCards.length >= Math.min(scoreCards.length, MAX_STORIES_PER_PAGE)
      ? "The template was selected to use the available article count on this page."
      : "Remaining articles were held for another page because this template is at capacity.",
    variant === 0
      ? "Initial generation uses the best-ranked template."
      : `Regenerated alternative ${variant + 1} uses another ranked arrangement for comparison.`,
    unusedArticles > 0
      ? `${unusedArticles} lower-scoring article${unusedArticles === 1 ? "" : "s"} left for another page.`
      : "All ready articles fit into the generated page.",
    "Text is fitted by scaling and container choice only; no facts are invented or image generation APIs called.",
  ];

  return {
    template,
    assignments,
    orderedArticles: selectedCards.map((card) => card.article),
    scoreCards,
    pages: Math.max(1, pageCount),
    variant,
    diagnostics,
  };
}

function AiGeneratedPagePreview({
  newspaper,
  articles,
  layout,
}: {
  newspaper: Newspaper;
  articles: Article[];
  layout: AiGeneratedLayout;
}) {
  const articleById = new Map(articles.map((article) => [article.id, article]));

  function slotClass(slot: AiLayoutSlot) {
    return cn(
      "min-h-0 overflow-hidden bg-newsprint-paper",
      "border-newsprint-rule/70",
      slot.y > 1 && "border-t pt-2",
      slot.x > 1 && "border-l pl-2",
      slot.tier === "lead" && "pr-2",
      slot.tier === "brief" && "pt-1",
    );
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="mx-auto bg-newsprint-paper text-newsprint-ink shadow-xl ring-1 ring-black/10"
        style={{
          width: PAGE_WIDTH,
          minHeight: PAGE_HEIGHT,
          padding: "22px 22px 18px",
        }}
      >
        <header className="mb-3 border-b-4 border-double border-newsprint-ink pb-2">
          <div className="flex items-center justify-between gap-4 text-[10px] font-bold uppercase tracking-[0.35em]">
            <span>{newspaper.edition_name || "News Edition"}</span>
            <span>AI Generated Page</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-newsprint-ink/65">
            <span>{format(new Date(newspaper.edition_date), "dd MMM yyyy")}</span>
            <span>Page 1 of {layout.pages}</span>
          </div>
        </header>

        <div
          className="grid"
          style={{
            height: PAGE_HEIGHT - 96,
            gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, 1fr))`,
            columnGap: PAGE_GUTTER,
            rowGap: 6,
          }}
        >
          {layout.template.slots.map((slot) => {
            const assignment = layout.assignments[slot.id];
            const article = assignment ? articleById.get(assignment.articleId) : undefined;
            const fittedArticle =
              article && assignment ? articleForSlot(article, slot, assignment) : undefined;

            return (
              <section
                key={slot.id}
                className={slotClass(slot)}
                style={{
                  gridColumn: `${slot.x} / span ${slot.w}`,
                  gridRow: `${slot.y} / span ${slot.h}`,
                }}
              >
                {fittedArticle && assignment ? (
                  <NewspaperArticleBlockContent
                    article={fittedArticle}
                    slot={slot}
                    assignment={assignment}
                    hideImageCaption
                    hideArticleBackground
                    disableAutoImagePlacement
                  />
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AiGenerateLayoutPage() {
  const ctx = useRouteContext({ from: "/_authenticated" });
  const organizationId = ctx.organization?.id;
  const [selectedEditionId, setSelectedEditionId] = useState("");
  const [generatedEditionId, setGeneratedEditionId] = useState("");
  const [layoutVariant, setLayoutVariant] = useState(0);

  const { data: newspapers = [], isLoading: newspapersLoading } = useQuery({
    queryKey: ["ai-layout-newspapers", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newspapers")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Newspaper[];
    },
  });

  const activeEditionId = selectedEditionId || newspapers[0]?.id || "";
  const selectedNewspaper =
    newspapers.find((newspaper) => newspaper.id === activeEditionId) ?? newspapers[0];

  const { data: articles = [], isLoading: articlesLoading } = useQuery({
    queryKey: ["ai-layout-articles", activeEditionId, organizationId],
    enabled: Boolean(activeEditionId && selectedNewspaper?.organization_id === organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("newspaper_id", activeEditionId)
        .order("priority_score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Article[];
    },
  });

  const generatedLayout = useMemo(() => {
    if (!selectedNewspaper || generatedEditionId !== activeEditionId) return null;
    return generateAiLayout(articles, selectedNewspaper.number_of_pages, layoutVariant);
  }, [activeEditionId, articles, generatedEditionId, layoutVariant, selectedNewspaper]);

  const scoreCards = useMemo(
    () => articles.map(scoreArticle).sort((a, b) => b.score - a.score),
    [articles],
  );
  const readyCount = scoreCards.filter(
    (card) => card.article.workflow_status?.ready_for_layout || hasArticleCopy(card.article),
  ).length;

  function generate() {
    if (generatedEditionId !== activeEditionId) {
      setLayoutVariant(0);
    }
    setGeneratedEditionId(activeEditionId);
  }

  function regenerate() {
    setGeneratedEditionId(activeEditionId);
    setLayoutVariant((current) => current + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Standalone prototype
          </div>
          <h1 className="font-serif text-3xl font-bold">AI Generate Layout</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Generate an isolated newspaper page preview from article metadata without changing the
            current Layout Editor, Generate Layout, Preview, or Publishing workflow.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedNewspaper && (
            <Link
              to="/editions/$id"
              params={{ id: selectedNewspaper.id }}
              className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
            >
              Open edition
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          <Button
            onClick={generatedLayout ? regenerate : generate}
            disabled={!activeEditionId || articlesLoading || readyCount === 0}
          >
            {articlesLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            {generatedLayout ? "Regenerate layout" : "AI Generate"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-md border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <NewspaperIcon className="h-4 w-4 text-primary" />
              Edition
            </div>
            <Select
              value={activeEditionId}
              onValueChange={setSelectedEditionId}
              disabled={newspapersLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={newspapersLoading ? "Loading editions..." : "Choose edition"}
                />
              </SelectTrigger>
              <SelectContent>
                {newspapers.map((newspaper) => (
                  <SelectItem key={newspaper.id} value={newspaper.id}>
                    {newspaper.edition_name} -{" "}
                    {format(new Date(newspaper.edition_date), "dd MMM yyyy")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedNewspaper && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border bg-background p-2">
                  <div className="text-muted-foreground">Pages</div>
                  <div className="font-semibold">{selectedNewspaper.number_of_pages}</div>
                </div>
                <div className="rounded-md border bg-background p-2">
                  <div className="text-muted-foreground">Status</div>
                  <div className="font-semibold capitalize">
                    {selectedNewspaper.status.replaceAll("_", " ")}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-md border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-primary" />
              Article analysis
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md border bg-background p-2">
                <div className="text-lg font-bold">{articles.length}</div>
                <div className="text-muted-foreground">Total</div>
              </div>
              <div className="rounded-md border bg-background p-2">
                <div className="text-lg font-bold">{readyCount}</div>
                <div className="text-muted-foreground">Ready</div>
              </div>
              <div className="rounded-md border bg-background p-2">
                <div className="text-lg font-bold">
                  {scoreCards.filter((card) => card.hasImage).length}
                </div>
                <div className="text-muted-foreground">Images</div>
              </div>
            </div>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {scoreCards.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No articles found for this edition.
                </div>
              ) : (
                scoreCards.slice(0, 8).map((card, index) => (
                  <div key={card.article.id} className="rounded-md border bg-background p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold">
                          {index + 1}. {card.article.headline || "Untitled article"}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {card.article.category && (
                            <Badge variant="secondary">{card.article.category}</Badge>
                          )}
                          {card.hasImage && (
                            <Badge variant="outline">
                              <ImageIcon className="mr-1 h-3 w-3" />
                              image
                            </Badge>
                          )}
                          {card.isFeatured && <Badge>lead signal</Badge>}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs font-bold tabular-nums">
                        {Math.round(card.score)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {generatedLayout && (
            <section className="rounded-md border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <LayoutTemplate className="h-4 w-4 text-primary" />
                AI decision
              </div>
              <div className="rounded-md border bg-background p-3">
                <div className="font-serif text-lg font-bold">{generatedLayout.template.name}</div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Variant {generatedLayout.variant + 1}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {generatedLayout.template.description}
                </p>
                <p className="mt-2 text-xs">{generatedLayout.template.strategy}</p>
              </div>
              <div className="mt-3 space-y-2">
                {generatedLayout.diagnostics.map((item) => (
                  <div key={item} className="flex gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>

        <section className="min-w-0 rounded-md border bg-card p-4 shadow-sm">
          {articlesLoading ? (
            <div className="flex min-h-[620px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading articles...
            </div>
          ) : !generatedLayout || !selectedNewspaper ? (
            <div className="flex min-h-[620px] flex-col items-center justify-center rounded-md border border-dashed bg-background p-10 text-center">
              <Wand2 className="mb-3 h-8 w-8 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Ready for standalone AI layout generation</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Select an edition and click AI Generate. This page will create a print-style preview
                in memory only, so the current layout workflow remains untouched.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Generated preview</h2>
                  <p className="text-sm text-muted-foreground">
                    Preview is rendered from the same generated slot data shown in the AI decision
                    panel.
                  </p>
                </div>
                <Badge variant="outline">No database changes</Badge>
              </div>
              <AiGeneratedPagePreview
                newspaper={selectedNewspaper}
                articles={articles}
                layout={generatedLayout}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
