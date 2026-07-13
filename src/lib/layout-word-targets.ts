type WordTargetSlot = {
  kind?: string;
  w: number;
  h: number;
};

type WordTargetImage = {
  position?: "left" | "right" | "center" | "full";
  widthPct?: number;
};

const MIN_LAYOUT_WORD_TARGET = 160;
const MAX_LAYOUT_WORD_TARGET = 1200;
const WORD_TARGET_STEP = 25;
const WORDS_PER_GRID_CELL = 24;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function imageTextFactor(image?: WordTargetImage | null) {
  if (!image) return 1;

  const widthPct = clamp(image.widthPct ?? 52, 28, 100) / 100;
  if (image.position === "full") return 0.52;
  if (image.position === "center") return clamp(1 - widthPct * 0.48, 0.56, 0.82);
  return clamp(1 - widthPct * 0.32, 0.64, 0.9);
}

export function estimateLayoutWordTarget(slot: WordTargetSlot, image?: WordTargetImage | null) {
  const slotArea = Math.max(slot.w * slot.h, 1);
  const kindFactor =
    slot.kind === "lead" ? 1.12 : slot.kind === "sidebar" ? 0.88 : slot.kind === "image" ? 0.72 : 1;
  const imageFactor = imageTextFactor(image);
  const target = slotArea * WORDS_PER_GRID_CELL * kindFactor * imageFactor;

  return clamp(
    Math.round(target / WORD_TARGET_STEP) * WORD_TARGET_STEP,
    MIN_LAYOUT_WORD_TARGET,
    MAX_LAYOUT_WORD_TARGET,
  );
}

