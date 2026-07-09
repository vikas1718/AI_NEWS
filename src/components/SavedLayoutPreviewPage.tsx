import type { CSSProperties } from "react";
import type { Article, Newspaper } from "@/lib/api";

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
};

const PAGE_WIDTH = 780;
const PAGE_HEIGHT = 1084;
const GRID_COLUMNS = 12;
const GRID_ROWS = 18;
const FRONT_PAGE_HEADER_AD_SLOT_ID = "front_page_header_left_ad";
const FRONT_PAGE_HEADER_QUOTE_SLOT_ID = "front_page_header_quote";
const DEFAULT_HEADER_QUOTE = "ದಿನದ ಚಿಂತನೆ / Quote";

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

function articleText(article?: Article) {
  if (!article) return "";
  return article.corrected_text ?? article.ocr_text ?? article.raw_text ?? article.summary ?? "";
}

function articleParagraphs(article?: Article) {
  const text = articleText(article).trim();
  if (!text) return [];
  return text
    .split(/\n{2,}|\r\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function PrajavaniMasthead() {
  return (
    <div className="select-none text-newsprint-ink">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end leading-none">
        <span className="text-right font-kannada-serif text-[50px] font-black leading-none tracking-normal">ಪ್ರಜಾ</span>
        <div className="mb-1 flex w-28 justify-center">
          <img src="/prajavani-nandi.png" alt="Prajavani Nandi logo" className="h-12 w-28 object-contain" />
        </div>
        <span className="text-left font-kannada-serif text-[50px] font-black leading-none tracking-normal">ವಾಣಿ</span>
      </div>
      <div className="-mt-1 font-kannada text-[10px] font-semibold leading-none tracking-wide">
        ಆತ್ಮ ವಿಶ್ವಾಸದ ಕನ್ನಡ ದಿನಪತ್ರಿಕೆ
      </div>
    </div>
  );
}

function AdBlock({ assignment }: { assignment?: SavedAssignment }) {
  return (
    <div className="h-full overflow-hidden border border-dashed border-amber-500 bg-amber-50 text-center text-amber-950">
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
          {assignment?.ad?.contact && <div className="text-[8px] leading-tight">{assignment.ad.contact}</div>}
          <div className="text-[8px] uppercase tracking-wide opacity-70">
            {assignment?.ad?.note ?? assignment?.ad?.size ?? "Reserved space"}
          </div>
        </div>
      )}
    </div>
  );
}

function articleFit(article: Article | undefined, slot: SavedSlot) {
  const textLength = articleText(article).length + (article?.headline?.length ?? 0) * 2;
  const density = textLength / Math.max(slot.w * slot.h, 1);
  return {
    headlineSize: Math.max(10, Math.min(slot.kind === "lead" ? 34 : 22, 34 - density * 0.18)),
    bodySize: Math.max(6.8, Math.min(slot.kind === "lead" ? 11.5 : 9.8, 11.5 - density * 0.055)),
    columns: Math.min(density > 48 ? 4 : 3, Math.max(1, Math.floor(slot.w / 3))),
    padding: slot.w <= 4 || density > 58 ? 6 : slot.kind === "lead" ? 10 : 8,
    gap: density > 55 ? 2 : density > 36 ? 4 : 6,
  };
}

function ArticleBlock({ article, slot }: { article?: Article; slot: SavedSlot }) {
  if (!article) return <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground" />;
  const fit = articleFit(article, slot);
  const paragraphs = articleParagraphs(article);

  return (
    <div className="flex h-full flex-col overflow-hidden border border-newsprint-rule bg-white text-newsprint-ink" style={{ padding: fit.padding, gap: fit.gap }}>
      <h3
        className="m-0 text-balance font-kannada-serif font-black"
        style={{ fontSize: fit.headlineSize, lineHeight: slot.kind === "lead" ? 1 : 1.04 }}
      >
        {article.headline || "Untitled article"}
      </h3>
      <div
        className="min-h-0 flex-1 font-kannada"
        style={{
          columnCount: fit.columns,
          columnGap: 9,
          fontSize: fit.bodySize,
          lineHeight: 1.18,
          textAlign: slot.w >= 4 ? "justify" : "left",
          overflowWrap: "break-word",
        }}
      >
        {article.image_url && (
          <figure className="mb-1 overflow-hidden border border-newsprint-rule bg-white">
            <img src={article.image_url} alt="" className="block h-20 w-full object-cover" />
          </figure>
        )}
        {paragraphs.map((paragraph, index) => (
          <p key={`${article.id}-${index}`} className="m-0 mb-1 break-inside-avoid">
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}

function HeaderQuoteBox({ quote }: { quote?: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col justify-center overflow-hidden border border-newsprint-rule bg-white px-3 py-2 text-left text-newsprint-ink">
      <div className="font-kannada text-[12px] font-semibold leading-snug">{quote || DEFAULT_HEADER_QUOTE}</div>
    </div>
  );
}

function headerAdAssignment(pageState: SavedPageState) {
  return pageState.assignments[FRONT_PAGE_HEADER_AD_SLOT_ID];
}

export function SavedLayoutPreviewPage({ newspaper, articles, layoutJson, pageNumber, totalPages }: Props) {
  const savedLayout = readSavedLayout(layoutJson);
  const pageState = savedLayout?.pages[String(pageNumber)];
  const articleById = new Map(articles.map((article) => [article.id, article]));

  if (!pageState) return null;

  const pageStyle: CSSProperties = {
    width: PAGE_WIDTH,
    minWidth: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    padding: 24,
    boxSizing: "border-box",
  };

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div data-print-page className="newsprint mx-auto flex flex-col overflow-hidden shadow-xl" style={pageStyle}>
        <div className="mb-3 border-b-4 border-double border-newsprint-ink pb-2">
          {pageNumber === 1 ? (
            <div
              className="grid items-stretch gap-3"
              style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`, gridTemplateRows: "86px" }}
            >
              <div style={{ gridColumn: "1 / span 3", gridRow: "1 / span 1" }}>
                <AdBlock assignment={headerAdAssignment(pageState)} />
              </div>
              <div className="flex flex-col items-center justify-center text-center" style={{ gridColumn: "4 / span 6" }}>
                <PrajavaniMasthead />
              </div>
              <div style={{ gridColumn: "10 / span 3", gridRow: "1 / span 1" }}>
                <HeaderQuoteBox quote={pageState.headerQuote} />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.22em]">
              <span>{newspaper.edition_name}</span>
              <span>Page {pageNumber} of {totalPages}</span>
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
                style={{ gridColumn: `${slot.x} / span ${slot.w}`, gridRow: `${slot.y} / span ${slot.h}` }}
              >
                {assignment?.ad || slot.kind === "ad" ? (
                  <AdBlock assignment={assignment} />
                ) : (
                  <ArticleBlock article={assignment?.articleId ? articleById.get(assignment.articleId) : undefined} slot={slot} />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-1 flex shrink-0 justify-between border-t border-newsprint-rule pt-0.5 text-[9px] uppercase tracking-widest">
          <span>{newspaper.edition_name}</span>
          <span>{new Date(newspaper.edition_date).toLocaleDateString()}</span>
          <span>Page {pageNumber}</span>
        </div>
      </div>
    </div>
  );
}
