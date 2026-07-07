import type { CSSProperties } from "react";
import type { Article, Newspaper } from "@/lib/api";

interface Props {
  newspaper: Newspaper;
  articles: Article[];
  pageNumber: number;
  totalPages?: number;
}

type PrintArticle = Article & {
  print_id?: string;
  print_text?: string;
  continued?: boolean;
  text_only?: boolean;
};

const ARTICLES_PER_PAGE = 7;
const LEAD_TEXT_LIMIT = 1500;
const STORY_TEXT_LIMIT = 540;

function articleBody(article: Article) {
  return article.corrected_text ?? article.ocr_text ?? article.raw_text ?? article.summary ?? "";
}

function takeTextChunk(text: string, limit: number) {
  if (text.length <= limit) return [text, ""] as const;
  const slice = text.slice(0, limit);
  const breakAt = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "), slice.lastIndexOf("."), slice.lastIndexOf("।"));
  const end = breakAt > limit * 0.65 ? breakAt + 1 : limit;
  return [text.slice(0, end).trim(), text.slice(end).trim()] as const;
}

function bodyTextClass(text = "", lead = false) {
  const length = text.length;

  if (lead) {
    if (length > 1500) return "text-[10.5px] leading-snug";
    return "text-[11px] leading-snug";
  }

  if (length > 620) return "text-[9.75px] leading-snug";
  if (length > 450) return "text-[10px] leading-snug";
  return "text-[10.5px] leading-snug";
}

export function paginatePrintArticles(articles: Article[]) {
  const sorted = [...articles]
    .filter((article) => article.page_number)
    .sort((a, b) => {
      const pageDiff = (a.page_number ?? 0) - (b.page_number ?? 0);
      if (pageDiff !== 0) return pageDiff;
      if (a.position === "top" && b.position !== "top") return -1;
      if (b.position === "top" && a.position !== "top") return 1;
      return (b.priority_score ?? 0) - (a.priority_score ?? 0);
    });

  const pages = new Map<number, PrintArticle[]>();
  let page = 1;
  let slot = 0;

  for (const article of sorted) {
    let remaining = articleBody(article).trim();
    let chunkIndex = 0;

    if (!remaining) remaining = article.summary ?? "";

    while (remaining) {
      if (slot >= ARTICLES_PER_PAGE) {
        page += 1;
        slot = 0;
      }

      const isLeadSlot = slot === 0;
      const limit = isLeadSlot ? LEAD_TEXT_LIMIT : STORY_TEXT_LIMIT;
      const [chunk, next] = takeTextChunk(remaining, limit);
      const continued = chunkIndex > 0;
      const pageArticles = pages.get(page) ?? [];

      pageArticles.push({
        ...article,
        id: `${article.id}-print-${chunkIndex}`,
        page_number: page,
        position: isLeadSlot ? "top" : article.position,
        headline_size: isLeadSlot ? "big" : article.headline_size === "big" ? "medium" : article.headline_size,
        image_url: continued ? null : article.image_url,
        summary: continued ? null : article.summary,
        print_id: article.id,
        print_text: chunk,
        continued,
        text_only: continued,
        corrected_text: chunk,
        ocr_text: null,
        raw_text: null,
      });

      pages.set(page, pageArticles);
      remaining = next;
      chunkIndex += 1;
      slot += 1;
    }
  }

  return pages;
}

export function getPrintPageCount(articles: Article[], minimumPages = 1) {
  const pages = paginatePrintArticles(articles);
  return Math.max(minimumPages, ...Array.from(pages.keys()), 1);
}

function PrajavaniMasthead() {
  return (
    <div className="select-none text-newsprint-ink">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end leading-none">
        <span className="text-right font-kannada-serif text-[56px] font-black leading-none tracking-normal sm:text-[74px]">
          ಪ್ರಜಾ
        </span>
        <div className="mb-1 flex w-28 justify-center sm:w-36">
          <img src="/prajavani-nandi.png" alt="" className="h-12 w-28 object-contain sm:h-14 sm:w-36" />
        </div>
        <span className="text-left font-kannada-serif text-[56px] font-black leading-none tracking-normal sm:text-[74px]">
          ವಾಣಿ
        </span>
      </div>
      <div className="-mt-1 font-kannada text-[10px] font-semibold leading-none tracking-wide">
        ಆತ್ಮ ವಿಶ್ವಾಸದ ಕನ್ನಡ ದಿನಪತ್ರಿಕೆ
      </div>
    </div>
  );
}

/** Renders one newspaper page in real column layout with headline hierarchy. */

const ARTICLE_BACKGROUND_COLORS = new Set([
  "#fff4bf",
  "#dbeafe",
  "#dcfce7",
  "#ffedd5",
  "#ffe4e6",
  "#e5e7eb",
]);

const BACKGROUND_COLOR_FALLBACK_KEY = "article_background_color";

