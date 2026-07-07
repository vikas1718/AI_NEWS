from __future__ import annotations

import base64
import json
import mimetypes
import os
import random
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BACKEND_VERSION = "openai-images-ocr-2026-07-06"
VALID_CATEGORIES = {
    "Politics",
    "Sports",
    "Crime",
    "Agriculture",
    "Education",
    "Cinema",
    "Business",
    "Other",
}

MOCK_KANNADA = [
    "\u0cac\u0cc6\u0c82\u0c97\u0cb3\u0cc2\u0cb0\u0cc1: \u0cb0\u0cbe\u0c9c\u0ccd\u0caf\u0ca6\u0cb2\u0ccd\u0cb2\u0cbf \u0c87\u0c82\u0ca6\u0cc1 \u0cad\u0cbe\u0cb0\u0cc0 \u0cae\u0cb3\u0cc6 \u0cb8\u0cc1\u0cb0\u0cbf\u0caf\u0cc1\u0ca4\u0ccd\u0ca4\u0cbf\u0ca6\u0cc6.",
    "\u0cae\u0cc8\u0cb8\u0cc2\u0cb0\u0cc1: \u0c95\u0cc3\u0cb7\u0cbf \u0c87\u0cb2\u0cbe\u0c96\u0cc6 \u0cb0\u0cc8\u0ca4\u0cb0\u0cbf\u0c97\u0cc6 \u0cb9\u0cca\u0cb8 \u0cb8\u0cac\u0ccd\u0cb8\u0cbf\u0ca1\u0cbf \u0caf\u0ccb\u0c9c\u0ca8\u0cc6 \u0c98\u0ccb\u0cb7\u0cbf\u0cb8\u0cbf\u0ca6\u0cc6.",
    "\u0cb9\u0cbe\u0cb8\u0ca8: \u0c9c\u0cbf\u0cb2\u0ccd\u0cb2\u0cbe \u0c95\u0ccd\u0cb0\u0cc0\u0ca1\u0cbe \u0cb8\u0cae\u0cbe\u0cb5\u0cc7\u0cb6\u0ca6\u0cb2\u0ccd\u0cb2\u0cbf \u0cb8\u0ccd\u0ca5\u0cb3\u0cc0\u0caf \u0ca4\u0c82\u0ca1 \u0c9a\u0cbf\u0ca8\u0ccd\u0ca8\u0ca6 \u0caa\u0ca6\u0c95 \u0c97\u0cc6\u0ca6\u0ccd\u0ca6\u0cbf\u0ca6\u0cc6.",
]

SYSTEM_PROMPT = """You are an expert Kannada newspaper editor and translator.
The input may be English, Kannada, mixed-language, or noisy OCR from an image/PDF/scan.

Default output language: Kannada (kn-IN).
Tasks:
1. If the input is English or any non-Kannada language, translate the full article into natural newspaper Kannada.
2. If the input is already Kannada, correct spelling, grammar, punctuation, OCR mistakes, and preserve meaning.
3. Preserve factual details, names, places, numbers, dates, quotes, and paragraph structure when possible.
4. Do not leave English sentences in corrected_text unless they are proper nouns, official titles, abbreviations, URLs, or quoted source text that should remain as-is.

Return a strict JSON object with:
- corrected_text (string): the final Kannada article text after translation/correction.
- headline (string): a punchy Kannada headline, <= 12 words.
- summary (string): 1-2 sentence Kannada summary.
- category (string): exactly one of: Politics, Sports, Crime, Agriculture, Education, Cinema, Business, Other.
- priority_score (integer 0-100): 95 for breaking/national, 80 state-level, 50 district-level, 30 local/soft.
Respond ONLY with JSON, no prose."""

TRANSLATION_RETRY_PROMPT = SYSTEM_PROMPT + """

Critical validation rule:
The previous output was rejected because the article body was not in Kannada script.
Return corrected_text, headline, and summary in Kannada script now. Do not copy the English input."""

