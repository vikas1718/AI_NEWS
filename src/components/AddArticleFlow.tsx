import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { aiFn, type Article } from "@/lib/api";
import { WorkflowTracker } from "@/components/WorkflowTracker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Upload, ImageIcon, FileText, ScanLine, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  newspaperId: string;
  onCreated?: () => void;
}

type UploadedFileInfo = {
  url: string;
  name: string;
  type: string;
};

const ARTICLE_PLACEHOLDER = "Paste English or Kannada article text. Run AI pipeline will convert it to Kannada by default.";

export function AddArticleFlow({ newspaperId, onCreated }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"text" | "image" | "pdf" | "scan">("text");
  const [rawText, setRawText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function uploadFile(file: File): Promise<UploadedFileInfo> {
    const path = `${newspaperId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from("raw-uploads").upload(path, file);
    if (error) throw error;
    const { data } = await supabase.storage.from("raw-uploads").createSignedUrl(path, 3600);
    return { url: data?.signedUrl ?? path, name: file.name, type: file.type };
  }

  const runPipeline = useMutation({
    mutationFn: async (fileInfo?: UploadedFileInfo) => {
      setGenerating(true);
      const workflow: Record<string, boolean> = { uploaded: true };

      let text = rawText;
      let inputType = tab;

      // OCR step
      if (tab !== "text") {
        const ocr = await aiFn.ocr({
          fileUrl: fileInfo?.url,
          inputType,
          fileName: fileInfo?.name,
          mimeType: fileInfo?.type,
        });
        text = ocr.ocr_text;
        workflow.ocr = true;
        toast.info("OCR complete. Converting to Kannada...");
      } else {
        workflow.ocr = true;
      }

      // Kannada conversion + article processing
      workflow.ai_processing = true;
      const ai = await aiFn.process(text);
      workflow.headline = true; workflow.category = true; workflow.priority = true; workflow.image = false;

      // Insert article only after the Kannada conversion succeeds.
      const { data: draft, error: e1 } = await supabase.from("articles").insert({
        newspaper_id: newspaperId,
        raw_input_type: inputType,
        raw_text: tab === "text" ? text : null,
        ocr_text: tab !== "text" ? text : null,
        corrected_text: ai.corrected_text,
        headline: ai.headline,
        summary: ai.summary,
        category: ai.category,
        priority_score: ai.priority_score,
        workflow_status: { ...workflow, ready_for_layout: false },
      }).select().single();
      if (e1) throw e1;

      return draft;
    },
    onSuccess: () => {
      setRawText("");
      setGenerating(false);
      qc.invalidateQueries({ queryKey: ["articles", newspaperId] });
      toast.success("Article added in Kannada. Image step pending");
      onCreated?.();
    },
    onError: (e: any) => { setGenerating(false); toast.error(e.message); },
  });

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fileInfo = await uploadFile(file);
      await runPipeline.mutateAsync(fileInfo);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setUploading(false); }
  }

  const busy = uploading || generating || runPipeline.isPending;

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Add article</h3>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="text"><FileText className="mr-1 h-3.5 w-3.5" />Text</TabsTrigger>
          <TabsTrigger value="image"><ImageIcon className="mr-1 h-3.5 w-3.5" />Image</TabsTrigger>
          <TabsTrigger value="pdf"><FileText className="mr-1 h-3.5 w-3.5" />PDF</TabsTrigger>
          <TabsTrigger value="scan"><ScanLine className="mr-1 h-3.5 w-3.5" />Scan</TabsTrigger>
        </TabsList>
        <TabsContent value="text" className="mt-4 space-y-3">
          <Label>Article text</Label>
          <Textarea rows={7} value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder={ARTICLE_PLACEHOLDER} className="font-kannada text-base" />
          <Button onClick={() => runPipeline.mutate(undefined)} disabled={busy || rawText.trim().length < 20} className="w-full">
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Converting to Kannada...</> : <><Wand2 className="mr-2 h-4 w-4" /> Run AI pipeline</>}
          </Button>
        </TabsContent>
        {(["image", "pdf", "scan"] as const).map((t) => (
          <TabsContent key={t} value={t} className="mt-4 space-y-3">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center hover:bg-accent/30">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <div className="text-sm font-medium">Click to upload {t}</div>
              <div className="text-xs text-muted-foreground">OCR runs first, then Kannada conversion</div>
              <input type="file" className="hidden" accept={t === "image" ? "image/*" : t === "pdf" ? "application/pdf" : "image/*,application/pdf"} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
            {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Uploaded, OCR, Kannada conversion...</div>}
          </TabsContent>
        ))}
      </Tabs>
      <div className="mt-4">
        <WorkflowTracker status={{ uploaded: busy, ocr: false, ai_processing: false, headline: false, category: false, priority: false, image: false, ready_for_layout: false }} />
      </div>
    </div>
  );
}
