// Authenticated Kannada TTS via server-side OpenAI-compatible speech API.
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

const MAX_TEXT_LENGTH = 24000;
const FAST_TEXT_LENGTH = 1800;
const CHUNK_SIZE = 3600;
const MAX_PARALLEL_CHUNKS = 3;

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunkText(text: string) {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > CHUNK_SIZE) {
    const window = remaining.slice(0, CHUNK_SIZE);
    const breakAt = Math.max(
      window.lastIndexOf("\n\n"),
      window.lastIndexOf("।"),
      window.lastIndexOf("."),
      window.lastIndexOf("?"),
      window.lastIndexOf("!"),
      window.lastIndexOf("\n"),
      window.lastIndexOf(" "),
    );
    const index = breakAt > CHUNK_SIZE * 0.55 ? breakAt + 1 : CHUNK_SIZE;
    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  return combined;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const blockSize = 0x8000;
  for (let index = 0; index < bytes.length; index += blockSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + blockSize));
  }
  return btoa(binary);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function synthesizeChunk(apiKey: string, text: string, model: string, voice: string) {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      response_format: "mp3",
      speed: 0.98,
      instructions:
        "Speak in natural standard Kannada (kn-IN) as a professional radio and television news reader. Use accurate pronunciation, crisp consonants, calm authority, correct pauses after clauses and paragraphs, and smooth intonation. Preserve names, places, numbers, dates, and quoted material clearly.",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return {
      error: new Response(JSON.stringify({ error: "tts_failed", detail }), {
        status: response.status === 401 ? 500 : response.status,
        headers: corsHeaders,
      }),
    };
  }

  return { audio: new Uint8Array(await response.arrayBuffer()) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authError = await requireAuthenticated(req);
    if (authError) return authError;

    const body = await req.json();
    const mode = body.mode === "full" ? "full" : "fast";
    const sourceText = normalizeText(body.text);
    const text =
      mode === "fast" && sourceText.length > FAST_TEXT_LENGTH
        ? sourceText.slice(0, FAST_TEXT_LENGTH).trim()
        : sourceText;
    if (!text) {
      return new Response(JSON.stringify({ error: "text required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return new Response(
        JSON.stringify({
          error: "text_too_long",
          detail: `Maximum supported article length is ${MAX_TEXT_LENGTH} characters.`,
        }),
        { status: 400, headers: corsHeaders },
      );
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    const model = Deno.env.get("OPENAI_TTS_MODEL") || "gpt-4o-mini-tts";
    const voice = Deno.env.get("OPENAI_TTS_VOICE") || "alloy";
    const chunks = chunkText(text);
    const results = await mapWithConcurrency(chunks, MAX_PARALLEL_CHUNKS, (chunk) =>
      synthesizeChunk(apiKey, chunk, model, voice),
    );
    const failedResult = results.find((result) => result.error);
    if (failedResult?.error) return failedResult.error;

    const audio = concatBytes(results.map((result) => result.audio!));
    return new Response(
      JSON.stringify({
        audio_base64: toBase64(audio),
        mime_type: "audio/mpeg",
        file_name: `kannada-news-${new Date().toISOString().slice(0, 10)}.mp3`,
        model,
        text_length: text.length,
        chunk_count: chunks.length,
        simulated: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
