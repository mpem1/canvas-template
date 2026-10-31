import { readPsd } from "ag-psd";
import type { Layer, TextStyle } from "ag-psd";
import { defaultImageFrame, defaultTextFrame } from "./factory";
import type { Doc, Frame, HAlign } from "./types";

/**
 * Photoshop PSD import — best-effort reconstruction, NOT pixel-perfect
 * layout fidelity:
 *  - page size from the PSD's resolution info (honors 72/150/300 dpi docs);
 *    PSD pixels are mapped to app px at 96 dpi so the PHYSICAL size matches.
 *  - pixel layers → ImageFrames (layer canvas rendered as PNG data URL)
 *  - text layers → editable TextFrames (first style run wins; fonts map
 *    best-effort since Photoshop font engines differ from the browser)
 *  - groups are flattened; vector/adjustment layers without pixels are
 *    skipped and counted
 *  - a PSD without usable layers falls back to the flattened composite
 */

export interface PsdImportStats {
  images: number;
  texts: number;
  skipped: number;
  flattened: boolean;
  dpi: number;
}

export interface PsdImportResult {
  doc: Doc;
  stats: PsdImportStats;
}

const MAX_DIM = 20000;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) =>
    clamp(Math.round(v ?? 0), 0, 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** ag-psd Color union: RGB {r,g,b} 0–255, FRGB {fr,fg,fb} 0–1, Grayscale {g}. */
function colorToHex(c: unknown): string | null {
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  if (typeof o.r === "number" && typeof o.g === "number" && typeof o.b === "number")
    return rgbToHex(o.r, o.g, o.b);
  if (typeof o.fr === "number" && typeof o.fg === "number" && typeof o.fb === "number")
    return rgbToHex(o.fr * 255, o.fg * 255, o.fb * 255);
  if (typeof o.g === "number" && o.r === undefined && o.fr === undefined)
    return rgbToHex(o.g, o.g, o.g);
  return null;
}

/** "Arial-BoldMT" → "Arial", "HelveticaNeue-Light" → "HelveticaNeue" */
function cleanFontName(raw: string | undefined): string {
  if (!raw) return "Arial";
  return (
    raw
      .replace(/[-_](Bold|Light|Regular|Medium|Thin|Black|Heavy|Italic|Oblique)(MT)?$/i, "")
      .replace(/(Bold|Light|Regular|Medium|Thin|Black|Heavy)(MT|PS)?$/i, "")
      .replace(/-?(MT|PS)$/i, "")
      .trim() || "Arial"
  );
}

function justificationToAlign(j: string | undefined): HAlign {
  if (!j) return "left";
  if (j === "center") return "center";
  if (j === "right") return "right";
  if (j.startsWith("justify")) return "justify";
  return "left";
}

function layerBox(l: Layer): { x: number; y: number; w: number; h: number } {
  const w = Math.max(0, (l.right ?? 0) - (l.left ?? 0));
  const h = Math.max(0, (l.bottom ?? 0) - (l.top ?? 0));
  return { x: l.left ?? 0, y: l.top ?? 0, w, h };
}

function buildTextFrame(l: Layer, k: number): Frame | null {
  const raw = l.text;
  if (!raw) return null;
  const text = (raw.text ?? "").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  if (!text.trim()) return null;
  // first style run wins (multi-style runs collapse to one text frame)
  const style: TextStyle = raw.styleRuns?.[0]?.style ?? raw.style ?? {};
  // Photoshop font size is in POINTS. Its pixel size scales with doc dpi
  // (px = pt·dpi/72), and PSD px map to app px by k=96/dpi — the dpi cancels,
  // so text keeps the same physical size in every document.
  const fontSizePt = typeof style.fontSize === "number" ? style.fontSize : 24;
  const fontSize = clamp(Math.round(fontSizePt * (96 / 72) * 10) / 10, 4, 800);
  const fontRaw = style.font?.name;
  const fontName = cleanFontName(fontRaw);
  const justify = raw.paragraphStyle?.justification;

  const box = layerBox(l);
  const f = defaultTextFrame(0, 0, 0, 0);
  return {
    ...f,
    name: l.name || "Photoshop text",
    x: box.x * k,
    y: box.y * k,
    // point text often has a tiny/zero box — give the text room
    w: Math.max(box.w * k, 160),
    h: Math.max(box.h * k, fontSize * 1.6),
    text,
    fontSize,
    bold: /bold|black|heavy/i.test(fontRaw ?? "") || style.fauxBold === true,
    italic: /italic|oblique/i.test(fontRaw ?? "") || style.fauxItalic === true,
    color: colorToHex(style.fillColor) ?? "#18181b",
    align: justificationToAlign(justify),
    vAlign: "top",
    padding: 0,
    fontFamily: fontName,
    autoFit: false,
    fillHeight: false,
  };
}

function buildImageFrame(l: Layer, k: number): Frame | null {
  const canvas = (l as { canvas?: HTMLCanvasElement }).canvas;
  if (!canvas || !canvas.width || !canvas.height) return null;
  const box = layerBox(l);
  if (box.w <= 0 || box.h <= 0) return null;
  const f = defaultImageFrame(0, 0, 0, 0);
  return {
    ...f,
    name: l.name || "Photoshop layer",
    x: Math.round(box.x * k),
    y: Math.round(box.y * k),
    w: Math.round(box.w * k),
    h: Math.round(box.h * k),
    src: canvas.toDataURL("image/png"),
    fileName: `${(l.name || "layer").replace(/[^\w-]+/g, "_")}.png`,
    fit: "fill", // canvas is exactly the layer box; uniform k keeps aspect
    imgW: canvas.width,
    imgH: canvas.height,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };
}

function walk(layers: Layer[] | undefined, k: number, stats: PsdImportStats, out: Frame[]): void {
  if (!layers) return;
  for (const l of layers) {
    if (l.hidden) {
      stats.skipped += 1;
      continue;
    }
    if (l.children?.length) {
      walk(l.children, k, stats, out); // flatten groups
      continue;
    }
    if (l.text?.text) {
      const f = buildTextFrame(l, k);
      if (f) {
        out.push(f);
        stats.texts += 1;
        continue;
      }
    }
    if ((l as { canvas?: unknown }).canvas) {
      const f = buildImageFrame(l, k);
      if (f) {
        out.push(f);
        stats.images += 1;
        continue;
      }
    }
    stats.skipped += 1; // vector shapes, adjustments, empty layers…
  }
}

export async function importPsdFile(file: File): Promise<PsdImportResult> {
  const buf = await file.arrayBuffer();
  // yield a frame so the busy spinner can paint before the sync parse
  await new Promise((r) => setTimeout(r, 30));

  let psd;
  try {
    psd = readPsd(buf, {
      skipThumbnail: true,
      throwForMissingFeatures: false,
      useImageData: false,
    });
  } catch {
    throw new Error("Not a valid Photoshop (.psd) file");
  }

  // ag-psd v34: document dpi lives in psd.imageResources.resolutionInfo as
  // horizontalResolution ('PPI' | 'PPCM'); older builds used imageResourcesData.
  const ri =
    psd.imageResources?.resolutionInfo ??
    (psd as { imageResourcesData?: { resolutionInfo?: { horizontalResolution?: number; horizontalResolutionUnit?: string } } })
      .imageResourcesData?.resolutionInfo;
  const rawDpi = typeof ri?.horizontalResolution === "number" && ri.horizontalResolution > 0 ? ri.horizontalResolution : 72;
  const dpi = clamp(ri?.horizontalResolutionUnit === "PPCM" ? rawDpi * 2.54 : rawDpi, 36, 1200);
  const k = 96 / dpi; // PSD px → app px scale
  const width = clamp(Math.round(psd.width * k), 16, MAX_DIM);
  const height = clamp(Math.round(psd.height * k), 16, MAX_DIM);

  const stats: PsdImportStats = {
    images: 0,
    texts: 0,
    skipped: 0,
    flattened: false,
    dpi: Math.round(dpi),
  };
  let frames: Frame[] = [];
  walk(psd.children, k, stats, frames);

  if (!frames.length) {
    // no usable layers — fall back to the flattened composite
    const composite = (psd as { canvas?: HTMLCanvasElement }).canvas;
    if (!composite) throw new Error("PSD has no renderable layers or composite image");
    const img = defaultImageFrame(0, 0, width, height);
    img.name = "Flattened artwork";
    img.src = composite.toDataURL("image/png");
    img.fileName = `${file.name.replace(/\.psd$/i, "")}.png`;
    img.fit = "fill";
    img.imgW = composite.width;
    img.imgH = composite.height;
    frames = [img];
    stats.flattened = true;
  }

  // PSD paints bottom → top; ag-psd children[0] is the TOP layer, so the
  // collected (top-first) order must be reversed to stack correctly.
  frames = frames.slice().reverse();

  const doc: Doc = {
    name: file.name.replace(/\.psd$/i, "") || "Photoshop import",
    width,
    height,
    unit: "in",
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    bleed: 0,
    pages: [{ id: `psd-${Date.now()}`, background: "#ffffff", frames }],
  };
  return { doc, stats };
}
