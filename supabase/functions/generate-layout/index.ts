// Deterministic priority-based layout planner. No external calls.
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

interface Article {
  id: string;
  headline?: string;
  summary?: string;
  category?: string;
  priority_score?: number;
  image_url?: string | null;
}

type LayoutPosition = "top" | "middle" | "bottom";
type LayoutSize = "small" | "medium" | "big" | "large";

interface LayoutPlanItem {
  article_id: string;
  page_number: number;
  position: LayoutPosition;
  headline_size: Extract<LayoutSize, "small" | "medium" | "big">;
  image_size: Extract<LayoutSize, "medium" | "large">;
  column_count: number;
  slot_index: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authError = await requireAuthenticated(req);
    if (authError) return authError;

    const { articles, number_of_pages } = (await req.json()) as {
      articles: Article[];
      number_of_pages: number;
    };
    const sorted = [...articles].sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
    const pages = Math.max(1, number_of_pages || 4);
    const slotsPerPage = 4; // top, mid-left, mid-right, bottom
    const positions: LayoutPosition[] = ["top", "middle", "middle", "bottom"];
    const layout: LayoutPlanItem[] = [];
    sorted.forEach((art, idx) => {
      const page = Math.min(pages, Math.floor(idx / slotsPerPage) + 1);
      const slot = idx % slotsPerPage;
      const isLead = idx === 0 || slot === 0;
      layout.push({
        article_id: art.id,
        page_number: page,
        position: positions[slot],
        headline_size: isLead ? "big" : slot === 3 ? "small" : "medium",
        image_size: isLead ? "large" : "medium",
        column_count: isLead ? 3 : 2,
        slot_index: slot,
      });
    });
    return new Response(JSON.stringify({ layout, generated_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
