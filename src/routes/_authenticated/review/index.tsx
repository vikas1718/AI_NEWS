import { createFileRoute, Link, useRouteContext, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Loader2, Printer, Rocket, Share2, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { getPrintPageCount, NewspaperPage } from "@/components/NewspaperPage";
import {
  hasSavedEditorLayout,
  savedLayoutPageNumbers,
  SavedLayoutPreviewPage,
} from "@/components/SavedLayoutPreviewPage";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Article, Newspaper } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { supabaseUntyped } from "@/lib/supabase-untyped";

export const Route = createFileRoute("/_authenticated/review/")({
  beforeLoad: ({ context }) => {
    if (!hasPermission(context.permissions, "review_articles")) {
      throw redirect({ to: "/access-denied" });
    }
  },
  component: ReviewQueue,
});

type PipelineOutputs = {
  pdf_url?: string;
  print_pdf_url?: string;
};

type SocialPostStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "scheduled"
  | "published"
  | "cancelled"
  | "failed";

type SocialPost = {
  id: string;
  organization_id: string;
  newspaper_id: string | null;
  article_ids: string[] | null;
  platform: "instagram" | "twitter" | "facebook" | "whatsapp" | "inshorts";
  status: SocialPostStatus;
  caption: string | null;
  summary: string | null;
  content: {
    customContent?: string | null;
    customImageName?: string | null;
    slides?: Array<{
      articleId?: string;
      caption?: string;
      hashtags?: string[];
    }>;
  } | null;
  scheduled_at: string | null;
  published_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  created_at: string;
  updated_at: string;
};

function socialPlatformLabel(platform: SocialPost["platform"]) {
  switch (platform) {
    case "instagram":
      return "Instagram";
    case "twitter":
      return "X (Twitter)";
    case "facebook":
      return "Facebook";
    case "whatsapp":
      return "WhatsApp Channel";
    case "inshorts":
      return "Inshorts";
    default:
      return platform;
  }
}

function socialStatusLabel(status: SocialPostStatus) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function socialPostTitle(post: SocialPost) {
  const slideCaption = post.content?.slides?.find((slide) => slide.caption?.trim())?.caption?.trim();
  const text = post.caption?.trim() || post.summary?.trim() || post.content?.customContent?.trim() || slideCaption;
  if (!text) return "Untitled social post";
  return text.split("\n").find((line) => line.trim())?.trim().slice(0, 90) || "Untitled social post";
}

function isMissingPublicationColumn(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = [candidate.code, candidate.message, candidate.details]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  return (
    text.includes("publications") &&
    (text.includes("PGRST204") ||
      text.includes("schema cache") ||
      text.includes("Could not find") ||
      text.includes("column"))
  );
}

function isPermissionDenied(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = [candidate.code, candidate.message, candidate.details]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return text.includes("42501") || text.includes("403") || text.includes("permission denied");
}

function createPdfOutputUrls(newspaper: Newspaper) {
  const assetRoot = `/generated/${newspaper.id}`;

  return {
    pdf_url: `${assetRoot}/edition.pdf`,
    print_pdf_url: `${assetRoot}/edition.pdf`,
  };
}

async function persistPublishedEdition({
  newspaper,
  outputs,
}: {
  newspaper: Newspaper;
  outputs: PipelineOutputs;
}) {
  const { error: newspaperError } = await supabase
    .from("newspapers")
    .update({ status: "published" })
    .eq("id", newspaper.id)
    .eq("organization_id", newspaper.organization_id);
  if (newspaperError) throw newspaperError;

  const { error: existingPublicationError } = await supabaseUntyped
    .from("publications")
    .delete()
    .eq("newspaper_id", newspaper.id);
  if (existingPublicationError && !isPermissionDenied(existingPublicationError)) {
    console.warn("[Publish PDF] Could not replace existing publication record", existingPublicationError);
  }

  const fullPublicationRecord = {
    newspaper_id: newspaper.id,
    pdf_url: outputs.pdf_url,
    print_pdf_url: outputs.print_pdf_url,
  };

  const { error: publicationError } = await supabaseUntyped
    .from("publications")
    .insert(fullPublicationRecord);

  if (isMissingPublicationColumn(publicationError)) {
    const { error: legacyPublicationError } = await supabaseUntyped.from("publications").insert({
      newspaper_id: newspaper.id,
      print_pdf_url: outputs.print_pdf_url,
    });
    if (legacyPublicationError && !isPermissionDenied(legacyPublicationError)) {
      console.warn("[Publish PDF] Could not save legacy publication record", legacyPublicationError);
    }
  } else if (publicationError) {
    if (!isPermissionDenied(publicationError)) {
      console.warn("[Publish PDF] Could not save publication record", publicationError);
    }
  }
}

