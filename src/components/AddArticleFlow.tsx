import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { aiFn } from "@/lib/api";
import { WorkflowTracker } from "@/components/WorkflowTracker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  ScanLine,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  newspaperId: string;
  onCreated?: () => void;
  recommendedTargetWordLimit?: number;
}

type AttachedFile = {
  file: File;
  sourceType: "image" | "pdf" | "scan";
  previewUrl: string | null;
};

type UploadedFileInfo = {
  url: string;
  name: string;
  type: string;
};

const ARTICLE_PLACEHOLDER =
  "Write or paste article text here. You can also attach an image, PDF, or scanned document.";
const DEFAULT_TARGET_WORD_LIMIT = 500;
const MIN_TARGET_WORD_LIMIT = 80;
const MAX_TARGET_WORD_LIMIT = 1200;
const TARGET_WORD_LIMIT_PRESETS = [250, 400, 600, 800, 1000];

function normalizeTargetWordLimit(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_TARGET_WORD_LIMIT;
  return Math.min(MAX_TARGET_WORD_LIMIT, Math.max(MIN_TARGET_WORD_LIMIT, Math.round(value)));
}

function getAttachmentLabel(sourceType: AttachedFile["sourceType"]) {
  if (sourceType === "image") return "Image";
  if (sourceType === "pdf") return "PDF";
  return "Scan";
}

