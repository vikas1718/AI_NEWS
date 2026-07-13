import { createFileRoute, Link, redirect, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, type ReactNode } from "react";
import {
  ArrowLeft,
  Download,
  Facebook,
  FileText,
  Globe2,
  Instagram,
  MessageCircle,
  Printer,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { getPrintPageCount, NewspaperPage } from "@/components/NewspaperPage";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import type { Article, Newspaper } from "@/lib/api";
import { hasAnyPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/published/$id")({
  beforeLoad: ({ context }) => {
    if (!hasAnyPermission(context.permissions, ["access_assigned_pages", "publish_articles"])) {
      throw redirect({ to: "/access-denied" });
    }
  },
  component: PublishedView,
});

type PublicationRecord = {
  id: string;
  newspaper_id: string;
  pipeline_job_id: string | null;
  website_url: string | null;
  pdf_url: string | null;
  print_pdf_url: string | null;
  print_ready_url: string | null;
  epaper_url: string | null;
  mobile_url: string | null;
  audio_url: string | null;
  social_media_kit_url: string | null;
  instagram_card_url: string | null;
  facebook_post_url: string | null;
  whatsapp_share_url: string | null;
  published_at: string;
};

function PublishedView() {
  const { id } = Route.useParams();
  const ctx = useRouteContext({ from: "/_authenticated" });
  const organizationId = ctx.organization?.id;
  const previewRef = useRef<HTMLDivElement>(null);

  const { data: newspaper } = useQuery({
    queryKey: ["published-newspaper", id, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newspapers")
        .select("*")
        .eq("id", id)
        .eq("organization_id", organizationId!)
        .single();
      if (error) throw error;
      return data as Newspaper;
    },
  });

  const { data: articles = [] } = useQuery({
    queryKey: ["published-articles", id, newspaper?.id],
    enabled: Boolean(newspaper?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from("articles").select("*").eq("newspaper_id", id);
      if (error) throw error;
      return (data ?? []) as unknown as Article[];
    },
  });

  const { data: publication } = useQuery({
    queryKey: ["publication", id, newspaper?.id],
    enabled: Boolean(newspaper?.id),
    queryFn: async () => {
      const { data, error } = await supabaseUntyped
        .from("publications")
        .select("*")
        .eq("newspaper_id", id)
        .maybeSingle();
      if (error) throw error;
      return data as PublicationRecord | null;
    },
  });

  async function downloadPdf() {
    if (!previewRef.current) return;
    toast.info("Generating PDF...");
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

  if (!newspaper) return <div>Loading...</div>;
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
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <OutputCard
          icon={Globe2}
          title="Website"
          desc={publication?.website_url ?? publication?.epaper_url ?? "Published web edition"}
          action={
            <Button size="sm" variant="outline" asChild>
              <a href={publication?.website_url ?? publication?.epaper_url ?? "#preview"}>Open</a>
            </Button>
          }
        />
        <OutputCard
          icon={FileText}
          title="PDF"
          desc={publication?.pdf_url ?? publication?.print_pdf_url ?? "Edition PDF"}
          action={
            <Button size="sm" variant="outline" onClick={downloadPdf}>
              Download
            </Button>
          }
        />
        <OutputCard
          icon={Printer}
          title="Print"
          desc={publication?.print_ready_url ?? "Print-ready layout"}
          action={
            <Button size="sm" variant="outline" onClick={downloadPdf}>
              Export
            </Button>
          }
        />
        <OutputCard
          icon={Smartphone}
          title="Mobile"
          desc={publication?.mobile_url ?? "Mobile optimized edition"}
          action={
            <Button size="sm" variant="outline" asChild>
              <a href={publication?.mobile_url ?? "#preview"}>Open</a>
            </Button>
          }
        />
        <OutputCard
          icon={Instagram}
          title="Social Media"
          desc={publication?.social_media_kit_url ?? "Instagram, Facebook, WhatsApp"}
          action={
            <a href="#social" className="text-xs text-primary hover:underline">
              Open kit
            </a>
          }
        />
      </div>

      <div id="social" className="space-y-3">
        <h2 className="text-lg font-semibold">Social Media Kit</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {topArticles.slice(0, 3).map((article, index) => {
            const Icon = [Instagram, Facebook, MessageCircle][index];
            const platform = ["Instagram", "Facebook", "WhatsApp"][index];
            return (
              <div key={article.id} className="overflow-hidden rounded-lg border">
                <div
                  id={`social-${platform.toLowerCase()}`}
                  className="bg-gradient-to-br from-primary to-primary/60 p-4 text-primary-foreground"
                  style={{ aspectRatio: "1" }}
                >
                  <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider opacity-90">
                    <Icon className="h-3 w-3" /> {platform}
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-widest opacity-80">
                    {newspaper.edition_name} - {article.category}
                  </div>
                  <h3 className="mt-2 font-kannada-serif text-2xl font-bold leading-tight">
                    {article.headline}
                  </h3>
                  {article.image_url && (
                    <img
                      src={article.image_url}
                      alt=""
                      className="mt-3 h-32 w-full rounded object-cover"
                    />
                  )}
                  <p className="mt-3 line-clamp-3 font-kannada text-sm opacity-90">
                    {article.summary}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div id="preview" className="space-y-6">
        <h2 className="text-lg font-semibold">E-Paper</h2>
        <div ref={previewRef} className="space-y-6">
          {pages.map((page) => (
            <div key={page} data-page>
              <NewspaperPage
                newspaper={newspaper}
                articles={articles}
                pageNumber={page}
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
      <div className="break-words text-xs text-muted-foreground">{desc}</div>
      <div className="mt-3">{action}</div>
    </div>
  );
}
