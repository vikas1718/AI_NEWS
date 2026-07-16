import type { CSSProperties } from "react";
import type { Article, Newspaper } from "@/lib/api";
import {
  ArticleTranslateOverlay,
  NewspaperArticleBlockContent,
} from "@/components/NewspaperArticleBlock";

type SavedSlot = {
  id: string;
  label?: string;
  kind?: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type SavedAssignment = {
  articleId?: string;
  image?: {
    position: "left" | "right" | "center" | "full";
    wrap: "square" | "tight";
    widthPct: number;
    aspectRatio: number;
    margin: number;
    caption: string;
  };
  text?: {
    headlineScale: number;
    bodyScale: number;
  };
  ad?: {
    title?: string;
    size?: string;
    imageUrl?: string;
    subtitle?: string;
    contact?: string;
    note?: string;
  };
};

type SavedPageState = {
  slots: SavedSlot[];
  assignments: Record<string, SavedAssignment>;
  rowScale?: number;
  columnScale?: number;
  gutter?: number;
  headerQuote?: string;
};

type SavedLayout = {
  pages: Record<string, SavedPageState>;
};

type Props = {
  newspaper: Newspaper;
  articles: Article[];
  layoutJson: unknown;
  pageNumber: number;
  totalPages: number;
  activeArticleId?: string;
  onArticleTap?: (articleId: string) => void;
  onTranslateArticle?: (articleId: string) => void;
};

const PAGE_WIDTH = 780;
const PAGE_HEIGHT = 1084;
const GRID_COLUMNS = 12;
const GRID_ROWS = 18;
const FRONT_PAGE_HEADER_AD_SLOT_ID = "front_page_header_left_ad";
const FRONT_PAGE_HEADER_QUOTE_SLOT_ID = "front_page_header_quote";
const DEFAULT_HEADER_QUOTE = "ದಿನದ ಚಿಂತನೆ / Quote";
const DEFAULT_HEADER_AD_ASSIGNMENT: SavedAssignment = {
  ad: {
    title: "Advertisement",
    size: "3 columns x 1 rows",
    imageUrl: "",
    subtitle: "",
    contact: "",
    note: "",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function layoutPayload(layoutJson: unknown) {
  if (isRecord(layoutJson) && "layout_json" in layoutJson) {
    return layoutJson.layout_json;
  }
  return layoutJson;
}

export function savedLayoutPageNumbers(layoutJson: unknown) {
  const payload = layoutPayload(layoutJson);
  if (!isRecord(payload) || !isRecord(payload.pages)) return [];
  return Object.keys(payload.pages)
    .map(Number)
    .filter((pageNumber) => Number.isFinite(pageNumber))
    .sort((a, b) => a - b);
}

export function hasSavedEditorLayout(layoutJson: unknown) {
  return savedLayoutPageNumbers(layoutJson).length > 0;
}

function readSavedLayout(layoutJson: unknown): SavedLayout | null {
  const payload = layoutPayload(layoutJson);
  if (!hasSavedEditorLayout(payload) || !isRecord(payload) || !isRecord(payload.pages)) return null;
  return payload as unknown as SavedLayout;
}

function isDefaultAdPlaceholder(assignment?: SavedAssignment) {
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

function hasAssignedAd(assignment?: SavedAssignment) {
  return Boolean(assignment?.ad && !isDefaultAdPlaceholder(assignment));
}

function PrajavaniMasthead() {
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

function AdBlock({ assignment }: { assignment?: SavedAssignment }) {
  return (
    <div className="h-full overflow-hidden bg-amber-50 text-center text-amber-950">
      {assignment?.ad?.imageUrl ? (
        <img
          src={assignment.ad.imageUrl}
          alt={assignment.ad.title || "Advertisement"}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col justify-center gap-1 p-2">
          <div className="text-[11px] font-black uppercase leading-tight tracking-widest">
            {assignment?.ad?.title ?? "Advertisement"}
          </div>
          {assignment?.ad?.subtitle && (
            <div className="text-[9px] font-semibold leading-tight">{assignment.ad.subtitle}</div>
          )}
          {assignment?.ad?.contact && (
            <div className="text-[8px] leading-tight">{assignment.ad.contact}</div>
          )}
          <div className="text-[8px] uppercase tracking-wide opacity-70">
            {assignment?.ad?.note ?? assignment?.ad?.size ?? "Reserved space"}
          </div>
        </div>
      )}
    </div>
  );
}

function ArticleBlock({
  article,
  slot,
  assignment,
  activeArticleId,
  onArticleTap,
  onTranslateArticle,
}: {
  article?: Article;
  slot: SavedSlot;
  assignment?: SavedAssignment;
  activeArticleId?: string;
  onArticleTap?: (articleId: string) => void;
  onTranslateArticle?: (articleId: string) => void;
}) {
  if (!article)
    return (
      <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground" />
    );

  const content = (
    <div className="h-full overflow-hidden bg-white">
      <NewspaperArticleBlockContent article={article} slot={slot} assignment={assignment} />
    </div>
  );

  if (!onArticleTap || !onTranslateArticle) return content;

  return (
    <ArticleTranslateOverlay
      articleId={article.id}
      isActive={activeArticleId === article.id}
      onTap={onArticleTap}
      onTranslate={onTranslateArticle}
      className="h-full"
    >
      {content}
    </ArticleTranslateOverlay>
  );
}

function HeaderQuoteBox({ quote }: { quote?: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col justify-center overflow-hidden bg-white px-3 py-2 text-left text-newsprint-ink">
      <div className="font-kannada text-[12px] font-semibold leading-snug">
        {quote || DEFAULT_HEADER_QUOTE}
      </div>
    </div>
  );
}

function headerAdAssignment(pageState: SavedPageState) {
  return pageState.assignments[FRONT_PAGE_HEADER_AD_SLOT_ID]?.ad
    ? pageState.assignments[FRONT_PAGE_HEADER_AD_SLOT_ID]
    : DEFAULT_HEADER_AD_ASSIGNMENT;
}

export function SavedLayoutPreviewPage({
  articles,
  layoutJson,
  pageNumber,
  activeArticleId,
  onArticleTap,
  onTranslateArticle,
}: Props) {
  const savedLayout = readSavedLayout(layoutJson);
  const pageState = savedLayout?.pages[String(pageNumber)];
  const articleById = new Map(articles.map((article) => [article.id, article]));

  if (!pageState) return null;
  const headerAd = headerAdAssignment(pageState);

  const pageStyle: CSSProperties = {
    width: PAGE_WIDTH,
    minWidth: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    padding: 24,
    boxSizing: "border-box",
  };

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div
        data-print-page
        className="newsprint mx-auto flex flex-col overflow-hidden shadow-xl"
        style={pageStyle}
      >
        <div className="mb-3 border-b-4 border-double border-newsprint-ink pb-2">
          {pageNumber === 1 ? (
            <div
              className="grid items-stretch gap-3"
              style={{
                gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
                gridTemplateRows: "86px",
              }}
            >
              <div style={{ gridColumn: "1 / span 3", gridRow: "1 / span 1" }}>
                <HeaderQuoteBox quote={pageState.headerQuote} />
              </div>
              <div
                className="flex flex-col items-center justify-center text-center"
                style={{ gridColumn: "4 / span 6" }}
              >
                <PrajavaniMasthead />
              </div>
              <div style={{ gridColumn: "10 / span 3", gridRow: "1 / span 1" }}>
                <AdBlock assignment={headerAd} />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.22em]">
              <span>Page {pageNumber}</span>
            </div>
          )}
        </div>

        <div
          className="grid min-h-0 flex-1"
          style={{
            gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, ${(pageState.columnScale ?? 100) / 100}fr))`,
            gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, ${(pageState.rowScale ?? 100) / 100}fr))`,
            gap: pageState.gutter ?? 8,
          }}
        >
          {pageState.slots.map((slot) => {
            const assignment = pageState.assignments[slot.id];
            return (
              <div
                key={slot.id}
                className="min-h-0 overflow-hidden"
                style={{
                  gridColumn: `${slot.x} / span ${slot.w}`,
                  gridRow: `${slot.y} / span ${slot.h}`,
                }}
              >
                {hasAssignedAd(assignment) ? (
                  <AdBlock assignment={assignment} />
                ) : (
                  <ArticleBlock
                    article={
                      assignment?.articleId ? articleById.get(assignment.articleId) : undefined
                    }
                    slot={slot}
                    assignment={assignment}
                    activeArticleId={activeArticleId}
                    onArticleTap={onArticleTap}
                    onTranslateArticle={onTranslateArticle}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
