import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Bookmark, Calendar as CalendarIcon, Check, ChevronLeft, ChevronRight, Clock, Eye, Globe2, Heart, Image, Instagram, Loader2, MessageCircle, MoreHorizontal, Repeat2, Search, Send, Share2, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { aiFn, scheduleFn, type Article, type InstagramSlideContent, type Newspaper, type ScheduledPost } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/multiplatform_/instagram")({
  component: InstagramPublishing,
});

type RankedArticle = Article & {
  aiScore: number;
  aiReason: string;
  priorityLabel: "Breaking" | "High Priority" | "Trending" | "Public Interest" | "Recommended";
};

type SlideContent = {
  caption: string;
  mentions: string[];
  suggestedMentions: string[];
  mentionsEdited: boolean;
  mentionSignature: string;
  hashtags: string[];
  hashtagVariant: number;
};

const platformTemplate = {
  platform: "Instagram",
  defaultCaptionPrefix: "Today's Top Stories",
  defaultHashtags: ["#Newsroom", "#IndiaNews", "#TopNews", "#Weather", "#Politics", "#Business"],
  bestPostingTime: "6:30 PM",
};

type SocialBranding = {
  displayName: string;
  handle: string;
  hashtag: string;
};

const defaultSocialBranding: SocialBranding = {
  displayName: "Newsroom",
  handle: "newsroom",
  hashtag: "#Newsroom",
};

function createSocialBranding(name?: string | null): SocialBranding {
  const displayName = name?.trim() || defaultSocialBranding.displayName;
  const handle =
    displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 28) || defaultSocialBranding.handle;
  const hashtag = toHashtag(displayName) || defaultSocialBranding.hashtag;

  return { displayName, handle, hashtag };
}

function defaultHashtagsForBrand(branding: SocialBranding) {
  return uniqueHashtags([branding.hashtag, ...platformTemplate.defaultHashtags]);
}

function InstagramBrandLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="instagram-logo-radial" cx="30%" cy="107%" r="140%">
          <stop offset="0%" stopColor="#fdf497" />
          <stop offset="5%" stopColor="#fdf497" />
          <stop offset="45%" stopColor="#fd5949" />
          <stop offset="60%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#instagram-logo-radial)" />
      <rect x="17" y="17" width="30" height="30" rx="9" fill="none" stroke="#fff" strokeWidth="4" />
      <circle cx="32" cy="32" r="8" fill="none" stroke="#fff" strokeWidth="4" />
      <circle cx="42.5" cy="21.5" r="3" fill="#fff" />
    </svg>
  );
}

function XBrandLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#000" />
      <path
        fill="#fff"
        d="M38.7 28.7 54 11h-3.6L37.1 26.4 26.5 11H14.2l16 23.3L14.2 53h3.6l14-16.2L43 53h12.3L38.7 28.7Zm-5 5.8-1.6-2.3-12.9-18.6h5.6l10.4 14.9 1.6 2.3 13.6 19.6h-5.6L33.7 34.5Z"
      />
    </svg>
  );
}

function FacebookBrandLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#1877F2" />
      <path
        fill="#fff"
        d="M36.8 54V34.8h6.4l1-7.5h-7.4v-4.8c0-2.2.6-3.6 3.7-3.6h4v-6.7c-.7-.1-3.1-.3-5.8-.3-5.8 0-9.7 3.5-9.7 10v5.5h-6.5v7.5H29V54h7.8Z"
      />
    </svg>
  );
}

function WhatsAppBrandLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#25D366" />
      <path
        fill="#fff"
        d="M18.1 47.3 20 40.4A23 23 0 1 1 28.6 49l-10.5 2.8Zm11.1-3.5.6.3a18.2 18.2 0 1 0-5.4-4.8l.4.7-1.1 4.2 5.5-1.4Z"
      />
      <path
        fill="#fff"
        d="M25.2 21.8c-.5-1.2-1.1-1.2-1.6-1.3h-1.4c-.5 0-1.3.2-2 1-.7.8-2.6 2.6-2.6 6.3s2.7 7.3 3.1 7.8c.4.5 5.3 8.4 13 11.4 6.4 2.5 7.7 2 9.1 1.9 1.4-.1 4.5-1.8 5.1-3.6.6-1.8.6-3.3.4-3.6-.2-.3-.7-.5-1.5-.9l-5.2-2.6c-.8-.4-1.4-.6-2 .6-.6 1.1-2.3 2.8-2.8 3.4-.5.6-1 .7-1.8.3-.8-.4-3.4-1.2-6.5-3.9-2.4-2.1-4-4.8-4.5-5.6-.5-.8-.1-1.2.4-1.6.4-.4.8-1 1.2-1.5.4-.5.5-.8.8-1.4.3-.6.1-1.1-.1-1.5l-2.4-5.6Z"
      />
    </svg>
  );
}

function InshortsBrandLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="inshorts-logo-gradient" x1="8" x2="56" y1="8" y2="56">
          <stop offset="0%" stopColor="#ff7a18" />
          <stop offset="100%" stopColor="#e31b23" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#inshorts-logo-gradient)" />
      <rect x="18" y="17" width="28" height="5" rx="2.5" fill="#fff" />
      <rect x="18" y="28" width="20" height="5" rx="2.5" fill="#fff" />
      <rect x="18" y="39" width="28" height="5" rx="2.5" fill="#fff" />
      <path d="M43 27 52 32l-9 5V27Z" fill="#fff" />
    </svg>
  );
}

const publishingPlatforms = [
  {
    id: "instagram",
    name: "Instagram",
    description: "Create Instagram-ready content from your newspaper edition.",
    logo: InstagramBrandLogo,
  },
  {
    id: "twitter",
    name: "X (Twitter)",
    description: "Create X-ready content from your newspaper edition.",
    logo: XBrandLogo,
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Create Facebook-ready content from your newspaper edition.",
    logo: FacebookBrandLogo,
  },
  {
    id: "whatsapp",
    name: "WhatsApp Channel",
    description: "Create WhatsApp Channel-ready content from your newspaper edition.",
    logo: WhatsAppBrandLogo,
  },
  {
    id: "inshorts",
    name: "Inshorts",
    description: "Create Inshorts-ready content from your newspaper edition.",
    logo: InshortsBrandLogo,
  },
] as const;

type PlatformId = (typeof publishingPlatforms)[number]["id"];

type PublishResult = {
  platform: PlatformId;
  status: "published" | "failed";
  message?: string;
};

type ScheduledPostGroup = {
  key: string;
  scheduledAt: string;
  status: ScheduledPost["status"];
  posts: ScheduledPost[];
  platforms: PlatformId[];
  slides: ScheduledPost["slides"];
};

function platformLabel(platformId: PlatformId) {
  return publishingPlatforms.find((platform) => platform.id === platformId)?.name ?? platformId;
}

function platformLogo(platformId: PlatformId) {
  return publishingPlatforms.find((platform) => platform.id === platformId)?.logo ?? InstagramBrandLogo;
}

function PlatformPublishIcon({ platform }: { platform: PlatformId }) {
  const Logo = platformLogo(platform);
  const label = platformLabel(platform);

  return (
    <div
      title={label}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border bg-background shadow-sm"
    >
      <Logo className="h-5 w-5 shrink-0" />
    </div>
  );
}

const selectionFactors = [
  "Breaking News",
  "Public Interest",
  "Trending",
  "Engagement Potential",
  "National Importance",
  "Local Importance",
  "Visual Quality",
  "Freshness",
  "Category Importance",
];

const categoryWeight: Record<string, number> = {
  Politics: 8,
  Business: 7,
  Agriculture: 7,
  Education: 6,
  Crime: 6,
  Sports: 5,
  Cinema: 4,
  Other: 3,
};

function rankArticle(article: Article): RankedArticle {
  const basePriority = article.priority_score ?? 50;
  const visualQuality = article.image_url ? 8 : 0;
  const categoryScore = article.category ? categoryWeight[article.category] ?? 3 : 3;
  const textScore = article.summary || article.corrected_text || article.raw_text ? 5 : 0;
  const aiScore = Math.min(99, Math.round(basePriority + visualQuality + categoryScore + textScore));

  const reason =
    aiScore >= 90
      ? "Trending national development"
      : aiScore >= 80
        ? "Strong public interest"
        : aiScore >= 70
          ? "High engagement potential"
          : "Relevant edition update";

  return {
    ...article,
    aiScore,
    aiReason: reason,
    priorityLabel:
      aiScore >= 95
        ? "Breaking"
        : aiScore >= 88
          ? "High Priority"
          : aiScore >= 80
            ? "Trending"
            : aiScore >= 70
              ? "Public Interest"
              : "Recommended",
  };
}