export function AddArticleFlow({ newspaperId, onCreated, recommendedTargetWordLimit }: Props) {
  const qc = useQueryClient();
  const [rawText, setRawText] = useState("");
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const defaultTargetWordLimit = normalizeTargetWordLimit(
    recommendedTargetWordLimit ?? DEFAULT_TARGET_WORD_LIMIT,
  );
  const [targetWordLimit, setTargetWordLimit] = useState(defaultTargetWordLimit);
  const [targetWordLimitTouched, setTargetWordLimitTouched] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const previewUrl = useMemo(() => attachedFile?.previewUrl ?? null, [attachedFile]);

  useEffect(() => {
    if (targetWordLimitTouched) return;
    setTargetWordLimit(defaultTargetWordLimit);
  }, [defaultTargetWordLimit, targetWordLimitTouched]);

  function setManualTargetWordLimit(value: number) {
    setTargetWordLimitTouched(true);
    setTargetWordLimit(value);
  }

  function attachFile(file: File, sourceType: AttachedFile["sourceType"]) {
    if (attachedFile?.previewUrl) URL.revokeObjectURL(attachedFile.previewUrl);
    setAttachedFile({
      file,
      sourceType,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    });
  }

  function removeAttachedFile() {
    if (attachedFile?.previewUrl) URL.revokeObjectURL(attachedFile.previewUrl);
    setAttachedFile(null);
  }

  async function uploadFile(file: File): Promise<UploadedFileInfo> {
    const path = `${newspaperId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("raw-uploads").upload(path, file);
    if (error) throw error;
    const { data } = await supabase.storage.from("raw-uploads").createSignedUrl(path, 3600);
    return { url: data?.signedUrl ?? path, name: file.name, type: file.type };
  }

  const runPipeline = useMutation({
    mutationFn: async () => {
      const typedText = rawText.trim();
      if (!typedText && !attachedFile) {
        throw new Error("Paste text or attach an image, PDF, or scan first");
      }

      setGenerating(true);
      const workflow: Record<string, boolean> = { uploaded: true };
      let ocrText: string | null = null;
      let textForAi = typedText;
      let inputType = typedText ? "text" : "attachment";

      if (attachedFile) {
        setUploading(true);
        const fileInfo = await uploadFile(attachedFile.file);
        setUploading(false);
        inputType = typedText ? `text+${attachedFile.sourceType}` : attachedFile.sourceType;

        const ocr = await aiFn.ocr({
          fileUrl: fileInfo.url,
          inputType: attachedFile.sourceType,
          fileName: fileInfo.name,
          mimeType: fileInfo.type,
        });
        ocrText = ocr.ocr_text;
        workflow.ocr = true;

        if (!textForAi) {
          textForAi = ocrText;
        }
      } else {
        workflow.ocr = true;
      }

      if (textForAi.trim().length < 20) {
        throw new Error("Add more article content before running the AI pipeline");
      }

      workflow.ai_processing = true;
      const ai = await aiFn.process(textForAi, {
        targetWordLimit: normalizeTargetWordLimit(targetWordLimit),
      });
      workflow.headline = true;
      workflow.category = true;
      workflow.priority = true;
      workflow.image = false;

      const { data: draft, error } = await supabase
        .from("articles")
        .insert({
          newspaper_id: newspaperId,
          raw_input_type: inputType,
          raw_text: typedText || null,
          ocr_text: ocrText,
          corrected_text: ai.corrected_text,
          headline: ai.headline,
          summary: ai.summary,
          category: ai.category,
          priority_score: ai.priority_score,
          workflow_status: { ...workflow, ready_for_layout: false },
        })
        .select()
        .single();
      if (error) throw error;

      return draft;
    },
    onSuccess: () => {
      setRawText("");
      removeAttachedFile();
      setTargetWordLimitTouched(false);
      setTargetWordLimit(defaultTargetWordLimit);
      qc.invalidateQueries({ queryKey: ["articles", newspaperId] });
      toast.success("Article added. Image step pending");
      onCreated?.();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not add article"),
    onSettled: () => {
      setUploading(false);
      setGenerating(false);
    },
  });

  const busy = uploading || generating || runPipeline.isPending;
  const normalizedTargetWordLimit = normalizeTargetWordLimit(targetWordLimit);
  const canProcess = Boolean(rawText.trim() || attachedFile) && !busy;

  return (
    <div className="rounded-lg border border-primary/20 bg-card p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-lg font-semibold">Add article</h3>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          AI article pipeline
        </div>
      </div>

      <div className="mb-4 grid gap-3 rounded-md border bg-muted/30 p-3 lg:grid-cols-[minmax(0,1fr)_auto_180px] lg:items-end">
        <div>
          <Label htmlFor="target-word-limit">Target word limit</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Default is based on the current newspaper block size and image space.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {TARGET_WORD_LIMIT_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={normalizedTargetWordLimit === preset ? "default" : "outline"}
              className="h-8 px-2 text-xs"
              onClick={() => setManualTargetWordLimit(preset)}
              disabled={busy}
            >
              {preset}
            </Button>
          ))}
        </div>
        <Input
          id="target-word-limit"
          type="number"
          min={MIN_TARGET_WORD_LIMIT}
          max={MAX_TARGET_WORD_LIMIT}
          step={10}
          value={targetWordLimit}
          onChange={(event) => setManualTargetWordLimit(Number(event.target.value))}
          onBlur={() => setManualTargetWordLimit(normalizedTargetWordLimit)}
          disabled={busy}
          className="bg-background"
        />
      </div>

      <div className="space-y-3">
        <Label>Article content</Label>
        <div className="overflow-hidden rounded-lg border bg-background">
          <Textarea
            rows={10}
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder={ARTICLE_PLACEHOLDER}
            disabled={busy}
            className="min-h-[260px] resize-y border-0 font-kannada text-base shadow-none focus-visible:ring-0"
          />

          {attachedFile && (
            <div className="border-t bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt=""
                      className="h-12 w-12 rounded border object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded border bg-background">
                      <Paperclip className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                      {getAttachmentLabel(attachedFile.sourceType)} attached
                    </div>
                    <div className="truncate text-sm text-muted-foreground">
                      {attachedFile.file.name}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={removeAttachedFile}
                  disabled={busy}
                >
                  <X className="mr-1 h-4 w-4" />
                  Remove
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t bg-muted/20 p-3">
            <AttachButton
              label="Attach image"
              icon={ImageIcon}
              accept="image/*"
              disabled={busy}
              onFile={(file) => attachFile(file, "image")}
            />
            <AttachButton
              label="Attach PDF"
              icon={FileText}
              accept="application/pdf"
              disabled={busy}
              onFile={(file) => attachFile(file, "pdf")}
            />
            <AttachButton
              label="Attach scan"
              icon={ScanLine}
              accept="image/*,application/pdf"
              disabled={busy}
              onFile={(file) => attachFile(file, "scan")}
            />
          </div>
        </div>

        <Button
          onClick={() => runPipeline.mutate()}
          disabled={!canProcess}
          className="w-full"
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {uploading ? "Uploading source..." : "Running AI pipeline..."}
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-4 w-4" />
              Run AI pipeline
            </>
          )}
        </Button>
      </div>

      <div className="mt-4">
        <WorkflowTracker
          status={{
            uploaded: busy,
            ocr: false,
            ai_processing: false,
            headline: false,
            category: false,
            priority: false,
            image: false,
            ready_for_layout: false,
          }}
        />
      </div>
    </div>
  );
}

function AttachButton({
  label,
  icon: Icon,
  accept,
  disabled,
  onFile,
}: {
  label: string;
  icon: typeof ImageIcon;
  accept: string;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <label
      className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium transition ${
        disabled
          ? "pointer-events-none opacity-50"
          : "bg-background hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
      <input
        type="file"
        className="hidden"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}
