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

export interface InstagramSlideContent {
  article_id: string;
  caption: string;
  mentions: string[];
  hashtags: string[];
}

export interface SocialContentEdit {
  caption: string;
  mentions: string[];
  hashtags: string[];
  provider?: string;
}

export interface ScheduledSlide {
  articleId: string;
  order: number;
  imageUrl: string | null;
  caption: string;
  mentions: string[];
  hashtags: string[];
}

export interface ScheduledPost {
  id: string;
  platform: "instagram" | "twitter" | "facebook" | "whatsapp" | "inshorts";
  status: "scheduled" | "cancelled";
  scheduledAt: string;
  createdAt: string;
  updatedAt: string;
  slides: ScheduledSlide[];
}

type ImageArticlePayload = Partial<Article> & {
  prompt?: string;
};

type JsonObject = Record<string, unknown>;

export type ProcessArticleOptions = {
  targetWordLimit?: number;
};

const FN_URL = (name: string) =>
  `${import.meta.env.VITE_BACKEND_URL ?? import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function callFn<T = unknown>(name: string, body: unknown): Promise<T> {
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
  const raw = await res.text();
  let json: unknown = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = { error: raw };
  }
  if (!res.ok) {
    const errorPayload = isJsonObject(json) ? json : {};
    const detail = [errorPayload.error, errorPayload.message, errorPayload.detail]
      .filter((part) => typeof part === "string" && part.trim())
      .join(": ");
    throw new Error(detail || `fn ${name} failed with HTTP ${res.status}`);
  }
  return json as T;
}

export const aiFn = {
  ocr: (payload: { fileUrl?: string; inputType?: string; fileName?: string; mimeType?: string }) =>
    callFn<{ ocr_text: string; simulated: boolean }>("process-ocr", payload),
  process: (text: string, options: ProcessArticleOptions = {}) =>
    callFn<{
      corrected_text: string;
      headline: string;
      summary: string;
      category: ArticleCategory;
      priority_score: number;
    }>("process-article-ai", { text, targetWordLimit: options.targetWordLimit ?? 250 }),
  image: (payload: string | ImageArticlePayload) =>
    callFn<{ image_url: string }>(
      "generate-image",
      typeof payload === "string" ? { prompt: payload } : { article: payload },
    ),
  instagram: (articles: Partial<Article>[]) =>
    callFn<{ slides: InstagramSlideContent[]; provider?: string }>("generate-instagram-content", {
      articles,
    }),
  editSocialContent: (payload: {
    platform: ScheduledPost["platform"];
    caption: string;
    mentions: string[];
    hashtags: string[];
    instructions: string;
    article: Partial<Article> | null;
  }) => callFn<SocialContentEdit>("edit-social-content", payload),
  tts: (text: string) => callFn<{ audio_url: string; simulated: boolean }>("tts-kannada", { text }),
};

export const scheduleFn = {
  list: () => callFn<{ posts: ScheduledPost[] }>("list-scheduled-posts", {}),
  create: (post: {
    platform: ScheduledPost["platform"];
    scheduledAt: string;
    slides: ScheduledSlide[];
  }) => callFn<{ post: ScheduledPost }>("schedule-post", { post }),
  update: (postId: string, scheduledAt: string) =>
    callFn<{ post: ScheduledPost }>("update-scheduled-post", { id: postId, scheduledAt }),
  cancel: (postId: string) =>
    callFn<{ post: ScheduledPost }>("cancel-scheduled-post", { id: postId }),
  delete: (postId: string) =>
    callFn<{ deleted: true; id: string }>("delete-scheduled-post", { id: postId }),
};
