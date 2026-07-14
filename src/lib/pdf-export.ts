function copyComputedStyles(source: Element, target: Element) {
  if (!(target instanceof HTMLElement || target instanceof SVGElement)) return;

  const computed = window.getComputedStyle(source);
  for (let index = 0; index < computed.length; index += 1) {
    const property = computed.item(index);
    const value = computed.getPropertyValue(property);
    if (value.includes("oklch") || value.includes("oklab")) continue;
    target.style.setProperty(property, value, computed.getPropertyPriority(property));
  }

  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);
  sourceChildren.forEach((child, index) => {
    const targetChild = targetChildren[index];
    if (targetChild) copyComputedStyles(child, targetChild);
  });
}

function isUnsafeExternalImage(src: string) {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return false;

  try {
    const url = new URL(src, window.location.href);
    if (url.origin === window.location.origin) return false;

    const hostname = url.hostname.toLowerCase();
    return (
      hostname.includes("ads2publish.com") ||
      hostname.includes("newspaperads.") ||
      hostname.includes("newspaperads")
    );
  } catch {
    return false;
  }
}

function createImagePlaceholderDataUrl(width: number, height: number) {
  const safeWidth = Math.max(160, Math.round(width || 320));
  const safeHeight = Math.max(90, Math.round(height || 180));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">
      <rect width="100%" height="100%" fill="#f5f0e6"/>
      <rect x="0.5" y="0.5" width="${safeWidth - 1}" height="${safeHeight - 1}" fill="none" stroke="#c8bfae"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6f6658" font-family="Arial, sans-serif" font-size="14">
        Image unavailable in PDF
      </text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function prepareImagesForPdf(clonedDocument: Document, sourceElement: HTMLElement) {
  const sourceImages = Array.from(sourceElement.querySelectorAll("img"));
  const clonedImages = Array.from(clonedDocument.querySelectorAll("img"));

  clonedImages.forEach((image, index) => {
    const sourceImage = sourceImages[index];
    const sourceSrc = sourceImage?.currentSrc || sourceImage?.src || image.currentSrc || image.src;
    image.crossOrigin = "anonymous";

    if (!isUnsafeExternalImage(sourceSrc)) return;

    const sourceRect = sourceImage?.getBoundingClientRect();
    image.removeAttribute("srcset");
    image.src = createImagePlaceholderDataUrl(sourceRect?.width ?? image.width, sourceRect?.height ?? image.height);
  });
}

export function prepareHtml2CanvasPdfClone(
  clonedDocument: Document,
  sourceElement: HTMLElement,
  pageIndex: number,
) {
  clonedDocument.documentElement.classList.add("pdf-export-mode");

  const clonedPages = clonedDocument.querySelectorAll("[data-print-page]");
  const clonedPage = clonedPages[pageIndex];
  if (clonedPage) {
    copyComputedStyles(sourceElement, clonedPage);
  }
  prepareImagesForPdf(clonedDocument, sourceElement);

  clonedDocument
    .querySelectorAll('link[rel="stylesheet"], style')
    .forEach((node) => node.remove());

  const baseStyle = clonedDocument.createElement("style");
  baseStyle.textContent = `
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; background: #ffffff; }
    img, svg, canvas { display: block; max-width: 100%; }
  `;
  clonedDocument.head.appendChild(baseStyle);
}