function articleTitle(article: Article) {
  return article.headline || "Untitled article";
}

function articleDescription(article: Article) {
  return article.summary || article.corrected_text || article.raw_text || "No description available.";
}

function scheduledPostArticleKey(post: ScheduledPost) {
  const orderedArticleIds = [...post.slides]
    .sort((a, b) => a.order - b.order)
    .map((slide) => slide.articleId)
    .filter(Boolean);

  if (orderedArticleIds.length > 0) return orderedArticleIds.join("|");
  return post.id;
}

function scheduledPostGroupKey(post: ScheduledPost) {
  return [scheduledPostArticleKey(post), post.scheduledAt, post.status].join("::");
}

function scheduledPostTitle(group: ScheduledPostGroup, articles: Article[]) {
  const firstSlide = [...group.slides].sort((a, b) => a.order - b.order)[0];
  const article = articles.find((item) => item.id === firstSlide?.articleId);
  if (article) return articleTitle(article);

  const captionTitle = firstSlide?.caption?.split("\n").find((line) => line.trim())?.trim();
  return captionTitle || "Scheduled news post";
}

function groupScheduledPosts(posts: ScheduledPost[]) {
  const groups = new Map<string, ScheduledPostGroup>();

  posts.forEach((post) => {
    const key = scheduledPostGroupKey(post);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        scheduledAt: post.scheduledAt,
        status: post.status,
        posts: [post],
        platforms: [post.platform],
        slides: post.slides,
      });
      return;
    }

    existing.posts.push(post);
    if (!existing.platforms.includes(post.platform)) {
      existing.platforms.push(post.platform);
    }
  });

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
  );
}

