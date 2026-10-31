import type {
  Doc,
  Frame,
  ImageFrame,
  Margins,
  ShapeFrame,
  ShapeKind,
  TextFrame,
  Tool,
} from "./types";
import { toPx } from "./units";

export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return (
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function textToHtml(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br>");
}

let counter = 0;
function autoName(prefix: string): string {
  counter += 1;
  return `${prefix} ${counter}`;
}

export function defaultTextFrame(
  x = 0,
  y = 0,
  w = 320,
  h = 160,
): TextFrame {
  return {
    id: uid(),
    name: autoName("Text"),
    type: "text",
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    locked: false,
    text: "",
    fontFamily: "Inter",
    fontSize: 24,
    bold: false,
    italic: false,
    underline: false,
    uppercase: false,
    align: "left",
    vAlign: "top",
    lineHeight: 1.3,
    letterSpacing: 0,
    color: "#18181b",
    outlineWidth: 0,
    outlineColor: "#000000",
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowBlur: 0,
    shadowColor: "#000000",
    fill: "none",
    padding: 8,
    autoFit: false,
    fillHeight: false,
  };
}

export function defaultImageFrame(
  x = 0,
  y = 0,
  w = 320,
  h = 240,
): ImageFrame {
  return {
    id: uid(),
    name: autoName("Image"),
    type: "image",
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    locked: false,
    src: "",
    fileName: "",
    fit: "cover",
    radius: 0,
    imgW: 0,
    imgH: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };
}

export function defaultShapeFrame(
  shape: ShapeKind,
  x = 0,
  y = 0,
  w = 240,
  h = 160,
): ShapeFrame {
  return {
    id: uid(),
    name: autoName("Shape"),
    type: "shape",
    x,
    y,
    w: shape === "line" ? Math.max(w, 40) : w,
    h: shape === "line" ? 20 : h,
    rotation: 0,
    opacity: 1,
    locked: false,
    shape,
    fill: shape === "line" ? "none" : "#f59e0b",
    stroke: "#18181b",
    strokeWidth: shape === "line" ? 3 : 1,
    radius: 0,
  };
}

export function frameForTool(
  tool: Tool,
  x: number,
  y: number,
  w: number,
  h: number,
): Frame | null {
  switch (tool) {
    case "text":
      return defaultTextFrame(x, y, w, h);
    case "image":
      return defaultImageFrame(x, y, w, h);
    case "rect":
      return defaultShapeFrame("rect", x, y, w, h);
    case "ellipse":
      return defaultShapeFrame("ellipse", x, y, w, h);
    case "line":
      return defaultShapeFrame("line", x, y, w, Math.min(h, 20));
    default:
      return null;
  }
}

/**
 * Ensure a single frame carries every field added after v1.
 * Mutates the frame in place and returns it. Used by migrateDoc() and by
 * store.addFrame so ANY frame entering the store is field-complete (panel
 * inputs must never see undefined values).
 */
export function migrateFrame(f: Frame): Frame {
  if (f.type === "text") {
    const t = f as TextFrame;
    if (typeof t.autoFit !== "boolean") t.autoFit = false;
    if (typeof t.fillHeight !== "boolean") t.fillHeight = false;
    if (
      typeof t.outlineWidth !== "number" ||
      !Number.isFinite(t.outlineWidth) ||
      t.outlineWidth < 0
    )
      t.outlineWidth = 0;
    if (typeof t.outlineColor !== "string" || !t.outlineColor)
      t.outlineColor = "#000000";
    if (typeof t.shadowOffsetX !== "number" || !Number.isFinite(t.shadowOffsetX))
      t.shadowOffsetX = 0;
    if (typeof t.shadowOffsetY !== "number" || !Number.isFinite(t.shadowOffsetY))
      t.shadowOffsetY = 0;
    if (
      typeof t.shadowBlur !== "number" ||
      !Number.isFinite(t.shadowBlur) ||
      t.shadowBlur < 0
    )
      t.shadowBlur = 0;
    if (typeof t.shadowColor !== "string" || !t.shadowColor)
      t.shadowColor = "#000000";
  } else if (f.type === "image") {
    const im = f as ImageFrame;
    if (typeof im.imgW !== "number") im.imgW = 0;
    if (typeof im.imgH !== "number") im.imgH = 0;
    if (typeof im.scale !== "number" || !Number.isFinite(im.scale) || im.scale <= 0)
      im.scale = 1;
    if (typeof im.offsetX !== "number" || !Number.isFinite(im.offsetX)) im.offsetX = 0;
    if (typeof im.offsetY !== "number" || !Number.isFinite(im.offsetY)) im.offsetY = 0;
  }
  return f;
}

/**
 * Ensure frames carry every field added after v1 (autosaved / imported docs).
 * Returns the same doc mutated in place.
 */
const isFiniteNum = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Normalize one page's guides to two finite, deduplicated, sorted arrays.
 * Mutates the page in place.
 */
export function migrateGuides(page: Doc["pages"][number]): void {
  const g = page.guides;
  if (!g || typeof g !== "object" || !Array.isArray(g.x) || !Array.isArray(g.y)) {
    page.guides = { x: [], y: [] };
    return;
  }
  const clean = (arr: unknown[]) =>
    Array.from(
      new Set(
        arr.filter(isFiniteNum).map(round2),
      ),
    ).sort((a, b) => a - b);
  page.guides = { x: clean(g.x), y: clean(g.y) };
}

export function migrateDoc(d: Doc): Doc {
  if (typeof d.bleed !== "number" || !Number.isFinite(d.bleed) || d.bleed < 0) {
    d.bleed = toPx(0.125, "in");
  }
  for (const page of d.pages) {
    migrateGuides(page);
    for (const f of page.frames) migrateFrame(f);
  }
  return d;
}

export function createDoc(opts: {
  name: string;
  widthPx: number;
  heightPx: number;
  unit: Doc["unit"];
  marginPx?: Margins;
  bleedPx?: number;
}): Doc {
  const margins = opts.marginPx ?? {
    top: toPx(0.5, "in"),
    right: toPx(0.5, "in"),
    bottom: toPx(0.5, "in"),
    left: toPx(0.5, "in"),
  };
  return {
    name: opts.name || "Untitled document",
    width: Math.max(16, Math.round(opts.widthPx)),
    height: Math.max(16, Math.round(opts.heightPx)),
    unit: opts.unit,
    margins,
    bleed: Math.max(0, Math.round(opts.bleedPx ?? toPx(0.125, "in"))),
    pages: [{ id: uid(), background: "#ffffff", frames: [], guides: { x: [], y: [] } }],
  };
}
