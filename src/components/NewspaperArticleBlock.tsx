import type { CSSProperties, ReactNode } from "react";
import type { Article } from "@/lib/api";

export type NewspaperSlotKind = "lead" | "story" | "image" | "ad" | "sidebar" | string;

export type NewspaperLayoutSlot = {
  id: string;
  label?: string;
  kind?: NewspaperSlotKind;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type NewspaperTextTuning = {
  headlineScale: number;
  bodyScale: number;
};

export type NewspaperImagePlacement = {
  position: "left" | "right" | "center" | "full";
  wrap: "square" | "tight";
  widthPct: number;
  aspectRatio: number;
  margin: number;
  caption: string;
};

export type NewspaperSlotAssignment = {
  articleId?: string;
  image?: NewspaperImagePlacement;
  text?: NewspaperTextTuning;
  ad?: {
    title?: string;
    size?: string;
    imageUrl?: string;
    subtitle?: string;
    contact?: string;
    note?: string;
  };
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
  image: NewspaperImagePlacement | null;
};

const MIN_IMAGE_WIDTH_PCT = 28;
const MAX_IMAGE_WIDTH_PCT = 100;
const MIN_TEXT_SCALE = 80;
const MAX_TEXT_SCALE = 130;
const DEFAULT_TEXT_TUNING: NewspaperTextTuning = { headlineScale: 100, bodyScale: 100 };
const ARTICLE_BACKGROUND_COLORS = new Set([
  "#fff4bf",
  "#dbeafe",
  "#dcfce7",
  "#ffedd5",
  "#ffe4e6",
  "#e5e7eb",
]);
const BACKGROUND_COLOR_FALLBACK_KEY = "article_background_color";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function newspaperArticleText(article?: Article) {
  if (!article) return "";
  return article.corrected_text ?? article.ocr_text ?? article.raw_text ?? article.summary ?? "";
}

function articleParagraphs(article?: Article) {
  const text = newspaperArticleText(article).trim();
  if (!text) return [];
  return text
    .split(/\n{2,}|\r\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function normalizeNewspaperArticleBackgroundColor(value: unknown) {
  if (typeof value === "string") {
    return ARTICLE_BACKGROUND_COLORS.has(value) ? value : "";
  }
  if (value && typeof value === "object" && "value" in value) {
    return normalizeNewspaperArticleBackgroundColor((value as { value?: unknown }).value);
  }
  return "";
}

export function newspaperArticleBackgroundStyle(article: Article): CSSProperties | undefined {
  const workflowStatus = article.workflow_status as Record<string, unknown> | null | undefined;
  const backgroundColor =
    normalizeNewspaperArticleBackgroundColor(article.background_color) ||
    normalizeNewspaperArticleBackgroundColor(workflowStatus?.[BACKGROUND_COLOR_FALLBACK_KEY]);

  return backgroundColor ? { backgroundColor } : undefined;
}

export function normalizeNewspaperTextTuning(tuning?: NewspaperTextTuning): NewspaperTextTuning {
  return {
    headlineScale: clamp(
      tuning?.headlineScale ?? DEFAULT_TEXT_TUNING.headlineScale,
      MIN_TEXT_SCALE,
      MAX_TEXT_SCALE,
    ),
    bodyScale: clamp(
      tuning?.bodyScale ?? DEFAULT_TEXT_TUNING.bodyScale,
      MIN_TEXT_SCALE,
      MAX_TEXT_SCALE,
    ),
  };
}

function imageCaption() {
  return "";
}

export function optimizeNewspaperImagePlacement(
  article: Article | undefined,
  slot: NewspaperLayoutSlot,
): NewspaperImagePlacement | null {
  if (!article?.image_url) return null;

  const textLength = newspaperArticleText(article).length + (article.headline?.length ?? 0) * 2;
  const wideSlot = slot.w >= 8;
  const tallSlot = slot.h >= 7;
  const dense = textLength / Math.max(slot.w * slot.h, 1) > 44;
  const imageDominant = slot.kind === "image" || (slot.kind === "lead" && wideSlot && tallSlot);

  if (imageDominant) {
    return {
      position: "full",
      wrap: "square",
      widthPct: 100,
      aspectRatio: wideSlot ? 16 / 9 : 4 / 3,
      margin: 4,
      caption: imageCaption(),
    };
  }

  if (!wideSlot) {
    return {
      position: "center",
      wrap: "square",
      widthPct: clamp(slot.w * 12, 52, 88),
      aspectRatio: 4 / 3,
      margin: 4,
      caption: imageCaption(),
    };
  }

  return {
    position: dense ? "right" : "left",
    wrap: "tight",
    widthPct: dense ? 36 : 44,
    aspectRatio: 4 / 3,
    margin: 5,
    caption: imageCaption(),
  };
}

export function normalizeNewspaperImagePlacement(
  article: Article | undefined,
  slot: NewspaperLayoutSlot,
  placement?: NewspaperImagePlacement,
): NewspaperImagePlacement | null {
  const optimized = optimizeNewspaperImagePlacement(article, slot);
  if (!optimized) return null;
  const next = placement ? { ...optimized, ...placement } : optimized;
  const maxWidth = next.position === "full" ? 100 : slot.w <= 4 ? 88 : MAX_IMAGE_WIDTH_PCT;

  return {
    ...next,
    widthPct: clamp(next.widthPct, MIN_IMAGE_WIDTH_PCT, maxWidth),
    margin: clamp(next.margin, 2, 6),
    aspectRatio: clamp(next.aspectRatio, 0.7, 2),
  };
}

export function getNewspaperArticleFit(
  article: Article | undefined,
  slot: NewspaperLayoutSlot,
  assignment?: NewspaperSlotAssignment,
): FittingPlan {
  const textLength = newspaperArticleText(article).length + (article?.headline?.length ?? 0) * 2;
  const area = slot.w * slot.h;
  const density = textLength / Math.max(area, 1);
  const textTuning = normalizeNewspaperTextTuning(assignment?.text);
  const baseHeadlineSize = Math.max(
    13,
    Math.min(slot.kind === "lead" ? 34 : 22, 34 - density * 0.18),
  );
  const baseBodySize = Math.max(
    6.8,
    Math.min(slot.kind === "lead" ? 11.5 : 9.8, 11.5 - density * 0.055),
  );
  const headlineSize = clamp(
    baseHeadlineSize * (textTuning.headlineScale / 100),
    10,
    slot.kind === "lead" ? 38 : 28,
  );
  const bodySize = clamp(
    baseBodySize * (textTuning.bodyScale / 100),
    6,
    slot.kind === "lead" ? 14 : 12,
  );
  const maxColumns = slot.w >= 10 ? 4 : slot.w >= 7 ? 3 : slot.w >= 4 ? 2 : 1;
  const columns = Math.min(
    maxColumns,
    density > 48 ? maxColumns : density > 30 ? Math.max(1, maxColumns - 1) : slot.w >= 8 ? 2 : 1,
  );
  const image = normalizeNewspaperImagePlacement(article, slot, assignment?.image);
  const spacing = density > 55 ? 1 : density > 36 ? 2 : 3;
  const padding = slot.w <= 4 || density > 58 ? 4 : slot.kind === "lead" ? 7 : 5;
  const columnGap = slot.w <= 4 ? 4 : slot.w >= 9 ? 7 : 5;
  const bodyLineHeight = density > 58 ? 1.12 : density > 38 ? 1.16 : 1.2;
  const headlineLineHeight = slot.kind === "lead" ? 0.98 : 1.02;
  const paragraphGap = density > 55 ? 1 : density > 36 ? 2 : 3;
  const justifyBody = slot.w >= 4 && bodySize >= 6.5;

  return {
    headlineSize,
    bodySize,
    image,
    columns,
    spacing,
    padding,
    columnGap,
    bodyLineHeight,
    headlineLineHeight,
    paragraphGap,
    justifyBody,
  };
}

export function NewspaperArticleBlockContent({
  article,
  slot,
  assignment,
  imageControls,
  hideImageCaption = true,
  hideArticleBackground = false,
  disableAutoImagePlacement = false,
}: {
  article: Article;
  slot: NewspaperLayoutSlot;
  assignment?: NewspaperSlotAssignment;
  imageControls?: ReactNode;
  hideImageCaption?: boolean;
  hideArticleBackground?: boolean;
  disableAutoImagePlacement?: boolean;
}) {
  const fit = getNewspaperArticleFit(article, slot, assignment);
  const image = disableAutoImagePlacement && !assignment?.image ? null : fit.image;
  const paragraphs = articleParagraphs(article);
  const backgroundStyle = hideArticleBackground
    ? undefined
    : newspaperArticleBackgroundStyle(article);

  function imageFigure() {
    if (!article.image_url || !image) return null;

    const floated = image.position === "left" || image.position === "right";
    const figureWidth = image.position === "full" ? "100%" : `${image.widthPct}%`;

    return (
      <figure
        className={`group relative break-inside-avoid overflow-hidden rounded-sm bg-white ${
          floated
            ? image.position === "left"
              ? "float-left"
              : "float-right"
            : image.position === "center"
              ? "mx-auto"
              : "w-full"
        }`}
        style={{
          width: figureWidth,
          margin:
            image.position === "left"
              ? `0 ${image.margin}px ${image.margin}px 0`
              : image.position === "right"
                ? `0 0 ${image.margin}px ${image.margin}px`
                : `${image.margin}px auto`,
          shapeOutside: image.wrap === "tight" && floated ? "inset(0 round 2px)" : undefined,
        }}
      >
        <img
          src={article.image_url}
          alt=""
          draggable={false}
          className="block w-full select-none object-cover"
          style={{ aspectRatio: image.aspectRatio }}
        />
        {!hideImageCaption && image.caption && (
          <figcaption className="px-1.5 py-1 text-left text-[8px] italic leading-[1.15] text-newsprint-ink/70">
            {image.caption}
          </figcaption>
        )}
        {imageControls}
      </figure>
    );
  }

  return (
    <div
      className="flex h-full flex-col text-newsprint-ink"
      style={{ ...backgroundStyle, gap: fit.spacing, padding: fit.padding }}
    >
      <h3
        className="m-0 text-balance font-kannada-serif font-black"
        style={{ fontSize: fit.headlineSize, lineHeight: fit.headlineLineHeight }}
      >
        {article.headline || "Untitled article"}
      </h3>
      <div
        className="min-h-0 flex-1 font-kannada"
        style={{
          columnCount: fit.columns,
          columnGap: fit.columnGap,
          columnRule: fit.columns > 1 ? "1px solid rgba(63, 56, 45, 0.18)" : undefined,
          fontSize: fit.bodySize,
          lineHeight: fit.bodyLineHeight,
          textAlign: fit.justifyBody ? "justify" : "left",
          textJustify: "inter-word",
          wordBreak: slot.w <= 3 ? "break-word" : "normal",
          overflowWrap: "break-word",
          hyphens: "auto",
        }}
      >
        {imageFigure()}
        {paragraphs.length > 0
          ? paragraphs.map((paragraph, index) => (
              <p
                key={`${article.id}-paragraph-${index}`}
                className="m-0 break-inside-avoid"
                style={{
                  marginBottom: index === paragraphs.length - 1 ? 0 : fit.paragraphGap,
                }}
              >
                {paragraph}
              </p>
            ))
          : null}
      </div>
    </div>
  );
}
