import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getPrintPageCount, NewspaperPage } from "@/components/NewspaperPage";
import type { Article, Newspaper } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Download,
  FileText,
  Radio,
  Instagram,
  Facebook,
  MessageCircle,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import { useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { hasAnyPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/published/$id")({
  beforeLoad: ({ context }) => {
    if (!hasAnyPermission(context.permissions, ["access_assigned_pages", "publish_articles"])) {
      throw redirect({ to: "/access-denied" });
    }
  },
  component: PublishedView,
});

function PublishedView() {
  const { id } = Route.useParams();
  const previewRef = useRef<HTMLDivElement>(null);

  const { data: newspaper } = useQuery({
    queryKey: ["newspaper", id],
    queryFn: async () =>
      (await supabase.from("newspapers").select("*").eq("id", id).single()).data as Newspaper,
  });
  const { data: articles = [] } = useQuery({
    queryKey: ["articles", id],
    queryFn: async () =>
      ((await supabase.from("articles").select("*").eq("newspaper_id", id)).data ??
        []) as unknown as Article[],
  });
  const { data: pub } = useQuery({
    queryKey: ["publication", id],
    queryFn: async () =>
      (await supabase.from("publications").select("*").eq("newspaper_id", id).maybeSingle()).data,
  });

  async function downloadPdf() {
    if (!previewRef.current) return;
    toast.info("Generating PDF…");
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
      import("jspdf"),
      import("html2canvas"),
    ]);
    const pages = previewRef.current.querySelectorAll("[data-print-page]");
    const pdf = new jsPDF({ unit: "px", format: [780, 1084] });
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i] as HTMLElement, {
        backgroundColor: "#ffffff",
        scale: 1.5,
      });
      const img = canvas.toDataURL("image/jpeg", 0.85);
      if (i > 0) pdf.addPage();
      pdf.addImage(img, "JPEG", 0, 0, 780, 1084);
    }
    pdf.save(`${newspaper?.edition_name}-${newspaper?.edition_date}.pdf`);
  }

  if (!newspaper) return <div>Loading…</div>;
  const totalPages = getPrintPageCount(articles, newspaper.number_of_pages);
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const topArticles = [...articles]
    .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
    .slice(0, 3);

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/editions"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Editions
        </Link>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">
              Published
            </div>
            <h1 className="mt-1 font-serif text-3xl font-bold">{newspaper.edition_name}</h1>
            <p className="text-sm text-muted-foreground">
              {new Date(newspaper.edition_date).toDateString()}
            </p>
          </div>
          <Button onClick={downloadPdf}>
            <Download className="mr-2 h-4 w-4" /> Download Print PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <OutputCard
          icon={FileText}
          title="Print PDF"
          desc="High-resolution PDF"
          action={
            <Button size="sm" variant="outline" onClick={downloadPdf}>
              Download
            </Button>
          }
        />
        <OutputCard
          icon={FileText}
          title="E-Paper"
          desc="Interactive web viewer"
          action={
            <Button size="sm" variant="outline" asChild>
              <a href="#preview">Open</a>
            </Button>
          }
        />
        <OutputCard
          icon={Radio}
          title="Audio Newspaper"
          desc={
            <>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                Simulated Kannada TTS
              </span>
            </>
          }
          action={
            pub?.audio_url ? (
              <audio controls className="h-8">
                <source src={pub.audio_url} />
              </audio>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )
          }
        />
        <OutputCard
          icon={Instagram}
          title="Social Media Kit"
          desc="IG · FB · WhatsApp cards"
          action={
            <a href="#social" className="text-xs text-primary hover:underline">
              Scroll ↓
            </a>
          }
        />
      </div>

      <div id="social" className="space-y-3">
        <h2 className="text-lg font-semibold">Social Media Kit</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {topArticles.slice(0, 3).map((a, i) => {
            const Icon = [Instagram, Facebook, MessageCircle][i];
            const platform = ["Instagram", "Facebook", "WhatsApp"][i];
            return (
              <div key={a.id} className="overflow-hidden rounded-lg border">
                <div
                  className="bg-gradient-to-br from-primary to-primary/60 p-4 text-primary-foreground"
                  style={{ aspectRatio: "1" }}
                >
                  <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider opacity-90">
                    <Icon className="h-3 w-3" /> {platform}
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-widest opacity-80">
                    {newspaper.edition_name} · {a.category}
                  </div>
                  <h3 className="mt-2 font-kannada-serif text-2xl font-bold leading-tight">
                    {a.headline}
                  </h3>
                  {a.image_url && (
                    <img
                      src={a.image_url}
                      alt=""
                      className="mt-3 h-32 w-full rounded object-cover"
                    />
                  )}
                  <p className="mt-3 line-clamp-3 font-kannada text-sm opacity-90">{a.summary}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div id="preview" className="space-y-6">
        <h2 className="text-lg font-semibold">E-Paper</h2>
        <div ref={previewRef} className="space-y-6">
          {pages.map((p) => (
            <div key={p} data-page>
              <NewspaperPage
                newspaper={newspaper}
                articles={articles}
                pageNumber={p}
                totalPages={totalPages}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OutputCard({
  icon: Icon,
  title,
  desc,
  action,
}: {
  icon: LucideIcon;
  title: string;
  desc: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <Icon className="h-5 w-5 text-primary" />
      <div className="mt-2 font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
      <div className="mt-3">{action}</div>
    </div>
  );
}