function articleDate(article: Article) {
  if (!article.created_at) return "Date unavailable";
  const date = new Date(article.created_at);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function createSummary(articles: Article[]) {
  if (articles.length === 0) return "Select news articles to generate a combined Instagram-ready summary.";
  const bullets = articles.slice(0, 6).map((article) => `- ${articleTitle(article)}.`).join("\n");
  return `India witnessed several important developments today.\n\n${bullets}\n\nThe selected stories have been combined into one concise summary suitable for Instagram.`;
}

function createCaption(articles: Article[], branding = defaultSocialBranding) {
  if (articles.length === 0) {
    return `${platformTemplate.defaultCaptionPrefix}\n\nStay informed with ${branding.displayName}.\n\n${branding.hashtag}\n#IndiaNews\n#BreakingNews`;
  }

  const lines = articles
    .slice(0, 6)
    .map((article) => articleTitle(article).replace(/\.$/, "") + "...")
    .join("\n\n");

  return `${platformTemplate.defaultCaptionPrefix}\n\n${lines}\n\nStay informed with ${branding.displayName}.\n\n${branding.hashtag}\n#IndiaNews\n#BreakingNews`;
}

function createSlideCaption(article: Article, branding = defaultSocialBranding) {
  return createCaption([article], branding)
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n")
    .trim();
}

function toHashtag(value: string) {
  const clean = value.replace(/[^a-zA-Z0-9]/g, "");
  if (!clean) return "";
  return `#${clean}`;
}

function uniqueHashtags(tags: string[]) {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const normalized = toHashtag(tag);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(toHashtag);
}

function articleKeywords(article: Article) {
  const stopWords = new Set([
    "about", "after", "also", "from", "have", "into", "more", "news", "that", "their", "this", "with",
    "will", "today", "india", "indian", "story", "latest", "update",
  ]);

  return Array.from(
    new Set(
      `${articleTitle(article)} ${articleDescription(article)}`
        .match(/[a-zA-Z][a-zA-Z0-9]+/g)
        ?.map((word) => word.toLowerCase())
        .filter((word) => word.length > 3 && !stopWords.has(word)) ?? [],
    ),
  )
    .slice(0, 5)
    .map((word) => `#${word.charAt(0).toUpperCase()}${word.slice(1)}`);
}

function createHashtags(article: Article, variant = 0, brandHashtag = defaultSocialBranding.hashtag) {
  const categoryTags = article.category ? [toHashtag(article.category)] : [];
  const categoryPools: Partial<Record<NonNullable<Article["category"]>, string[]>> = {
    Politics: ["#PoliticsToday", "#Governance", "#PublicPolicy", "#ElectionWatch"],
    Business: ["#BusinessNews", "#Economy", "#MarketUpdate", "#FinanceNews"],
    Agriculture: ["#Agriculture", "#Farmers", "#RuralNews", "#AgriUpdate"],
    Education: ["#EducationNews", "#Students", "#Learning", "#CampusNews"],
    Crime: ["#CrimeNews", "#PublicSafety", "#LawAndOrder", "#CrimeUpdate"],
    Sports: ["#SportsNews", "#GameDay", "#SportsUpdate", "#TeamIndia"],
    Cinema: ["#CinemaNews", "#Entertainment", "#FilmNews", "#KannadaCinema"],
    Other: ["#NewsUpdate", "#CurrentAffairs", "#TopStories", "#TrendingNow"],
  };
  const rotatingPools = [
    ["#LatestNews", "#IndiaToday", "#TopStories", "#CurrentAffairs", "#DailyNews", "#TrendingNow", "#NewsUpdate", "#India"],
    ["#BreakingUpdate", "#NewsToday", "#InTheNews", "#IndiaNews", "#TopUpdates", "#StayInformed", "#NationalNews", "#LocalNews"],
    ["#TodayNews", "#NewsAlert", "#LatestUpdates", "#PublicInterest", "#NewsDigest", "#CurrentNews", "#TrendingNews", "#MorningUpdate"],
  ];
  const categoryPool = article.category ? categoryPools[article.category] ?? [] : [];
  const pool = rotatingPools[variant % rotatingPools.length];
  const offset = variant % pool.length;
  const rotatedPool = [...pool.slice(offset), ...pool.slice(0, offset)];

  return uniqueHashtags([
    ...categoryTags,
    ...articleKeywords(article),
    ...categoryPool,
    ...rotatedPool,
    brandHashtag,
  ]).slice(0, 12);
}

function createSlideContent(article: Article, branding = defaultSocialBranding): SlideContent {
  const suggestedMentions = createMentionSuggestions(article);
  return {
    caption: createSlideCaption(article, branding),
    mentions: suggestedMentions,
    suggestedMentions,
    mentionsEdited: false,
    mentionSignature: articleMentionSignature(article),
    hashtags: createHashtags(article, 0, branding.hashtag),
    hashtagVariant: 0,
  };
}

function parseHashtags(value: string) {
  return uniqueHashtags(value.split(/[\s,]+/).filter(Boolean));
}

function normalizeMention(value: string) {
  const clean = value.trim().replace(/\s+/g, "").replace(/^@+/, "").replace(/[^a-zA-Z0-9._]/g, "");
  if (!clean) return "";
  return `@${clean}`;
}

function uniqueMentions(mentions: string[]) {
  const seen = new Set<string>();
  return mentions
    .map(normalizeMention)
    .filter((mention) => {
      const key = mention.toLowerCase();
      if (!mention || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function parseMentions(value: string) {
  return uniqueMentions(value.split(/[\s,]+/).filter(Boolean));
}

function localDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromLocalInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function scheduleDateLabel(value: string) {
  const date = dateFromLocalInput(value);
  if (!date) return "Select date";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function localTimeInputValue(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function localTimeDisplayValue(value: string) {
  const [hoursValue, minutesValue] = value.split(":").map(Number);
  if (Number.isNaN(hoursValue) || Number.isNaN(minutesValue)) return "";

  const period = hoursValue >= 12 ? "PM" : "AM";
  const displayHours = hoursValue % 12 || 12;
  return `${String(displayHours).padStart(2, "0")}:${String(minutesValue).padStart(2, "0")} ${period}`;
}

function formatTimeInput(value: string) {
  const match = value.trim().match(/^(\d{1,2})\s*:\s*(\d{1,2})\s*([ap]m)$/i);
  if (!match) {
    return { value: "", error: "Enter time in 12-hour format, for example 09:30 AM." };
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();

  if (hours < 1 || hours > 12) {
    return { value: "", error: "Hours must be between 1 and 12." };
  }

  if (minutes < 0 || minutes > 59) {
    return { value: "", error: "Minutes must be between 00 and 59." };
  }

  return {
    value: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${period}`,
    error: "",
  };
}

function timeInputToLocalValue(value: string) {
  const formatted = formatTimeInput(value);
  if (!formatted.value) return { value: "", error: formatted.error };

  const match = formatted.value.match(/^(\d{2}):(\d{2}) (AM|PM)$/);
  if (!match) return { value: "", error: "Enter time in 12-hour format, for example 09:30 AM." };

  let hours = Number(match[1]);
  const minutes = match[2];
  const period = match[3];

  if (period === "AM" && hours === 12) hours = 0;
  if (period === "PM" && hours !== 12) hours += 12;

  return {
    value: `${String(hours).padStart(2, "0")}:${minutes}`,
    error: "",
  };
}

function defaultScheduleDateTime() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 30);
  return date;
}

function formatScheduledAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";

  const dateLabel = date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeLabel = date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${dateLabel} • ${timeLabel}`;
}

function articleMentionSignature(article: Article) {
  return [
    article.headline,
    article.summary,
    article.corrected_text,
    article.raw_text,
    article.category,
  ].filter(Boolean).join("|");
}

const verifiedInstagramHandles: Array<{ signals: string[]; handles: string[] }> = [
  { signals: ["virat kohli", "kohli"], handles: ["@virat.kohli", "@indiancricketteam", "@icc"] },
  { signals: ["rohit sharma"], handles: ["@rohitsharma45", "@indiancricketteam", "@icc"] },
  { signals: ["lionel messi", "messi"], handles: ["@leomessi", "@fifaworldcup"] },
  { signals: ["cristiano ronaldo", "ronaldo"], handles: ["@cristiano"] },
  { signals: ["fifa", "world cup"], handles: ["@fifaworldcup"] },
  { signals: ["icc", "cricket council"], handles: ["@icc"] },
  { signals: ["bcci", "team india", "indian cricket"], handles: ["@indiancricketteam", "@icc"] },
  { signals: ["ipl", "indian premier league"], handles: ["@iplt20"] },
  { signals: ["narendra modi", "prime minister of india", "prime minister modi"], handles: ["@narendramodi"] },
  { signals: ["white house"], handles: ["@whitehouse"] },
  { signals: ["election commission"], handles: ["@eciindia"] },
  { signals: ["openai", "chatgpt"], handles: ["@openai"] },
  { signals: ["isro", "indian space research organisation", "indian space research organization"], handles: ["@isro.in"] },
  { signals: ["nasa"], handles: ["@nasa"] },
  { signals: ["spacex"], handles: ["@spacex"] },
  { signals: ["elon musk"], handles: ["@elonmusk", "@spacex"] },
  { signals: ["google", "alphabet"], handles: ["@google"] },
  { signals: ["microsoft"], handles: ["@microsoft"] },
  { signals: ["apple", "iphone"], handles: ["@apple"] },
  { signals: ["tesla"], handles: ["@teslamotors"] },
  { signals: ["meta", "facebook", "instagram"], handles: ["@meta"] },
  { signals: ["amazon"], handles: ["@amazon"] },
  { signals: ["netflix"], handles: ["@netflix"] },
];

function createMentionSuggestions(article: Article) {
  const text = [
    article.headline,
    article.summary,
    article.corrected_text,
    article.raw_text,
    article.category,
  ].filter(Boolean).join(" ").toLowerCase();

  return uniqueMentions(
    verifiedInstagramHandles.flatMap((item) =>
      item.signals.some((signal) => text.includes(signal)) ? item.handles : [],
    ),
  ).slice(0, 8);
}

function refreshSlideContent(article: Article, existing?: SlideContent, branding = defaultSocialBranding): SlideContent {
  const mentionSignature = articleMentionSignature(article);
  const suggestedMentions = existing?.suggestedMentions ?? createMentionSuggestions(article);
  const shouldRefreshMentions = !existing || existing.mentionSignature !== mentionSignature;

  return {
    caption: existing?.caption ?? createSlideCaption(article, branding),
    mentions: shouldRefreshMentions ? suggestedMentions : existing.mentions ?? [],
    suggestedMentions,
    mentionsEdited: existing?.mentionsEdited ?? false,
    mentionSignature,
    hashtags: existing?.hashtags ?? createHashtags(article, 0, branding.hashtag),
    hashtagVariant: existing?.hashtagVariant ?? 0,
  };
}

function generateSlideContent(article: Article, existing?: SlideContent, branding = defaultSocialBranding): SlideContent {
  const mentionSignature = articleMentionSignature(article);
  const suggestedMentions = createMentionSuggestions(article);
  const preserveManualMentions = Boolean(existing?.mentionsEdited && existing.mentionSignature === mentionSignature);

  return {
    caption: createSlideCaption(article, branding),
    mentions: preserveManualMentions ? existing?.mentions ?? [] : suggestedMentions,
    suggestedMentions,
    mentionsEdited: preserveManualMentions,
    mentionSignature,
    hashtags: createHashtags(article, 0, branding.hashtag),
    hashtagVariant: 0,
  };
}

function slideContentFromAi(
  article: Article,
  generated: InstagramSlideContent | undefined,
  existing?: SlideContent,
  branding = defaultSocialBranding,
): SlideContent {
  const mentionSignature = articleMentionSignature(article);
  const aiMentions = uniqueMentions([...(generated?.mentions ?? []), ...createMentionSuggestions(article)]);
  const preserveManualMentions = Boolean(existing?.mentionsEdited && existing.mentionSignature === mentionSignature);
  const hashtags = uniqueHashtags(generated?.hashtags ?? []);

  return {
    caption: generated?.caption?.trim() || createSlideCaption(article, branding),
    mentions: preserveManualMentions ? existing?.mentions ?? [] : aiMentions,
    suggestedMentions: aiMentions,
    mentionsEdited: preserveManualMentions,
    mentionSignature,
    hashtags: hashtags.length > 0 ? hashtags : createHashtags(article, 0, branding.hashtag),
    hashtagVariant: 0,
  };
}

function InstagramPublishing() {
  const ctx = useRouteContext({ from: "/_authenticated" });
  const organizationId = ctx.organization?.id;
  const socialBranding = useMemo(
    () => createSocialBranding(ctx.organization?.name),
    [ctx.organization?.name],
  );
  const [activePlatform, setActivePlatform] = useState<PlatformId>("instagram");
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(["instagram"]);
  const [publishMode, setPublishMode] = useState<"now" | "later">("now");
  const [publishError, setPublishError] = useState("");
  const [publishResults, setPublishResults] = useState<PublishResult[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [selectionMode, setSelectionMode] = useState<"ai" | "manual">("ai");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [caption, setCaption] = useState("");
  const [slideContent, setSlideContent] = useState<Record<string, SlideContent>>({});
  const [modificationRequest, setModificationRequest] = useState("");
  const [modificationError, setModificationError] = useState("");
  const [isApplyingChanges, setIsApplyingChanges] = useState(false);
  const [isGeneratingInstagramPost, setIsGeneratingInstagramPost] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editHashtags, setEditHashtags] = useState("");
  const [mentionInput, setMentionInput] = useState("");
  const [mentionDraft, setMentionDraft] = useState<string[]>([]);
  const [editingMentionIndex, setEditingMentionIndex] = useState<number | null>(null);
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [isLoadingScheduledPosts, setIsLoadingScheduledPosts] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [editingScheduleIds, setEditingScheduleIds] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState(() => localDateInputValue(defaultScheduleDateTime()));
  const [scheduleTime, setScheduleTime] = useState(() => localTimeDisplayValue(localTimeInputValue(defaultScheduleDateTime())));
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleConfirmation, setScheduleConfirmation] = useState("");
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const { data: currentEdition } = useQuery({
    queryKey: ["instagram-current-edition", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newspapers")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Newspaper | null;
    },
  });

  const { data: articlesData, isLoading } = useQuery({
    queryKey: ["instagram-edition-articles", currentEdition?.id, organizationId],
    enabled: Boolean(currentEdition?.id && currentEdition?.organization_id === organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("newspaper_id", currentEdition!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Article[];
    },
  });

  const articles = useMemo(() => (Array.isArray(articlesData) ? articlesData : []), [articlesData]);

  const rankedArticles = useMemo(
    () => articles.map(rankArticle).sort((a, b) => b.aiScore - a.aiScore),
    [articles],
  );

  const aiSelectedArticles = useMemo(() => rankedArticles.slice(0, 6), [rankedArticles]);
  const aiSelectedIds = useMemo(() => aiSelectedArticles.map((article) => article.id), [aiSelectedArticles]);
  const selectedArticles = useMemo(
    () => rankedArticles.filter((article) => selectedIds.includes(article.id)),
    [rankedArticles, selectedIds],
  );
  const previewArticles = useMemo(
    () => (selectedArticles.length > 0 ? selectedArticles : aiSelectedArticles),
    [aiSelectedArticles, selectedArticles],
  );
  const previewSlides = useMemo(() => previewArticles.slice(0, 6), [previewArticles]);
  const activeIndex = previewSlides.length === 0 ? 0 : Math.min(carouselIndex, previewSlides.length - 1);
  const activeArticle = previewSlides[activeIndex];
  const activeSlideContent = activeArticle
    ? refreshSlideContent(activeArticle, slideContent[activeArticle.id], socialBranding)
    : {
        caption: caption.trim() || createCaption([], socialBranding),
        mentions: [],
        suggestedMentions: [],
        mentionsEdited: false,
        mentionSignature: "",
        hashtags: defaultHashtagsForBrand(socialBranding),
        hashtagVariant: 0,
      };

  const categories = useMemo(
    () => Array.from(new Set(articles.map((article) => article.category).filter(Boolean))) as string[],
    [articles],
  );
  const scheduledPostGroups = useMemo(() => groupScheduledPosts(scheduledPosts), [scheduledPosts]);
  const filteredArticles = useMemo(() => rankedArticles.filter((article) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      articleTitle(article).toLowerCase().includes(query) ||
      articleDescription(article).toLowerCase().includes(query);
    const matchesCategory = category === "all" || article.category === category;
    return matchesSearch && matchesCategory;
  }), [category, rankedArticles, search]);

  useEffect(() => {
    if (selectionMode !== "ai" || aiSelectedIds.length === 0) return;
    setSelectedIds((current) => {
      if (current.length === aiSelectedIds.length && current.every((id, index) => id === aiSelectedIds[index])) {
        return current;
      }
      return aiSelectedIds;
    });
  }, [aiSelectedIds, selectionMode]);

  useEffect(() => {
    setCaption(createCaption(previewArticles, socialBranding));
  }, [previewArticles, socialBranding]);

  useEffect(() => {
    setSlideContent((current) => {
      const next = { ...current };
      previewSlides.forEach((article) => {
        next[article.id] = refreshSlideContent(article, next[article.id], socialBranding);
      });
      return next;
    });
  }, [previewSlides, socialBranding]);

  useEffect(() => {
    setCarouselIndex(0);
  }, [previewArticles]);

  useEffect(() => {
    console.log("Rendered Mentions:", activeSlideContent.mentions);
  }, [activeArticle?.id, activeSlideContent.mentions]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingScheduledPosts(true);
    scheduleFn.list()
      .then(({ posts }) => {
        if (!cancelled) setScheduledPosts(posts);
      })
      .catch((error) => {
        console.error("Scheduled posts load failed:", error);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingScheduledPosts(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function togglePublishPlatform(platform: PlatformId) {
    setSelectedPlatforms((current) =>
      current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform],
    );
    setPublishError("");
    setPublishResults([]);
    setScheduleConfirmation("");
  }

  function toggleArticle(articleId: string) {
    setSelectionMode("manual");
    setSelectedIds((current) =>
      current.includes(articleId) ? current.filter((id) => id !== articleId) : [...current, articleId],
    );
  }

  async function generateSummary() {
    if (previewSlides.length === 0) return;
    setIsGeneratingInstagramPost(true);
    setSummary(createSummary(previewArticles));
    setCaption(createCaption(previewArticles, socialBranding));
    try {
      const generated = await aiFn.instagram(previewSlides);
      console.log("Instagram AI Response:", generated);
      console.log("AI Response:", generated);
      console.log("Mentions:", generated.slides?.map((slide) => slide.mentions));
      setSlideContent((current) => {
        const next = { ...current };
        const slidesByArticleId = new Map((generated.slides ?? []).map((slide) => [slide.article_id, slide]));
        previewSlides.forEach((article) => {
          next[article.id] = slideContentFromAi(article, slidesByArticleId.get(article.id), next[article.id], socialBranding);
        });
        console.log("Stored Slide:", activeArticle ? next[activeArticle.id] : undefined);
        return next;
      });
    } catch (error) {
      console.error("Instagram AI request failed:", error);
      setSlideContent((current) => {
        const next = { ...current };
        previewSlides.forEach((article) => {
          next[article.id] = generateSlideContent(article, next[article.id], socialBranding);
        });
        return next;
      });
    } finally {
      window.setTimeout(() => setIsGeneratingInstagramPost(false), 300);
    }
  }

  function activateAiSelection() {
    setSelectionMode("ai");
    setSelectedIds(aiSelectedArticles.map((article) => article.id));
  }

  function regenerateHashtags() {
    if (!activeArticle) return;
    setSlideContent((current) => {
      const existing = current[activeArticle.id] ?? createSlideContent(activeArticle, socialBranding);
      const hashtagVariant = existing.hashtagVariant + 1;
      return {
        ...current,
        [activeArticle.id]: {
          ...existing,
          hashtags: createHashtags(activeArticle, hashtagVariant, socialBranding.hashtag),
          hashtagVariant,
        },
      };
    });
  }

  async function applyChanges() {
    const instructions = modificationRequest.trim();
    console.log("Apply Changes clicked");
    console.log("Instructions:", instructions);
    if (!activeArticle || !instructions || isApplyingChanges) return;

    const targetArticle = activeArticle;
    const existing = refreshSlideContent(targetArticle, slideContent[targetArticle.id], socialBranding);
    console.log("Current Caption:", existing.caption);
    setModificationError("");
    setIsApplyingChanges(true);

    try {
      const updated = await aiFn.editSocialContent({
        platform: activePlatform,
        caption: existing.caption,
        mentions: existing.mentions,
        hashtags: existing.hashtags,
        instructions,
        article: targetArticle,
      });

      setSlideContent((current) => {
        const currentContent = refreshSlideContent(targetArticle, current[targetArticle.id], socialBranding);
        const mentions = uniqueMentions(updated.mentions ?? []);
        const hashtags = uniqueHashtags(updated.hashtags ?? []);
        return {
          ...current,
          [targetArticle.id]: {
            ...currentContent,
            caption: updated.caption?.trim() || currentContent.caption,
            mentions,
            suggestedMentions: uniqueMentions([...mentions, ...currentContent.suggestedMentions]),
            mentionsEdited: true,
            mentionSignature: articleMentionSignature(targetArticle),
            hashtags,
          },
        };
      });
      setModificationRequest("");
    } catch (error) {
      console.error("Request Changes failed:", error);
      setModificationError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsApplyingChanges(false);
    }
  }

  function openEditor() {
    if (!activeArticle) return;
    setEditingArticleId(activeArticle.id);
    setEditCaption(activeSlideContent.caption);
    setMentionDraft(activeSlideContent.mentions);
    setMentionInput("");
    setEditingMentionIndex(null);
    setEditHashtags(activeSlideContent.hashtags.join(" "));
    setIsEditorOpen(true);
  }

  function saveEditor() {
    if (!editingArticleId) return;
    const article = previewSlides.find((item) => item.id === editingArticleId);
    if (!article) return;
    setSlideContent((current) => {
      const existing = current[editingArticleId] ?? createSlideContent(article, socialBranding);
      return {
        ...current,
        [editingArticleId]: {
          ...existing,
          caption: editCaption,
          mentions: uniqueMentions(mentionDraft),
          mentionsEdited: true,
          mentionSignature: articleMentionSignature(article),
          hashtags: parseHashtags(editHashtags),
        },
      };
    });
    setIsEditorOpen(false);
    setEditingArticleId(null);
    setMentionInput("");
    setEditingMentionIndex(null);
  }

  function addMention() {
    const newMentions = parseMentions(mentionInput);
    if (newMentions.length === 0) return;
    setMentionDraft((current) => uniqueMentions([...current, ...newMentions]));
    setMentionInput("");
  }

  function updateMention(index: number, value: string) {
    setMentionDraft((current) => current.map((mention, currentIndex) => (currentIndex === index ? value : mention)));
  }

  function removeMention(index: number) {
    setMentionDraft((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function buildScheduledSlides() {
    return previewSlides.map((article, index) => {
      const content = refreshSlideContent(article, slideContent[article.id], socialBranding);
      return {
        articleId: article.id,
        order: index,
        imageUrl: article.image_url ?? null,
        caption: content.caption,
        mentions: content.mentions,
        hashtags: content.hashtags,
      };
    });
  }

  async function publishToPlatform(platform: PlatformId) {
    const slides = buildScheduledSlides();
    if (slides.length === 0) {
      throw new Error("No content available to publish.");
    }

    await Promise.resolve({
      platform,
      caption: slides[0]?.caption ?? "",
      mentions: slides.flatMap((slide) => slide.mentions),
      hashtags: slides.flatMap((slide) => slide.hashtags),
      images: slides.map((slide) => slide.imageUrl).filter(Boolean),
    });
  }

  async function publishSelectedPlatforms() {
    setPublishResults([]);
    setPublishError("");

    if (selectedPlatforms.length === 0) {
      setPublishError("Please select at least one platform before publishing.");
      return;
    }

    setIsPublishing(true);
    const results = await Promise.allSettled(
      selectedPlatforms.map(async (platform) => {
        await publishToPlatform(platform);
        return platform;
      }),
    );

    setPublishResults(
      results.map((result, index) => {
        const platform = selectedPlatforms[index];
        if (result.status === "fulfilled") {
          return { platform, status: "published" };
        }

        return {
          platform,
          status: "failed",
          message: result.reason instanceof Error ? result.reason.message : "Unable to publish.",
        };
      }),
    );
    setIsPublishing(false);
  }

  async function createScheduledPostsForSelectedPlatforms(isoScheduledAt: string) {
    const slides = buildScheduledSlides();
    const results = await Promise.allSettled(
      selectedPlatforms.map((platform) =>
        scheduleFn.create({
          platform,
          scheduledAt: isoScheduledAt,
          slides,
        }),
      ),
    );
    const createdPosts = results
      .filter((result): result is PromiseFulfilledResult<{ post: ScheduledPost }> => result.status === "fulfilled")
      .map((result) => result.value.post);
    const failedPlatforms = results
      .map((result, index) => (result.status === "rejected" ? selectedPlatforms[index] : null))
      .filter((platform): platform is PlatformId => Boolean(platform));

    setScheduledPosts((current) => [...createdPosts, ...current]);

    if (failedPlatforms.length > 0) {
      throw new Error(`Unable to schedule: ${failedPlatforms.map(platformLabel).join(", ")}.`);
    }
  }

  async function publishWithSettings() {
    if (publishMode === "now") {
      await publishSelectedPlatforms();
      return;
    }

    setPublishResults([]);
    setPublishError("");
    setScheduleConfirmation("");

    if (selectedPlatforms.length === 0) {
      setPublishError("Please select at least one platform before publishing.");
      return;
    }

    const scheduledAt = scheduledDateTime();
    if (!scheduledAt) return;

    const isoScheduledAt = scheduledAt.toISOString();
    setIsPublishing(true);
    try {
      await createScheduledPostsForSelectedPlatforms(isoScheduledAt);
      setScheduleConfirmation(`Post scheduled successfully.\n\n${formatScheduledAt(isoScheduledAt)}`);
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : "Unable to schedule the post. Please try again.");
    } finally {
      setIsPublishing(false);
    }
  }

  function openScheduleDialog(posts?: ScheduledPost[]) {
    if ((!posts || posts.length === 0) && selectedPlatforms.length === 0) {
      setScheduleConfirmation("Please select at least one platform before scheduling.");
      return;
    }

    const firstPost = posts?.[0];
    const date = firstPost ? new Date(firstPost.scheduledAt) : defaultScheduleDateTime();
    setEditingScheduleIds(posts?.map((post) => post.id) ?? []);
    setScheduleDate(localDateInputValue(date));
    setScheduleTime(localTimeDisplayValue(localTimeInputValue(date)));
    setScheduleError("");
    setIsScheduleOpen(true);
  }

  function scheduledDateTime() {
    if (!scheduleDate || !scheduleTime) {
      setScheduleError("Select a date and time.");
      return null;
    }

    const today = localDateInputValue(new Date());
    if (scheduleDate < today) {
      setScheduleError("Select today or a future date.");
      return null;
    }

    const formattedTime = formatTimeInput(scheduleTime);
    if (!formattedTime.value) {
      setScheduleError(formattedTime.error);
      return null;
    }

    setScheduleTime(formattedTime.value);

    const localTime = timeInputToLocalValue(formattedTime.value);
    if (!localTime.value) {
      setScheduleError(localTime.error);
      return null;
    }

    const scheduledAt = new Date(`${scheduleDate}T${localTime.value}`);
    if (Number.isNaN(scheduledAt.getTime())) {
      setScheduleError("Select a valid date and time.");
      return null;
    }

    if (scheduledAt.getTime() <= Date.now()) {
      setScheduleError(scheduleDate === today ? "Select a future time for today." : "Schedule time must be in the future.");
      return null;
    }

    setScheduleError("");
    return scheduledAt;
  }

  async function saveSchedule() {
    const scheduledAt = scheduledDateTime();
    if (!scheduledAt) return;
    if (editingScheduleIds.length === 0 && selectedPlatforms.length === 0) {
      setScheduleError("Please select at least one platform before scheduling.");
      return;
    }

    const isoScheduledAt = scheduledAt.toISOString();
    setIsSavingSchedule(true);
    try {
      if (editingScheduleIds.length > 0) {
        const results = await Promise.allSettled(
          editingScheduleIds.map((postId) => scheduleFn.update(postId, isoScheduledAt)),
        );
        const updatedPosts = results
          .filter((result): result is PromiseFulfilledResult<{ post: ScheduledPost }> => result.status === "fulfilled")
          .map((result) => result.value.post);
        if (updatedPosts.length !== editingScheduleIds.length) {
          throw new Error("Unable to update every selected platform schedule.");
        }
        const updatedById = new Map(updatedPosts.map((post) => [post.id, post]));
        setScheduledPosts((current) =>
          current.map((item) => updatedById.get(item.id) ?? item),
        );
      } else {
        await createScheduledPostsForSelectedPlatforms(isoScheduledAt);
      }

      const scheduledPlatformNames = editingScheduleIds.length > 0
        ? ["selected post"]
        : selectedPlatforms.map(platformLabel);
      setScheduleConfirmation(
        `${scheduledPlatformNames.join(", ")} scheduled successfully for ${formatScheduledAt(isoScheduledAt)}`,
      );
      setIsScheduleOpen(false);
      setEditingScheduleIds([]);
    } catch (error) {
      console.error("Schedule save failed:", error);
      setScheduleError("Unable to save the scheduled post. Please try again.");
    } finally {
      setIsSavingSchedule(false);
    }
  }

  async function cancelScheduledPosts(postIds: string[]) {
    try {
      const results = await Promise.allSettled(postIds.map((postId) => scheduleFn.cancel(postId)));
      const cancelledPosts = results
        .filter((result): result is PromiseFulfilledResult<{ post: ScheduledPost }> => result.status === "fulfilled")
        .map((result) => result.value.post);
      const cancelledById = new Map(cancelledPosts.map((post) => [post.id, post]));
      setScheduledPosts((current) => current.map((item) => cancelledById.get(item.id) ?? item));
    } catch (error) {
      console.error("Schedule cancel failed:", error);
    }
  }

  async function deleteScheduledPosts(postIds: string[]) {
    try {
      const results = await Promise.allSettled(postIds.map((postId) => scheduleFn.delete(postId)));
      const deletedIds = new Set(
        results
          .map((result, index) => (result.status === "fulfilled" ? postIds[index] : null))
          .filter((postId): postId is string => Boolean(postId)),
      );
      setScheduledPosts((current) => current.filter((post) => !deletedIds.has(post.id)));
    } catch (error) {
      console.error("Schedule delete failed:", error);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold">Multi-Platform Publishing</h1>
      </div>

      <PlatformSelector
        activePlatform={activePlatform}
        selectedPlatforms={selectedPlatforms}
        onSelect={setActivePlatform}
        onTogglePublish={togglePublishPlatform}
      />

      <div className="space-y-6">
        <div>
          <h2 className="font-serif text-3xl font-bold">Instagram Publishing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create Instagram-ready content from your newspaper edition.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(280px,25%)_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Select News From AI Editor</CardTitle>
              <CardDescription>
                AI automatically analyzes all news articles and selects the most engaging and platform-appropriate
                stories.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 overflow-hidden rounded-md border bg-muted/30 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={selectionMode === "ai" ? "default" : "ghost"}
                  className="rounded-sm"
                  onClick={activateAiSelection}
                >
                  AI Auto Selection
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={selectionMode === "manual" ? "default" : "ghost"}
                  className="rounded-sm"
                  onClick={() => setSelectionMode("manual")}
                >
                  Manual Selection
                </Button>
              </div>

              {selectionMode === "ai" && (
                <p className="text-xs leading-5 text-muted-foreground">
                  AI Auto Selection is active. The Top 6 articles are selected using mock ranking factors like public
                  interest, freshness, visual quality, and engagement potential.
                </p>
              )}

              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px] xl:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_150px]">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search articles..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isLoading && <div className="text-sm text-muted-foreground">Loading articles...</div>}
              {!isLoading && filteredArticles.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No articles found.
                </div>
              )}

              <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                {(selectionMode === "ai" ? filteredArticles.filter((article) => aiSelectedArticles.some((selected) => selected.id === article.id)) : filteredArticles).map((article) => (
                  <NewsSelectionRow
                    key={article.id}
                    article={article}
                    checked={selectedIds.includes(article.id)}
                    onToggle={() => toggleArticle(article.id)}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                <span>
                  Showing {selectionMode === "ai" ? Math.min(aiSelectedArticles.length, filteredArticles.length) : filteredArticles.length} of {rankedArticles.length} Articles
                </span>
                <span>Page 1</span>
              </div>

              <Button className="w-full" onClick={generateSummary} disabled={previewArticles.length === 0}>
                Generate Summary
              </Button>
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>{publishingPlatforms.find((platform) => platform.id === activePlatform)?.name} Preview</CardTitle>
              <CardDescription>Live platform preview using the same caption, mentions, hashtags, and selected articles.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                {isGeneratingInstagramPost ? (
                  <InstagramPreviewLoading />
                ) : (
                  <PlatformPostPreview
                    platform={activePlatform}
                    articles={previewArticles}
                    caption={activeSlideContent.caption}
                    mentions={activeSlideContent.mentions}
                    hashtags={activeSlideContent.hashtags}
                    carouselIndex={carouselIndex}
                    branding={socialBranding}
                    onPrevious={() =>
                      setCarouselIndex((current) =>
                        current === 0 ? Math.max(previewArticles.slice(0, 6).length - 1, 0) : current - 1,
                      )
                    }
                    onNext={() =>
                      setCarouselIndex((current) => {
                        const slideCount = previewArticles.slice(0, 6).length;
                        if (slideCount === 0) return 0;
                        return current === slideCount - 1 ? 0 : current + 1;
                      })
                    }
                  />
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-4">
                  <div>
                    <div className="text-sm font-semibold">Instagram Content</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Hashtags appear inside the post caption preview.
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={regenerateHashtags} disabled={!activeArticle}>
                      Regenerate Hashtags
                    </Button>
                    <Button variant="outline" size="sm" onClick={openEditor} disabled={!activeArticle}>
                      Edit
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Request Changes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      className="min-h-36"
                      placeholder="Example: Make the caption shorter. Use Kannada. Add more emojis. Focus on Solar news. Reduce hashtags."
                      value={modificationRequest}
                      onChange={(event) => {
                        setModificationRequest(event.target.value);
                        setModificationError("");
                      }}
                    />
                    {modificationError && <div className="text-sm text-destructive">{modificationError}</div>}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={applyChanges}
                        disabled={!activeArticle || !modificationRequest.trim() || isApplyingChanges}
                      >
                        {isApplyingChanges && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isApplyingChanges ? "Applying..." : "Apply Changes"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">4. Publish Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <RadioGroup
                      value={publishMode}
                      onValueChange={(value) => {
                        setPublishMode(value as "now" | "later");
                        setPublishError("");
                        setScheduleError("");
                        setScheduleConfirmation("");
                      }}
                      className="gap-3"
                    >
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-3 text-sm font-medium transition hover:border-primary/40 hover:bg-muted/30">
                        <RadioGroupItem value="now" />
                        <span>Publish Now</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-3 text-sm font-medium transition hover:border-primary/40 hover:bg-muted/30">
                        <RadioGroupItem value="later" />
                        <span>Schedule for Later</span>
                      </label>
                    </RadioGroup>

                    {publishMode === "later" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <div className="text-sm font-semibold">Date</div>
                          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="flex h-12 w-full items-center justify-between rounded-xl border bg-background px-3 text-left text-sm shadow-sm transition hover:border-primary/40 hover:bg-muted/20 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                              >
                                <span className="font-medium">{scheduleDateLabel(scheduleDate)}</span>
                                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarPicker
                                mode="single"
                                captionLayout="dropdown"
                                startMonth={new Date(new Date().getFullYear(), new Date().getMonth(), 1)}
                                endMonth={new Date(new Date().getFullYear() + 5, 11, 31)}
                                selected={dateFromLocalInput(scheduleDate)}
                                disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                                onSelect={(date) => {
                                  if (!date) return;
                                  setScheduleDate(localDateInputValue(date));
                                  setScheduleError("");
                                  setIsDatePickerOpen(false);
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm font-semibold">Time</div>
                          <div className="relative">
                            <Input
                              type="text"
                              placeholder="09:00 AM"
                              value={scheduleTime}
                              onChange={(event) => {
                                setScheduleTime(event.target.value);
                                setScheduleError("");
                              }}
                              onBlur={() => {
                                const formatted = formatTimeInput(scheduleTime);
                                if (formatted.value) {
                                  setScheduleTime(formatted.value);
                                  setScheduleError("");
                                } else if (scheduleTime.trim()) {
                                  setScheduleError(formatted.error);
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.currentTarget.blur();
                                }
                              }}
                              className="h-12 rounded-xl pr-10 text-sm font-medium shadow-sm transition hover:border-primary/40 focus-visible:ring-2"
                            />
                            <Clock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    )}

                    {scheduleError && <div className="text-sm text-destructive">{scheduleError}</div>}
                    {scheduleConfirmation && (
                      <div className="whitespace-pre-line rounded-md border bg-muted/30 px-3 py-2 text-sm">
                        {scheduleConfirmation}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex justify-end pt-1">
                  <Button className="w-full sm:w-auto" onClick={publishWithSettings} disabled={isPublishing}>
                    {isPublishing ? (publishMode === "later" ? "Scheduling..." : "Publishing...") : "Publish"}
                  </Button>
                </div>

                {(isLoadingScheduledPosts || scheduledPostGroups.length > 0) && (
                  <Card className="shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base">Scheduled Posts</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {isLoadingScheduledPosts && (
                        <div className="text-sm text-muted-foreground">Loading scheduled posts...</div>
                      )}
                      {!isLoadingScheduledPosts && scheduledPostGroups.map((group) => {
                        const postIds = group.posts.map((post) => post.id);
                        return (
                        <div key={group.key} className="space-y-3 rounded-md border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="text-sm font-medium">{formatScheduledAt(group.scheduledAt)}</div>
                              <div className="mt-1 text-sm font-semibold">{scheduledPostTitle(group, articles)}</div>
                            </div>
                            <Badge variant={group.status === "scheduled" ? "default" : "secondary"}>
                              {group.status === "scheduled" ? "Scheduled" : "Cancelled"}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {group.platforms.map((platform) => (
                              <PlatformPublishIcon key={platform} platform={platform} />
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openScheduleDialog(group.posts)}
                              disabled={group.status !== "scheduled"}
                            >
                              Edit Time
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => cancelScheduledPosts(postIds)}
                              disabled={group.status !== "scheduled"}
                            >
                              Cancel
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => deleteScheduledPosts(postIds)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}
              </div>
            </CardContent>
          </Card>

          {(publishError || publishResults.length > 0) && (
            <div className="rounded-lg border bg-background p-4 text-sm">
              {publishError && <div className="font-medium text-destructive">{publishError}</div>}
              {publishResults.length > 0 && (
                <div className="space-y-2">
                  <div className="font-semibold">
                    {publishResults.every((result) => result.status === "published")
                      ? "Successfully published to:"
                      : "Publish results:"}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {publishResults.map((result) => (
                      <div key={result.platform} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                        <span>{platformLabel(result.platform)}</span>
                        <span className={result.status === "published" ? "text-emerald-600" : "text-destructive"}>
                          {result.status === "published" ? "✓ Published" : "✗ Failed"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      </div>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Instagram Post</DialogTitle>
            <DialogDescription>
              Changes apply only to the currently selected carousel slide.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold">Caption</div>
              <Textarea
                className="min-h-40"
                value={editCaption}
                onChange={(event) => setEditCaption(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-semibold">Mentions</div>
              {mentionDraft.length > 0 ? (
                <div className="space-y-2">
                  {mentionDraft.map((mention, index) => (
                    <div key={`${mention}-${index}`} className="flex gap-2">
                      <Input
                        value={mention}
                        readOnly={editingMentionIndex !== index}
                        onChange={(event) => updateMention(index, event.target.value)}
                      />
                      <Button type="button" variant="outline" onClick={() => setEditingMentionIndex(index)}>
                        Edit
                      </Button>
                      <Button type="button" variant="outline" onClick={() => removeMention(index)}>
                        Delete
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No AI-generated mentions found for this article.</div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Enter Instagram username"
                  value={mentionInput}
                  onChange={(event) => setMentionInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addMention();
                    }
                  }}
                />
                <Button type="button" onClick={addMention}>
                  Add Mention
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-semibold">Hashtags</div>
              <Textarea
                className="min-h-28"
                value={editHashtags}
                onChange={(event) => setEditHashtags(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEditor}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isScheduleOpen}
        onOpenChange={(open) => {
          setIsScheduleOpen(open);
          if (!open) setEditingScheduleIds([]);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Post</DialogTitle>
            <DialogDescription>
              Choose when this prepared post should be marked ready for publishing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold">Date</div>
              <Input
                type="date"
                min={localDateInputValue(new Date())}
                value={scheduleDate}
                onChange={(event) => setScheduleDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-semibold">Time</div>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="09:00 AM"
                  value={scheduleTime}
                  onChange={(event) => {
                    setScheduleTime(event.target.value);
                    setScheduleError("");
                  }}
                  onBlur={() => {
                    const formatted = formatTimeInput(scheduleTime);
                    if (formatted.value) {
                      setScheduleTime(formatted.value);
                      setScheduleError("");
                    } else if (scheduleTime.trim()) {
                      setScheduleError(formatted.error);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                  className="h-12 rounded-xl pr-10 text-sm font-medium shadow-sm transition hover:border-primary/40 focus-visible:ring-2"
                />
                <Clock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            {scheduleError && <div className="text-sm text-destructive">{scheduleError}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsScheduleOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSchedule} disabled={isSavingSchedule}>
              {isSavingSchedule ? "Scheduling..." : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function PlatformSelector({
  activePlatform,
  selectedPlatforms,
  onSelect,
  onTogglePublish,
}: {
  activePlatform: PlatformId;
  selectedPlatforms: PlatformId[];
  onSelect: (platform: PlatformId) => void;
  onTogglePublish: (platform: PlatformId) => void;
}) {
  return (
    <div className="sticky top-14 z-20 border-b bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="grid gap-3 pb-1 sm:grid-cols-2 lg:grid-cols-5">
        {publishingPlatforms.map(({ id, name, logo: Logo }) => {
          const selected = activePlatform === id;
          const checked = selectedPlatforms.includes(id);

          return (
            <div
              key={id}
              role="button"
              tabIndex={0}
              className={`group relative flex h-16 w-full cursor-pointer items-center gap-2 rounded-lg border bg-card px-4 pr-10 text-sm font-semibold shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:scale-[1.03] hover:border-primary/40 hover:bg-card hover:shadow-md ${
                selected ? "border-primary bg-primary/10 text-primary shadow-md hover:bg-primary/10" : ""
              }`}
              aria-pressed={selected}
              onClick={() => onSelect(id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(id);
                }
              }}
            >
              <Checkbox
                checked={checked}
                aria-label={`Publish to ${name}`}
                className="absolute right-3 top-3 h-4 w-4"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                onCheckedChange={() => onTogglePublish(id)}
              />
              <Logo className="h-7 w-7 shrink-0" />
              {name}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InstagramPreviewLoading() {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mx-auto max-w-md overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b p-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2 w-20" />
          </div>
          <Skeleton className="h-4 w-4 rounded-full" />
        </div>
        <div className="aspect-square p-4">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
        <div className="space-y-3 border-t p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Instagram className="h-4 w-4 text-primary" />
            Generating Instagram post...
          </div>
          {["Creating caption...", "Generating hashtags...", "Preparing preview..."].map((message) => (
            <div key={message} className="flex items-center gap-3 text-xs text-muted-foreground">
              <Skeleton className="h-2 w-2 rounded-full" />
              <span>{message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type PlatformPreviewProps = {
  articles: Article[];
  caption: string;
  mentions: string[];
  hashtags: string[];
  carouselIndex: number;
  branding: SocialBranding;
  onPrevious: () => void;
  onNext: () => void;
};

function PlatformPostPreview({ platform, ...props }: PlatformPreviewProps & { platform: PlatformId }) {
  switch (platform) {
    case "twitter":
      return <TwitterPostPreview {...props} />;
    case "facebook":
      return <FacebookPostPreview {...props} />;
    case "whatsapp":
      return <WhatsAppChannelPostPreview {...props} />;
    case "inshorts":
      return <InshortsPostPreview {...props} />;
    case "instagram":
    default:
      return <InstagramPostPreview {...props} />;
  }
}

function getPreviewContent({ articles, caption, mentions, hashtags, carouselIndex, branding }: PlatformPreviewProps) {
  const slides = articles.slice(0, 6);
  const activeIndex = slides.length === 0 ? 0 : Math.min(carouselIndex, slides.length - 1);
  const activeArticle = slides[activeIndex];
  const cleanCaption = caption.trim() || createCaption([], branding);
  const cleanMentions = uniqueMentions(mentions).join(" ");
  const captionTags = hashtags.filter((tag) => !cleanCaption.includes(tag)).join(" ");
  const displayText = [cleanMentions, cleanCaption, captionTags].filter(Boolean).join("\n\n");

  return {
    slides,
    activeIndex,
    activeArticle,
    displayText,
    headline: activeArticle ? articleTitle(activeArticle) : "Today's Top Stories",
    summary: activeArticle ? articleDescription(activeArticle) : cleanCaption,
  };
}

function VerifiedBadge({ className = "bg-primary text-primary-foreground" }: { className?: string }) {
  return (
    <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${className}`}>
      <Check className="h-2.5 w-2.5" />
    </span>
  );
}

function CarouselImageControls({
  slides,
  activeIndex,
  activeArticle,
  onPrevious,
  onNext,
  className = "aspect-video",
}: {
  slides: Article[];
  activeIndex: number;
  activeArticle?: Article;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-muted ${className}`}>
      {activeArticle ? (
        <ArticleThumbnail article={activeArticle} className="h-full w-full rounded-none" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <Image className="h-10 w-10 text-muted-foreground" />
        </div>
      )}

      {slides.length > 1 && (
        <>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute left-3 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-background/90 shadow-sm"
            onClick={onPrevious}
            aria-label="Previous carousel slide"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute right-3 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-background/90 shadow-sm"
            onClick={onNext}
            aria-label="Next carousel slide"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
            {activeIndex + 1}/{slides.length}
          </div>
        </>
      )}
    </div>
  );
}

function TwitterPostPreview(props: PlatformPreviewProps) {
  const { slides, activeIndex, activeArticle, displayText } = getPreviewContent(props);
  const { displayName, handle } = props.branding;

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mx-auto max-w-xl overflow-hidden rounded-2xl border bg-card text-sm shadow-sm">
        <div className="flex gap-3 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black">
            <XBrandLogo className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1 font-bold leading-none">
                  <span>{displayName}</span>
                  <VerifiedBadge className="bg-sky-500 text-white" />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">@{handle} · 2h</div>
              </div>
              <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="mt-3 whitespace-pre-wrap text-[15px] leading-6">{displayText}</div>

            <CarouselImageControls
              slides={slides}
              activeIndex={activeIndex}
              activeArticle={activeArticle}
              onPrevious={props.onPrevious}
              onNext={props.onNext}
              className="mt-3 aspect-video"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><MessageCircle className="h-4 w-4" /> 128</span>
              <span className="inline-flex items-center gap-1"><Repeat2 className="h-4 w-4" /> 342</span>
              <span className="inline-flex items-center gap-1"><Heart className="h-4 w-4" /> 2.4K</span>
              <span className="inline-flex items-center gap-1"><BarChart3 className="h-4 w-4" /> 48K</span>
              <span className="inline-flex items-center gap-1"><Bookmark className="h-4 w-4" /> 219</span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 text-center text-xs text-muted-foreground">X post preview</div>
    </div>
  );
}

function FacebookPostPreview(props: PlatformPreviewProps) {
  const { slides, activeIndex, activeArticle, displayText } = getPreviewContent(props);
  const { displayName } = props.branding;

  return (
    <div className="rounded-xl border bg-[#f0f2f5] p-4">
      <div className="mx-auto max-w-xl overflow-hidden rounded-lg bg-white text-sm text-slate-950 shadow-sm">
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1877F2] text-lg font-bold text-white">
            f
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 font-semibold leading-none">
              <span>{displayName}</span>
              <VerifiedBadge className="bg-[#1877F2] text-white" />
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <span>2h</span>
              <span>·</span>
              <Globe2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <MoreHorizontal className="h-5 w-5 text-slate-500" />
        </div>

        <div className="whitespace-pre-wrap px-4 pb-3 leading-6">{displayText}</div>
        <CarouselImageControls
          slides={slides}
          activeIndex={activeIndex}
          activeArticle={activeArticle}
          onPrevious={props.onPrevious}
          onNext={props.onNext}
          className="mx-4 aspect-video rounded-md"
        />

        <div className="mx-4 flex items-center justify-between border-b py-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="flex -space-x-1">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1877F2] text-white"><ThumbsUp className="h-3 w-3" /></span>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white"><Heart className="h-3 w-3 fill-current" /></span>
            </span>
            <span>18K reactions</span>
          </div>
          <span>642 comments · 215 shares</span>
        </div>

        <div className="grid grid-cols-3 px-4 py-1 text-sm font-medium text-slate-600">
          <button type="button" className="flex items-center justify-center gap-2 rounded-md py-2 hover:bg-slate-100">
            <ThumbsUp className="h-4 w-4" /> Like
          </button>
          <button type="button" className="flex items-center justify-center gap-2 rounded-md py-2 hover:bg-slate-100">
            <MessageCircle className="h-4 w-4" /> Comment
          </button>
          <button type="button" className="flex items-center justify-center gap-2 rounded-md py-2 hover:bg-slate-100">
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>
      </div>
      <div className="mt-3 text-center text-xs text-muted-foreground">Facebook feed preview</div>
    </div>
  );
}

function WhatsAppChannelPostPreview(props: PlatformPreviewProps) {
  const { slides, activeIndex, activeArticle, displayText } = getPreviewContent(props);
  const { displayName } = props.branding;

  return (
    <div className="rounded-xl border bg-[#eae6df] p-4">
      <div className="mx-auto max-w-md overflow-hidden rounded-2xl bg-[#f7f7f7] text-sm text-slate-950 shadow-sm">
        <div className="flex items-center gap-3 border-b bg-white px-4 py-3">
          <WhatsAppBrandLogo className="h-10 w-10" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 font-semibold">
              <span>{displayName} Channel</span>
              <VerifiedBadge className="bg-emerald-500 text-white" />
            </div>
            <div className="text-xs text-slate-500">Today at 6:30 PM</div>
          </div>
          <MoreHorizontal className="h-5 w-5 text-slate-500" />
        </div>

        <div className="space-y-3 p-4">
          <div className="rounded-xl rounded-tl-sm bg-white p-3 shadow-sm">
            <div className="whitespace-pre-wrap leading-6">{displayText}</div>
            <CarouselImageControls
              slides={slides}
              activeIndex={activeIndex}
              activeArticle={activeArticle}
              onPrevious={props.onPrevious}
              onNext={props.onNext}
              className="mt-3 aspect-video"
            />
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>6:30 PM</span>
              <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> 24.8K</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {["👍 1.8K", "❤️ 936", "🔥 412", "🙏 208"].map((reaction) => (
              <button key={reaction} type="button" className="rounded-full bg-white px-3 py-1 text-xs shadow-sm">
                {reaction}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 text-center text-xs text-muted-foreground">WhatsApp Channel preview</div>
    </div>
  );
}

function InshortsPostPreview(props: PlatformPreviewProps) {
  const { slides, activeIndex, activeArticle, headline, summary } = getPreviewContent(props);
  const { displayName } = props.branding;

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mx-auto max-w-sm overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="relative aspect-[9/14] bg-muted">
          {activeArticle ? (
            <ArticleThumbnail article={activeArticle} className="h-full w-full rounded-none" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <Image className="h-10 w-10 text-muted-foreground" />
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-5 text-white">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="rounded-full bg-white/18 px-2 py-1 backdrop-blur">{displayName} · 2 min read</span>
              <Share2 className="h-5 w-5" />
            </div>
            <h3 className="text-xl font-bold leading-tight">{headline}</h3>
            <p className="mt-3 line-clamp-5 text-sm leading-6 text-white/90">{summary}</p>
            <div className="mt-4 flex items-center justify-between text-xs text-white/75">
              <span>Source: {displayName}</span>
              <span>{activeIndex + 1}/{Math.max(slides.length, 1)}</span>
            </div>
          </div>

          {slides.length > 1 && (
            <div className="absolute inset-x-0 top-3 flex justify-center gap-1.5">
              {slides.map((article, index) => (
                <span
                  key={article.id}
                  className={`h-1.5 w-7 rounded-full ${index === activeIndex ? "bg-white" : "bg-white/35"}`}
                />
              ))}
            </div>
          )}

          {slides.length > 1 && (
            <div className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between">
              <Button type="button" variant="secondary" size="icon" className="h-8 w-8 rounded-full bg-white/90" onClick={props.onPrevious}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button type="button" variant="secondary" size="icon" className="h-8 w-8 rounded-full bg-white/90" onClick={props.onNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 text-center text-xs text-muted-foreground">Swipe news card preview</div>
    </div>
  );
}

function InstagramPostPreview({
  articles,
  caption,
  mentions,
  hashtags,
  carouselIndex,
  branding,
  onPrevious,
  onNext,
}: PlatformPreviewProps) {
  const slides = articles.slice(0, 6);
  const activeIndex = slides.length === 0 ? 0 : Math.min(carouselIndex, slides.length - 1);
  const activeArticle = slides[activeIndex];
  const cleanCaption = caption.trim() || createCaption([], branding);
  const cleanMentions = uniqueMentions(mentions).join(" ");
  const captionTags = hashtags.filter((tag) => !cleanCaption.includes(tag));
  const displayCaption = [cleanMentions, cleanCaption, captionTags.join(" ")].filter(Boolean).join("\n\n");

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mx-auto max-w-md overflow-hidden rounded-xl border bg-card text-sm shadow-sm">
        <div className="flex items-center gap-3 border-b px-3 py-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Instagram className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 font-semibold leading-none">
              <span>{branding.handle}</span>
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                <Check className="h-2.5 w-2.5" />
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{branding.displayName} - 2h</div>
          </div>
          <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="relative aspect-square bg-muted">
          {activeArticle ? (
            <ArticleThumbnail article={activeArticle} className="h-full w-full rounded-none" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <Image className="h-10 w-10 text-muted-foreground" />
            </div>
          )}

          {slides.length > 1 && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute left-3 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-background/90 shadow-sm"
                onClick={onPrevious}
                aria-label="Previous carousel slide"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-3 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-background/90 shadow-sm"
                onClick={onNext}
                aria-label="Next carousel slide"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="absolute right-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium text-white">
                {activeIndex + 1}/{slides.length}
              </div>
            </>
          )}
        </div>

        <div className="border-t px-3 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Heart className="h-5 w-5" />
              <MessageCircle className="h-5 w-5" />
              <Send className="h-5 w-5" />
            </div>
            <Bookmark className="h-5 w-5" />
          </div>

          {slides.length > 1 && (
            <div className="mt-3 flex justify-center gap-1.5">
              {slides.map((article, index) => (
                <span
                  key={article.id}
                  className={`h-1.5 w-1.5 rounded-full ${index === activeIndex ? "bg-primary" : "bg-muted-foreground/30"}`}
                />
              ))}
            </div>
          )}

          <div className="mt-3 font-semibold">Liked by 12,543 people</div>
          <div className="mt-2 whitespace-pre-wrap leading-5">
            <span className="font-semibold">{branding.handle}</span>{" "}
            <span>{displayCaption}</span>
          </div>
          <div className="mt-2 text-muted-foreground">View all comments</div>
          <div className="mt-1">
            <span className="font-semibold">reader_updates</span> great update
          </div>
          <div className="mt-1">
            <span className="font-semibold">news_daily</span> very informative
          </div>
          <div className="mt-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">2 hours ago</div>
        </div>
      </div>
      <div className="mt-3 text-center text-xs text-muted-foreground">Swipe carousel preview</div>
    </div>
  );
}

function NewsSelectionRow({
  article,
  checked,
  onToggle,
}: {
  article: RankedArticle;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
      className="flex w-full gap-3 rounded-lg border bg-background p-3 text-left transition hover:border-primary/40 hover:shadow-sm"
    >
      <Checkbox checked={checked} aria-label={`Select ${articleTitle(article)}`} className="mt-5" />
      <ArticleThumbnail article={article} className="h-14 w-14" />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-sm font-semibold">{articleTitle(article)}</div>
        <div className="mt-1 text-xs text-muted-foreground">{articleDate(article)}</div>
        <div className="mt-1 text-xs text-muted-foreground">{article.category || "Other"}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="px-2 py-0 text-[10px]">
            {article.priorityLabel}
          </Badge>
          <span className="text-[10px] font-medium text-muted-foreground">AI Score {article.aiScore}</span>
        </div>
      </div>
    </div>
  );
}

function ArticleThumbnail({ article, className }: { article: Article; className: string }) {
  if (article.image_url) {
    return <img src={article.image_url} alt="" className={`shrink-0 rounded-md object-cover ${className}`} />;
  }

  return (
    <div className={`flex shrink-0 items-center justify-center rounded-md bg-muted ${className}`}>
      <Image className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}
