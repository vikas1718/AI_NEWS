import { createFileRoute } from "@tanstack/react-router";
import { Cpu, ScanLine, Languages, SpellCheck, Type, FileText, Tag, TrendingUp, Image as ImageIcon, LayoutGrid, Volume2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pipeline")({
  component: Pipeline,
});

const MODULES = [
  { icon: ScanLine, name: "OCR AI", stage: "Extract source text from image/PDF/scan uploads.", impl: "OpenAI vision OCR" },
  { icon: Languages, name: "Kannada Translation AI", stage: "Convert English or mixed input to Kannada by default.", impl: "Bundled into correction step" },
  { icon: SpellCheck, name: "Grammar AI", stage: "Fix grammar and spelling in the Kannada article.", impl: "Real (Gemini 3 Flash)" },
  { icon: Type, name: "Headline AI", stage: "Generate a punchy Kannada headline.", impl: "Real (Gemini 3 Flash)" },
  { icon: FileText, name: "Summarisation AI", stage: "1–2 sentence Kannada summary.", impl: "Real (Gemini 3 Flash)" },
  { icon: Tag, name: "Category AI", stage: "Classify: Politics, Sports, Crime, …", impl: "Real (Gemini 3 Flash)" },
  { icon: TrendingUp, name: "Priority AI", stage: "0–100 score. Higher = earlier page, bigger head.", impl: "Real (Gemini 3 Flash)" },
  { icon: ImageIcon, name: "Image AI", stage: "Generate an editorial image from headline+summary.", impl: "Real (Gemini 3.1 Flash Image)" },
  { icon: LayoutGrid, name: "Layout AI", stage: "Assign page, position, headline/image size, columns.", impl: "Deterministic priority planner" },
  { icon: Volume2, name: "TTS AI", stage: "Read the newspaper aloud in Kannada.", impl: "Simulated (Bhashini/Google TTS-ready)" },
];

function Pipeline() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-primary">AI Pipeline</div>
        <h1 className="mt-1 font-serif text-3xl font-bold">10 modules working together</h1>
        <p className="mt-1 text-sm text-muted-foreground">Each module handles a step. Real LLM where feasible; simulated where a Kannada-specific provider is needed (structured to plug in later).</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {MODULES.map((m, i) => (
          <div key={m.name} className="flex gap-3 rounded-lg border bg-card p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><m.icon className="h-5 w-5" /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <div className="font-semibold">{m.name}</div>
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">{m.stage}</div>
              <div className="mt-2 inline-block rounded bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">{m.impl}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
