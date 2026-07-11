// Real Lovable AI call: Kannada translation/correction + headline + summary + category + priority.
// deno-lint-ignore-file
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function requireAuthenticated(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: corsHeaders,
    });
  }
  if (!supabaseUrl || !anonKey) {
    return new Response(JSON.stringify({ error: "auth_config_missing" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const authResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anonKey },
  });
  if (!authResp.ok) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: corsHeaders,
    });
  }
  return null;
}

const SYSTEM = `You are an expert Kannada newspaper editor and translator.
The input may be English, Kannada, mixed-language, or noisy OCR from an image/PDF/scan.

Default output language: Kannada (kn-IN).
Tasks:
1. If the input is English or any non-Kannada language, translate the full article into natural newspaper Kannada.
2. If the input is already Kannada, correct spelling, grammar, punctuation, OCR mistakes, and preserve meaning.
3. Preserve factual details, names, places, numbers, dates, quotes, and paragraph structure when possible.
4. Do not leave English sentences in corrected_text unless they are proper nouns, official titles, abbreviations, URLs, or quoted source text that should remain as-is.

Return a strict JSON object with:
- corrected_text (string): the final Kannada article text after translation/correction.
- headline (string): a punchy Kannada headline, <= 12 words.
- summary (string): 1-2 sentence Kannada summary.
- category (string): exactly one of: Politics, Sports, Crime, Agriculture, Education, Cinema, Business, Other.
- priority_score (integer 0-100): 95 for breaking/national, 80 state-level, 50 district-level, 30 local/soft.
Respond ONLY with JSON, no prose.`;

const DEFAULT_TARGET_WORD_LIMIT = 250;
const MIN_TARGET_WORD_LIMIT = 80;
const MAX_TARGET_WORD_LIMIT = 1200;

function normalizeTargetWordLimit(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_TARGET_WORD_LIMIT;
  return Math.min(MAX_TARGET_WORD_LIMIT, Math.max(MIN_TARGET_WORD_LIMIT, Math.round(numeric)));
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function expansionFloor(sourceWordCount: number, targetWordLimit: number) {
  return Math.min(
    Math.floor(targetWordLimit * 0.75),
    Math.max(sourceWordCount + 60, Math.ceil(sourceWordCount * 2.5)),
  );
}

function shouldRetryExpansion(sourceText: string, correctedText: string, targetWordLimit: number) {
  const sourceWordCount = countWords(sourceText);
  const correctedWordCount = countWords(correctedText);
  if (sourceWordCount >= targetWordLimit * 0.8) return false;
  return correctedWordCount < expansionFloor(sourceWordCount, targetWordLimit);
}

function buildSystemPrompt(targetWordLimit: number, retryReason?: "too_long" | "too_short") {
  const retryRule =
    retryReason === "too_long"
      ? "- The previous answer exceeded the target. Rewrite corrected_text again under the limit while keeping the same strict JSON format."
      : retryReason === "too_short"
        ? "- The previous answer was too close to the source and did not apply the length optimizer. Expand corrected_text more substantially while using only source facts."
        : "";

  return `${SYSTEM}

Article length optimizer:
- Target word limit: ${targetWordLimit} words. corrected_text must be at or under this limit.
- If the source article is shorter than the target, expand it toward ${Math.floor(targetWordLimit * 0.85)}-${targetWordLimit} words when the source has enough factual material.
- For short inputs, do not simply translate or repeat the original. Build a complete professional newspaper article with a lead, supporting context from the supplied facts, and a clean close.
- If the source article is longer than the target, summarize it while preserving key facts and the original meaning.
- If the source article is already close to the target, improve grammar, clarity, readability, and newspaper style without unnecessary expansion.
- Do not hallucinate or add new facts, names, dates, places, quotes, statistics, allegations, or background context not present in the source.
- You may elaborate wording, transitions, attribution phrasing, and article structure, but every factual claim must be traceable to the source.
- Preserve factual details, attribution, and meaning. Staying under the word limit is mandatory.
${retryRule}`;
}

type AiArticleResult = {
  corrected_text?: unknown;
  headline?: unknown;
  summary?: unknown;
  category?: unknown;
  priority_score?: unknown;
  error?: string;
  raw?: unknown;
  [key: string]: unknown;
};

async function processArticle(
  apiKey: string,
  text: string,
  targetWordLimit: number,
  retryReason?: "too_long" | "too_short",
) {
  const sourceWordCount = countWords(text);
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: buildSystemPrompt(targetWordLimit, retryReason) },
        {
          role: "user",
          content: `Source word count: ${sourceWordCount}
Target word limit: ${targetWordLimit}
Required action: ${
            sourceWordCount < targetWordLimit * 0.8
              ? "expand the article toward the target without adding facts"
              : sourceWordCount > targetWordLimit
                ? "summarize the article under the target"
                : "polish the article and keep it under the target"
          }

SOURCE ARTICLE:
${text}`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (resp.status === 429) {
    return {
      response: new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: corsHeaders,
      }),
    };
  }
  if (resp.status === 402) {
    return {
      response: new Response(JSON.stringify({ error: "credits_exhausted" }), {
        status: 402,
        headers: corsHeaders,
      }),
    };
  }
  if (!resp.ok) {
    const body = await resp.text();
    return {
      response: new Response(JSON.stringify({ error: "ai_failed", detail: body }), {
        status: 500,
        headers: corsHeaders,
      }),
    };
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: AiArticleResult;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { error: "parse_failed", raw: content };
  }
  return { parsed };
}

