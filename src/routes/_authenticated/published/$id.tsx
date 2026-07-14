import { createFileRoute, Link, redirect, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  Loader2,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { getPrintPageCount, NewspaperPage } from "@/components/NewspaperPage";
import {
  hasSavedEditorLayout,
  savedLayoutPageNumbers,
  SavedLayoutPreviewPage,
} from "@/components/SavedLayoutPreviewPage";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Article, Newspaper } from "@/lib/api";
import { prepareHtml2CanvasPdfClone } from "@/lib/pdf-export";
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
  const ctx = useRouteContext({ from: "/_authenticated" });
  const organizationId = ctx.organization?.id;
  const previewRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

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

  const { data: latestLayout } = useQuery({
    queryKey: ["published-saved-layout", id, newspaper?.id],
    enabled: Boolean(newspaper?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("layouts")
        .select("layout_json")
        .eq("newspaper_id", id)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.layout_json ?? null;
    },
  });

  function printWithBrowserPdf() {
    if (!previewRef.current) {
      toast.error("Preview is still loading. Try again in a moment.");
      return;
    }

    toast.info("Print dialog opened. Choose Save as PDF to export.");
    window.print();
  }

  async function waitForPreviewImages() {
    if (!previewRef.current) return;
    const images = Array.from(previewRef.current.querySelectorAll("img"));
    await Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          }),
      ),
    );
  }

  function pdfFileName() {
    const base = `${newspaper?.edition_name ?? "newspaper"}-${newspaper?.edition_date ?? "edition"}`;
    return `${base.replace(/[\\/:*?"<>|]+/g, "-")}.pdf`;
  }

  async function downloadPdf() {
    if (!previewRef.current) {
      toast.error("Preview is still loading. Try again in a moment.");
      return;
    }

    setIsExportingPdf(true);
    const loadingToast = toast.loading("Preparing print-ready PDF...");

    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      document.documentElement.classList.add("pdf-export-mode");
      try {
        await waitForPreviewImages();
        const pages = previewRef.current.querySelectorAll("[data-print-page]");
        if (pages.length === 0) {
          throw new Error("No newspaper preview pages were found.");
        }

        const pdf = new jsPDF({ unit: "px", format: [780, 1084] });
        for (let i = 0; i < pages.length; i++) {
          toast.loading(`Exporting page ${i + 1} of ${pages.length}...`, { id: loadingToast });
          const canvas = await html2canvas(pages[i] as HTMLElement, {
            backgroundColor: "#ffffff",
            scale: 2,
            useCORS: true,
            allowTaint: false,
            logging: false,
            onclone: (clonedDocument) => {
              prepareHtml2CanvasPdfClone(clonedDocument, pages[i] as HTMLElement, i);
            },
          });
          const img = canvas.toDataURL("image/png");
          if (i > 0) pdf.addPage([780, 1084]);
          pdf.addImage(img, "PNG", 0, 0, 780, 1084);
        }
        pdf.save(pdfFileName());
      } finally {
        document.documentElement.classList.remove("pdf-export-mode");
      }
      toast.success("Print-ready PDF downloaded.", { id: loadingToast });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `PDF download failed: ${error.message}. Opening print dialog instead.`
          : "PDF download failed. Opening print dialog instead.",
        { id: loadingToast },
      );
      window.setTimeout(() => window.print(), 300);
    } finally {
      setIsExportingPdf(false);
    }
  }

  if (!newspaper) return <div>Loading...</div>;
  const hasSavedPreview = hasSavedEditorLayout(latestLayout);
  const savedPreviewPages = savedLayoutPageNumbers(latestLayout);
  const totalPages = hasSavedPreview
    ? savedPreviewPages.length
    : getPrintPageCount(articles, newspaper.number_of_pages);
  const pages = hasSavedPreview
    ? savedPreviewPages
    : Array.from({ length: totalPages }, (_, i) => i + 1);
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
          <div className="flex flex-wrap gap-2">
            <Button onClick={downloadPdf} disabled={isExportingPdf || pages.length === 0}>
              {isExportingPdf ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isExportingPdf ? "Exporting PDF..." : "Download PDF"}
            </Button>
            <Button variant="outline" onClick={printWithBrowserPdf}>
              <Printer className="mr-2 h-4 w-4" />
              Print / Save as PDF
            </Button>
          </div>
        </div>
      </div>

      <div id="preview" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Print Preview</h2>
            <p className="text-sm text-muted-foreground">
              This is the exact layout used for PDF export and browser printing.
            </p>
          </div>
          <Button variant="outline" onClick={printWithBrowserPdf}>
            <Printer className="mr-2 h-4 w-4" />
            Print / Save as PDF
          </Button>
        </div>
        <div id="print-export-root" ref={previewRef} className="space-y-6">
          {pages.map((page) => (
            <div key={page} data-page>
              {hasSavedPreview ? (
                <SavedLayoutPreviewPage
                  newspaper={newspaper}
                  articles={articles}
                  layoutJson={latestLayout}
                  pageNumber={page}
                  totalPages={totalPages}
                />
              ) : (
                <NewspaperPage
                  newspaper={newspaper}
                  articles={articles}
                  pageNumber={page}
                  totalPages={totalPages}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