IMAGE_BRIEF_PROMPT = """You are a photo editor for a Kannada newspaper in Karnataka, India.
Convert the article details into one accurate English image-generation prompt.
Return strict JSON with:
- visual_prompt (string): a concrete, factual, documentary photo brief.

Rules:
- Preserve the actual topic, people, place, event, and mood from the article.
- If details are missing, use a safe generic local scene for that category instead of inventing named people or exact places.
- Write in English because image models follow English visual prompts better.
- Describe a single realistic news photograph, not a poster, graphic, collage, or newspaper page.
- Explicitly forbid visible text, captions, logos, watermarks, and UI.
- Keep it under 90 words.
Respond ONLY with JSON."""

OCR_PROMPT = """Perform OCR on the provided image/document. Extract all visible text exactly as it appears.
Preserve the original language, formatting, line breaks, punctuation, and paragraph structure.
Return only the extracted text. Do not translate, summarize, correct, rewrite, add headings, or add explanations.
If the image is blurry, rotated, low contrast, cropped, handwritten, scanned, or a PDF page, still extract the best readable text.
Never ask the user to upload a clearer image. Never return an apology or quality warning. If no text is visible, return only: NO_TEXT_FOUND"""


def load_env() -> None:
    env_file = ROOT / ".env"
    if not env_file.exists():
        return

    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def json_response(handler: BaseHTTPRequestHandler, payload: Any, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("content-length", "0"))
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    return json.loads(raw.decode("utf-8"))