function countKannadaChars(text: string) {
  return [...text].filter((char) => char >= "\u0c80" && char <= "\u0cff").length;
}

function countLatinChars(text: string) {
  return [...text].filter((char) => /[a-z]/i.test(char)).length;
}

function needsKannadaTranslation(text: string) {
  const latinCount = countLatinChars(text);
  const kannadaCount = countKannadaChars(text);
  return latinCount >= 20 && latinCount > kannadaCount * 2;
}

function hasKannadaText(text: string) {
  return countKannadaChars(text) >= 5;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authError = await requireAuthenticated(req);
    if (authError) return authError;

    const { text, targetWordLimit } = await req.json();
    if (!text) throw new Error("text required");
    const normalizedTargetWordLimit = normalizeTargetWordLimit(targetWordLimit);
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const result = await processArticle(apiKey, text, normalizedTargetWordLimit);
    if (result.response) return result.response;
    let parsed: AiArticleResult = result.parsed ?? {};

    if (countWords(String(parsed.corrected_text ?? "")) > normalizedTargetWordLimit) {
      const retryResult = await processArticle(apiKey, text, normalizedTargetWordLimit, "too_long");
      if (retryResult.response) return retryResult.response;
      parsed = retryResult.parsed ?? {};
    } else if (
      shouldRetryExpansion(text, String(parsed.corrected_text ?? ""), normalizedTargetWordLimit)
    ) {
      const retryResult = await processArticle(apiKey, text, normalizedTargetWordLimit, "too_short");
      if (retryResult.response) return retryResult.response;
      parsed = retryResult.parsed ?? {};
    }

    if (typeof parsed.priority_score === "number") {
      parsed.priority_score = Math.max(0, Math.min(100, Math.round(parsed.priority_score)));
    } else {
      parsed.priority_score = 50;
    }
    const validCats = [
      "Politics",
      "Sports",
      "Crime",
      "Agriculture",
      "Education",
      "Cinema",
      "Business",
      "Other",
    ];
    if (typeof parsed.category !== "string" || !validCats.includes(parsed.category)) {
      parsed.category = "Other";
    }
    if (needsKannadaTranslation(text) && !hasKannadaText(String(parsed.corrected_text ?? ""))) {
      return new Response(
        JSON.stringify({ error: "translation_failed", detail: "AI returned non-Kannada text" }),
        { status: 500, headers: corsHeaders },
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