function normalizeArticleBackgroundColor(value: unknown) {
  if (typeof value === "string") {
    return ARTICLE_BACKGROUND_COLORS.has(value) ? value : "";
  }
  if (value && typeof value === "object" && "value" in value) {
    return normalizeArticleBackgroundColor((value as { value?: unknown }).value);
  }
  return "";
}

function articleBackgroundStyle(article: Article): CSSProperties | undefined {
  const workflowStatus = article.workflow_status as Record<string, unknown> | null | undefined;
  const backgroundColor =
    normalizeArticleBackgroundColor(article.background_color) ||
    normalizeArticleBackgroundColor(workflowStatus?.[BACKGROUND_COLOR_FALLBACK_KEY]);
  if (!backgroundColor) return undefined;
  return {
    backgroundColor,
    padding: "10px",
    borderRadius: 2,
  };
}
export function NewspaperPage({ newspaper, articles, pageNumber }: Props) {
  const pageArticles = articles
    .filter((a) => (a.page_number ?? 0) === pageNumber)
    .sort((a, b) => (a.position === "top" ? -1 : b.position === "top" ? 1 : 0));

  const lead = pageArticles.find((a) => a.headline_size === "big") ?? pageArticles[0];
  const rest = pageArticles.filter((a) => a.id !== lead?.id);
  const leadText = lead ? lead.print_text ?? lead.corrected_text ?? lead.ocr_text ?? lead.raw_text ?? "" : "";

  return (
    <div
      className="newsprint mx-auto shadow-xl"
      style={{ width: "100%", maxWidth: 780, aspectRatio: "0.72", padding: "28px 32px" }}
    >
      {/* Masthead only on page 1 */}
      {pageNumber === 1 && (
        <div className="mb-3 border-b-4 border-double border-newsprint-ink pb-3 text-center">
          <div className="font-serif text-5xl font-black tracking-tight">
            {newspaper.edition_name}
          </div>
          <div className="mt-1 flex justify-between text-[10px] uppercase tracking-widest">
            <span>{newspaper.language}</span>
            <span>{new Date(newspaper.edition_date).toDateString()}</span>
            <span>
              Page {pageNumber} of {newspaper.number_of_pages}
            </span>
          </div>
        </div>
      )}
      {pageNumber !== 1 && (
        <div className="mb-1 flex shrink-0 items-center justify-between border-b border-newsprint-rule pb-1 text-[9px] uppercase tracking-widest">
          <span>{newspaper.edition_name}</span>
          <span>Page {pageNumber}</span>
        </div>
      )}

      {!lead && (
        <div className="flex h-full items-center justify-center text-sm italic opacity-60">
          — Advertisement space —
        </div>
      )}

      {lead && (
        <div
          className="mb-4 border-b border-newsprint-rule pb-3"
          style={articleBackgroundStyle(lead)}
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary">
            {lead.category}
          </div>
          <h1 className="mt-1 font-kannada-serif text-4xl font-black leading-tight">
            {lead.headline}
          </h1>
          {lead.summary && (
            <p className="mt-2 font-kannada text-sm italic opacity-80">{lead.summary}</p>
          )}
          <div className="mt-3 grid grid-cols-3 gap-3">
            {lead.image_url && (
              <div className="col-span-3">
                <img
                  src={lead.image_url}
                  alt=""
                  className="w-full object-cover"
                  style={{ maxHeight: 240 }}
                />
                <div className="text-[9px] italic opacity-70">— Photo caption —</div>
              </div>
            )}
            <div
              className="col-span-3 font-kannada text-[13px] leading-relaxed"
              style={{ columnCount: 3, columnGap: 12 }}
            >
              {lead.corrected_text ?? lead.ocr_text ?? lead.raw_text}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {rest.map((a) => (
          <div
            key={a.id}
            className="border-t border-newsprint-rule pt-2"
            style={articleBackgroundStyle(a)}
          >
            <div className="text-[9px] font-bold uppercase tracking-widest text-primary">
              {a.category}
            </div>
            <h3
              className={`font-kannada-serif font-bold leading-tight ${a.headline_size === "medium" ? "text-lg" : "text-base"}`}
            >
              {a.headline}
            </h3>
            {a.image_url && (
              <img
                src={a.image_url}
                alt=""
                className="mt-1.5 w-full object-cover"
                style={{ maxHeight: 110 }}
              />
            )}
            <p
              className="mt-1 font-kannada text-[12px] leading-snug"
              style={{ columnCount: a.column_count && a.column_count > 1 ? 2 : 1, columnGap: 8 }}
            >
              {a.corrected_text ?? a.summary ?? a.ocr_text ?? a.raw_text}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-1 flex shrink-0 justify-between border-t border-newsprint-rule pt-0.5 text-[9px] uppercase tracking-widest">
        <span>{newspaper.edition_name}</span>
        <span>{new Date(newspaper.edition_date).toLocaleDateString()}</span>
        <span>Page {pageNumber}</span>
      </div>
    </div>
  );
}
