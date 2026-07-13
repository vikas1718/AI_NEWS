import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity,
  Clock3,
  Download,
  Loader2,
  Mic2,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Square,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { aiFn, type Article, type KannadaTtsResult, type Newspaper } from "@/lib/api";

const ACTIVE_EDITION_KEY = "ai-news-active-edition-id";
const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
const FAST_SCRIPT_LIMIT = 1400;

type AudioState = "idle" | "generating" | "loading" | "ready" | "error";
type GenerationMode = "fast" | "full";

function articleCopy(article?: Article | null) {
  if (!article) return "";
  return [
    article.headline,
    article.corrected_text,
    article.ocr_text,
    article.raw_text,
    article.summary,
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n\n");
}

function fastArticleCopy(article?: Article | null) {
  if (!article) return "";
  const body = [article.corrected_text, article.ocr_text, article.raw_text]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n\n");
  return [article.headline, article.summary, body.slice(0, FAST_SCRIPT_LIMIT)]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n\n")
    .trim();
}

function audioUrlFromResult(result: KannadaTtsResult) {
  if (result.audio_url?.trim()) return result.audio_url.trim();

  const base64Audio = result.audio_base64
    ?.replace(/^data:audio\/[^;]+;base64,/i, "")
    .replace(/\s/g, "");

  if (!base64Audio) {
    throw new Error(
      "The TTS service did not return audio data. Redeploy the tts-kannada Edge Function and confirm OPENAI_API_KEY is set.",
    );
  }

  const byteCharacters = atob(base64Audio);
  const bytes = new Uint8Array(byteCharacters.length);
  for (let index = 0; index < byteCharacters.length; index += 1) {
    bytes[index] = byteCharacters.charCodeAt(index);
  }
  const mimeType = result.mime_type || "audio/mpeg";
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function statusLabel(audioState: AudioState) {
  if (audioState === "generating") return "Generating";
  if (audioState === "loading") return "Loading audio";
  if (audioState === "ready") return "Ready";
  if (audioState === "error") return "Error";
  return "Waiting";
}

function estimatedReadTime(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 150));
}

