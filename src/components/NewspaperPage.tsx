import type { CSSProperties } from "react";
import type { Article, Newspaper } from "@/lib/api";
import { newspaperArticleBackgroundStyle } from "@/components/NewspaperArticleBlock";

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
};

const PRINT_PAGE_WIDTH = 780;
const PRINT_PAGE_HEIGHT = 1084;
const PRINT_PAGE_PADDING = "28px 32px";
const ARTICLES_PER_PAGE = 4;
const LEAD_TEXT_LIMIT = 720;
const STORY_TEXT_LIMIT = 220;

function articleBody(article: Article) {
  return article.corrected_text ?? article.ocr_text ?? article.raw_text ?? article.summary ?? "";
}

function takeTextChunk(text: string, limit: number) {
  if (text.length <= limit) return [text, ""] as const;

  const slice = text.slice(0, limit);
  const breakAt = Math.max(
    slice.lastIndexOf("\n"),
    slice.lastIndexOf(" "),
    slice.lastIndexOf("."),
    slice.lastIndexOf("।"),
  );
  const end = breakAt > limit * 0.6 ? breakAt + 1 : limit;

  return [text.slice(0, end).trim(), text.slice(end).trim()] as const;
}

function bodyTextClass(text = "", lead = false) {
  if (lead) return text.length > 600 ? "text-[11px] leading-snug" : "text-[12px] leading-snug";
  if (text.length > 180) return "text-[10px] leading-snug";
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
    let remaining = articleBody(article).trim() || article.summary?.trim() || "";
    let chunkIndex = 0;

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
        headline_size: isLeadSlot
          ? "big"
          : article.headline_size === "big"
            ? "medium"
            : article.headline_size,
        image_url: continued ? null : article.image_url,
        summary: continued ? null : article.summary,
        print_id: article.id,
        print_text: chunk,
        continued,
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
          <img
            src="/prajavani-nandi.png"
            alt=""
            className="h-12 w-28 object-contain sm:h-14 sm:w-36"
          />
        </div>
        <span className="text-left font-kannada-serif text-[56px] font-black leading-none tracking-normal sm:text-[74px]">
          ವಾಣಿ
        </span>
      </div>
      <div className="mt-2 font-kannada text-[10px] font-semibold leading-none tracking-wide">
        ಆತ್ಮ ವಿಶ್ವಾಸದ ಕನ್ನಡ ದಿನಪತ್ರಿಕೆ
      </div>
    </div>
  );
}

function articleBackgroundStyle(article: Article): CSSProperties | undefined {
  const backgroundStyle = newspaperArticleBackgroundStyle(article);
  if (!backgroundStyle) return undefined;

  return {
    ...backgroundStyle,
    padding: "8px",
    borderRadius: 2,
  };
}

function articleText(article: PrintArticle) {
  return (
    article.print_text ??
    article.corrected_text ??
    article.summary ??
    article.ocr_text ??
    article.raw_text ??
    ""
  );
}

export function NewspaperPage({ newspaper, articles, pageNumber, totalPages }: Props) {
  const pageArticles = paginatePrintArticles(articles).get(pageNumber) ?? [];
  const lead = pageArticles.find((a) => a.headline_size === "big") ?? pageArticles[0];
  const rest = pageArticles.filter((a) => a.id !== lead?.id);
  const leadText = lead ? articleText(lead) : "";
  const displayTotalPages = totalPages ?? newspaper.number_of_pages;

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div
        data-print-page
        className="newsprint mx-auto flex flex-col overflow-hidden shadow-xl"
        style={{
          width: PRINT_PAGE_WIDTH,
          minWidth: PRINT_PAGE_WIDTH,
          height: PRINT_PAGE_HEIGHT,
          padding: PRINT_PAGE_PADDING,
          boxSizing: "border-box",
        }}
      >
        {pageNumber === 1 ? (
          <div className="mb-3 shrink-0 border-b-4 border-double border-newsprint-ink pb-3 text-center">
            <PrajavaniMasthead />
            <div className="mt-2 flex justify-between border-t border-newsprint-rule pt-1 text-[10px] uppercase tracking-widest">
              <span>{newspaper.language}</span>
              <span>{new Date(newspaper.edition_date).toDateString()}</span>
              <span>
                Page {pageNumber} of {displayTotalPages}
              </span>
            </div>
          </div>
        ) : (
          <div className="mb-2 flex shrink-0 items-center justify-between border-b border-newsprint-rule pb-1 text-[9px] uppercase tracking-widest">
            <span>{newspaper.edition_name}</span>
            <span>Page {pageNumber}</span>
          </div>
        )}

        {!lead && (
          <div className="flex flex-1 items-center justify-center text-sm italic opacity-60">
            Advertisement space
          </div>
        )}

        {lead && (
          <div className="mb-3 shrink-0 pb-2" style={articleBackgroundStyle(lead)}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-primary">
              {lead.continued ? "Continued" : lead.category}
            </div>
            <h1 className="mt-1 font-kannada-serif text-3xl font-black leading-tight">
              {lead.headline}
            </h1>
            {lead.summary && (
              <p className="mt-1.5 font-kannada text-xs italic leading-snug opacity-80">
                {lead.summary}
              </p>
            )}
            <div className="mt-2 grid grid-cols-3 gap-3">
              {lead.image_url && (
                <div className="col-span-3">
                  <img src={lead.image_url} alt="" className="h-36 w-full object-cover" />
                  <div className="text-[9px] italic opacity-70">Photo caption</div>
                </div>
              )}
              <div
                className={`col-span-3 font-kannada ${bodyTextClass(leadText, true)}`}
                style={{ columnCount: 3, columnGap: 12 }}
              >
                {leadText}
              </div>
            </div>
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-hidden">
          {rest.map((article) => {
            const text = articleText(article);
            return (
              <div
                key={article.id}
                className="min-h-0 overflow-hidden pt-2"
                style={articleBackgroundStyle(article)}
              >
                <div className="text-[9px] font-bold uppercase tracking-widest text-primary">
                  {article.continued ? "Continued" : article.category}
                </div>
                <h3
                  className={`font-kannada-serif font-bold leading-tight ${article.headline_size === "medium" ? "text-base" : "text-sm"}`}
                >
                  {article.headline}
                </h3>
                {article.image_url && (
                  <img src={article.image_url} alt="" className="mt-1.5 h-20 w-full object-cover" />
                )}
                <p
                  className={`mt-1 font-kannada ${bodyTextClass(text)}`}
                  style={{
                    columnCount: article.column_count && article.column_count > 1 ? 2 : 1,
                    columnGap: 8,
                  }}
                >
                  {text}
                </p>
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
