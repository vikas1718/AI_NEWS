import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Article } from "@/lib/api";
import { aiFn } from "@/lib/api";
import { WorkflowTracker } from "@/components/WorkflowTracker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Crop,
  ImageIcon,
  LinkIcon,
  Loader2,
  Palette,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const maybeError = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    return [maybeError.message, maybeError.details, maybeError.hint, maybeError.code]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(" ");
  }
  return String(error);
}

const BACKGROUND_COLORS: Array<{ label: string; value: string | null; swatch: string }> = [
  { label: "None", value: null, swatch: "#ffffff" },
  { label: "Soft yellow", value: "#fff4bf", swatch: "#fff4bf" },
  { label: "Pale blue", value: "#dbeafe", swatch: "#dbeafe" },
  { label: "Light green", value: "#dcfce7", swatch: "#dcfce7" },
  { label: "Warm peach", value: "#ffedd5", swatch: "#ffedd5" },
  { label: "Light rose", value: "#ffe4e6", swatch: "#ffe4e6" },
  { label: "Soft grey", value: "#e5e7eb", swatch: "#e5e7eb" },
];

const BACKGROUND_COLOR_FALLBACK_KEY = "article_background_color";

function normalizeBackgroundColor(value: unknown) {
  if (typeof value === "string") {
    return BACKGROUND_COLORS.some((option) => option.value === value) ? value : "";
  }
  if (value && typeof value === "object" && "value" in value) {
    return normalizeBackgroundColor((value as { value?: unknown }).value);
  }
  return "";
}

function articleBackgroundColor(article: Article) {
  const workflowStatus = article.workflow_status as Record<string, unknown> | null | undefined;
  return (
    normalizeBackgroundColor(article.background_color) ||
    normalizeBackgroundColor(workflowStatus?.[BACKGROUND_COLOR_FALLBACK_KEY])
  );
}

function isMissingBackgroundColorColumn(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("background_color") &&
    (message.includes("column") ||
      message.includes("schema cache") ||
      message.includes("could not find"))
  );
}

const catColor: Record<string, string> = {
  Politics: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  Sports: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  Crime: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  Agriculture: "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-200",
  Education: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200",
  Cinema: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200",
  Business: "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-200",
  Other: "bg-muted text-muted-foreground",
};