export function KannadaTtsModule() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const readyToastUrlRef = useRef("");
  const [selectedEditionId, setSelectedEditionId] = useState("");
  const [selectedArticleId, setSelectedArticleId] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioResult, setAudioResult] = useState<KannadaTtsResult | null>(null);
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(90);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("fast");

  const { data: editions = [], isLoading: editionsLoading } = useQuery({
    queryKey: ["tts-editions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newspapers")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Newspaper[];
    },
  });

  useEffect(() => {
    if (selectedEditionId || editions.length === 0) return;
    const activeId = window.localStorage.getItem(ACTIVE_EDITION_KEY);
    const edition = editions.find((item) => item.id === activeId) ?? editions[0];
    setSelectedEditionId(edition.id);
  }, [editions, selectedEditionId]);

  const { data: articles = [], isFetching: articlesLoading } = useQuery({
    queryKey: ["tts-articles", selectedEditionId],
    enabled: Boolean(selectedEditionId),
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("newspaper_id", selectedEditionId)
        .order("priority_score", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Article[];
    },
  });

  const selectedArticle =
    articles.find((article) => article.id === selectedArticleId) ?? articles[0] ?? null;
  const selectedText = useMemo(() => articleCopy(selectedArticle), [selectedArticle]);
  const generationText = useMemo(
    () => (generationMode === "fast" ? fastArticleCopy(selectedArticle) : selectedText),
    [generationMode, selectedArticle, selectedText],
  );
  const contentSignature = useMemo(
    () =>
      [
        selectedArticle?.id ?? "",
        selectedArticle?.updated_at ?? "",
        generationMode,
        generationText.length,
        generationText,
      ].join("|"),
    [generationMode, generationText, selectedArticle],
  );

  useEffect(() => {
    if (!selectedArticleId && articles[0]) {
      setSelectedArticleId(articles[0].id);
    }
    if (
      selectedArticleId &&
      articles.length > 0 &&
      !articles.some((article) => article.id === selectedArticleId)
    ) {
      setSelectedArticleId(articles[0].id);
    }
  }, [articles, selectedArticleId]);

  const ttsMutation = useMutation({
    mutationFn: ({ text, mode }: { text: string; mode: GenerationMode }) =>
      aiFn.tts(text, { mode }),
    onMutate: () => {
      setAudioState("generating");
      setGenerationProgress(8);
    },
    onSuccess: (result) => {
      try {
        const nextAudioUrl = audioUrlFromResult(result);
        setAudioResult(result);
        setAudioState("loading");
        setGenerationProgress(96);
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
        setAudioUrl((previousUrl) => {
          if (previousUrl && previousUrl.startsWith("blob:")) URL.revokeObjectURL(previousUrl);
          return nextAudioUrl;
        });
      } catch (error) {
        setAudioResult(null);
        setAudioState("error");
        setGenerationProgress(0);
        setAudioUrl((previousUrl) => {
          if (previousUrl && previousUrl.startsWith("blob:")) URL.revokeObjectURL(previousUrl);
          return "";
        });
        toast.error(error instanceof Error ? error.message : "Could not load generated audio");
      }
    },
    onError: (error: unknown) => {
      setAudioState("error");
      setGenerationProgress(0);
      toast.error(error instanceof Error ? error.message : "Could not generate audio");
    },
  });
  const generateAudio = ttsMutation.mutate;

  useEffect(() => {
    if (!generationText.trim()) {
      setAudioState("idle");
      setGenerationProgress(0);
      return;
    }
    const text = generationText;
    const mode = generationMode;
    setGenerationProgress(0);
    const timeout = window.setTimeout(() => generateAudio({ text, mode }), 350);
    return () => window.clearTimeout(timeout);
  }, [contentSignature, generateAudio, generationMode, generationText]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume / 100;
  }, [volume, audioUrl]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.playbackRate = speed;
  }, [speed, audioUrl]);

  useEffect(() => {
    if (audioState !== "generating") return;
    const interval = window.setInterval(() => {
      setGenerationProgress((value) =>
        Math.min(92, value + Math.max(1, Math.round((92 - value) * 0.12))),
      );
    }, 450);
    return () => window.clearInterval(interval);
  }, [audioState]);

  useEffect(
    () => () => {
      if (audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );

  async function play() {
    if (!audioRef.current || !audioUrl) return;
    try {
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (error) {
      setIsPlaying(false);
      setAudioState("error");
      toast.error(
        error instanceof Error ? error.message : "This browser could not play the generated audio.",
      );
    }
  }

  function pause() {
    audioRef.current?.pause();
    setIsPlaying(false);
  }

  function stop() {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  }

  async function replay() {
    if (!audioRef.current || !audioUrl) return;
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
    await play();
  }

  const ready = audioState === "ready" && Boolean(audioUrl);
  const selectedEdition = editions.find((edition) => edition.id === selectedEditionId);
  const currentStatusLabel = statusLabel(audioState);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="grid gap-5 border-b bg-primary/5 p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-primary">
              <Radio className="h-4 w-4" />
              Kannada voice studio
            </div>
            <h1 className="mt-2 font-serif text-4xl font-bold">Text-to-Speech</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Fast Kannada news-reader audio with automatic article sync, playback controls, and
              downloadable output.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border bg-background px-3 py-2">
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                Status
              </div>
              <div className="mt-1 text-sm font-semibold">{currentStatusLabel}</div>
            </div>
            <div className="rounded-md border bg-background px-3 py-2">
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <Mic2 className="h-3.5 w-3.5" />
                Segments
              </div>
              <div className="mt-1 text-sm font-semibold">{audioResult?.chunk_count ?? "-"}</div>
            </div>
            <div className="rounded-md border bg-background px-3 py-2">
              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" />
                Read
              </div>
              <div className="mt-1 text-sm font-semibold">
                {estimatedReadTime(generationText)} min
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-4 rounded-lg border bg-card p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Edition</label>
              <Select
                value={selectedEditionId}
                onValueChange={(value) => {
                  window.localStorage.setItem(ACTIVE_EDITION_KEY, value);
                  setSelectedEditionId(value);
                  setSelectedArticleId("");
                }}
                disabled={editionsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select edition" />
                </SelectTrigger>
                <SelectContent>
                  {editions.map((edition) => (
                    <SelectItem key={edition.id} value={edition.id}>
                      {edition.edition_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Article</label>
              <Select
                value={selectedArticle?.id ?? ""}
                onValueChange={setSelectedArticleId}
                disabled={articlesLoading || articles.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select article" />
                </SelectTrigger>
                <SelectContent>
                  {articles.map((article, index) => (
                    <SelectItem key={article.id} value={article.id}>
                      {article.headline || `Article ${index + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-serif text-2xl font-bold">
                  {selectedArticle?.headline || "No article selected"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {selectedEdition?.edition_name ?? "No edition"} ·{" "}
                  {generationText.length.toLocaleString()} TTS characters
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={generationMode === "fast" ? "default" : "outline"}
                  onClick={() => setGenerationMode("fast")}
                  disabled={ttsMutation.isPending}
                >
                  Fast script
                </Button>
                <Button
                  type="button"
                  variant={generationMode === "full" ? "default" : "outline"}
                  onClick={() => setGenerationMode("full")}
                  disabled={ttsMutation.isPending}
                >
                  Full article
                </Button>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  generationText &&
                  ttsMutation.mutate({ text: generationText, mode: generationMode })
                }
                disabled={!generationText || ttsMutation.isPending}
              >
                {ttsMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                Regenerate
              </Button>
            </div>
            <div className="mt-4 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-md bg-muted/35 p-4 text-sm leading-7">
              {generationText ||
                "Open an edition and add Kannada article content to generate speech."}
            </div>
          </div>
        </section>

        <aside className="space-y-5 rounded-lg border bg-card p-5 shadow-sm">
          {audioUrl ? (
            <audio
              ref={audioRef}
              src={audioUrl}
              preload="auto"
              onLoadedMetadata={(event) => {
                setDuration(event.currentTarget.duration);
              }}
              onCanPlay={() => {
                setAudioState("ready");
                setGenerationProgress(100);
                if (readyToastUrlRef.current !== audioUrl) {
                  readyToastUrlRef.current = audioUrl;
                  toast.success("Kannada audio generated");
                }
              }}
              onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
              onEnded={() => setIsPlaying(false)}
              onError={() => {
                setAudioState("error");
                setGenerationProgress(0);
                setIsPlaying(false);
                toast.error("Generated audio could not be loaded by the browser.");
              }}
            />
          ) : (
            <audio ref={audioRef} />
          )}
          <div className="rounded-md border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Audio generation</div>
                <div className="mt-1 text-xs text-muted-foreground">{currentStatusLabel}</div>
              </div>
              <Badge variant={audioState === "ready" ? "default" : "secondary"}>
                {generationProgress}%
              </Badge>
            </div>
            <Progress value={generationProgress} className="mt-4 h-2.5" />
            <div className="mt-3 text-xs text-muted-foreground">
              {audioState === "generating"
                ? `Preparing natural Kannada speech... ${generationProgress}%`
                : audioState === "loading"
                  ? "Audio generated. Loading it into the player..."
                  : audioState === "ready"
                    ? `Generated ${audioResult?.chunk_count ?? 1} audio segment(s)`
                    : audioState === "error"
                      ? "Generation failed. Check backend configuration and try again."
                      : "Audio regenerates automatically when article content changes."}
            </div>
          </div>

          <div className="space-y-3 rounded-md border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">Playback</div>
              <div className="text-xs tabular-nums text-muted-foreground">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>
            <Slider
              value={[duration ? (currentTime / duration) * 100 : 0]}
              min={0}
              max={100}
              step={0.1}
              disabled={!ready}
              onValueChange={([value]) => {
                if (!audioRef.current || !duration) return;
                audioRef.current.currentTime = (value / 100) * duration;
              }}
            />
            <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 rounded-md border bg-background p-2">
            <Button size="icon" onClick={play} disabled={!ready || isPlaying} title="Play">
              <Play className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={pause}
              disabled={!ready || !isPlaying}
              title="Pause"
            >
              <Pause className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={play}
              disabled={!ready || isPlaying}
              title="Resume"
            >
              <Play className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={stop} disabled={!ready} title="Stop">
              <Square className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={replay} disabled={!ready} title="Replay">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2 rounded-md border bg-background p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex items-center gap-2 font-medium">
                <Volume2 className="h-4 w-4" /> Volume
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">{volume}%</span>
            </div>
            <Slider
              value={[volume]}
              min={0}
              max={100}
              step={1}
              onValueChange={([value]) => setVolume(value)}
            />
          </div>

          <div className="space-y-2 rounded-md border bg-background p-4">
            <div className="text-sm font-medium">Playback speed</div>
            <div className="grid grid-cols-4 gap-2">
              {SPEEDS.map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={speed === item ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSpeed(item)}
                >
                  {item}x
                </Button>
              ))}
            </div>
          </div>

          <Button asChild className="w-full" disabled={!ready}>
            <a
              href={audioUrl || undefined}
              download={audioResult?.file_name ?? "kannada-news-audio.mp3"}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Audio
            </a>
          </Button>
        </aside>
      </div>
    </div>
  );
}
