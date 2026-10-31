export type Unit = "in" | "cm" | "mm" | "pt" | "px";
export type FrameType = "text" | "image" | "shape";

/** Floor for auto-fit text — text never shrinks below this size. */
export const MIN_FONT_SIZE = 12;
/** Upper bound for the text outline (stroke) width in px. */
export const MAX_OUTLINE_WIDTH = 20;
/** Upper bound (absolute) for text drop-shadow offsets in px. */
export const MAX_SHADOW_OFFSET = 200;
/** Upper bound for the text drop-shadow blur radius in px. */
export const MAX_SHADOW_BLUR = 100;
/** px tolerance for snapping an image to the frame center while dragging. */
export const IMAGE_CENTER_SNAP = 6;

export type ShapeKind = "rect" | "ellipse" | "line";
export type ImageFit = "cover" | "contain" | "fill";
export type HAlign = "left" | "center" | "right" | "justify";
export type VAlign = "top" | "middle" | "bottom";
export type Tool =
  | "select"
  | "text"
  | "image"
  | "rect"
  | "ellipse"
  | "line";

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BaseFrame {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  locked: boolean;
}

export interface TextFrame extends BaseFrame {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  uppercase: boolean;
  align: HAlign;
  vAlign: VAlign;
  lineHeight: number;
  letterSpacing: number;
  color: string;
  /** Outline (stroke) width in px. 0 = no outline. */
  outlineWidth: number;
  /** Outline color, used when outlineWidth > 0. */
  outlineColor: string;
  /** Drop shadow horizontal offset in px (can be negative). */
  shadowOffsetX: number;
  /** Drop shadow vertical offset in px (can be negative). */
  shadowOffsetY: number;
  /** Drop shadow blur radius in px. 0 = hard-edged shadow. */
  shadowBlur: number;
  /** Drop shadow color. */
  shadowColor: string;
  fill: string;
  padding: number;
  /** Shrink the font so the text stays inside the box (never below MIN_FONT_SIZE). */
  autoFit: boolean;
  /** Spread line spacing so the text fills the box top to bottom. */
  fillHeight: boolean;
}

export interface ImageFrame extends BaseFrame {
  type: "image";
  src: string;
  fileName: string;
  fit: ImageFit;
  radius: number;
  /** Natural image width in px (captured on load). 0 = unknown. */
  imgW: number;
  /** Natural image height in px (captured on load). 0 = unknown. */
  imgH: number;
  /** Zoom of the image inside the frame. 1 = base fit (per `fit` mode). */
  scale: number;
  /** Horizontal pan of the image inside the frame, px from center. */
  offsetX: number;
  /** Vertical pan of the image inside the frame, px from center. */
  offsetY: number;
}

export interface ShapeFrame extends BaseFrame {
  type: "shape";
  shape: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
}

export type Frame = TextFrame | ImageFrame | ShapeFrame;

/**
 * User-placed guide lines for one page, in doc px relative to the page origin.
 * `x` holds vertical guides (constant x), `y` holds horizontal guides (constant y).
 */
export interface Guides {
  x: number[];
  y: number[];
}

export interface DocPage {
  id: string;
  background: string;
  frames: Frame[];
  /** Custom guide lines (optional — migrateDoc backfills older docs). */
  guides?: Guides;
}

export interface Doc {
  name: string;
  width: number;
  height: number;
  unit: Unit;
  margins: Margins;
  /** Bleed allowance in px on all sides (print-safe overflow zone). */
  bleed: number;
  pages: DocPage[];
}

export interface PagePreset {
  id: string;
  name: string;
  w: number;
  h: number;
  unit: Unit;
}

export const PAGE_PRESETS: PagePreset[] = [
  { id: "a4", name: "A4", w: 21, h: 29.7, unit: "cm" },
  { id: "letter", name: "US Letter", w: 8.5, h: 11, unit: "in" },
  { id: "legal", name: "US Legal", w: 8.5, h: 14, unit: "in" },
  { id: "tabloid", name: "Tabloid 11×17", w: 11, h: 17, unit: "in" },
  { id: "a3", name: "A3", w: 29.7, h: 42, unit: "cm" },
  { id: "a5", name: "A5", w: 14.8, h: 21, unit: "cm" },
  { id: "poster-13x19", name: 'Poster 13"×19"', w: 13, h: 19, unit: "in" },
  { id: "poster-18x24", name: 'Poster 18"×24"', w: 18, h: 24, unit: "in" },
  { id: "poster-24x36", name: 'Poster 24"×36"', w: 24, h: 36, unit: "in" },
  { id: "card", name: 'Business Card 3.5"×2"', w: 3.5, h: 2, unit: "in" },
  { id: "square-12", name: 'Square 12"×12"', w: 12, h: 12, unit: "in" },
];

export const FONT_FAMILIES: { group: string; fonts: string[] }[] = [
  {
    group: "Web fonts",
    fonts: [
      "Anton",
      "Bebas Neue",
      "DM Sans",
      "Inter",
      "Lora",
      "Merriweather",
      "Oswald",
      "Playfair Display",
    ],
  },
  {
    group: "System fonts",
    fonts: [
      "Arial",
      "Verdana",
      "Trebuchet MS",
      "Georgia",
      "Times New Roman",
      "Garamond",
      "Courier New",
      "Impact",
    ],
  },
];

export function fontStack(f: string): string {
  const generic =
    f === "Courier New"
      ? "monospace"
      : f === "Georgia" || f === "Times New Roman" || f === "Garamond"
        ? "serif"
        : "sans-serif";
  return `"${f}", ${generic}`;
}