def env_value(name: str) -> str | None:
    value = os.environ.get(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


def get_azure_openai_key() -> str | None:
    if (env_value("OPENAI_PROVIDER") or "openai").lower() != "azure":
        return None
    if not env_value("AZURE_OPENAI_ENDPOINT"):
        return None

    key = env_value("AZURE_OPENAI_API_KEY")
    if key:
        return key
    return None


def get_openai_key() -> str | None:
    key = env_value("OPENAI_API_KEY")
    return key


def azure_url(deployment: str, operation: str) -> str:
    endpoint = env_value("AZURE_OPENAI_ENDPOINT")
    if not endpoint:
        raise ValueError("AZURE_OPENAI_ENDPOINT required for Azure OpenAI")
    api_version = env_value("AZURE_OPENAI_API_VERSION") or "2024-10-21"
    endpoint = endpoint.rstrip("/")
    return f"{endpoint}/openai/deployments/{deployment}/{operation}?api-version={api_version}"


def primary_text_model() -> str:
    return env_value("OPENAI_MODEL_PRIMARY") or env_value("OPENAI_TEXT_MODEL") or "gpt-4o-mini"


def count_kannada_chars(text: str) -> int:
    return sum(1 for char in text if "\u0c80" <= char <= "\u0cff")


def count_latin_chars(text: str) -> int:
    return sum(1 for char in text if ("a" <= char.lower() <= "z"))


def needs_kannada_translation(text: str) -> bool:
    latin_count = count_latin_chars(text)
    kannada_count = count_kannada_chars(text)
    return latin_count >= 20 and latin_count > kannada_count * 2


def has_kannada_text(text: str) -> bool:
    return count_kannada_chars(text) >= 5


def call_openai_chat(text: str, system_prompt: str = SYSTEM_PROMPT) -> dict[str, Any] | None:
    azure_key = get_azure_openai_key()
    if azure_key:
        deployment = env_value("AZURE_OPENAI_TEXT_DEPLOYMENT") or env_value("OPENAI_MODEL_PRIMARY")
        if not deployment:
            raise ValueError("AZURE_OPENAI_TEXT_DEPLOYMENT required for Azure OpenAI chat")
        payload = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            "response_format": {"type": "json_object"},
        }
        request = urllib.request.Request(
            azure_url(deployment, "chat/completions"),
            data=json.dumps(payload).encode("utf-8"),
            headers={"api-key": azure_key, "Content-Type": "application/json"},
            method="POST",
        )

        with urllib.request.urlopen(request, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        return json.loads(content)

    api_key = get_openai_key()
    if not api_key:
        return None

    payload = {
        "model": primary_text_model(),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
        "response_format": {"type": "json_object"},
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=60) as response:
        data = json.loads(response.read().decode("utf-8"))
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
    return json.loads(content)


def guess_mime_type(file_name: str | None, content_type: str | None) -> str:
    if content_type and content_type.split(";")[0].strip() and content_type.split(";")[0].strip() != "application/octet-stream":
        return content_type.split(";")[0].strip()
    guessed, _ = mimetypes.guess_type(file_name or "")
    return guessed or "application/octet-stream"


def download_upload_file(file_url: str, file_name: str | None, mime_type: str | None) -> tuple[str, str]:
    request = urllib.request.Request(file_url, headers={"User-Agent": "innerverse-ocr/1.0"}, method="GET")
    with urllib.request.urlopen(request, timeout=120) as response:
        body = response.read()
        response_type = response.headers.get("Content-Type")

    if not body:
        raise RuntimeError("ocr_failed: uploaded file was empty")

    detected_mime = guess_mime_type(file_name, mime_type or response_type)
    encoded = base64.b64encode(body).decode("ascii")
    return f"data:{detected_mime};base64,{encoded}", detected_mime


def response_output_text(data: dict[str, Any]) -> str:
    direct = str(data.get("output_text") or "").strip()
    if direct:
        return direct

    parts: list[str] = []
    for item in data.get("output") or []:
        for content in item.get("content") or []:
            text = content.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "\n".join(part.strip() for part in parts if part.strip()).strip()


def looks_like_ocr_refusal(text: str) -> bool:
    lowered = text.lower()
    refusal_markers = [
        "upload a clearer",
        "higher resolution",
        "image quality",
        "cannot extract",
        "unable to extract",
        "can't extract",
        "no text found",
        "no_text_found",
        "ಚಿತ್ರದ ಗುಣಮಟ್ಟ",
        "ಸ್ಪಷ್ಟ ಚಿತ್ರ",
        "ಪಠ್ಯ ಹೊರತೆಗೆಯುವುದು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ",
    ]
    return any(marker in lowered for marker in refusal_markers)


def call_openai_ocr(file_url: str, input_type: str | None = None, file_name: str | None = None, mime_type: str | None = None) -> str:
    api_key = get_openai_key()
    if not api_key:
        raise ValueError("OPENAI_API_KEY required for OCR")

    file_data, detected_mime = download_upload_file(file_url, file_name, mime_type)
    filename = file_name or ("upload.pdf" if detected_mime == "application/pdf" or input_type == "pdf" else "upload.jpg")
    file_item = (
        {"type": "input_file", "filename": filename, "file_data": file_data}
        if detected_mime == "application/pdf" or input_type == "pdf"
        else {"type": "input_image", "image_url": file_data, "detail": "high"}
    )
    payload = {
        "model": primary_text_model(),
        "input": [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": OCR_PROMPT},
                    file_item,
                ],
            }
        ],
        "max_output_tokens": 6000,
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=120) as response:
        data = json.loads(response.read().decode("utf-8"))
    text = response_output_text(data)
    if not text:
        raise RuntimeError("ocr_failed: OpenAI returned empty text")
    if looks_like_ocr_refusal(text):
        raise RuntimeError("ocr_failed: OpenAI could not read text from this file. Try cropping to the article area or uploading a direct scan/photo of the text.")
    return text


def call_openai_image_brief(article: dict[str, Any]) -> str | None:
    api_key = get_openai_key()
    if not api_key:
        return None

    payload = {
        "model": primary_text_model(),
        "messages": [
            {"role": "system", "content": IMAGE_BRIEF_PROMPT},
            {"role": "user", "content": json.dumps(article, ensure_ascii=False)},
        ],
        "response_format": {"type": "json_object"},
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=60) as response:
        data = json.loads(response.read().decode("utf-8"))
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
    parsed = json.loads(content)
    brief = str(parsed.get("visual_prompt") or "").strip()
    return brief or None


