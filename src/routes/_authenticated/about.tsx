import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, UserRound, Sparkles, FileCheck2, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/about")({
  component: About,
});

function About() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-bold">The AI News Studio workflow</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          AI handles 80–90% of the editorial workflow (OCR, correction, headline/summary generation,
          categorisation, prioritisation, image generation and layout). The Editor and Chief Editor
          keep full creative and publishing control.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {[
          { icon: UserRound, title: "Editor", desc: "Uploads raw text / image / PDF / scan." },
          {
            icon: Sparkles,
            title: "AI Pipeline",
            desc: "OCR → correction → headline → summary → category → priority → image → layout.",
          },
          { icon: UserRound, title: "Editor", desc: "Reviews cards, tweaks layout, adds ads." },
          {
            icon: FileCheck2,
            title: "Chief Editor",
            desc: "Approve, reject with comment, or comment.",
          },
          { icon: Send, title: "Publish", desc: "Print PDF, e-paper, audio, social kit." },
        ].map((s, i, arr) => (
          <div
            key={s.title}
            className="flex flex-col items-center rounded-lg border bg-card p-4 text-center"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <s.icon className="h-5 w-5" />
            </div>
            <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Step {i + 1}
            </div>
            <div className="mt-1 font-semibold">{s.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.desc}</div>
            {i < arr.length - 1 && (
              <ArrowRight className="mt-3 hidden h-4 w-4 text-muted-foreground md:block" />
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-accent/30 p-6">
        <h2 className="font-serif text-xl font-bold">Roles</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm font-semibold">Editor</div>
            <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
              <li>Creates newspaper editions</li>
              <li>Adds articles (text / OCR image / PDF / scan)</li>
              <li>Runs the AI pipeline</li>
              <li>Tweaks layout, sends to Chief Editor</li>
            </ul>
          </div>
          <div>
            <div className="text-sm font-semibold">Chief Editor</div>
            <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
              <li>Sees the review queue of submitted editions</li>
              <li>Approves, rejects with comment, or leaves comments</li>
              <li>Approval triggers PDF / e-paper / audio / social publish</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
