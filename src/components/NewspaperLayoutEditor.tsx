import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownUp,
  Columns3,
  FileDown,
  GripVertical,
  LayoutTemplate,
  Lock,
  Maximize2,
  Minimize2,
  Monitor,
  PanelTop,
  Plus,
  Redo2,
  RotateCcw,
  Rows3,
  Save,
  Search,
  Smartphone,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Wand2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Article } from "@/lib/api";
import {
  NewspaperArticleBlockContent,
  getNewspaperArticleFit,
  newspaperArticleText,
  normalizeNewspaperImagePlacement,
  normalizeNewspaperTextTuning,
  optimizeNewspaperImagePlacement,
} from "@/components/NewspaperArticleBlock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type SlotKind = "lead" | "story" | "image" | "ad" | "sidebar";
type PreviewMode = "print" | "pdf" | "mobile";
type SlotResizeHandle = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";

type LayoutSlot = {
  id: string;
  label: string;
  kind: SlotKind;
  x: number;
  y: number;
  w: number;
  h: number;
  locked?: boolean;
};

type LayoutTemplateDef = {
  id: string;
  name: string;
  description: string;
  columns: number;
  rows: number;
  slots: LayoutSlot[];
};

type SlotAssignment = {
  articleId?: string;
  image?: ImagePlacement;
  text?: TextTuning;
  ad?: {
    title: string;
    size: string;
    imageUrl?: string;
    subtitle?: string;
    contact?: string;
    note?: string;
  };
};

type LayoutState = {
  templateId: string;
  slots: LayoutSlot[];
  assignments: Record<string, SlotAssignment>;
  rowScale: number;
  columnScale: number;
  gutter: number;
  headerQuote?: string;
};

type LayoutRecord = {
  id: string;
  layout_json: unknown;
  version: number;
};

type FittingPlan = {
  headlineSize: number;
  bodySize: number;
  columns: number;
  spacing: number;
  padding: number;
  columnGap: number;
  bodyLineHeight: number;
  headlineLineHeight: number;
  paragraphGap: number;
  justifyBody: boolean;
  image: ImagePlacement | null;
};

type TextTuning = {
  headlineScale: number;
  bodyScale: number;
};

type ImagePlacement = {
  position: "left" | "right" | "center" | "full";
  wrap: "square" | "tight";
  widthPct: number;
  aspectRatio: number;
  margin: number;
  caption: string;
};

const PAGE_WIDTH = 780;
const PAGE_HEIGHT = 1084;
const MIN_PAGE_ZOOM = 45;
const MAX_PAGE_ZOOM = 160;
const PAGE_ZOOM_STEP = 5;
const GRID_COLUMNS = 12;
const GRID_ROWS = 18;
const MIN_IMAGE_WIDTH_PCT = 28;
const MAX_IMAGE_WIDTH_PCT = 100;
const MIN_TEXT_SCALE = 80;
const MAX_TEXT_SCALE = 130;
const AUTO_FIT_TEXT_SCALE_LIMIT = 125;
const AUTO_FIT_TARGET_FILL = 0.78;
const FRONT_PAGE_HEADER_AD_SLOT_ID = "front_page_header_left_ad";
const FRONT_PAGE_HEADER_QUOTE_SLOT_ID = "front_page_header_quote";
const DEFAULT_HEADER_QUOTE = "ದಿನದ ಚಿಂತನೆ / Quote";
const FRONT_PAGE_HEADER_AD_SLOT: LayoutSlot = {
  id: FRONT_PAGE_HEADER_AD_SLOT_ID,
  label: "Front-page right ad",
  kind: "ad",
  x: 10,
  y: 1,
  w: 3,
  h: 1,
  locked: true,
};
const FRONT_PAGE_HEADER_QUOTE_SLOT: LayoutSlot = {
  id: FRONT_PAGE_HEADER_QUOTE_SLOT_ID,
  label: "Front-page quote",
  kind: "sidebar",
  x: 1,
  y: 1,
  w: 3,
  h: 1,
  locked: true,
};
const DEFAULT_TEXT_TUNING: TextTuning = {
  headlineScale: 100,
  bodyScale: 100,
};

const TEMPLATE_DEFS: LayoutTemplateDef[] = [
  {
    id: "classic_front",
    name: "Classic Front",
    description: "Lead banner, four balanced stories, bottom ad rail.",
    columns: GRID_COLUMNS,
    rows: GRID_ROWS,
    slots: [
      { id: "lead", label: "Lead story", kind: "lead", x: 1, y: 1, w: 12, h: 5 },
      { id: "left_top", label: "Left column", kind: "story", x: 1, y: 6, w: 4, h: 5 },
      { id: "center_top", label: "Center column", kind: "story", x: 5, y: 6, w: 4, h: 5 },
      { id: "right_top", label: "Right column", kind: "story", x: 9, y: 6, w: 4, h: 5 },
      { id: "wide_bottom", label: "Wide analysis", kind: "story", x: 1, y: 11, w: 8, h: 5 },
      { id: "briefs", label: "Briefs", kind: "sidebar", x: 9, y: 11, w: 4, h: 5 },
      { id: "ad_bottom", label: "Right advertisement", kind: "ad", x: 9, y: 16, w: 4, h: 3 },
    ],
  },
  {
    id: "metro_grid",
    name: "Metro Grid",
    description: "Dense city-news rhythm with equal snap blocks.",
    columns: GRID_COLUMNS,
    rows: GRID_ROWS,
    slots: [
      { id: "hero", label: "Hero", kind: "lead", x: 1, y: 1, w: 8, h: 6 },
      { id: "sky_ad", label: "Sky ad", kind: "ad", x: 9, y: 1, w: 4, h: 3 },
      { id: "quick_take", label: "Quick take", kind: "sidebar", x: 9, y: 4, w: 4, h: 3 },
      { id: "story_a", label: "Story A", kind: "story", x: 1, y: 7, w: 4, h: 5 },
      { id: "story_b", label: "Story B", kind: "story", x: 5, y: 7, w: 4, h: 5 },
      { id: "story_c", label: "Story C", kind: "story", x: 9, y: 7, w: 4, h: 5 },
      { id: "photo_strip", label: "Photo strip", kind: "image", x: 1, y: 12, w: 12, h: 4 },
      { id: "bottom_note", label: "Bottom note", kind: "story", x: 1, y: 16, w: 12, h: 3 },
    ],
  },
  {
    id: "editorial_depth",
    name: "Editorial Depth",
    description: "Long-form opinion layout with sidebar context.",
    columns: GRID_COLUMNS,
    rows: GRID_ROWS,
    slots: [
      { id: "main_opinion", label: "Main opinion", kind: "lead", x: 1, y: 1, w: 7, h: 9 },
      { id: "portrait", label: "Portrait story", kind: "image", x: 8, y: 1, w: 5, h: 5 },
      { id: "fact_box", label: "Fact box", kind: "sidebar", x: 8, y: 6, w: 5, h: 4 },
      { id: "column_one", label: "Column one", kind: "story", x: 1, y: 10, w: 4, h: 6 },
      { id: "column_two", label: "Column two", kind: "story", x: 5, y: 10, w: 4, h: 6 },
      { id: "column_three", label: "Column three", kind: "story", x: 9, y: 10, w: 4, h: 6 },
      { id: "footer_ad", label: "Right footer ad", kind: "ad", x: 9, y: 16, w: 4, h: 3 },
    ],
  },
  {
    id: "photo_first",
    name: "Photo First",
    description: "Large visual lead with compact supporting copy.",
    columns: GRID_COLUMNS,
    rows: GRID_ROWS,
    slots: [
      { id: "photo_lead", label: "Photo lead", kind: "lead", x: 1, y: 1, w: 12, h: 8 },
      { id: "caption_story", label: "Caption story", kind: "story", x: 1, y: 9, w: 6, h: 4 },
      { id: "reaction", label: "Reaction", kind: "story", x: 7, y: 9, w: 6, h: 4 },
      { id: "gallery_left", label: "Gallery left", kind: "image", x: 1, y: 13, w: 4, h: 4 },
      { id: "gallery_mid", label: "Gallery middle", kind: "image", x: 5, y: 13, w: 4, h: 4 },
      { id: "gallery_right", label: "Gallery right", kind: "image", x: 9, y: 13, w: 4, h: 4 },
      { id: "classified", label: "Right classified", kind: "ad", x: 9, y: 17, w: 4, h: 2 },
    ],
  },
  {
    id: "business_compact",
    name: "Business Compact",
    description: "Ticker-like compact blocks with a strong market lead.",
    columns: GRID_COLUMNS,
    rows: GRID_ROWS,
    slots: [
      { id: "market_lead", label: "Market lead", kind: "lead", x: 1, y: 1, w: 7, h: 6 },
      { id: "market_table", label: "Market table", kind: "sidebar", x: 8, y: 1, w: 5, h: 6 },
      { id: "biz_one", label: "Business one", kind: "story", x: 1, y: 7, w: 4, h: 5 },
      { id: "biz_two", label: "Business two", kind: "story", x: 5, y: 7, w: 4, h: 5 },
      { id: "biz_three", label: "Business three", kind: "story", x: 9, y: 7, w: 4, h: 5 },
      { id: "brief_stack", label: "Brief stack", kind: "story", x: 1, y: 12, w: 8, h: 4 },
      { id: "brand_ad", label: "Right brand ad", kind: "ad", x: 9, y: 12, w: 4, h: 4 },
      { id: "footer", label: "Footer", kind: "story", x: 1, y: 16, w: 12, h: 3 },
    ],
  },
  {
    id: "sports_scoreboard",
    name: "Sports Scoreboard",
    description: "Score strip, feature lead, and match reports.",
    columns: GRID_COLUMNS,
    rows: GRID_ROWS,
    slots: [
      { id: "score_strip", label: "Score strip", kind: "sidebar", x: 1, y: 1, w: 12, h: 2 },
      { id: "match_lead", label: "Match lead", kind: "lead", x: 1, y: 3, w: 8, h: 7 },
      { id: "player_card", label: "Player card", kind: "image", x: 9, y: 3, w: 4, h: 7 },
      { id: "report_a", label: "Report A", kind: "story", x: 1, y: 10, w: 4, h: 5 },
      { id: "report_b", label: "Report B", kind: "story", x: 5, y: 10, w: 4, h: 5 },
      { id: "report_c", label: "Report C", kind: "story", x: 9, y: 10, w: 4, h: 5 },
      { id: "sponsor", label: "Right sponsor", kind: "ad", x: 9, y: 15, w: 4, h: 4 },
    ],
  },
  {
    id: "rural_report",
    name: "Rural Report",
    description: "Agriculture-first page with useful sidebars.",
    columns: GRID_COLUMNS,
    rows: GRID_ROWS,
    slots: [
      { id: "field_lead", label: "Field lead", kind: "lead", x: 1, y: 1, w: 9, h: 6 },
      { id: "weather_box", label: "Weather box", kind: "sidebar", x: 10, y: 1, w: 3, h: 6 },
      { id: "village_one", label: "Village one", kind: "story", x: 1, y: 7, w: 6, h: 5 },
      { id: "village_two", label: "Village two", kind: "story", x: 7, y: 7, w: 6, h: 5 },
      { id: "market_price", label: "Market price", kind: "sidebar", x: 1, y: 12, w: 4, h: 4 },
      { id: "advice", label: "Advice column", kind: "story", x: 5, y: 12, w: 4, h: 4 },
      { id: "ad_seed", label: "Right seed ad", kind: "ad", x: 9, y: 12, w: 4, h: 4 },
      { id: "bottom_story", label: "Bottom story", kind: "story", x: 1, y: 16, w: 12, h: 3 },
    ],
  },
  {
    id: "tabloid_energy",
    name: "Tabloid Energy",
    description: "Bold stacked stories for entertainment and city buzz.",
    columns: GRID_COLUMNS,
    rows: GRID_ROWS,
    slots: [
      { id: "splash", label: "Splash", kind: "lead", x: 1, y: 1, w: 6, h: 8 },
      { id: "buzz", label: "Buzz", kind: "lead", x: 7, y: 1, w: 6, h: 5 },
      { id: "promo", label: "Promo ad", kind: "ad", x: 7, y: 6, w: 6, h: 3 },
      { id: "short_one", label: "Short one", kind: "story", x: 1, y: 9, w: 4, h: 5 },
      { id: "short_two", label: "Short two", kind: "story", x: 5, y: 9, w: 4, h: 5 },
      { id: "short_three", label: "Short three", kind: "story", x: 9, y: 9, w: 4, h: 5 },
      { id: "bottom_visual", label: "Bottom visual", kind: "image", x: 1, y: 14, w: 12, h: 5 },
    ],
  },
  {
    id: "weekend_magazine",
    name: "Weekend Magazine",
    description: "Airier magazine rhythm while staying print-ready.",
    columns: GRID_COLUMNS,
    rows: GRID_ROWS,
    slots: [
      { id: "cover_story", label: "Cover story", kind: "lead", x: 1, y: 1, w: 5, h: 9 },
      { id: "cover_image", label: "Cover image", kind: "image", x: 6, y: 1, w: 7, h: 9 },
      { id: "essay", label: "Essay", kind: "story", x: 1, y: 10, w: 6, h: 5 },
      { id: "culture", label: "Culture", kind: "story", x: 7, y: 10, w: 6, h: 5 },
      { id: "guide", label: "Guide", kind: "sidebar", x: 1, y: 15, w: 8, h: 4 },
      { id: "sponsor_block", label: "Right sponsor block", kind: "ad", x: 9, y: 15, w: 4, h: 4 },
    ],
  },
  {
    id: "classified_plus",
    name: "Classified Plus",
    description: "Stories above, compact ads below, strong section control.",
    columns: GRID_COLUMNS,
    rows: GRID_ROWS,
    slots: [
      { id: "top_lead", label: "Top lead", kind: "lead", x: 1, y: 1, w: 12, h: 4 },
      { id: "classified_story_a", label: "Story A", kind: "story", x: 1, y: 5, w: 4, h: 5 },
      { id: "classified_story_b", label: "Story B", kind: "story", x: 5, y: 5, w: 4, h: 5 },
      { id: "classified_story_c", label: "Story C", kind: "story", x: 9, y: 5, w: 4, h: 5 },
      { id: "ad_a", label: "Ad A", kind: "ad", x: 1, y: 10, w: 3, h: 3 },
      { id: "ad_b", label: "Ad B", kind: "ad", x: 4, y: 10, w: 3, h: 3 },
      { id: "ad_c", label: "Ad C", kind: "ad", x: 7, y: 10, w: 3, h: 3 },
      { id: "ad_d", label: "Ad D", kind: "ad", x: 10, y: 10, w: 3, h: 3 },
      { id: "bottom_feature", label: "Bottom feature", kind: "story", x: 1, y: 13, w: 12, h: 6 },
    ],
  },
];

