import { createFileRoute, Link, useRouteContext, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Clock3, Loader2, Rocket, Share2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { aiFn, type Article, type Newspaper } from "@/lib/api";
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

type PipelineStageKey = "website" | "pdf" | "print" | "mobile" | "social";
type PipelineStageStatus = "queued" | "running" | "completed" | "failed";

type PipelineStage = {
  key: PipelineStageKey;
  label: string;
  status: PipelineStageStatus;
};

type PublicationJob = {
  id: string;
  newspaper_id: string;
  status: "queued" | "running" | "completed" | "failed";
  current_stage: PipelineStageKey | null;
  stages: PipelineStage[];
  output_urls: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
};

type PipelineOutputs = {
  website_url?: string;
  epaper_url?: string;
  pdf_url?: string;
  print_pdf_url?: string;
  print_ready_url?: string;
  mobile_url?: string;
  social_media_kit_url?: string;
  instagram_card_url?: string;
  facebook_post_url?: string;
  whatsapp_share_url?: string;
  audio_url?: string;
  social_slides?: unknown;
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

const pipelineStageDefinitions: Array<Omit<PipelineStage, "status">> = [
  { key: "website", label: "Website" },
  { key: "pdf", label: "PDF" },
  { key: "print", label: "Print" },
  { key: "mobile", label: "Mobile" },
  { key: "social", label: "Social Media" },
];

function createQueuedStages(): PipelineStage[] {
  return pipelineStageDefinitions.map((stage) => ({ ...stage, status: "queued" }));
}

function setStageStatus(
  stages: PipelineStage[],
  stageKey: PipelineStageKey,
  status: PipelineStageStatus,
) {
  return stages.map((stage) => (stage.key === stageKey ? { ...stage, status } : stage));
}

function getLatestJobForNewspaper(jobs: PublicationJob[], newspaperId: string) {
  return jobs.find((job) => job.newspaper_id === newspaperId) ?? null;
}

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

function createPipelineOutputUrls(newspaper: Newspaper) {
  const editionRoot = `/published/${newspaper.id}`;
  const assetRoot = `/generated/${newspaper.id}`;

  return {
    website_url: editionRoot,
    epaper_url: editionRoot,
    pdf_url: `${assetRoot}/edition.pdf`,
    print_pdf_url: `${assetRoot}/edition.pdf`,
    print_ready_url: `${assetRoot}/print-ready.pdf`,
    mobile_url: `${editionRoot}?surface=mobile`,
    social_media_kit_url: `${editionRoot}#social`,
    instagram_card_url: `${editionRoot}#social-instagram`,
    facebook_post_url: `${editionRoot}#social-facebook`,
    whatsapp_share_url: `${editionRoot}#social-whatsapp`,
  };
}

async function shortPipelinePause() {
  await new Promise((resolve) => setTimeout(resolve, 300));
}

export async function runPublicationPipeline({
  newspaper,
  articles,
  userId,
}: {
  newspaper: Newspaper;
  articles: Article[];
  userId: string;
}) {
  const initialStages = createQueuedStages();
  const outputUrls = createPipelineOutputUrls(newspaper);

  const { data: job, error: jobError } = await supabaseUntyped
    .from("publication_jobs")
    .insert({
      newspaper_id: newspaper.id,
      created_by: userId,
      status: "running",
      current_stage: "website",
      stages: initialStages,
      output_urls: {},
      started_at: new Date().toISOString(),
    })
    .select("id,newspaper_id,status,current_stage,stages,output_urls,error_message,created_at")
    .single();
  if (jobError) throw jobError;

  let stages = initialStages;
  let outputs: PipelineOutputs = {};

  async function updateJob(patch: Record<string, unknown>) {
    const { error } = await supabaseUntyped.from("publication_jobs").update(patch).eq("id", job.id);
    if (error) throw error;
  }

  async function runStage(
    stageKey: PipelineStageKey,
    generator: () => Promise<Partial<PipelineOutputs>> | Partial<PipelineOutputs>,
  ) {
    stages = setStageStatus(stages, stageKey, "running");
    await updateJob({
      current_stage: stageKey,
      stages,
      status: "running",
      output_urls: outputs,
    });

    await shortPipelinePause();
    const stageOutputs = await generator();
    outputs = { ...outputs, ...stageOutputs };
    stages = setStageStatus(stages, stageKey, "completed");
    await updateJob({
      current_stage: stageKey,
      stages,
      output_urls: outputs,
    });
  }

  try {
    await runStage("website", () => ({
      website_url: outputUrls.website_url,
      epaper_url: outputUrls.epaper_url,
    }));

    await runStage("pdf", () => ({
      pdf_url: outputUrls.pdf_url,
      print_pdf_url: outputUrls.print_pdf_url,
    }));

    await runStage("print", () => ({
      print_ready_url: outputUrls.print_ready_url,
    }));

    await runStage("mobile", async () => {
      const headlines = articles.map((article) => `${article.headline}. ${article.summary ?? ""}`).join(" ");
      const tts = await aiFn.tts(headlines).catch(() => ({ audio_url: "" }));
      return {
        mobile_url: outputUrls.mobile_url,
        audio_url: tts.audio_url,
      };
    });

    await runStage("social", async () => {
      const social = await aiFn.instagram(articles).catch(() => ({ slides: [] }));
      return {
        social_media_kit_url: outputUrls.social_media_kit_url,
        instagram_card_url: outputUrls.instagram_card_url,
        facebook_post_url: outputUrls.facebook_post_url,
        whatsapp_share_url: outputUrls.whatsapp_share_url,
        social_slides: social.slides,
      };
    });

    const { error: existingPublicationError } = await supabaseUntyped
      .from("publications")
      .delete()
      .eq("newspaper_id", newspaper.id);
    if (existingPublicationError) throw existingPublicationError;

    const { error: publicationError } = await supabaseUntyped.from("publications").insert({
      newspaper_id: newspaper.id,
      pipeline_job_id: job.id,
      website_url: outputs.website_url,
      epaper_url: outputs.epaper_url,
      pdf_url: outputs.pdf_url,
      print_pdf_url: outputs.print_pdf_url,
      print_ready_url: outputs.print_ready_url,
      mobile_url: outputs.mobile_url,
      audio_url: outputs.audio_url,
      social_media_kit_url: outputs.social_media_kit_url,
      instagram_card_url: outputs.instagram_card_url,
      facebook_post_url: outputs.facebook_post_url,
      whatsapp_share_url: outputs.whatsapp_share_url,
    });
    if (publicationError) throw publicationError;

    const { error: newspaperError } = await supabase
      .from("newspapers")
      .update({ status: "published" })
      .eq("id", newspaper.id)
      .eq("organization_id", newspaper.organization_id);
    if (newspaperError) throw newspaperError;

    await updateJob({
      status: "completed",
      current_stage: "social",
      stages,
      output_urls: outputs,
      completed_at: new Date().toISOString(),
      error_message: null,
    });

    return { jobId: job.id, outputs };
  } catch (error) {
    if (job?.id) {
      const currentStage = stages.find((stage) => stage.status === "running")?.key ?? "website";
      stages = setStageStatus(stages, currentStage, "failed");
      await supabaseUntyped
        .from("publication_jobs")
        .update({
          status: "failed",
          current_stage: currentStage,
          stages,
          output_urls: outputs,
          error_message: error instanceof Error ? error.message : "Publication pipeline failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
    throw error;
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

  const approvedNewspaperIds = approvedQueue.map((newspaper) => newspaper.id);
  const { data: publicationJobs = [] } = useQuery({
    queryKey: ["publication-jobs", organizationId, approvedNewspaperIds.join(",")],
    enabled: Boolean(organizationId) && approvedNewspaperIds.length > 0,
    refetchInterval: 2000,
    queryFn: async () => {
      const { data, error } = await supabaseUntyped
        .from("publication_jobs")
        .select("id,newspaper_id,status,current_stage,stages,output_urls,error_message,created_at")
        .in("newspaper_id", approvedNewspaperIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PublicationJob[];
    },
  });

  const publish = useMutation({
    mutationFn: async (newspaper: Newspaper) => {
      const { data: articles, error: articlesError } = await supabase
        .from("articles")
        .select("*")
        .eq("newspaper_id", newspaper.id);
      if (articlesError) throw articlesError;

      await runPublicationPipeline({
        newspaper,
        articles: (articles ?? []) as unknown as Article[],
        userId: user.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approved-queue", organizationId] });
      qc.invalidateQueries({ queryKey: ["review-queue", organizationId] });
      qc.invalidateQueries({ queryKey: ["publication-jobs", organizationId] });
      qc.invalidateQueries({ queryKey: ["newspapers", organizationId] });
      toast.success("Publication pipeline completed");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not publish edition"),
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
            Approved editions waiting for Website, PDF, Print, Mobile, and Social Media generation.
          </p>
        </div>
        {approvedQueue.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No approved editions waiting to publish.
          </div>
        ) : (
          <div className="grid gap-3">
            {approvedQueue.map((newspaper) => {
              const job = getLatestJobForNewspaper(publicationJobs, newspaper.id);
              const isPublishing = publish.isPending && publish.variables?.id === newspaper.id;
              const isJobRunning = job?.status === "running" || job?.status === "queued";

              return (
                <div
                  key={newspaper.id}
                  className="space-y-3 rounded-lg border bg-card p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link
                      to="/review/$id"
                      params={{ id: newspaper.id }}
                      className="min-w-0 hover:underline"
                    >
                      <div className="font-serif text-lg font-semibold">
                        {newspaper.edition_name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(newspaper.edition_date), "dd MMM yyyy")} -{" "}
                        {newspaper.number_of_pages} pages
                      </div>
                    </Link>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={newspaper.status} />
                      {canPublish && (
                        <Button
                          size="sm"
                          onClick={() => publish.mutate(newspaper)}
                          disabled={isPublishing || isJobRunning}
                        >
                          {isPublishing || isJobRunning ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Rocket className="mr-2 h-4 w-4" />
                          )}
                          {isPublishing || isJobRunning ? "Publishing" : "Publish"}
                        </Button>
                      )}
                    </div>
                  </div>
                  <PipelineProgress job={job} />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function PipelineProgress({ job }: { job: PublicationJob | null }) {
  const stages = job?.stages?.length ? job.stages : createQueuedStages();

  return (
    <div className="grid gap-2 md:grid-cols-5">
      {stages.map((stage) => (
        <div key={stage.key} className="rounded-md border bg-background/70 p-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <StageIcon status={stage.status} />
            {stage.label}
          </div>
          <div className="mt-1 text-[11px] capitalize text-muted-foreground">{stage.status}</div>
        </div>
      ))}
      {job?.status === "failed" && job.error_message && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive md:col-span-5">
          {job.error_message}
        </div>
      )}
    </div>
  );
}

function StageIcon({ status }: { status: PipelineStageStatus }) {
  if (status === "completed") return <Check className="h-3.5 w-3.5 text-emerald-600" />;
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  return <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />;
}
