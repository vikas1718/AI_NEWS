import { useMutation } from "@tanstack/react-query";
import { Download, Loader2, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { aiFn } from "@/lib/api";

const DEFAULT_VOLUME = 0.9;

type AudioState = "idle" | "generating" | "loading" | "ready" | "error";

export type KannadaTtsResult = {
  audio_url?: string | null;
  audio_base64?: string | null;
  mime_type?: string | null;
  chunk_count?: number | null;
  file_name?: string | null;
};

type Props = {
  inputText: string;
  title?: string;
  autoGenerate?: boolean;
};

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
  if (audioState === "generating") return "Generating audio…";
  if (audioState === "loading") return "Loading audio…";
  if (audioState === "ready") return "Ready to play";
  if (audioState === "error") return "Couldn't generate audio";
  return "Waiting for text";
}

export function KannadaTtsPlayer({ inputText, title = "Article audio", autoGenerate = true }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const readyToastUrlRef = useRef("");

  const [audioUrl, setAudioUrl] = useState("");
  const [audioResult, setAudioResult] = useState<KannadaTtsResult | null>(null);
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const ttsMutation = useMutation({
    mutationFn: (text: string) => aiFn.tts(text, { mode: "fast" }),
    onMutate: () => {
      setAudioState("generating");
      setIsPlaying(false);
    },
    onSuccess: (result) => {
      try {
        const nextAudioUrl = audioUrlFromResult(result as KannadaTtsResult);
        setAudioResult(result as KannadaTtsResult);
        setAudioState("loading");
        setCurrentTime(0);
        setDuration(0);
        if (audioUrl && audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
        setAudioUrl(nextAudioUrl);
      } catch (error) {
        setAudioResult(null);
        setAudioState("error");
        setAudioUrl((previousUrl) => {
          if (previousUrl && previousUrl.startsWith("blob:")) URL.revokeObjectURL(previousUrl);
          return "";
        });
        toast.error(error instanceof Error ? error.message : "Could not load generated audio");
      }
    },
    onError: (error: unknown) => {
      setAudioState("error");
      toast.error(error instanceof Error ? error.message : "Could not generate audio");
    },
  });

  const generateAudio = ttsMutation.mutate;
  const shouldGenerate = autoGenerate && Boolean(inputText.trim());

  useEffect(() => {
    if (!shouldGenerate) {
      setAudioState("idle");
      return;
    }

    const text = inputText;
    const timeout = window.setTimeout(() => generateAudio(text), 350);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText, shouldGenerate]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = DEFAULT_VOLUME;
  }, [audioUrl]);

  useEffect(
    () => () => {
      if (audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );

  async function togglePlayback() {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      return;
    }
    try {
      await audioRef.current.play();
    } catch (error) {
      setAudioState("error");
      toast.error(
        error instanceof Error ? error.message : "This browser could not play the generated audio.",
      );
    }
  }

  const ready = audioState === "ready" && Boolean(audioUrl);
  const isBusy = audioState === "generating" || audioState === "loading";
  const downloadFileName = audioResult?.file_name ?? "kannada-news-audio.mp3";

  return (
    <div className="space-y-5">
      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onCanPlay={() => {
            setAudioState("ready");
            if (readyToastUrlRef.current !== audioUrl) {
              readyToastUrlRef.current = audioUrl;
              toast.success("Audio ready");
            }
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onEnded={() => setIsPlaying(false)}
          onError={() => {
            setAudioState("error");
            toast.error("Generated audio could not be loaded by the browser.");
          }}
        />
      ) : (
        <audio ref={audioRef} />
      )}

      <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <Button
          type="button"
          size="icon"
          onClick={togglePlayback}
          disabled={!ready}
          className="h-14 w-14 shrink-0 rounded-full"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isBusy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5" />
          )}
        </Button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{statusLabel(audioState)}</div>
        </div>

        <Button
          asChild
          type="button"
          size="icon"
          variant="outline"
          className="h-10 w-10 shrink-0 rounded-full border-white/15 bg-transparent hover:bg-white/10"
          disabled={!ready}
          title="Download audio"
        >
          <a href={audioUrl || undefined} download={downloadFileName}>
            <Download className="h-4 w-4" />
          </a>
        </Button>
      </div>

      <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/5 p-4">
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
    </div>
  );
}