function articleText(article?: Article) {
  return newspaperArticleText(article);
}

function cloneSlots(slots: LayoutSlot[]) {
  return slots.map((slot) => ({ ...slot }));
}

function emptyAdAssignment(slot: LayoutSlot): SlotAssignment {
  return {
    ad: {
      title: "Advertisement",
      size: `${slot.w} columns x ${slot.h} rows`,
      imageUrl: "",
      subtitle: "",
      contact: "",
      note: "",
    },
  };
}

function isDefaultAdPlaceholder(assignment?: SlotAssignment) {
  const ad = assignment?.ad;
  if (!ad) return false;

  const title = ad.title?.trim() ?? "";
  return (
    (!title || title === "Advertisement") &&
    !ad.imageUrl?.trim() &&
    !ad.subtitle?.trim() &&
    !ad.contact?.trim() &&
    !ad.note?.trim()
  );
}

function sanitizeAssignments(assignments: Record<string, SlotAssignment>) {
  return Object.fromEntries(
    Object.entries(assignments).map(([slotId, assignment]) => [
      slotId,
      isDefaultAdPlaceholder(assignment) ? {} : assignment,
    ]),
  ) as Record<string, SlotAssignment>;
}

function withFrontPageHeaderAdAssignment(assignments: Record<string, SlotAssignment>) {
  const headerAd = assignments[FRONT_PAGE_HEADER_AD_SLOT_ID];
  return {
    ...assignments,
    [FRONT_PAGE_HEADER_AD_SLOT_ID]: headerAd?.ad
      ? headerAd
      : emptyAdAssignment(FRONT_PAGE_HEADER_AD_SLOT),
  };
}

function asArticleSlot(slot: LayoutSlot): LayoutSlot {
  if (slot.kind !== "ad") return slot;
  return {
    ...slot,
    kind: "story",
    label:
      slot.label.replace(/\b(ad|advertisement|classified|sponsor|promo)\b/gi, "Article").trim() ||
      "Article block",
    locked: false,
  };
}

const RIGHT_SIDE_SLOT_OVERRIDES: Record<
  string,
  Partial<Pick<LayoutSlot, "label" | "x" | "y" | "w" | "h">>
> = {
  ad_bottom: { label: "Right advertisement", x: 9, y: 16, w: 4, h: 3 },
  footer_ad: { label: "Right footer ad", x: 9, y: 16, w: 4, h: 3 },
  classified: { label: "Right classified", x: 9, y: 17, w: 4, h: 2 },
  brief_stack: { x: 1, y: 12, w: 8, h: 4 },
  brand_ad: { label: "Right brand ad", x: 9, y: 12, w: 4, h: 4 },
  sponsor: { label: "Right sponsor", x: 9, y: 15, w: 4, h: 4 },
  market_price: { x: 1, y: 12, w: 4, h: 4 },
  ad_seed: { label: "Right seed ad", x: 9, y: 12, w: 4, h: 4 },
  guide: { x: 1, y: 15, w: 8, h: 4 },
  sponsor_block: { label: "Right sponsor block", x: 9, y: 15, w: 4, h: 4 },
};

function alignRightSideAds(pageState: LayoutState): LayoutState {
  return {
    ...pageState,
    slots: pageState.slots.map((slot) => {
      const override = RIGHT_SIDE_SLOT_OVERRIDES[slot.id];
      return override ? { ...slot, ...override } : slot;
    }),
  };
}

function createInitialState(template: LayoutTemplateDef, articles: Article[]): LayoutState {
  const assignments: Record<string, SlotAssignment> = {};
  const assignedArticleIds = new Set<string>();
  const pageOneArticles = articles
    .filter((article) => !article.page_number || article.page_number === 1)
    .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));

  template.slots.forEach((slot, index) => {
    const article =
      pageOneArticles[index] ?? articles.find((candidate) => !assignedArticleIds.has(candidate.id));
    if (article) {
      assignedArticleIds.add(article.id);
      assignments[slot.id] = { articleId: article.id };
    }
  });

  return {
    templateId: template.id,
    slots: cloneSlots(template.slots).map((slot) =>
      assignments[slot.id]?.articleId ? asArticleSlot(slot) : slot,
    ),
    assignments: withFrontPageHeaderAdAssignment(assignments),
    rowScale: 100,
    columnScale: 100,
    gutter: 8,
    headerQuote: DEFAULT_HEADER_QUOTE,
  };
}

function articleSlotsFor(template: LayoutTemplateDef) {
  return template.slots;
}

function templateCapacity(template: LayoutTemplateDef) {
  return articleSlotsFor(template).length;
}

function chooseTemplateForArticleCount(articleCount: number) {
  return [...TEMPLATE_DEFS].sort((a, b) => {
    const aCapacity = templateCapacity(a);
    const bCapacity = templateCapacity(b);
    const aOverflow = aCapacity < articleCount ? 100 : 0;
    const bOverflow = bCapacity < articleCount ? 100 : 0;
    return (
      Math.abs(aCapacity - articleCount) +
      aOverflow -
      (Math.abs(bCapacity - articleCount) + bOverflow)
    );
  })[0];
}

function pageNumbersFor(pageStates?: Record<number, LayoutState>) {
  const existingPageNumbers = Object.keys(pageStates ?? {})
    .map(Number)
    .filter((pageNumber) => Number.isFinite(pageNumber) && pageNumber > 0)
    .sort((a, b) => a - b);

  return existingPageNumbers.length > 0 ? existingPageNumbers : [1];
}

function createPageState(
  template: LayoutTemplateDef,
  articles: Article[],
  pageNumber: number,
): LayoutState {
  const assignments: Record<string, SlotAssignment> = {};
  const articleSlots = articleSlotsFor(template);
  const sortedArticles = [...articles].sort(
    (a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0),
  );
  const pageArticles = sortedArticles.slice(
    (pageNumber - 1) * articleSlots.length,
    pageNumber * articleSlots.length,
  );
  let articleIndex = 0;

  template.slots.forEach((slot) => {
    const article = pageArticles[articleIndex];
    if (article) assignments[slot.id] = { articleId: article.id };
    articleIndex += 1;
  });

  return {
    templateId: template.id,
    slots: cloneSlots(template.slots).map((slot) =>
      assignments[slot.id]?.articleId ? asArticleSlot(slot) : slot,
    ),
    assignments: withFrontPageHeaderAdAssignment(assignments),
    rowScale: 100,
    columnScale: 100,
    gutter: 8,
  };
}

function applyTemplateToPage(pageState: LayoutState, template: LayoutTemplateDef): LayoutState {
  const existingAssignments = sanitizeAssignments(pageState.assignments);
  const existingStoryAssignments = pageState.slots
    .map((slot) => existingAssignments[slot.id])
    .filter((assignment): assignment is SlotAssignment => Boolean(assignment?.articleId));
  let storyIndex = 0;

  const assignments: Record<string, SlotAssignment> = {};
  template.slots.forEach((slot) => {
    if (existingAssignments[slot.id]?.ad) {
      assignments[slot.id] = existingAssignments[slot.id];
      return;
    }

    const assignment = existingStoryAssignments[storyIndex];
    if (assignment) assignments[slot.id] = assignment;
    storyIndex += 1;
  });
  return {
    ...pageState,
    templateId: template.id,
    slots: cloneSlots(template.slots).map((slot) =>
      assignments[slot.id]?.articleId ? asArticleSlot(slot) : slot,
    ),
    assignments: withFrontPageHeaderAdAssignment(assignments),
    headerQuote: pageState.headerQuote ?? DEFAULT_HEADER_QUOTE,
  };
}

function createPagedStates(template: LayoutTemplateDef, articles: Article[]) {
  return {
    1: createPageState(template, articles, 1),
  } as Record<number, LayoutState>;
}