def category_fallback_scene(category: str | None) -> str:
    scenes = {
        "Politics": "local elected officials and citizens at a government office or public meeting in Karnataka",
        "Sports": "athletes competing or celebrating on a local sports ground in Karnataka",
        "Crime": "police officers investigating a cordoned street scene without graphic violence",
        "Agriculture": "farmers working in a field with crops, tools, and rural Karnataka surroundings",
        "Education": "students and teachers in a classroom or school campus in Karnataka",
        "Cinema": "film crew, actors, or a cinema crowd in a realistic local entertainment setting",
        "Business": "shop owners, workers, or customers in a local market or business district",
        "Other": "people connected to a local news event in a realistic Karnataka setting",
    }
    return scenes.get(category or "Other", scenes["Other"])


def build_image_article(payload: dict[str, Any]) -> dict[str, Any]:
    article = payload.get("article")
    if isinstance(article, dict):
        prompt = str(payload.get("prompt") or "").strip()
        if prompt and not article.get("prompt"):
            article = {**article, "prompt": prompt}
        return article
    return {"prompt": str(payload.get("prompt") or "").strip()}


def build_visual_prompt(payload: dict[str, Any]) -> str:
    article = build_image_article(payload)
    try:
        brief = call_openai_image_brief(article)
    except Exception:
        brief = None
    if brief:
        return brief

    headline = str(article.get("headline") or article.get("prompt") or "Kannada news article").strip()
    summary = str(article.get("summary") or "").strip()
    category = str(article.get("category") or "Other").strip()
    text = str(article.get("text") or article.get("body") or article.get("corrected_text") or "").strip()
    context = summary or text[:500] or headline
    scene = category_fallback_scene(category)
    return (
        f"Accurate documentary news photograph for this {category} article: {headline}. "
        f"Article context: {context}. "
        f"Show {scene}. Natural light, realistic Indian photojournalism, clear subject focus, no visible words, no captions, no logos, no watermark."
    )


