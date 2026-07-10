import { supabase } from "@/integrations/supabase/client";

export type NewspaperStatus =
  "draft" | "pending_layout" | "pending_approval" | "approved" | "rejected" | "published";
export type ArticleCategory =
  "Politics" | "Sports" | "Crime" | "Agriculture" | "Education" | "Cinema" | "Business" | "Other";

export interface Newspaper {
  id: string;
  edition_name: string;
  edition_date: string;
  language: string;
  number_of_pages: number;
  organization_id: string | null;
  template: string;
  status: NewspaperStatus;
  created_by: string;
  created_at: string;
}

export interface Article {
  id: string;
  newspaper_id: string;
  raw_input_type: string;
  raw_text: string | null;
  ocr_text: string | null;
  corrected_text: string | null;
  headline: string | null;
  summary: string | null;
  category: ArticleCategory | null;
  background_color: string | null;
  priority_score: number | null;
  image_url: string | null;
  image_source: string | null;
  workflow_status: Record<string, boolean>;
  page_number: number | null;
  position: string | null;
  headline_size: string | null;
  image_size: string | null;
  column_count: number | null;
  created_at: string;
}

type ImageArticlePayload = Partial<Article> & {
  prompt?: string;
};

export interface LayoutPlanItem {
  article_id: string;
  page_number: number;
  position: string;
  headline_size: string;
  image_size: string;
  column_count: number;
  slot_index?: number;
}

const BACKEND_URL = (
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

const FN_URL = (name: string) => `${BACKEND_URL}/functions/v1/${name}`;

async function callFn<T = unknown>(name: string, body: unknown): Promise<T> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const res = await fetch(FN_URL(name), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `fn ${name} failed`);
  return json;
}

export const aiFn = {
  ocr: (payload: { fileUrl?: string; inputType?: string; fileName?: string; mimeType?: string }) =>
    callFn<{ ocr_text: string; simulated: boolean }>("process-ocr", payload),
  process: (text: string) =>
    callFn<{
      corrected_text: string;
      headline: string;
      summary: string;
      category: ArticleCategory;
      priority_score: number;
    }>("process-article-ai", { text }),
  image: (payload: string | Partial<Article>) =>
    callFn<{ image_url: string }>(
      "generate-image",
      typeof payload === "string" ? { prompt: payload } : { article: payload },
    ),
  layout: (articles: Article[], number_of_pages: number) =>
    callFn<{ layout: LayoutPlanItem[] }>("generate-layout", { articles, number_of_pages }),
  tts: (text: string) => callFn<{ audio_url: string; simulated: boolean }>("tts-kannada", { text }),
};