export function createGeneratedEditorLayout(articles: Article[], numberOfPages: number) {
  const sortedArticles = [...articles].sort(
    (a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0),
  );
  const maxTemplateCapacity = Math.max(...TEMPLATE_DEFS.map(templateCapacity), 1);
  const pageCount = Math.max(
    1,
    numberOfPages,
    Math.ceil(sortedArticles.length / maxTemplateCapacity),
  );
  const articleById = new Map(sortedArticles.map((article) => [article.id, article]));
  const pages: Record<number, LayoutState> = {};
  let articleIndex = 0;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const remainingArticles = Math.max(0, sortedArticles.length - articleIndex);
    const remainingPages = Math.max(1, pageCount - pageNumber + 1);
    const pageArticleTarget = Math.ceil(remainingArticles / remainingPages);
    const template = chooseTemplateForArticleCount(Math.max(1, pageArticleTarget));
    const assignments: Record<string, SlotAssignment> = {};
    const slots = cloneSlots(template.slots);

    for (const slot of slots) {
      const article = sortedArticles[articleIndex];
      if (!article) break;
      assignments[slot.id] = { articleId: article.id };
      articleIndex += 1;
    }

    pages[pageNumber] = autoFitArticleSpace(
      {
        templateId: template.id,
        slots: slots.map((slot) => (assignments[slot.id]?.articleId ? asArticleSlot(slot) : slot)),
        assignments,
        rowScale: 100,
        columnScale: 100,
        gutter: 8,
        headerQuote: pageNumber === 1 ? DEFAULT_HEADER_QUOTE : undefined,
      },
      articleById,
    );
  }

  return {
    active_page: 1,
    pages,
    saved_at: new Date().toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isLayoutState(value: unknown): value is LayoutState {
  if (!isRecord(value)) return false;
  return (
    typeof value.templateId === "string" &&
    Array.isArray(value.slots) &&
    isRecord(value.assignments) &&
    typeof value.rowScale === "number" &&
    typeof value.columnScale === "number" &&
    typeof value.gutter === "number"
  );
}

function savedLayoutToPageStates(
  layoutJson: unknown,
): { activePage: number; pageStates: Record<number, LayoutState> } | null {
  if (!isRecord(layoutJson) || !isRecord(layoutJson.pages)) return null;

  const pageStates = Object.fromEntries(
    Object.entries(layoutJson.pages)
      .filter(([, pageState]) => isLayoutState(pageState))
      .map(([pageNumber, pageState]) => {
        const state = alignRightSideAds(pageState as LayoutState);
        const sanitizedAssignments = sanitizeAssignments(state.assignments);
        const assignments =
          Number(pageNumber) === 1
            ? withFrontPageHeaderAdAssignment(sanitizedAssignments)
            : sanitizedAssignments;
        return [
          Number(pageNumber),
          {
            ...state,
            slots: state.slots.map((slot) =>
              assignments[slot.id]?.articleId ? asArticleSlot(slot) : slot,
            ),
            assignments,
          },
        ];
      }),
  ) as Record<number, LayoutState>;

  if (Object.keys(pageStates).length === 0) return null;

  const activePage =
    typeof layoutJson.active_page === "number"
      ? layoutJson.active_page
      : Number(Object.keys(pageStates)[0]);
  return {
    activePage: pageStates[activePage] ? activePage : Number(Object.keys(pageStates)[0]),
    pageStates,
  };
}

function reconcilePagedStates(
  currentPages: Record<number, LayoutState>,
  template: LayoutTemplateDef,
  articles: Article[],
) {
  const validArticleIds = new Set(articles.map((article) => article.id));
  const nextPages: Record<number, LayoutState> = {};

  pageNumbersFor(currentPages).forEach((pageNumber) => {
    const pageTemplate = pageNumber === 1 ? template : chooseTemplateForArticleCount(1);
    const existing = currentPages[pageNumber] ?? createPageState(pageTemplate, [], pageNumber);
    nextPages[pageNumber] = alignRightSideAds({
      ...existing,
      assignments: Object.fromEntries(
        Object.entries(sanitizeAssignments(existing.assignments)).map(([slotId, assignment]) => [
          slotId,
          assignment.articleId && !validArticleIds.has(assignment.articleId) ? {} : assignment,
        ]),
      ),
    });
    if (pageNumber === 1) {
      nextPages[pageNumber] = {
        ...nextPages[pageNumber],
        assignments: withFrontPageHeaderAdAssignment(nextPages[pageNumber].assignments),
      };
    }
  });

  return nextPages;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTextTuning(tuning?: TextTuning): TextTuning {
  return normalizeNewspaperTextTuning(tuning);
}

function optimizeImagePlacement(
  article: Article | undefined,
  slot: LayoutSlot,
): ImagePlacement | null {
  return optimizeNewspaperImagePlacement(article, slot);
}

function normalizeImagePlacement(
  article: Article | undefined,
  slot: LayoutSlot,
  placement?: ImagePlacement,
): ImagePlacement | null {
  return normalizeNewspaperImagePlacement(article, slot, placement);
}

function getArticleFit(
  article: Article | undefined,
  slot: LayoutSlot,
  assignment?: SlotAssignment,
): FittingPlan {
  return getNewspaperArticleFit(article, slot, assignment);
}

function collides(a: LayoutSlot, b: LayoutSlot) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function canResizeSlot(slots: LayoutSlot[], slotId: string, next: LayoutSlot) {
  if (
    next.x < 1 ||
    next.y < 1 ||
    next.x + next.w - 1 > GRID_COLUMNS ||
    next.y + next.h - 1 > GRID_ROWS
  ) {
    return false;
  }

  return !slots.some((slot) => slot.id !== slotId && collides(next, slot));
}

function resizedSlotFromHandle(
  slot: LayoutSlot,
  handle: SlotResizeHandle,
  dxCells: number,
  dyCells: number,
) {
  const next = { ...slot };
  const rightEdge = slot.x + slot.w - 1;
  const bottomEdge = slot.y + slot.h - 1;

  if (handle.includes("e")) {
    next.w = Math.max(2, slot.w + dxCells);
  }
  if (handle.includes("s")) {
    next.h = Math.max(2, slot.h + dyCells);
  }
  if (handle.includes("w")) {
    next.x = clamp(slot.x + dxCells, 1, rightEdge - 1);
    next.w = rightEdge - next.x + 1;
  }
  if (handle.includes("n")) {
    next.y = clamp(slot.y + dyCells, 1, bottomEdge - 1);
    next.h = bottomEdge - next.y + 1;
  }

  return next;
}

function reflowSlotsIntoOpenSpace(
  slots: LayoutSlot[],
  assignments: Record<string, SlotAssignment>,
  options: {
    excludeSlotIds?: Set<string>;
    scoreSlot?: (slot: LayoutSlot) => number;
  } = {},
) {
  const nextSlots = cloneSlots(slots);
  const directions: Array<(slot: LayoutSlot) => LayoutSlot> = [
    (slot) => ({ ...slot, h: slot.h + 1 }),
    (slot) => ({ ...slot, y: slot.y - 1, h: slot.h + 1 }),
    (slot) => ({ ...slot, w: slot.w + 1 }),
    (slot) => ({ ...slot, x: slot.x - 1, w: slot.w + 1 }),
  ];

  for (let pass = 0; pass < GRID_COLUMNS * GRID_ROWS; pass += 1) {
    let changed = false;
    const orderedSlots = [...nextSlots].sort((a, b) => {
      const scoreDiff = (options.scoreSlot?.(b) ?? 0) - (options.scoreSlot?.(a) ?? 0);
      const articleWeight =
        Number(Boolean(assignments[b.id]?.articleId)) -
        Number(Boolean(assignments[a.id]?.articleId));
      return scoreDiff || articleWeight || a.y - b.y || a.x - b.x;
    });

    for (const slot of orderedSlots) {
      if (options.excludeSlotIds?.has(slot.id)) continue;
      if (slot.locked || assignments[slot.id]?.ad) continue;
      const slotIndex = nextSlots.findIndex((item) => item.id === slot.id);
      if (slotIndex < 0) continue;

      const expanded = directions
        .map((direction) => direction(nextSlots[slotIndex]))
        .find((candidate) => canResizeSlot(nextSlots, slot.id, candidate));

      if (expanded) {
        nextSlots[slotIndex] = expanded;
        changed = true;
      }
    }

    if (!changed) break;
  }

  return nextSlots;
}

function estimateArticleFill(
  article: Article | undefined,
  slot: LayoutSlot,
  assignment?: SlotAssignment,
) {
  if (!article) return 0;

  const textLength = articleText(article).length + (article.headline?.length ?? 0) * 2;
  const slotArea = Math.max(slot.w * slot.h, 1);
  const densityTarget = slot.kind === "lead" ? 44 : slot.w <= 4 ? 40 : 48;
  const imageArea = article.image_url ? (assignment?.image?.position === "full" ? 2.4 : 1.5) : 0;
  const estimatedContentArea = Math.max(1.5, textLength / densityTarget + imageArea);

  return estimatedContentArea / slotArea;
}

function autoFitAssignmentForArticle(
  article: Article,
  slot: LayoutSlot,
  assignment: SlotAssignment,
): SlotAssignment {
  const fill = estimateArticleFill(article, slot, assignment);
  if (fill >= AUTO_FIT_TARGET_FILL) return assignment;

  const emptyRatio = clamp(AUTO_FIT_TARGET_FILL - fill, 0, AUTO_FIT_TARGET_FILL);
  const scaleBoost = Math.round(emptyRatio * 45);
  const currentText = normalizeTextTuning(assignment.text);
  const nextText = normalizeTextTuning({
    headlineScale: Math.min(
      AUTO_FIT_TEXT_SCALE_LIMIT,
      Math.max(currentText.headlineScale, 100 + Math.round(scaleBoost * 0.8)),
    ),
    bodyScale: Math.min(
      AUTO_FIT_TEXT_SCALE_LIMIT,
      Math.max(currentText.bodyScale, 100 + scaleBoost),
    ),
  });
  const nextImage = article.image_url
    ? normalizeImagePlacement(article, slot, {
        ...(assignment.image ??
          optimizeImagePlacement(article, slot) ?? {
            position: slot.w >= 7 ? "right" : "center",
            wrap: "square",
            widthPct: 52,
            aspectRatio: 4 / 3,
            margin: 6,
            caption: "",
          }),
        widthPct: Math.min(
          MAX_IMAGE_WIDTH_PCT,
          Math.max(assignment.image?.widthPct ?? 52, 52 + Math.round(emptyRatio * 34)),
        ),
      })
    : assignment.image;

  return {
    ...assignment,
    text: nextText,
    image: nextImage ?? assignment.image,
  };
}

function autoFitArticleSpace(
  pageState: LayoutState,
  articleById: Map<string, Article>,
): LayoutState {
  const assignments = { ...pageState.assignments };
  const shrunkSlotIds = new Set<string>();
  const nextSlots = pageState.slots.map((slot) => {
    const assignment = assignments[slot.id];
    const article = assignment?.articleId ? articleById.get(assignment.articleId) : undefined;
    if (!assignment?.articleId || !article || assignment.ad) return slot;

    const fittedAssignment = autoFitAssignmentForArticle(article, slot, assignment);
    assignments[slot.id] = fittedAssignment;

    const fillAfterTuning = estimateArticleFill(article, slot, fittedAssignment);
    const minHeight = slot.kind === "lead" ? 3 : article.image_url ? 3 : 2;
    const targetHeight = clamp(
      Math.ceil((slot.h * Math.max(fillAfterTuning, 0.38)) / AUTO_FIT_TARGET_FILL),
      minHeight,
      slot.h,
    );

    if (!slot.locked && slot.h - targetHeight >= 1) {
      shrunkSlotIds.add(slot.id);
      return { ...slot, h: targetHeight };
    }

    return slot;
  });

  if (shrunkSlotIds.size === 0) {
    return {
      ...pageState,
      assignments,
    };
  }

  return {
    ...pageState,
    slots: reflowSlotsIntoOpenSpace(nextSlots, assignments, {
      excludeSlotIds: shrunkSlotIds,
      scoreSlot: (slot) => {
        const assignment = assignments[slot.id];
        const article = assignment?.articleId ? articleById.get(assignment.articleId) : undefined;
        return estimateArticleFill(article, slot, assignment);
      },
    }),
    assignments,
  };
}

function DraggableArticleChip({ article, disabled }: { article: Article; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `article:${article.id}`,
    disabled,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`w-full rounded-md border bg-background p-2 text-left shadow-sm transition ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-grab active:cursor-grabbing"
      } ${isDragging ? "opacity-40" : "hover:border-primary/60 hover:bg-primary/5"}`}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="line-clamp-2 font-kannada text-xs font-semibold leading-snug">
            {article.headline || "Untitled article"}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>{article.category ?? "Other"}</span>
            <span>P{article.priority_score ?? 0}</span>
            {!disabled && (
              <span className="ml-auto normal-case tracking-normal">Drag to paper</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function TemplateMiniPreview({ template }: { template: LayoutTemplateDef }) {
  return (
    <div
      className="grid h-16 rounded border bg-newsprint-paper p-1"
      style={{
        gridTemplateColumns: `repeat(${template.columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${template.rows}, minmax(0, 1fr))`,
        gap: 1,
      }}
    >
      {template.slots.map((slot) => (
        <div
          key={slot.id}
          className={`rounded-[1px] ${
            slot.kind === "ad"
              ? "bg-amber-200"
              : slot.kind === "lead"
                ? "bg-slate-800"
                : slot.kind === "image"
                  ? "bg-sky-200"
                  : "bg-slate-300"
          }`}
          style={{
            gridColumn: `${slot.x} / span ${slot.w}`,
            gridRow: `${slot.y} / span ${slot.h}`,
          }}
        />
      ))}
    </div>
  );
}

function PrajavaniLayoutMasthead() {
  return (
    <div className="select-none text-newsprint-ink">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end leading-none">
        <span className="text-right font-kannada-serif text-[50px] font-black leading-none tracking-normal">
          ಪ್ರಜಾ
        </span>
        <div className="mb-1 flex w-28 justify-center">
          <img
            src="/prajavani-nandi.png"
            alt="Prajavani Nandi logo"
            className="h-12 w-28 object-contain"
          />
        </div>
        <span className="text-left font-kannada-serif text-[50px] font-black leading-none tracking-normal">
          ವಾಣಿ
        </span>
      </div>
      <div className="mt-2 font-kannada text-[10px] font-semibold leading-none tracking-wide">
        ಆತ್ಮ ವಿಶ್ವಾಸದ ಕನ್ನಡ ದಿನಪತ್ರಿಕೆ
      </div>
    </div>
  );
}

function HeaderQuoteBox({
  quote,
  selected,
  previewMode,
  onSelect,
}: {
  quote: string;
  selected: boolean;
  previewMode: PreviewMode;
  onSelect: () => void;
}) {
  const showChrome = previewMode !== "pdf";

  return (
    <button
      type="button"
      className={`relative flex h-full min-h-0 flex-col justify-center overflow-hidden bg-white px-3 py-2 text-left text-newsprint-ink transition ${
        selected ? "ring-2 ring-primary" : ""
      }`}
      style={{
        gridColumn: "1 / span 3",
        gridRow: "1 / span 1",
      }}
      onClick={onSelect}
    >
      {showChrome && (
        <span className="absolute left-1 top-1 rounded bg-white/90 px-1 text-[8px] font-semibold uppercase tracking-wide shadow-sm">
          Quote
        </span>
      )}
      <div className="mt-2 font-kannada text-[12px] font-semibold leading-snug">
        {quote || DEFAULT_HEADER_QUOTE}
      </div>
    </button>
  );
}

function ArticleSlot({
  slot,
  assignment,
  article,
  selected,
  previewMode,
  canEdit,
  onSelect,
  onUpdateAssignment,
  onResizeStart,
}: {
  slot: LayoutSlot;
  assignment?: SlotAssignment;
  article?: Article;
  selected: boolean;
  previewMode: PreviewMode;
  canEdit: boolean;
  onSelect: () => void;
  onUpdateAssignment: (assignment: SlotAssignment) => void;
  onResizeStart?: (
    event: ReactPointerEvent<HTMLButtonElement>,
    slot: LayoutSlot,
    handle: SlotResizeHandle,
  ) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${slot.id}`,
    disabled: slot.locked || !canEdit,
  });
  const draggable = useDraggable({
    id: `slotdrag:${slot.id}`,
    disabled: slot.locked || !assignment || !canEdit,
  });
  const fit = getArticleFit(article, slot, assignment);
  const isAd = Boolean(assignment?.ad);
  const showChrome = previewMode !== "pdf";

  function resizeImage(startEvent: ReactPointerEvent<HTMLButtonElement>, direction: -1 | 1) {
    if (!fit.image || !assignment || !canEdit) return;
    startEvent.preventDefault();
    startEvent.stopPropagation();

    const startX = startEvent.clientX;
    const containerWidth =
      startEvent.currentTarget.closest("[data-article-slot]")?.clientWidth ?? 240;
    const startWidth = fit.image.widthPct;

    function onMove(event: PointerEvent) {
      const deltaPct = ((event.clientX - startX) / containerWidth) * 100 * direction;
      onUpdateAssignment({
        ...assignment,
        image: {
          ...fit.image,
          widthPct: clamp(startWidth + deltaPct, MIN_IMAGE_WIDTH_PCT, MAX_IMAGE_WIDTH_PCT),
        },
      });
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function moveImage(nextPosition: ImagePlacement["position"]) {
    if (!fit.image || !assignment || !canEdit) return;
    onUpdateAssignment({
      ...assignment,
      image: {
        ...fit.image,
        position: nextPosition,
        widthPct:
          nextPosition === "full" ? 100 : clamp(fit.image.widthPct, MIN_IMAGE_WIDTH_PCT, 88),
      },
    });
  }

  function editorImageControls() {
    if (!fit.image || !assignment || !canEdit || previewMode === "pdf") return null;

    return (
      <>
        <div className="absolute right-1 top-1 hidden rounded bg-white/90 p-0.5 shadow-sm group-hover:flex">
          {(["left", "center", "right", "full"] as const).map((position) => (
            <button
              key={position}
              type="button"
              className={`h-5 min-w-5 rounded px-1 text-[8px] uppercase ${
                fit.image?.position === position
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                moveImage(position);
              }}
            >
              {position[0]}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Resize image from left"
          className="absolute bottom-0 left-0 h-4 w-4 cursor-nwse-resize rounded-tr bg-primary/80 opacity-0 transition group-hover:opacity-100"
          onPointerDown={(event) => resizeImage(event, -1)}
        />
        <button
          type="button"
          aria-label="Resize image from right"
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize rounded-tl bg-primary/80 opacity-0 transition group-hover:opacity-100"
          onPointerDown={(event) => resizeImage(event, 1)}
        />
      </>
    );
  }

  const showBlockResizeHandles = showChrome && canEdit && !slot.locked && Boolean(onResizeStart);
  const blockResizeHandleClass =
    "absolute rounded-sm bg-primary/90 shadow-sm ring-1 ring-white/80 transition hover:bg-primary";
  const blockResizeHandleVisibility = selected
    ? "opacity-100"
    : "opacity-0 group-hover:opacity-100";

  function blockResizeHandle(
    handle: SlotResizeHandle,
    label: string,
    className: string,
    cursorClass: string,
  ) {
    if (!showBlockResizeHandles) return null;

    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        className={`${blockResizeHandleClass} ${blockResizeHandleVisibility} ${cursorClass} ${className}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => onResizeStart?.(event, slot, handle)}
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      data-article-slot
      className={`group relative min-h-0 overflow-hidden bg-white transition ${
        selected ? "ring-2 ring-primary" : ""
      } ${isOver ? "bg-emerald-50 ring-2 ring-emerald-500" : ""} ${!assignment?.articleId && !assignment?.ad && !isAd ? "bg-muted/20" : ""}`}
      style={{
        gridColumn: `${slot.x} / span ${slot.w}`,
        gridRow: `${slot.y} / span ${slot.h}`,
      }}
      onClick={onSelect}
    >
      {showChrome && (
        <div className="absolute left-1 top-1 z-10 flex items-center gap-1">
          <button
            ref={draggable.setNodeRef}
            type="button"
            className="rounded bg-white/90 p-0.5 text-muted-foreground shadow-sm"
            style={{
              transform: draggable.transform
                ? `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)`
                : undefined,
            }}
            {...draggable.attributes}
            {...draggable.listeners}
          >
            {slot.locked ? <Lock className="h-3 w-3" /> : <GripVertical className="h-3 w-3" />}
          </button>
          <span className="rounded bg-white/90 px-1 text-[8px] font-semibold uppercase tracking-wide shadow-sm">
            {slot.label}
          </span>
        </div>
      )}

      {!assignment?.articleId && !assignment?.ad && !isAd && (
        <div className="flex h-full items-center justify-center p-3 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Drop article here
        </div>
      )}

      {isAd && !assignment?.articleId && (
        <div className="h-full overflow-hidden bg-amber-50 text-center text-amber-950">
          {assignment?.ad?.imageUrl ? (
            <img
              src={assignment.ad.imageUrl}
              alt={assignment.ad.title || "Advertisement"}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col justify-center gap-1 p-2">
              <PanelTop className="mx-auto h-5 w-5" />
              <div className="text-[11px] font-black uppercase leading-tight tracking-widest">
                {assignment?.ad?.title ?? "Advertisement"}
              </div>
              {assignment?.ad?.subtitle && (
                <div className="text-[9px] font-semibold leading-tight">
                  {assignment.ad.subtitle}
                </div>
              )}
              {assignment?.ad?.contact && (
                <div className="text-[8px] leading-tight">{assignment.ad.contact}</div>
              )}
              {assignment?.ad?.note ? (
                <div className="text-[8px] italic leading-tight opacity-75">
                  {assignment.ad.note}
                </div>
              ) : (
                <div className="text-[8px] uppercase tracking-wide opacity-70">
                  {assignment?.ad?.size ?? `${slot.w} columns x ${slot.h} rows`}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {assignment?.articleId && article && (
        <NewspaperArticleBlockContent
          article={article}
          slot={slot}
          assignment={assignment}
          imageControls={editorImageControls()}
        />
      )}

      {showBlockResizeHandles && (
        <div className="pointer-events-none absolute inset-0 z-20">
          {blockResizeHandle(
            "n",
            "Resize block from top",
            "left-1/2 top-0 h-2 w-8 -translate-x-1/2",
            "pointer-events-auto cursor-ns-resize",
          )}
          {blockResizeHandle(
            "s",
            "Resize block from bottom",
            "bottom-0 left-1/2 h-2 w-8 -translate-x-1/2",
            "pointer-events-auto cursor-ns-resize",
          )}
          {blockResizeHandle(
            "e",
            "Resize block from right",
            "right-0 top-1/2 h-8 w-2 -translate-y-1/2",
            "pointer-events-auto cursor-ew-resize",
          )}
          {blockResizeHandle(
            "w",
            "Resize block from left",
            "left-0 top-1/2 h-8 w-2 -translate-y-1/2",
            "pointer-events-auto cursor-ew-resize",
          )}
          {blockResizeHandle(
            "nw",
            "Resize block from top left",
            "left-0 top-0 h-3 w-3",
            "pointer-events-auto cursor-nwse-resize",
          )}
          {blockResizeHandle(
            "ne",
            "Resize block from top right",
            "right-0 top-0 h-3 w-3",
            "pointer-events-auto cursor-nesw-resize",
          )}
          {blockResizeHandle(
            "sw",
            "Resize block from bottom left",
            "bottom-0 left-0 h-3 w-3",
            "pointer-events-auto cursor-nesw-resize",
          )}
          {blockResizeHandle(
            "se",
            "Resize block from bottom right",
            "bottom-0 right-0 h-3 w-3",
            "pointer-events-auto cursor-nwse-resize",
          )}
        </div>
      )}
    </div>
  );
}

export function NewspaperLayoutEditor({
  articles,
  newspaperId,
  canEdit,
}: {
  articles: Article[];
  pages: number[];
  newspaperId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const articleById = useMemo(
    () => new Map(articles.map((article) => [article.id, article])),
    [articles],
  );
  const [activePage, setActivePage] = useState(1);
  const [pageStates, setPageStates] = useState<Record<number, LayoutState>>(() =>
    createPagedStates(TEMPLATE_DEFS[0], articles),
  );
  const state = pageStates[activePage] ?? createPageState(TEMPLATE_DEFS[0], articles, activePage);
  const [selectedSlotId, setSelectedSlotId] = useState(state.slots[0]?.id ?? "");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("print");
  const [pageZoom, setPageZoom] = useState(100);
  const [articleSearch, setArticleSearch] = useState("");
  const [activeDragLabel, setActiveDragLabel] = useState("");
  const [past, setPast] = useState<LayoutState[]>([]);
  const [future, setFuture] = useState<LayoutState[]>([]);
  const currentTemplate =
    TEMPLATE_DEFS.find((item) => item.id === state.templateId) ?? TEMPLATE_DEFS[0];
  const pageNumbers = pageNumbersFor(pageStates);
  const pageHeaderSlots =
    activePage === 1 ? [FRONT_PAGE_HEADER_AD_SLOT, FRONT_PAGE_HEADER_QUOTE_SLOT] : [];
  const selectableSlots = [...pageHeaderSlots, ...state.slots];
  const savedLayoutQuery = useQuery({
    queryKey: ["saved-layout", newspaperId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("layouts")
        .select("id, layout_json, version")
        .eq("newspaper_id", newspaperId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as LayoutRecord | null;
    },
  });

  const selectedSlot = selectableSlots.find((slot) => slot.id === selectedSlotId) ?? state.slots[0];
  const selectedIsHeaderQuote = selectedSlot?.id === FRONT_PAGE_HEADER_QUOTE_SLOT_ID;
  const selectedAssignment = selectedSlot ? state.assignments[selectedSlot.id] : undefined;
  const selectedIsAdBlock = Boolean(
    selectedSlot && (selectedSlot.kind === "ad" || selectedAssignment?.ad),
  );
  const selectedAdIsMissing = Boolean(selectedIsAdBlock && !selectedAssignment?.ad);
  const selectedArticle = selectedAssignment?.articleId
    ? articleById.get(selectedAssignment.articleId)
    : undefined;
  const selectedImage = selectedSlot
    ? normalizeImagePlacement(selectedArticle, selectedSlot, selectedAssignment?.image)
    : null;
  const selectedTextTuning = normalizeTextTuning(selectedAssignment?.text);
  const assignedArticleIds = new Set(
    Object.values(pageStates).flatMap((pageState) =>
      Object.values(pageState.assignments)
        .map((assignment) => assignment.articleId)
        .filter(Boolean),
    ),
  );
  const unassignedArticles = articles.filter((article) => !assignedArticleIds.has(article.id));
  const pagePlacedCount = Object.values(state.assignments).filter(
    (assignment) => assignment.articleId,
  ).length;
  const pageCapacity = state.slots.filter((slot) => !state.assignments[slot.id]?.ad).length;
  const maxTemplateCapacity = Math.max(...TEMPLATE_DEFS.map(templateCapacity), 1);
  const currentPageArticleTarget =
    pagePlacedCount > 0
      ? pagePlacedCount
      : Math.max(1, Math.min(unassignedArticles.length, maxTemplateCapacity));
  const filteredUnassignedArticles = unassignedArticles.filter((article) => {
    const haystack =
      `${article.headline ?? ""} ${article.category ?? ""} ${article.summary ?? ""}`.toLowerCase();
    return haystack.includes(articleSearch.trim().toLowerCase());
  });
  const placedArticlePlacements = Object.entries(pageStates).flatMap(([pageNumber, pageState]) =>
    Object.entries(pageState.assignments).flatMap(([slotId, assignment]) => {
      if (!assignment.articleId) return [];
      const article = articleById.get(assignment.articleId);
      const slot = pageState.slots.find((item) => item.id === slotId);
      if (!article || !slot) return [];

      return [
        {
          article,
          pageNumber: Number(pageNumber),
          slotId,
          slotLabel: slot.label,
        },
      ];
    }),
  );

  function changePageZoom(delta: number) {
    setPageZoom((current) => clamp(current + delta, MIN_PAGE_ZOOM, MAX_PAGE_ZOOM));
  }

  function handlePageWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    changePageZoom(event.deltaY < 0 ? PAGE_ZOOM_STEP : -PAGE_ZOOM_STEP);
  }

  function commit(updater: (current: LayoutState) => LayoutState) {
    setPageStates((currentPages) => {
      const current =
        currentPages[activePage] ?? createPageState(currentTemplate, articles, activePage);
      setPast((items) => [...items.slice(-19), current]);
      setFuture([]);
      return {
        ...currentPages,
        [activePage]: updater(current),
      };
    });
  }

  function selectTemplate(templateId: string) {
    const template = TEMPLATE_DEFS.find((item) => item.id === templateId) ?? TEMPLATE_DEFS[0];
    setPageStates((currentPages) => {
      const currentPage =
        currentPages[activePage] ?? createPageState(template, articles, activePage);
      const nextPages = {
        ...currentPages,
        [activePage]: applyTemplateToPage(currentPage, template),
      };

      return reconcilePagedStates(nextPages, template, articles);
    });
    setPast([]);
    setFuture([]);
    setSelectedSlotId(template.slots[0]?.id ?? "");
  }

  function openPage(pageNumber: number) {
    const nextState =
      pageStates[pageNumber] ?? createPageState(chooseTemplateForArticleCount(1), [], pageNumber);
    setPageStates((currentPages) => ({
      ...currentPages,
      [pageNumber]: currentPages[pageNumber] ?? nextState,
    }));
    setActivePage(pageNumber);
    setPast([]);
    setFuture([]);
    setSelectedSlotId(nextState.slots[0]?.id ?? "");
  }

  function addPage() {
    setPageStates((currentPages) => {
      const currentPageNumbers = pageNumbersFor(currentPages);
      const nextPageNumber = Math.max(...currentPageNumbers) + 1;
      const template = chooseTemplateForArticleCount(
        Math.max(1, Math.min(unassignedArticles.length, maxTemplateCapacity)),
      );
      const nextState = createPageState(template, [], nextPageNumber);

      setActivePage(nextPageNumber);
      setSelectedSlotId(nextState.slots[0]?.id ?? "");
      setPast([]);
      setFuture([]);
      return {
        ...currentPages,
        [nextPageNumber]: nextState,
      };
    });
    toast.success("New page added");
  }

  function deletePage() {
    if (pageNumbers.length <= 1) return;

    setPageStates((currentPages) => {
      const remainingPageNumbers = pageNumbersFor(currentPages).filter(
        (pageNumber) => pageNumber !== activePage,
      );
      const compactedPages = Object.fromEntries(
        remainingPageNumbers.map((pageNumber, index) => [index + 1, currentPages[pageNumber]]),
      ) as Record<number, LayoutState>;
      const nextActivePage = Math.min(activePage, remainingPageNumbers.length);
      const nextState = compactedPages[nextActivePage] ?? compactedPages[1];

      setActivePage(nextActivePage);
      setSelectedSlotId(nextState?.slots[0]?.id ?? "");
      setPast([]);
      setFuture([]);
      return compactedPages;
    });
    toast.success("Page deleted");
  }

  useEffect(() => {
    setPageStates((currentPages) => reconcilePagedStates(currentPages, currentTemplate, articles));
  }, [articles, currentTemplate]);

  useEffect(() => {
    const savedLayout = savedLayoutToPageStates(savedLayoutQuery.data?.layout_json);
    if (!savedLayout) return;

    setPageStates(savedLayout.pageStates);
    setActivePage(savedLayout.activePage);
    setPast([]);
    setFuture([]);
    setSelectedSlotId(savedLayout.pageStates[savedLayout.activePage]?.slots[0]?.id ?? "");
  }, [savedLayoutQuery.data?.id]);

  function setAssignment(slotId: string, assignment?: SlotAssignment) {
    commit((current) => ({
      ...current,
      assignments: {
        ...current.assignments,
        [slotId]: assignment ?? {},
      },
    }));
  }

  function updateHeaderQuote(nextQuote: string) {
    commit((current) => ({
      ...current,
      headerQuote: nextQuote,
    }));
  }

  function addAdToSelectedBlock() {
    if (!selectedSlot || selectedIsHeaderQuote) return;
    setAssignment(selectedSlot.id, emptyAdAssignment(selectedSlot));
    toast.success("Advertisement block added");
  }

  function convertSelectedAdToArticleBlock() {
    if (!selectedSlot || selectedIsHeaderQuote) return;
    commit((current) => {
      const nextAssignments = { ...current.assignments };
      delete nextAssignments[selectedSlot.id];

      return {
        ...current,
        slots: current.slots.map((slot) =>
          slot.id === selectedSlot.id ? asArticleSlot(slot) : slot,
        ),
        assignments: nextAssignments,
      };
    });
    toast.success("Ad block converted to article space");
  }

  function deleteSelectedAdBlock() {
    if (!selectedSlot || selectedIsHeaderQuote || selectedSlot.id === FRONT_PAGE_HEADER_AD_SLOT_ID)
      return;

    commit((current) => {
      const nextAssignments = { ...current.assignments };
      delete nextAssignments[selectedSlot.id];
      const remainingSlots = current.slots.filter((slot) => slot.id !== selectedSlot.id);
      const reflowedSlots = reflowSlotsIntoOpenSpace(remainingSlots, nextAssignments);

      setSelectedSlotId(reflowedSlots.find((slot) => !slot.locked)?.id ?? "");

      return {
        ...current,
        slots: reflowedSlots,
        assignments: nextAssignments,
      };
    });
    toast.success("Ad block deleted and layout reflowed");
  }

  function clearSelectedBlock() {
    if (!selectedSlot || selectedIsHeaderQuote) return;
    commit((current) => {
      const nextAssignments = { ...current.assignments };
      delete nextAssignments[selectedSlot.id];
      return {
        ...current,
        slots: current.slots.map((slot) =>
          slot.id === selectedSlot.id && slot.kind === "ad" ? asArticleSlot(slot) : slot,
        ),
        assignments: nextAssignments,
      };
    });
    toast.success("Block cleared");
  }

  function updateSelectedAd(field: keyof NonNullable<SlotAssignment["ad"]>, value: string) {
    if (!selectedSlot || !selectedAssignment?.ad) return;
    setAssignment(selectedSlot.id, {
      ad: {
        ...selectedAssignment.ad,
        [field]: value,
      },
    });
  }

  function updateSelectedImage(nextImage: ImagePlacement) {
    if (!selectedSlot || !selectedAssignment) return;
    setAssignment(selectedSlot.id, {
      ...selectedAssignment,
      image: nextImage,
    });
  }

  function updateSelectedTextTuning(nextText: TextTuning) {
    if (!selectedSlot || !selectedAssignment) return;
    setAssignment(selectedSlot.id, {
      ...selectedAssignment,
      text: normalizeTextTuning(nextText),
    });
  }

  function changeSelectedTextScale(field: keyof TextTuning, delta: number) {
    updateSelectedTextTuning({
      ...selectedTextTuning,
      [field]: selectedTextTuning[field] + delta,
    });
  }

  function resetSelectedTextTuning() {
    if (!selectedSlot || !selectedAssignment) return;
    setAssignment(selectedSlot.id, {
      ...selectedAssignment,
      text: DEFAULT_TEXT_TUNING,
    });
  }

  function optimizeSelectedImage() {
    if (!selectedSlot || !selectedAssignment) return;
    const optimized = optimizeImagePlacement(selectedArticle, selectedSlot);
    if (!optimized) {
      toast.error("Add an image URL before optimizing placement");
      return;
    }

    setAssignment(selectedSlot.id, {
      ...selectedAssignment,
      image: optimized,
    });
    toast.success("AI image placement optimized");
  }

  function focusPlacedArticle(pageNumber: number, slotId: string) {
    openPage(pageNumber);
    setSelectedSlotId(slotId);
  }

  function removePlacedArticle(pageNumber: number, slotId: string) {
    setPageStates((currentPages) => {
      const pageState = currentPages[pageNumber];
      if (!pageState) return currentPages;

      setPast((items) => [...items.slice(-19), pageState]);
      setFuture([]);

      return {
        ...currentPages,
        [pageNumber]: {
          ...pageState,
          assignments: {
            ...pageState.assignments,
            [slotId]: {},
          },
        },
      };
    });
    if (pageNumber === activePage) setSelectedSlotId(slotId);
    toast.success("Article removed from paper");
  }

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (id.startsWith("article:")) {
      const article = articleById.get(id.replace("article:", ""));
      setActiveDragLabel(article?.headline ?? "Article");
    } else if (id.startsWith("slotdrag:")) {
      const slot = state.slots.find((item) => item.id === id.replace("slotdrag:", ""));
      setActiveDragLabel(slot?.label ?? "Section");
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveDragLabel("");
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId.startsWith("slot:")) return;

    const targetSlotId = overId.replace("slot:", "");
    const targetSlot = state.slots.find((slot) => slot.id === targetSlotId);
    if (!targetSlot || targetSlot.locked) return;

    if (activeId.startsWith("article:")) {
      const articleId = activeId.replace("article:", "");
      setPageStates((currentPages) => {
        const nextPages = Object.fromEntries(
          Object.entries(currentPages).map(([pageNumber, pageState]) => [
            pageNumber,
            {
              ...pageState,
              assignments: Object.fromEntries(
                Object.entries(pageState.assignments).map(([slotId, assignment]) => [
                  slotId,
                  assignment.articleId === articleId ? {} : assignment,
                ]),
              ),
            },
          ]),
        ) as Record<number, LayoutState>;
        const activePageState =
          nextPages[activePage] ?? createPageState(currentTemplate, articles, activePage);

        setPast((items) => [...items.slice(-19), state]);
        setFuture([]);

        const placedPageState = {
          ...activePageState,
          slots: activePageState.slots.map((slot) =>
            slot.id === targetSlotId ? asArticleSlot(slot) : slot,
          ),
          assignments: {
            ...activePageState.assignments,
            [targetSlotId]: { articleId },
          },
        };

        return {
          ...nextPages,
          [activePage]: autoFitArticleSpace(placedPageState, articleById),
        };
      });
      setSelectedSlotId(targetSlotId);
      return;
    }

    if (activeId.startsWith("slotdrag:")) {
      const sourceSlotId = activeId.replace("slotdrag:", "");
      if (sourceSlotId === targetSlotId) return;
      commit((current) => ({
        ...current,
        assignments: {
          ...current.assignments,
          [sourceSlotId]: current.assignments[targetSlotId] ?? {},
          [targetSlotId]: current.assignments[sourceSlotId] ?? {},
        },
      }));
      setSelectedSlotId(targetSlotId);
    }
  }

  function resizeSelected(dw: number, dh: number) {
    if (!selectedSlot || selectedSlot.locked) return;
    const next = {
      ...selectedSlot,
      w: Math.max(2, selectedSlot.w + dw),
      h: Math.max(2, selectedSlot.h + dh),
    };
    if (!canResizeSlot(state.slots, selectedSlot.id, next)) {
      toast.error("Resize blocked to prevent overlap or page overflow");
      return;
    }
    commit((current) => ({
      ...current,
      slots: current.slots.map((slot) => (slot.id === selectedSlot.id ? next : slot)),
    }));
  }

  function resizeSlotByDrag(
    startEvent: ReactPointerEvent<HTMLButtonElement>,
    slot: LayoutSlot,
    handle: SlotResizeHandle,
  ) {
    if (!canEdit || slot.locked) return;
    startEvent.preventDefault();
    startEvent.stopPropagation();

    const slotElement = startEvent.currentTarget.closest("[data-article-slot]");
    const slotRect = slotElement?.getBoundingClientRect();
    if (!slotRect) return;

    const cellWidth = Math.max(slotRect.width / slot.w, 1);
    const cellHeight = Math.max(slotRect.height / slot.h, 1);
    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    const startSlot = { ...slot };
    const startSlots = cloneSlots(state.slots);
    const startState = state;
    let lastSlot = startSlot;
    let historyRecorded = false;

    setSelectedSlotId(slot.id);

    function isSameSlot(a: LayoutSlot, b: LayoutSlot) {
      return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
    }

    function applySlot(next: LayoutSlot) {
      if (isSameSlot(lastSlot, next)) return;

      if (!historyRecorded) {
        setPast((items) => [...items.slice(-19), startState]);
        setFuture([]);
        historyRecorded = true;
      }

      lastSlot = next;
      setPageStates((currentPages) => {
        const current = currentPages[activePage] ?? startState;

        return {
          ...currentPages,
          [activePage]: {
            ...current,
            slots: current.slots.map((item) => (item.id === slot.id ? next : item)),
          },
        };
      });
    }

    function onMove(event: PointerEvent) {
      const dxCells = Math.round((event.clientX - startX) / cellWidth);
      const dyCells = Math.round((event.clientY - startY) / cellHeight);
      const next = resizedSlotFromHandle(startSlot, handle, dxCells, dyCells);

      if (!canResizeSlot(startSlots, slot.id, next)) return;
      applySlot(next);
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function autoFitCurrentPage() {
    commit((current) => autoFitArticleSpace(current, articleById));
    toast.success("Article spaces auto fitted");
  }

  function moveSelected(direction: -1 | 1) {
    if (
      !selectedSlot ||
      selectedSlot.id === FRONT_PAGE_HEADER_AD_SLOT_ID ||
      selectedSlot.id === FRONT_PAGE_HEADER_QUOTE_SLOT_ID
    ) {
      return;
    }
    const index = state.slots.findIndex((slot) => slot.id === selectedSlot.id);
    const target = state.slots[index + direction];
    if (!target || target.locked) return;
    commit((current) => ({
      ...current,
      assignments: {
        ...current.assignments,
        [selectedSlot.id]: current.assignments[target.id] ?? {},
        [target.id]: current.assignments[selectedSlot.id] ?? {},
      },
    }));
    setSelectedSlotId(target.id);
  }

  function undo() {
    const previous = past[past.length - 1];
    if (!previous) return;
    setFuture((items) => [state, ...items]);
    setPast((items) => items.slice(0, -1));
    setPageStates((currentPages) => ({
      ...currentPages,
      [activePage]: previous,
    }));
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setPast((items) => [...items, state]);
    setFuture((items) => items.slice(1));
    setPageStates((currentPages) => ({
      ...currentPages,
      [activePage]: next,
    }));
  }

  function resetLayout() {
    const template = TEMPLATE_DEFS.find((item) => item.id === state.templateId) ?? TEMPLATE_DEFS[0];
    commit(() => createPageState(template, articles, activePage));
    setSelectedSlotId(template.slots[0]?.id ?? "");
  }

  const saveLayout = useMutation({
    mutationFn: async () => {
      const layoutJson = {
        active_page: activePage,
        pages: pageStates,
        saved_at: new Date().toISOString(),
      };
      const layoutRecord = savedLayoutQuery.data;
      const nextVersion = (layoutRecord?.version ?? 0) + 1;
      const { error: layoutError } = layoutRecord
        ? await supabase
            .from("layouts")
            .update({
              layout_json: layoutJson,
              version: nextVersion,
              generated_at: new Date().toISOString(),
            })
            .eq("id", layoutRecord.id)
        : await supabase.from("layouts").insert({
            newspaper_id: newspaperId,
            layout_json: layoutJson,
            version: nextVersion,
          });
      if (layoutError) throw layoutError;

      let priority = 100;
      for (const [pageNumber, pageState] of Object.entries(pageStates)) {
        const orderedSlots = pageState.slots.filter(
          (slot) => pageState.assignments[slot.id]?.articleId,
        );
        for (const slot of orderedSlots) {
          const articleId = pageState.assignments[slot.id]?.articleId;
          if (!articleId) continue;
          const article = articleById.get(articleId);
          if (article?.newspaper_id !== newspaperId) continue;
          const { error } = await supabase
            .from("articles")
            .update({
              page_number: Number(pageNumber),
              position: slot.kind === "lead" ? "top" : "body",
              headline_size: slot.kind === "lead" ? "big" : slot.w >= 6 ? "medium" : "small",
              image_size: slot.kind === "image" || slot.kind === "lead" ? "large" : "small",
              column_count: Math.min(3, Math.max(1, Math.floor(slot.w / 4))),
              priority_score: priority,
            })
            .eq("id", articleId)
            .eq("newspaper_id", newspaperId);
          if (error) throw error;
          priority -= 1;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["articles"] });
      queryClient.invalidateQueries({ queryKey: ["saved-layout", newspaperId] });
      toast.success("Custom layout saved");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save layout"),
  });

  const updateArticle = useMutation({
    mutationFn: async (payload: { headline?: string; image_url?: string }) => {
      if (!selectedArticle) return;
      const { error } = await supabase
        .from("articles")
        .update(payload)
        .eq("id", selectedArticle.id)
        .eq("newspaper_id", newspaperId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["articles"] });
      toast.success("Article updated");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not update article"),
  });

  const previewBaseScale = previewMode === "mobile" ? 0.56 : previewMode === "pdf" ? 0.9 : 0.76;
  const canvasScale = previewBaseScale * (pageZoom / 100);
  const headerAdAssignment =
    state.assignments[FRONT_PAGE_HEADER_AD_SLOT_ID] ??
    emptyAdAssignment(FRONT_PAGE_HEADER_AD_SLOT);

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid min-h-[760px] gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px] 2xl:grid-cols-[320px_minmax(760px,1fr)_380px]">
        <aside className="min-h-0 rounded-lg border bg-card">
          <div className="border-b p-3">
            <div className="flex items-center gap-2 font-semibold">
              <LayoutTemplate className="h-4 w-4 text-primary" />
              Choose page {activePage} style
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Each page can use its own template. Pick one that fits this page's article count.
            </p>
          </div>
          <ScrollArea className="h-[calc(100vh-238px)] min-h-[686px]">
            <div className="space-y-2 p-3">
              {TEMPLATE_DEFS.map((template) => {
                const capacity = templateCapacity(template);
                const fitLabel =
                  capacity === currentPageArticleTarget
                    ? "Best fit"
                    : capacity > currentPageArticleTarget
                      ? "Good fit"
                      : "Tight";

                return (
                  <button
                    key={template.id}
                    type="button"
                    className={`w-full rounded-md border p-2 text-left transition ${
                      state.templateId === template.id
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/50"
                    }`}
                    onClick={() => selectTemplate(template.id)}
                    disabled={!canEdit}
                  >
                    <TemplateMiniPreview template={template} />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{template.name}</div>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          fitLabel === "Best fit"
                            ? "bg-emerald-50 text-emerald-700"
                            : fitLabel === "Good fit"
                              ? "bg-muted text-muted-foreground"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {fitLabel} - {capacity} stories
                      </span>
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {template.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </aside>

        <section className="min-w-0 rounded-lg border border-slate-200 bg-slate-100 text-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white p-3">
            <div>
              <div className="text-sm font-semibold">Page layout</div>
              <div className="text-xs leading-relaxed text-slate-600">
                Page {activePage}: {pagePlacedCount} of {pageCapacity} story spaces filled. Add a
                new page when you need more room.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <div className="mr-1 flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
                {pageNumbers.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => openPage(pageNumber)}
                    className={`h-8 min-w-12 rounded px-2 text-xs font-semibold transition ${
                      activePage === pageNumber
                        ? "bg-primary text-primary-foreground"
                        : "text-slate-600 hover:bg-slate-200 hover:text-slate-950"
                    }`}
                  >
                    Page {pageNumber}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                onClick={addPage}
                disabled={!canEdit}
                title="Add new page"
              >
                <Plus className="mr-1 h-4 w-4" />
                New page
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100 disabled:text-slate-400"
                onClick={deletePage}
                disabled={!canEdit || pageNumbers.length <= 1}
                title="Delete current page"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Delete page
              </Button>
              <ToggleGroup
                type="single"
                value={previewMode}
                onValueChange={(value) => value && setPreviewMode(value as PreviewMode)}
              >
                <ToggleGroupItem
                  value="print"
                  aria-label="Print preview"
                  className="border-slate-300 bg-white text-slate-800 hover:bg-slate-100 data-[state=on]:bg-slate-800 data-[state=on]:text-white"
                >
                  <Monitor className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="pdf"
                  aria-label="PDF preview"
                  className="border-slate-300 bg-white text-slate-800 hover:bg-slate-100 data-[state=on]:bg-slate-800 data-[state=on]:text-white"
                >
                  <FileDown className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="mobile"
                  aria-label="Mobile preview"
                  className="border-slate-300 bg-white text-slate-800 hover:bg-slate-100 data-[state=on]:bg-slate-800 data-[state=on]:text-white"
                >
                  <Smartphone className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
              <div className="mx-1 flex items-center rounded-md border border-slate-200 bg-white">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-r-none text-slate-800 hover:bg-slate-100"
                  onClick={() => changePageZoom(-PAGE_ZOOM_STEP)}
                  disabled={pageZoom <= MIN_PAGE_ZOOM}
                  title="Zoom out"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
                <button
                  type="button"
                  className="h-8 min-w-14 border-x border-slate-200 px-2 text-xs font-semibold text-slate-700"
                  onClick={() => setPageZoom(100)}
                  title="Reset zoom. Use Ctrl + scroll to zoom, or scroll normally to move through the page."
                >
                  {pageZoom}%
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-l-none text-slate-800 hover:bg-slate-100"
                  onClick={() => changePageZoom(PAGE_ZOOM_STEP)}
                  disabled={pageZoom >= MAX_PAGE_ZOOM}
                  title="Zoom in"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100 disabled:text-slate-400"
                onClick={undo}
                disabled={!past.length}
                title="Undo"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100 disabled:text-slate-400"
                onClick={redo}
                disabled={!future.length}
                title="Redo"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100 disabled:text-slate-400"
                onClick={resetLayout}
                disabled={!canEdit}
                title="Reset page"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => saveLayout.mutate()}
                disabled={!canEdit || saveLayout.isPending}
              >
                <Save className="mr-1 h-4 w-4" />
                Save
              </Button>
            </div>
          </div>

          <div
            className="flex h-[calc(100vh-238px)] min-h-[760px] items-start justify-center overflow-auto bg-slate-200 p-4"
            onWheel={handlePageWheel}
          >
            <div
              className="relative shrink-0"
              style={{
                width: PAGE_WIDTH * canvasScale,
                height: PAGE_HEIGHT * canvasScale,
              }}
            >
              <div
                className={`origin-top-left rounded-md bg-newsprint-paper shadow-xl ${previewMode === "mobile" ? "rounded-[18px] border-[10px] border-slate-900" : ""}`}
                style={{
                  width: PAGE_WIDTH,
                  height: PAGE_HEIGHT,
                  transform: `scale(${canvasScale})`,
                }}
              >
                <div className="flex h-full flex-col p-6">
                  <div className="mb-3 bg-white pb-2 text-newsprint-ink border-b-4 border-double border-newsprint-ink">
                    {activePage === 1 ? (
                      <div
                        className="grid items-stretch gap-3"
                        style={{
                          gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
                          gridTemplateRows: "86px",
                        }}
                      >
                        <ArticleSlot
                          slot={FRONT_PAGE_HEADER_AD_SLOT}
                          assignment={headerAdAssignment}
                          selected={selectedSlot?.id === FRONT_PAGE_HEADER_AD_SLOT_ID}
                          previewMode={previewMode}
                          canEdit={canEdit}
                          onSelect={() => setSelectedSlotId(FRONT_PAGE_HEADER_AD_SLOT_ID)}
                          onResizeStart={resizeSlotByDrag}
                          onUpdateAssignment={(nextAssignment) =>
                            setAssignment(FRONT_PAGE_HEADER_AD_SLOT_ID, nextAssignment)
                          }
                        />
                        <div
                          className="flex flex-col items-center justify-center text-center"
                          style={{
                            gridColumn: "4 / span 6",
                            gridRow: "1 / span 1",
                          }}
                        >
                          <PrajavaniLayoutMasthead />
                        </div>
                        <HeaderQuoteBox
                          quote={state.headerQuote ?? DEFAULT_HEADER_QUOTE}
                          selected={selectedSlot?.id === FRONT_PAGE_HEADER_QUOTE_SLOT_ID}
                          previewMode={previewMode}
                          onSelect={() => setSelectedSlotId(FRONT_PAGE_HEADER_QUOTE_SLOT_ID)}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.22em]">
                        <span>Page {activePage}</span>
                      </div>
                    )}
                  </div>
                  <div
                    className="grid min-h-0 flex-1"
                    style={{
                      gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, ${state.columnScale / 100}fr))`,
                      gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, ${state.rowScale / 100}fr))`,
                      gap: state.gutter,
                    }}
                  >
                    {state.slots.map((slot) => {
                      const assignment = state.assignments[slot.id];
                      const article = assignment?.articleId
                        ? articleById.get(assignment.articleId)
                        : undefined;
                      return (
                        <ArticleSlot
                          key={slot.id}
                          slot={slot}
                          assignment={assignment}
                          article={article}
                          selected={selectedSlot?.id === slot.id}
                          previewMode={previewMode}
                          canEdit={canEdit}
                          onSelect={() => setSelectedSlotId(slot.id)}
                          onResizeStart={resizeSlotByDrag}
                          onUpdateAssignment={(nextAssignment) =>
                            setAssignment(slot.id, nextAssignment)
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="min-h-0 rounded-lg border bg-card">
          <div className="border-b p-3">
            <div className="text-sm font-semibold">Editor panel</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Select a block on the page, then adjust its size, image, or article details here.
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Badge variant="secondary">{articles.length} articles</Badge>
              <Badge variant="secondary">{placedArticlePlacements.length} on paper</Badge>
              <Badge variant={unassignedArticles.length ? "default" : "secondary"}>
                {unassignedArticles.length} not added
              </Badge>
            </div>
          </div>

          <ScrollArea className="h-[calc(100vh-238px)] min-h-[686px]">
            <div className="space-y-5 p-3">
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <GripVertical className="h-3.5 w-3.5" />
                  Article placement
                </div>
                <div className="rounded-md border bg-background p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold">Not added to paper</div>
                      <div className="text-[10px] text-muted-foreground">
                        Drag an article onto any empty newspaper block.
                      </div>
                    </div>
                    <Badge variant={unassignedArticles.length ? "default" : "secondary"}>
                      {unassignedArticles.length}
                    </Badge>
                  </div>
                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={articleSearch}
                      onChange={(event) => setArticleSearch(event.target.value)}
                      placeholder="Search articles"
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                  <div className="mt-2 space-y-2">
                    {unassignedArticles.length === 0 ? (
                      <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                        All articles are already on the paper.
                      </div>
                    ) : filteredUnassignedArticles.length === 0 ? (
                      <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                        No articles match your search.
                      </div>
                    ) : (
                      filteredUnassignedArticles.map((article) => (
                        <DraggableArticleChip
                          key={article.id}
                          article={article}
                          disabled={!canEdit}
                        />
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-md border bg-background p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold">Added on paper</div>
                      <div className="text-[10px] text-muted-foreground">
                        Click an article to jump to its page block.
                      </div>
                    </div>
                    <Badge variant="secondary">{placedArticlePlacements.length}</Badge>
                  </div>
                  <div className="mt-2 space-y-2">
                    {placedArticlePlacements.length === 0 ? (
                      <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                        No articles are placed yet.
                      </div>
                    ) : (
                      placedArticlePlacements.map(({ article, pageNumber, slotId, slotLabel }) => (
                        <div
                          key={`${pageNumber}-${slotId}`}
                          className="rounded-md border bg-muted/30 p-2"
                        >
                          <button
                            type="button"
                            className="block w-full text-left"
                            onClick={() => focusPlacedArticle(pageNumber, slotId)}
                          >
                            <div className="line-clamp-2 font-kannada text-xs font-semibold leading-snug">
                              {article.headline || "Untitled article"}
                            </div>
                            <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                              Page {pageNumber} - {slotLabel}
                            </div>
                          </button>
                          {canEdit && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="mt-2 h-7 w-full justify-start px-2 text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => removePlacedArticle(pageNumber, slotId)}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Remove from paper
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <Columns3 className="h-3.5 w-3.5" />
                  Page spacing
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Column feel</Label>
                  <Slider
                    value={[state.columnScale]}
                    min={86}
                    max={114}
                    step={1}
                    onValueChange={([value]) =>
                      commit((current) => ({ ...current, columnScale: value }))
                    }
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Row feel</Label>
                  <Slider
                    value={[state.rowScale]}
                    min={86}
                    max={114}
                    step={1}
                    onValueChange={([value]) =>
                      commit((current) => ({ ...current, rowScale: value }))
                    }
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Space between blocks</Label>
                  <Slider
                    value={[state.gutter]}
                    min={2}
                    max={14}
                    step={1}
                    onValueChange={([value]) =>
                      commit((current) => ({ ...current, gutter: value }))
                    }
                    disabled={!canEdit}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={autoFitCurrentPage}
                  disabled={!canEdit || pagePlacedCount === 0}
                >
                  <Wand2 className="mr-1 h-3.5 w-3.5" />
                  Auto fit article space
                </Button>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <Rows3 className="h-3.5 w-3.5" />
                  Selected block
                </div>
                {selectedSlot && (
                  <>
                    <div className="rounded-md border bg-background p-2">
                      <div className="text-sm font-semibold">{selectedSlot.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {selectedAdIsMissing ? "article-ready ad space" : selectedSlot.kind} block -{" "}
                        {selectedSlot.w} columns x {selectedSlot.h} rows
                      </div>
                      {selectedArticle && (
                        <div className="mt-2 line-clamp-2 text-xs font-medium">
                          {selectedArticle.headline}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resizeSelected(1, 0)}
                        disabled={!canEdit || selectedSlot.locked}
                      >
                        <Maximize2 className="mr-1 h-3.5 w-3.5" />
                        Wider
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resizeSelected(-1, 0)}
                        disabled={!canEdit || selectedSlot.locked}
                      >
                        <Minimize2 className="mr-1 h-3.5 w-3.5" />
                        Narrower
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resizeSelected(0, 1)}
                        disabled={!canEdit || selectedSlot.locked}
                      >
                        Taller
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resizeSelected(0, -1)}
                        disabled={!canEdit || selectedSlot.locked}
                      >
                        Shorter
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => moveSelected(-1)}
                        disabled={!canEdit || selectedSlot.locked}
                      >
                        <ArrowDownUp className="mr-1 h-3.5 w-3.5" />
                        Previous
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => moveSelected(1)}
                        disabled={!canEdit || selectedSlot.locked}
                      >
                        <ArrowDownUp className="mr-1 h-3.5 w-3.5" />
                        Next
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        commit((current) => ({
                          ...current,
                          slots: current.slots.map((slot) =>
                            slot.id === selectedSlot.id ? { ...slot, locked: !slot.locked } : slot,
                          ),
                        }))
                      }
                      disabled={
                        !canEdit ||
                        selectedSlot.id === FRONT_PAGE_HEADER_AD_SLOT_ID ||
                        selectedIsHeaderQuote
                      }
                    >
                      {selectedSlot.locked ? (
                        <Unlock className="mr-2 h-4 w-4" />
                      ) : (
                        <Lock className="mr-2 h-4 w-4" />
                      )}
                      {selectedSlot.locked ? "Unlock section" : "Lock section"}
                    </Button>
                  </>
                )}
              </section>

              {selectedIsHeaderQuote && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    <Type className="h-3.5 w-3.5" />
                    Quote box
                  </div>
                  <div className="space-y-2 rounded-md border bg-background p-2">
                    <Label className="text-xs">Front page quote</Label>
                    <Input
                      value={state.headerQuote ?? DEFAULT_HEADER_QUOTE}
                      onChange={(event) => updateHeaderQuote(event.target.value)}
                      placeholder="Enter quote text"
                      disabled={!canEdit}
                      className="h-8 text-xs"
                    />
                  </div>
                </section>
              )}

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <PanelTop className="h-3.5 w-3.5" />
                  Block content
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addAdToSelectedBlock}
                    disabled={!canEdit || !selectedSlot || selectedIsHeaderQuote}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add ad
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clearSelectedBlock}
                    disabled={!canEdit || !selectedSlot || selectedIsHeaderQuote}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Clear block
                  </Button>
                </div>
                {selectedIsAdBlock && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={convertSelectedAdToArticleBlock}
                      disabled={!canEdit || !selectedSlot || selectedIsHeaderQuote}
                    >
                      <Type className="mr-1 h-3.5 w-3.5" />
                      Article block
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={deleteSelectedAdBlock}
                      disabled={
                        !canEdit ||
                        !selectedSlot ||
                        selectedIsHeaderQuote ||
                        selectedSlot.id === FRONT_PAGE_HEADER_AD_SLOT_ID
                      }
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete ad
                    </Button>
                  </div>
                )}
                {selectedAssignment?.ad && (
                  <div className="space-y-2 rounded-md border bg-background p-2">
                    <div className="text-xs font-semibold">Advertisement details</div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Ad title</Label>
                      <Input
                        value={selectedAssignment.ad.title}
                        onChange={(event) => updateSelectedAd("title", event.target.value)}
                        disabled={!canEdit}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Image URL</Label>
                      <Input
                        value={selectedAssignment.ad.imageUrl ?? ""}
                        onChange={(event) => updateSelectedAd("imageUrl", event.target.value)}
                        placeholder="Paste ad image URL"
                        disabled={!canEdit}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Subtitle or offer</Label>
                      <Input
                        value={selectedAssignment.ad.subtitle ?? ""}
                        onChange={(event) => updateSelectedAd("subtitle", event.target.value)}
                        placeholder="Example: 50% off this weekend"
                        disabled={!canEdit}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Contact or website</Label>
                      <Input
                        value={selectedAssignment.ad.contact ?? ""}
                        onChange={(event) => updateSelectedAd("contact", event.target.value)}
                        placeholder="Phone, address, or URL"
                        disabled={!canEdit}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Small note</Label>
                      <Input
                        value={selectedAssignment.ad.note ?? ""}
                        onChange={(event) => updateSelectedAd("note", event.target.value)}
                        placeholder="Optional footer text"
                        disabled={!canEdit}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <Type className="h-3.5 w-3.5" />
                  Article details
                </div>
                {selectedArticle ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Headline</Label>
                      <Input
                        key={`headline-${selectedArticle.id}`}
                        defaultValue={selectedArticle.headline ?? ""}
                        onBlur={(event) => updateArticle.mutate({ headline: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-3 rounded-md border bg-background p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold">Text size</div>
                          <div className="text-[10px] text-muted-foreground">
                            Fine tune this block without changing other articles
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          onClick={resetSelectedTextTuning}
                          disabled={!canEdit}
                        >
                          Reset
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <Label className="text-xs">Heading</Label>
                          <span className="tabular-nums text-muted-foreground">
                            {selectedTextTuning.headlineScale}%
                          </span>
                        </div>
                        <div className="grid grid-cols-[2rem_1fr_2rem] items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-0 text-xs"
                            aria-label="Decrease heading size"
                            onClick={() => changeSelectedTextScale("headlineScale", -5)}
                            disabled={
                              !canEdit || selectedTextTuning.headlineScale <= MIN_TEXT_SCALE
                            }
                          >
                            A-
                          </Button>
                          <Slider
                            value={[selectedTextTuning.headlineScale]}
                            min={MIN_TEXT_SCALE}
                            max={MAX_TEXT_SCALE}
                            step={1}
                            onValueChange={([value]) =>
                              updateSelectedTextTuning({
                                ...selectedTextTuning,
                                headlineScale: value,
                              })
                            }
                            disabled={!canEdit}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-0 text-xs"
                            aria-label="Increase heading size"
                            onClick={() => changeSelectedTextScale("headlineScale", 5)}
                            disabled={
                              !canEdit || selectedTextTuning.headlineScale >= MAX_TEXT_SCALE
                            }
                          >
                            A+
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <Label className="text-xs">Content</Label>
                          <span className="tabular-nums text-muted-foreground">
                            {selectedTextTuning.bodyScale}%
                          </span>
                        </div>
                        <div className="grid grid-cols-[2rem_1fr_2rem] items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-0 text-xs"
                            aria-label="Decrease content size"
                            onClick={() => changeSelectedTextScale("bodyScale", -5)}
                            disabled={!canEdit || selectedTextTuning.bodyScale <= MIN_TEXT_SCALE}
                          >
                            A-
                          </Button>
                          <Slider
                            value={[selectedTextTuning.bodyScale]}
                            min={MIN_TEXT_SCALE}
                            max={MAX_TEXT_SCALE}
                            step={1}
                            onValueChange={([value]) =>
                              updateSelectedTextTuning({
                                ...selectedTextTuning,
                                bodyScale: value,
                              })
                            }
                            disabled={!canEdit}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-0 text-xs"
                            aria-label="Increase content size"
                            onClick={() => changeSelectedTextScale("bodyScale", 5)}
                            disabled={!canEdit || selectedTextTuning.bodyScale >= MAX_TEXT_SCALE}
                          >
                            A+
                          </Button>
                        </div>
                      </div>
                    </div>
                    {selectedArticle.image_url && selectedImage && (
                      <div className="space-y-3 rounded-md border bg-background p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-xs font-semibold">Smart image placement</div>
                            <div className="text-[10px] text-muted-foreground">
                              Keeps the photo balanced with the surrounding text
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={optimizeSelectedImage}
                            disabled={!canEdit}
                          >
                            AI fit
                          </Button>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {(["left", "center", "right", "full"] as const).map((position) => (
                            <Button
                              key={position}
                              type="button"
                              size="sm"
                              variant={selectedImage.position === position ? "default" : "outline"}
                              className="px-1 text-[11px]"
                              onClick={() =>
                                updateSelectedImage({
                                  ...selectedImage,
                                  position,
                                  widthPct:
                                    position === "full"
                                      ? 100
                                      : clamp(selectedImage.widthPct, MIN_IMAGE_WIDTH_PCT, 88),
                                })
                              }
                              disabled={!canEdit}
                            >
                              {position}
                            </Button>
                          ))}
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <Label className="text-xs">Image width</Label>
                            <span className="text-muted-foreground">
                              {Math.round(selectedImage.widthPct)}%
                            </span>
                          </div>
                          <Slider
                            value={[selectedImage.widthPct]}
                            min={MIN_IMAGE_WIDTH_PCT}
                            max={selectedImage.position === "full" ? 100 : 88}
                            step={1}
                            onValueChange={([value]) =>
                              updateSelectedImage({
                                ...selectedImage,
                                widthPct: selectedImage.position === "full" ? 100 : value,
                              })
                            }
                            disabled={!canEdit || selectedImage.position === "full"}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Caption</Label>
                          <Input
                            key={`caption-${selectedArticle.id}-${selectedSlot?.id}`}
                            defaultValue={selectedImage.caption}
                            onBlur={(event) =>
                              updateSelectedImage({
                                ...selectedImage,
                                caption: event.target.value,
                              })
                            }
                            disabled={!canEdit}
                          />
                        </div>
                      </div>
                    )}
                    <div className="rounded-md border bg-background p-2 text-xs text-muted-foreground">
                      The block automatically balances text size, image placement, spacing, and
                      columns to keep the page clean.
                    </div>
                  </>
                ) : (
                  <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                    Select an article block on the page to edit its headline, image, and spacing.
                  </div>
                )}
              </section>
            </div>
          </ScrollArea>
        </aside>
      </div>

      <DragOverlay>
        {activeDragLabel ? (
          <div className="max-w-64 rounded-md border bg-background px-3 py-2 text-sm font-semibold shadow-lg">
            {activeDragLabel}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