def call_openai_image(visual_prompt: str) -> str | None:
    image_prompt = (
        "Create one realistic editorial news photograph for an Indian Kannada newspaper. "
        "Make it look like an actual field photo taken by a local photojournalist in Karnataka, India. "
        "Use natural light, believable people, authentic clothing, real-world streets/offices/farms/schools/stadiums as appropriate, "
        "clear subject focus, strong newspaper composition, and no fantasy styling. "
        "Do not include words, captions, typography, logos, watermarks, UI, posters, fake newspaper pages, or collage layouts. "
        f"Article brief: {visual_prompt}"
    )

    azure_key = get_azure_openai_key()
    if azure_key:
        deployment = env_value("AZURE_OPENAI_IMAGE_DEPLOYMENT")
        if not deployment:
            raise ValueError("AZURE_OPENAI_IMAGE_DEPLOYMENT required for Azure OpenAI image generation")
        payload = {
            "prompt": image_prompt,
            "size": env_value("OPENAI_IMAGE_SIZE") or "1024x1024",
            "quality": env_value("OPENAI_IMAGE_QUALITY") or "high",
            "n": 1,
        }
        request = urllib.request.Request(
            azure_url(deployment, "images/generations"),
            data=json.dumps(payload).encode("utf-8"),
            headers={"api-key": azure_key, "Content-Type": "application/json"},
            method="POST",
        )

        with urllib.request.urlopen(request, timeout=120) as response:
            data = json.loads(response.read().decode("utf-8"))
        image_data = data.get("data", [{}])[0]
        if image_data.get("url"):
            return image_data["url"]
        image = image_data.get("b64_json")
        return f"data:image/png;base64,{image}" if image else None

    api_key = get_openai_key()
    if not api_key:
        return None

    payload = {
        "model": env_value("OPENAI_IMAGE_MODEL") or "gpt-image-1",
        "prompt": image_prompt,
        "size": env_value("OPENAI_IMAGE_SIZE") or "1024x1024",
        "quality": env_value("OPENAI_IMAGE_QUALITY") or "high",
        "background": "opaque",
        "output_format": env_value("OPENAI_IMAGE_FORMAT") or "jpeg",
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/images/generations",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=120) as response:
        data = json.loads(response.read().decode("utf-8"))
    image_data = data.get("data", [{}])[0]
    if image_data.get("url"):
        return image_data["url"]
    image = image_data.get("b64_json")
    return f"data:image/png;base64,{image}" if image else None


def call_pollinations_image(visual_prompt: str) -> str | None:
    api_key = env_value("POLLINATIONS_API_KEY")
    if not api_key:
        return None

    base_url = (env_value("POLLINATIONS_BASE_URL") or "https://gen.pollinations.ai").rstrip("/")
    image_prompt = (
        "Accurate realistic editorial news photograph, documentary photojournalism, natural light, authentic Indian local scene, "
        "clear subject, no text, no logo, no watermark, no poster, no graphic design. "
        f"{visual_prompt}"
    )
    query = {
        "key": api_key,
        "model": env_value("POLLINATIONS_IMAGE_MODEL") or "flux",
        "width": env_value("POLLINATIONS_IMAGE_WIDTH") or "1200",
        "height": env_value("POLLINATIONS_IMAGE_HEIGHT") or "760",
        "nologo": "true",
        "private": "true",
        "enhance": env_value("POLLINATIONS_ENHANCE") or "false",
        "seed": str(random.randint(1, 2_147_483_647)),
    }
    encoded_prompt = urllib.parse.quote(image_prompt)
    url = f"{base_url}/image/{encoded_prompt}?{urllib.parse.urlencode(query)}"
    if (env_value("POLLINATIONS_RETURN_URL") or "true").lower() == "true":
        return url

    request = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {api_key}", "Accept": "image/*"},
        method="GET",
    )

    with urllib.request.urlopen(request, timeout=180) as response:
        content_type = response.headers.get("Content-Type", "image/jpeg").split(";")[0]
        body = response.read()

    if content_type.startswith("application/json"):
        try:
            error_payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            error_payload = body.decode("utf-8", errors="replace")
        raise RuntimeError(f"pollinations_failed: {error_payload}")

    if not content_type.startswith("image/") or not body:
        raise RuntimeError(f"pollinations_failed: unexpected content type {content_type}")

    encoded = base64.b64encode(body).decode("ascii")
    return f"data:{content_type};base64,{encoded}"


def normalize_article_result(result: dict[str, Any], text: str) -> dict[str, Any]:
    priority = result.get("priority_score", 50)
    try:
        priority = max(0, min(100, round(float(priority))))
    except (TypeError, ValueError):
        priority = 50

    category = result.get("category")
    if category not in VALID_CATEGORIES:
        category = "Other"

    headline = str(result.get("headline") or text.strip().splitlines()[0][:80] or "Untitled article").strip()
    summary = str(result.get("summary") or text.strip()[:220]).strip()
    corrected_text = str(result.get("corrected_text") or text).strip()

    return {
        "corrected_text": corrected_text,
        "headline": headline,
        "summary": summary,
        "category": category,
        "priority_score": priority,
    }


def fallback_image(prompt: str) -> str:
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
<rect width="1200" height="760" fill="#f4f0e8"/>
<rect x="72" y="72" width="1056" height="616" fill="#ffffff" stroke="#1f2937" stroke-width="10"/>
<rect x="120" y="132" width="420" height="260" fill="#d7e3df"/>
<rect x="590" y="132" width="490" height="44" fill="#111827"/>
<rect x="590" y="206" width="430" height="30" fill="#6b7280"/>
<rect x="590" y="258" width="470" height="30" fill="#6b7280"/>
<rect x="120" y="440" width="960" height="28" fill="#374151"/>
<rect x="120" y="500" width="860" height="24" fill="#9ca3af"/>
<rect x="120" y="548" width="910" height="24" fill="#9ca3af"/>
<text x="120" y="635" fill="#111827" font-size="34" font-family="Arial, sans-serif">Image placeholder: {prompt[:52]}</text>
</svg>"""
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def handle_process_ocr(payload: dict[str, Any]) -> dict[str, Any]:
    file_url = str(payload.get("fileUrl") or "").strip()
    if not file_url:
        raise ValueError("fileUrl required for OCR")

    input_type = str(payload.get("inputType") or "image")
    file_name = str(payload.get("fileName") or "").strip() or None
    mime_type = str(payload.get("mimeType") or "").strip() or None

    try:
        text = call_openai_ocr(file_url, input_type, file_name, mime_type)
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            raise RuntimeError("rate_limited") from exc
        if exc.code == 402:
            raise RuntimeError("credits_exhausted") from exc
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"ocr_failed: HTTP {exc.code}: {body}") from exc
    except (OSError, urllib.error.URLError) as exc:
        raise RuntimeError(f"ocr_failed: {exc}") from exc

    return {
        "ocr_text": text,
        "simulated": False,
        "source_type": input_type,
        "source": file_url,
    }


def handle_process_article(payload: dict[str, Any]) -> dict[str, Any]:
    text = str(payload.get("text") or "").strip()
    if not text:
        raise ValueError("text required")

    requires_translation = needs_kannada_translation(text)

    try:
        result = call_openai_chat(text)
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            raise RuntimeError("rate_limited") from exc
        if exc.code == 402:
            raise RuntimeError("credits_exhausted") from exc
        raise RuntimeError(f"ai_failed: {exc.read().decode('utf-8', errors='replace')}") from exc
    except (OSError, urllib.error.URLError) as exc:
        if requires_translation:
            raise RuntimeError("ai_failed: Kannada conversion needs OpenAI/network access. Please check the backend connection and try again.") from exc
        result = None

    if result is None and requires_translation:
        raise RuntimeError("ai_failed: Kannada conversion needs OPENAI_API_KEY. Please configure the backend and try again.")

    if result is None:
        result = {
            "corrected_text": text,
            "headline": text.splitlines()[0][:80],
            "summary": text[:220],
            "category": "Other",
            "priority_score": 50,
        }

    normalized = normalize_article_result(result, text)
    if requires_translation and not has_kannada_text(normalized["corrected_text"]):
        try:
            retry_result = call_openai_chat(text, TRANSLATION_RETRY_PROMPT)
            if retry_result is not None:
                normalized = normalize_article_result(retry_result, text)
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                raise RuntimeError("rate_limited") from exc
            if exc.code == 402:
                raise RuntimeError("credits_exhausted") from exc
            raise RuntimeError(f"ai_failed: {exc.read().decode('utf-8', errors='replace')}") from exc
        except (OSError, urllib.error.URLError) as exc:
            raise RuntimeError("ai_failed: Kannada conversion needs OpenAI/network access. Please check the backend connection and try again.") from exc

    if requires_translation and not has_kannada_text(normalized["corrected_text"]):
        raise RuntimeError("translation_failed: AI returned non-Kannada text. Please run the pipeline again.")

    return normalized


def handle_generate_image(payload: dict[str, Any]) -> dict[str, Any]:
    article = build_image_article(payload)
    if not any(str(article.get(key) or "").strip() for key in ("prompt", "headline", "summary", "text", "body", "corrected_text")):
        raise ValueError("prompt or article details required")
    try:
        visual_prompt = build_visual_prompt(payload)
    except Exception as exc:
        visual_prompt = build_visual_prompt({"prompt": str(article.get("prompt") or article.get("headline") or "Kannada news article")})
        return {
            "image_url": fallback_image(visual_prompt),
            "provider": "fallback",
            "backend_version": BACKEND_VERSION,
            "warning": f"prompt_failed: {exc}",
        }

    errors: list[str] = []

    if get_openai_key() or get_azure_openai_key():
        try:
            image_url = call_openai_image(visual_prompt)
            if image_url:
                return {"image_url": image_url, "provider": "openai", "backend_version": BACKEND_VERSION}
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                raise RuntimeError("rate_limited") from exc
            if exc.code == 402:
                raise RuntimeError("credits_exhausted") from exc
            body = exc.read().decode("utf-8", errors="replace")
            errors.append(f"OpenAI: HTTP {exc.code}: {body}")
        except Exception as exc:
            errors.append(f"OpenAI: {exc}")

    if errors:
        return {
            "image_url": fallback_image(visual_prompt),
            "provider": "fallback",
            "backend_version": BACKEND_VERSION,
            "warning": "image_failed: " + " | ".join(errors),
        }

    return {"image_url": fallback_image(visual_prompt), "provider": "fallback", "backend_version": BACKEND_VERSION}


def handle_generate_layout(payload: dict[str, Any]) -> dict[str, Any]:
    articles = payload.get("articles") or []
    pages = max(1, int(payload.get("number_of_pages") or 4))
    positions = ["top", "middle", "middle", "bottom"]
    layout = []

    sorted_articles = sorted(articles, key=lambda item: item.get("priority_score") or 0, reverse=True)
    for index, article in enumerate(sorted_articles):
        slot = index % 4
        is_lead = index == 0 or slot == 0
        layout.append(
            {
                "article_id": article.get("id"),
                "page_number": min(pages, index // 4 + 1),
                "position": positions[slot],
                "headline_size": "big" if is_lead else "small" if slot == 3 else "medium",
                "image_size": "large" if is_lead else "medium",
                "column_count": 3 if is_lead else 2,
                "slot_index": slot,
            }
        )

    return {"layout": layout, "generated_at": datetime.now(timezone.utc).isoformat()}


def handle_tts(payload: dict[str, Any]) -> dict[str, Any]:
    text = str(payload.get("text") or "")
    return {
        "audio_url": "https://actions.google.com/sounds/v1/ambiences/newspaper_being_folded.ogg",
        "simulated": True,
        "text_length": len(text),
    }


HANDLERS = {
    "process-ocr": handle_process_ocr,
    "process-article-ai": handle_process_article,
    "generate-image": handle_generate_image,
    "generate-layout": handle_generate_layout,
    "tts-kannada": handle_tts,
}


class BackendHandler(BaseHTTPRequestHandler):
    server_version = "InnerversePythonBackend/1.0"

    def do_OPTIONS(self) -> None:
        json_response(self, {})

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/health":
            json_response(self, {"ok": True, "service": "innerverse-python-backend", "backend_version": BACKEND_VERSION})
            return
        json_response(self, {"error": "not_found"}, 404)

    def do_POST(self) -> None:
        name = self.path.rstrip("/").split("/")[-1]
        handler = HANDLERS.get(name)
        if handler is None:
            json_response(self, {"error": "not_found"}, 404)
            return

        try:
            payload = read_json(self)
            json_response(self, handler(payload))
        except json.JSONDecodeError:
            json_response(self, {"error": "invalid_json"}, 400)
        except ValueError as exc:
            json_response(self, {"error": str(exc)}, 400)
        except RuntimeError as exc:
            message = str(exc)
            status = 500
            if message == "rate_limited":
                status = 429
            elif message == "credits_exhausted":
                status = 402
            json_response(self, {"error": message}, status)
        except Exception as exc:
            json_response(self, {"error": str(exc)}, 500)

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main() -> None:
    load_env()
    port = int(os.environ.get("PY_BACKEND_PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), BackendHandler)
    print(f"Python backend running at http://127.0.0.1:{port}")
    print("Endpoints are available at /functions/v1/{process-ocr,process-article-ai,generate-image,generate-layout,tts-kannada}")
    server.serve_forever()


if __name__ == "__main__":
    main()
