// Supabase Edge Functions runtime
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => null);
  const text: string | undefined = body?.text;
  const targetLanguage: string | undefined = body?.targetLanguage;
  const sourceLanguage: string | undefined = body?.sourceLanguage;

  if (!text || typeof text !== "string") {
    return new Response(JSON.stringify({ error: "Missing text" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!targetLanguage || typeof targetLanguage !== "string") {
    return new Response(JSON.stringify({ error: "Missing targetLanguage" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // TODO: Replace with your actual translation provider.
  // For now, return the input if no provider is configured.
  // This keeps the app functional but may not translate.
  const translated_text = text;

  return new Response(JSON.stringify({ translated_text, sourceLanguage, targetLanguage }), {
    headers: { "Content-Type": "application/json" },
  });
});

