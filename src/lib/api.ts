import { supabase } from "@/integrations/supabase/client";

export type NewspaperStatus = "draft" | "pending_layout" | "pending_approval" | "approved" | "rejected" | "published";
export type ArticleCategory = "Politics" | "Sports" | "Crime" | "Agriculture" | "Education" | "Cinema" | "Business" | "Other";

export interface Newspaper {
  id: string;
  edition_name: string;
  edition_date: string;
  language: string;
  number_of_pages: number;
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

const FN_URL = (name: string) =>
  `${import.meta.env.VITE_BACKEND_URL ?? import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;

async function callFn<T = any>(name: string, body: any): Promise<T> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const res = await fetch(FN_URL(name), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `fn ${name} failed`);
  return json;
}

export const aiFn = {
  ocr: (payload: { fileUrl?: string; inputType?: string; fileName?: string; mimeType?: string }) => callFn<{ ocr_text: string; simulated: boolean }>("process-ocr", payload),
  process: (text: string) => callFn<{ corrected_text: string; headline: string; summary: string; category: ArticleCategory; priority_score: number }>("process-article-ai", { text }),
  image: (payload: string | ImageArticlePayload) => callFn<{ image_url: string }>("generate-image", typeof payload === "string" ? { prompt: payload } : { article: payload }),
  layout: (articles: Article[], number_of_pages: number) => callFn<{ layout: any[] }>("generate-layout", { articles, number_of_pages }),
  tts: (text: string) => callFn<{ audio_url: string; simulated: boolean }>("tts-kannada", { text }),
};