function ReviewQueue() {
  const ctx = useRouteContext({ from: "/_authenticated" });
  const { user } = ctx;
  const organizationId = ctx.organization?.id;
  const qc = useQueryClient();
  const canPublish = hasPermission(ctx.permissions, "publish_articles");

  const { data: socialReviewQueue = [] } = useQuery({
    queryKey: ["social-review-queue", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabaseUntyped
        .from("social_posts")
        .select("*")
        .eq("organization_id", organizationId)
        .in("status", ["submitted", "under_review"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SocialPost[];
    },
  });

  const { data: approvedSocialPosts = [] } = useQuery({
    queryKey: ["approved-social-posts", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabaseUntyped
        .from("social_posts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", "approved")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SocialPost[];
    },
  });

  const { data: queue = [] } = useQuery({
    queryKey: ["review-queue", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newspapers")
        .select("*")
        .eq("organization_id", organizationId!)
        .eq("status", "pending_approval")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Newspaper[];
    },
  });

  const { data: approvedQueue = [] } = useQuery({
    queryKey: ["approved-queue", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newspapers")
        .select("*")
        .eq("organization_id", organizationId!)
        .eq("status", "approved")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Newspaper[];
    },
  });

  const { data: exportedPdfQueue = [] } = useQuery({
    queryKey: ["exported-pdf-queue", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newspapers")
        .select("*")
        .eq("organization_id", organizationId!)
        .eq("status", "published")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Newspaper[];
    },
  });

  const updateSocialPost = useMutation({
    mutationFn: async ({
      post,
      status,
    }: {
      post: SocialPost;
      status: "under_review" | "approved" | "rejected" | "published";
    }) => {
      const patch: Record<string, unknown> = {
        status,
      };
      if (status === "under_review" || status === "approved" || status === "rejected") {
        patch.reviewed_by = user.id;
        patch.reviewed_at = new Date().toISOString();
      }
      if (status === "published") {
        patch.published_at = new Date().toISOString();
      }

      const { error } = await supabaseUntyped
        .from("social_posts")
        .update(patch)
        .eq("id", post.id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["social-review-queue", organizationId] });
      qc.invalidateQueries({ queryKey: ["approved-social-posts", organizationId] });
      toast.success(`Social post ${socialStatusLabel(variables.status).toLowerCase()}`);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not update social post"),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-bold">Review Queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review submitted editions and social posts, then publish approved work when the
          organization is ready.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Social Approval Requests</h2>
          <p className="text-sm text-muted-foreground">
            Social posts submitted by editors and waiting for chief editor approval.
          </p>
        </div>
        {socialReviewQueue.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No social approval requests right now.
          </div>
        ) : (
          <div className="grid gap-3">
            {socialReviewQueue.map((post) => (
              <div key={post.id} className="space-y-3 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Share2 className="h-4 w-4 text-primary" />
                      <div className="font-serif text-lg font-semibold">{socialPostTitle(post)}</div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{socialPlatformLabel(post.platform)}</span>
                      <span>{format(new Date(post.created_at), "dd MMM yyyy, h:mm a")}</span>
                      <Badge variant="secondary">{socialStatusLabel(post.status)}</Badge>
                    </div>
                    {post.summary && (
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{post.summary}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {post.status === "submitted" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateSocialPost.mutate({ post, status: "under_review" })}
                        disabled={updateSocialPost.isPending}
                      >
                        Start Review
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => updateSocialPost.mutate({ post, status: "approved" })}
                      disabled={updateSocialPost.isPending}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateSocialPost.mutate({ post, status: "rejected" })}
                      disabled={updateSocialPost.isPending}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Approved Social Posts</h2>
          <p className="text-sm text-muted-foreground">
            Approved social posts waiting for the organization to publish.
          </p>
        </div>
        {approvedSocialPosts.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No approved social posts waiting to publish.
          </div>
        ) : (
          <div className="grid gap-3">
            {approvedSocialPosts.map((post) => (
              <div key={post.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Share2 className="h-4 w-4 text-primary" />
                    <div className="font-serif text-lg font-semibold">{socialPostTitle(post)}</div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{socialPlatformLabel(post.platform)}</span>
                    <Badge>{socialStatusLabel(post.status)}</Badge>
                  </div>
                </div>
                {canPublish && (
                  <Button
                    size="sm"
                    onClick={() => updateSocialPost.mutate({ post, status: "published" })}
                    disabled={updateSocialPost.isPending}
                  >
                    <Rocket className="mr-2 h-4 w-4" />
                    Publish Social Post
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Approval Requests</h2>
          <p className="text-sm text-muted-foreground">Submitted editions waiting for review.</p>
        </div>
        {queue.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No approval requests right now.
          </div>
        ) : (
          <div className="grid gap-3">
            {queue.map((newspaper) => (
              <Link
                key={newspaper.id}
                to="/review/$id"
                params={{ id: newspaper.id }}
                className="flex items-center justify-between rounded-lg border bg-card p-4 hover:border-primary/40"
              >
                <div>
                  <div className="font-serif text-lg font-semibold">{newspaper.edition_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {format(new Date(newspaper.edition_date), "dd MMM yyyy")} -{" "}
                    {newspaper.number_of_pages} pages
                  </div>
                </div>
                <StatusBadge status={newspaper.status} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Approved Queue</h2>
          <p className="text-sm text-muted-foreground">
            Approved editions waiting for the chief editor to export the final print PDF.
          </p>
        </div>
        {approvedQueue.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No approved editions waiting to publish.
          </div>
        ) : (
          <div className="grid gap-3">
            {approvedQueue.map((newspaper) => (
              <ApprovedEditionPdfCard
                key={newspaper.id}
                newspaper={newspaper}
                canPublish={canPublish}
                mode="publish"
                onPublished={() => {
                  qc.invalidateQueries({ queryKey: ["approved-queue", organizationId] });
                  qc.invalidateQueries({ queryKey: ["exported-pdf-queue", organizationId] });
                  qc.invalidateQueries({ queryKey: ["review-queue", organizationId] });
                  qc.invalidateQueries({ queryKey: ["newspapers", organizationId] });
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Exported PDFs</h2>
          <p className="text-sm text-muted-foreground">
            Published editions with final print PDFs ready to download.
          </p>
        </div>
        {exportedPdfQueue.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No exported PDFs yet.
          </div>
        ) : (
          <div className="grid gap-3">
            {exportedPdfQueue.map((newspaper) => (
              <ApprovedEditionPdfCard
                key={newspaper.id}
                newspaper={newspaper}
                canPublish={canPublish}
                mode="download"
                onPublished={() => undefined}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ApprovedEditionPdfCard({
  newspaper,
  canPublish,
  mode,
  onPublished,
}: {
  newspaper: Newspaper;
  canPublish: boolean;
  mode: "publish" | "download";
  onPublished: () => void;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPrintActive, setIsPrintActive] = useState(false);

  const { data: articles = [] } = useQuery({
    queryKey: ["approved-pdf-articles", newspaper.id],
    enabled: Boolean(newspaper.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("newspaper_id", newspaper.id);
      if (error) throw error;
      return (data ?? []) as unknown as Article[];
    },
  });

  const { data: latestLayout } = useQuery({
    queryKey: ["approved-pdf-layout", newspaper.id],
    enabled: Boolean(newspaper.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("layouts")
        .select("layout_json")
        .eq("newspaper_id", newspaper.id)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.layout_json ?? null;
    },
  });

  const savedPreviewPages = savedLayoutPageNumbers(latestLayout);
  const hasSavedPreview = hasSavedEditorLayout(latestLayout);
  const totalPages = hasSavedPreview
    ? savedPreviewPages.length
    : getPrintPageCount(articles, newspaper.number_of_pages);
  const pages = hasSavedPreview
    ? savedPreviewPages
    : Array.from({ length: totalPages }, (_, index) => index + 1);

  async function handlePdfAction() {
    if (!previewRef.current) {
      toast.error("PDF preview is still loading. Try again in a moment.");
      return;
    }

    setIsPublishing(true);
    const loadingToast = toast.loading(
      mode === "publish" ? "Preparing print dialog..." : "Preparing print download...",
    );

    try {
      if (mode === "publish") {
        await persistPublishedEdition({
          newspaper,
          outputs: createPdfOutputUrls(newspaper),
        });
        onPublished();
        toast.success("Edition published. Choose Save as PDF in the print dialog.", { id: loadingToast });
      } else {
        toast.success("Choose Save as PDF in the print dialog.", { id: loadingToast });
      }
      setIsPrintActive(true);
      window.setTimeout(() => {
        window.print();
        window.setTimeout(() => setIsPrintActive(false), 500);
      }, 100);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not open the print dialog.",
        { id: loadingToast },
      );
      setIsPrintActive(false);
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/review/$id"
          params={{ id: newspaper.id }}
          className="min-w-0 hover:underline"
        >
          <div className="font-serif text-lg font-semibold">{newspaper.edition_name}</div>
          <div className="text-sm text-muted-foreground">
            {format(new Date(newspaper.edition_date), "dd MMM yyyy")} - {totalPages} pages
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <StatusBadge status={newspaper.status} />
          {canPublish && (
            <Button size="sm" onClick={handlePdfAction} disabled={isPublishing || pages.length === 0}>
              {isPublishing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-2 h-4 w-4" />
              )}
              {isPublishing
                ? mode === "publish"
                  ? "Opening Print"
                  : "Opening Print"
                : mode === "publish"
                  ? "Publish & Print"
                  : "Print / Save PDF"}
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {mode === "publish"
          ? "This publishes the edition, then opens the browser print dialog for a sharper PDF."
          : "This opens the browser print dialog so you can save a sharp PDF."}
      </p>
      <div
        ref={previewRef}
        id={isPrintActive ? "print-export-root" : undefined}
        className="pdf-export-stage"
        aria-hidden="true"
      >
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
  );
}
