import { aiFn } from "@/lib/api";

export type TranslateTargetLanguage =
  | "kn" // Kannada
  | "en" // English
  | (string & {});

export type TranslateOptions = {
  sourceLanguage?: string;
  targetLanguage: TranslateTargetLanguage;
};

export async function translateText({
  text,
  options,
}: {
  text: string;
  options: TranslateOptions;
}): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const result = await aiFn.translate(trimmed, options);
  // Expected shape: { translated_text: string }
  return result.translated_text ?? "";
}