export function ArticleCard({
  article,
  editable = true,
}: {
  article: Article;
  editable?: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [headline, setHeadline] = useState(article.headline ?? "");
  const [body, setBody] = useState(
    article.corrected_text ?? article.ocr_text ?? article.raw_text ?? "",
  );
  const [imageUrl, setImageUrl] = useState(article.image_url ?? "");
  const [imagePrompt, setImagePrompt] = useState("");
  const [backgroundColor, setBackgroundColor] = useState(() => articleBackgroundColor(article));
  const [genLoading, setGenLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropLoading, setCropLoading] = useState(false);
  const [cropZoom, setCropZoom] = useState(1.15);
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);

  useEffect(() => {
    if (!editing) {
      setHeadline(article.headline ?? "");
      setBody(article.corrected_text ?? article.ocr_text ?? article.raw_text ?? "");
      setImageUrl(article.image_url ?? "");
      setImagePrompt("");
      setBackgroundColor(articleBackgroundColor(article));
    }
  }, [article, editing]);

  const imageWorkflow = (hasImage = true) => ({
    ...(article.workflow_status ?? {}),
    image: hasImage,
    ready_for_layout: true,
  });
  const articleDisplayText = [
    article.headline,
    article.summary,
    article.corrected_text,
    article.ocr_text,
    article.raw_text,
  ].filter(Boolean).join("\n");
  const sourceText = article.raw_text ?? article.ocr_text ?? article.corrected_text ?? article.summary ?? article.headline ?? "";
  const showConvertToKannada = editable && needsKannadaConversion(articleDisplayText);

  const save = useMutation({
    mutationFn: async () => {
      const nextImageUrl = imageUrl.trim() || null;
      const nextBackgroundColor = normalizeBackgroundColor(backgroundColor) || null;
      const nextWorkflowStatus = {
        ...(nextImageUrl ? imageWorkflow(true) : article.workflow_status),
        [BACKGROUND_COLOR_FALLBACK_KEY]: nextBackgroundColor,
      };
      const payload = {
        headline,
        corrected_text: body,
        image_url: nextImageUrl,
        image_source: nextImageUrl ? (article.image_source ?? "manual") : null,
        background_color: nextBackgroundColor,
        workflow_status: nextWorkflowStatus,
      };
      const { error } = await supabase.from("articles").update(payload).eq("id", article.id);
      if (!error) return { usedFallback: false };

      if (!isMissingBackgroundColorColumn(error)) throw error;

      const { error: fallbackError } = await supabase
        .from("articles")
        .update({
          headline: payload.headline,
          corrected_text: payload.corrected_text,
          image_url: payload.image_url,
          image_source: payload.image_source,
          workflow_status: payload.workflow_status,
        })
        .eq("id", article.id);
      if (fallbackError) throw fallbackError;
      return { usedFallback: true };
    },
    onSuccess: ({ usedFallback }) => {
      qc.invalidateQueries({ queryKey: ["articles"] });
      setEditing(false);
      if (usedFallback) {
        toast.warning("Saved. Apply the background_color migration for permanent column storage.");
      } else {
        toast.success("Saved");
      }
    },
    onError: (e: unknown) => toast.error(errorMessage(e)),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .delete()
        .eq("id", article.id)
        .eq("newspaper_id", article.newspaper_id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw new Error("Article was not deleted. You may not have permission to remove it.");
    },
    onSuccess: () => {
      qc.setQueryData<Article[]>(
        ["articles", article.newspaper_id],
        (current) => current?.filter((item) => item.id !== article.id) ?? current,
      );
      qc.invalidateQueries({ queryKey: ["articles", article.newspaper_id] });
      toast.success("Removed");
    },
    onError: (e: unknown) => toast.error(errorMessage(e)),
  });

  const convertToKannada = useMutation({
    mutationFn: async () => {
      const source = sourceText.trim();
      if (source.length < 20) throw new Error("Article text is too short to convert");

      const ai = await aiFn.process(source);
      const { error } = await supabase.from("articles").update({
        corrected_text: ai.corrected_text,
        headline: ai.headline,
        summary: ai.summary,
        category: ai.category,
        priority_score: ai.priority_score,
        workflow_status: {
          ...(article.workflow_status ?? {}),
          ai_processing: true,
          headline: true,
          category: true,
          priority: true,
        },
      }).eq("id", article.id);
      if (error) throw error;
      return ai;
    },
    onSuccess: (ai) => {
      setHeadline(ai.headline);
      setBody(ai.corrected_text);
      qc.invalidateQueries({ queryKey: ["articles", article.newspaper_id] });
      toast.success("Converted to Kannada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function saveImageUrl(nextImageUrl: string, source: string) {
    const { error } = await supabase
      .from("articles")
      .update({
        image_url: nextImageUrl,
        image_source: source,
        workflow_status: imageWorkflow(true),
      })
      .eq("id", article.id);
    if (error) throw error;

    setImageUrl(nextImageUrl);
    qc.invalidateQueries({ queryKey: ["articles"] });
  }

  async function uploadImageBlob(blob: Blob, source: string, extension = "jpg") {
    const path = `article-images/${article.newspaper_id}/${article.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("generated-assets")
      .upload(path, blob, {
        cacheControl: "31536000",
        contentType: blob.type || "image/jpeg",
      });
    if (uploadError) throw uploadError;

    const { data, error: urlError } = await supabase.storage
      .from("generated-assets")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (urlError) throw urlError;
    const uploadedUrl = data?.signedUrl;
    if (!uploadedUrl) throw new Error("Could not create image URL");

    await saveImageUrl(uploadedUrl, source);
    return uploadedUrl;
  }

  async function genImage() {
    setGenLoading(true);
    try {
      const { image_url } = await aiFn.image({
        prompt: imagePrompt.trim() || undefined,
        headline: headline || article.headline || "Kannada news article",
        summary: article.summary,
        category: article.category,
        priority_score: article.priority_score,
        corrected_text: body,
        raw_text: article.raw_text,
      });
      await saveImageUrl(image_url, "ai_generated");
      toast.success("AI image generated");
    } catch (e: unknown) {
      toast.error(errorMessage(e));
    } finally {
      setGenLoading(false);
    }
  }

  async function uploadImage(file: File) {
    setUploadLoading(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      await uploadImageBlob(file, "uploaded", extension);
      toast.success("Image added");
    } catch (e: unknown) {
      toast.error(errorMessage(e));
    } finally {
      setUploadLoading(false);
    }
  }

  async function saveCroppedImage() {
    if (!imageUrl) return;

    setCropLoading(true);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.referrerPolicy = "no-referrer";
      const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = () =>
          reject(new Error("Could not load this image for cropping. Upload it first, then crop."));
      });
      img.src = imageUrl;
      const image = await loaded;

      const outputWidth = 1200;
      const outputHeight = 760;
      const baseScale = Math.max(
        outputWidth / image.naturalWidth,
        outputHeight / image.naturalHeight,
      );
      const scale = baseScale * cropZoom;
      const sourceWidth = outputWidth / scale;
      const sourceHeight = outputHeight / scale;
      const sourceX = Math.max(
        0,
        Math.min(
          image.naturalWidth - sourceWidth,
          (image.naturalWidth - sourceWidth) * (cropX / 100),
        ),
      );
      const sourceY = Math.max(
        0,
        Math.min(
          image.naturalHeight - sourceHeight,
          (image.naturalHeight - sourceHeight) * (cropY / 100),
        ),
      );

      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not prepare image crop");
      ctx.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputWidth,
        outputHeight,
      );

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (nextBlob) => {
            if (nextBlob) resolve(nextBlob);
            else reject(new Error("Could not save cropped image"));
          },
          "image/jpeg",
          0.9,
        );
      });

      await uploadImageBlob(blob, "cropped", "jpg");
      setCropOpen(false);
      toast.success("Photo cropped");
    } catch (e: unknown) {
      toast.error(errorMessage(e));
    } finally {
      setCropLoading(false);
    }
  }

  async function markNoImage() {
    await supabase
      .from("articles")
      .update({ workflow_status: imageWorkflow(true) })
      .eq("id", article.id);
    qc.invalidateQueries({ queryKey: ["articles"] });
  }

  function cancelEdit() {
    setHeadline(article.headline ?? "");
    setBody(article.corrected_text ?? article.ocr_text ?? article.raw_text ?? "");
    setImageUrl(article.image_url ?? "");
    setImagePrompt("");
    setBackgroundColor(articleBackgroundColor(article));
    setEditing(false);
  }

  const priority = article.priority_score ?? 0;
  const priorityBadge =
    priority >= 90
      ? "bg-red-600 text-white"
      : priority >= 70
        ? "bg-orange-500 text-white"
        : priority >= 45
          ? "bg-amber-400 text-amber-950"
          : "bg-muted text-muted-foreground";

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-start gap-4 p-4">
        <div className="w-24 shrink-0">
          {article.image_url ? (
            <img src={article.image_url} alt="" className="h-24 w-24 rounded object-cover" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded bg-muted text-muted-foreground">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            {article.category && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${catColor[article.category]}`}
              >
                {article.category}
              </span>
            )}
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${priorityBadge}`}>
              P{priority}
            </span>
            {article.image_source === "ai_generated" && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                AI IMAGE
              </span>
            )}
            {article.image_source === "uploaded" && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                UPLOADED
              </span>
            )}
          </div>
          {editing ? (
            <>
              <Input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="font-kannada text-lg font-semibold"
              />
              <Textarea
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="font-kannada text-sm"
              />
              <div className="grid gap-2 rounded-md border bg-background/60 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Article image
                </div>
                {imageUrl ? (
                  <img src={imageUrl} alt="" className="h-32 w-full rounded-md object-cover" />
                ) : (
                  <div className="flex h-24 w-full items-center justify-center rounded-md border border-dashed text-muted-foreground">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="Paste image URL"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setImageUrl(imageUrl.trim())}
                    title="Use pasted image URL"
                  >
                    <LinkIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Textarea
                  rows={3}
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Image prompt, optional. Example: show farmers inspecting damaged paddy crop after heavy rain, realistic Karnataka village photo."
                  className="text-sm"
                />
                <div className="grid gap-2 rounded-md border bg-background/60 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Palette className="h-3.5 w-3.5" />
                    Article background
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {BACKGROUND_COLORS.map((option) => {
                      const selected = (backgroundColor || null) === option.value;
                      return (
                        <button
                          key={option.label}
                          type="button"
                          aria-label={option.label}
                          title={option.label}
                          onClick={() => setBackgroundColor(option.value ?? "")}
                          className={`h-8 w-8 rounded border transition ${selected ? "ring-2 ring-primary ring-offset-2" : "hover:ring-1 hover:ring-muted-foreground"}`}
                          style={{ backgroundColor: option.swatch }}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={genImage} disabled={genLoading}>
                    {genLoading ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
                    )}
                    Generate image
                  </Button>
                  {imageUrl && (
                    <Button size="sm" variant="outline" onClick={() => setCropOpen(true)}>
                      <Crop className="mr-1 h-3.5 w-3.5" />
                      Crop photo
                    </Button>
                  )}
                  <Button size="sm" variant="outline" asChild disabled={uploadLoading}>
                    <label className="cursor-pointer">
                      {uploadLoading ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="mr-1 h-3.5 w-3.5" />
                      )}
                      Upload image
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.currentTarget.value = "";
                          if (file) void uploadImage(file);
                        }}
                      />
                    </label>
                  </Button>
                  {imageUrl && (
                    <Button size="sm" variant="ghost" onClick={() => setImageUrl("")}>
                      Remove image
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={cancelEdit}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <h4 className="font-kannada text-xl font-bold leading-snug">
                {article.headline ?? "..."}
              </h4>
              <p className="line-clamp-2 font-kannada text-sm text-muted-foreground">
                {article.summary ?? article.corrected_text ?? article.ocr_text ?? article.raw_text}
              </p>
            </>
          )}
        </div>
      </div>
      <div className="border-t bg-muted/30 px-4 py-2">
        <WorkflowTracker status={article.workflow_status} />
      </div>
      {editable && !editing && (
        <div className="flex flex-wrap gap-2 border-t px-4 py-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" variant="outline" onClick={genImage} disabled={genLoading}>
            {genLoading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : article.image_url ? (
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
            ) : (
              <Sparkles className="mr-1 h-3.5 w-3.5" />
            )}
            {article.image_url ? "Regenerate image" : "Generate AI image"}
          </Button>
          {!article.image_url && (
            <Button size="sm" variant="ghost" onClick={markNoImage}>
              No image needed
            </Button>
          )}
          <div className="ml-auto">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => del.mutate()}
              className="text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
      <Dialog open={cropOpen} onOpenChange={setCropOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crop photo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="overflow-hidden rounded-md border bg-muted">
              {imageUrl && (
                <div
                  className="aspect-[30/19] bg-cover bg-no-repeat"
                  style={{
                    backgroundImage: `url(${imageUrl})`,
                    backgroundPosition: `${cropX}% ${cropY}%`,
                    backgroundSize: `${cropZoom * 100}% auto`,
                  }}
                />
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                Zoom
                <Slider
                  min={1}
                  max={3}
                  step={0.05}
                  value={[cropZoom]}
                  onValueChange={([value]) => setCropZoom(value)}
                />
              </label>
              <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                Horizontal
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[cropX]}
                  onValueChange={([value]) => setCropX(value)}
                />
              </label>
              <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                Vertical
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[cropY]}
                  onValueChange={([value]) => setCropY(value)}
                />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCropOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveCroppedImage} disabled={cropLoading}>
              {cropLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save crop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
