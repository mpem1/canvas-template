"use client";

import { useEffect, useState } from "react";
import { MIN_FONT_SIZE, fontStack } from "./types";
import type { TextFrame } from "./types";

/**
 * Offscreen text measurement + auto-fit math.
 *
 * A single shared detached <div> measures how tall a text block renders at a
 * given font size inside a fixed width. Auto-fit binary-searches the largest
 * font size (never below MIN_FONT_SIZE) whose block fits the box; fill-height
 * derives the per-line spacing that makes the block span the box top to bottom.
 */

interface MeasureOpts {
  text: string;
  fontFamily: string; // full CSS stack
  fontSize: number;
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  letterSpacing: number;
  lineHeightPx: number;
  widthPx: number;
}

let measurer: HTMLDivElement | null = null;

function getMeasurer(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  if (!measurer) {
    measurer = document.createElement("div");
    measurer.setAttribute("aria-hidden", "true");
    const s = measurer.style;
    s.position = "absolute";
    s.left = "-99999px";
    s.top = "0";
    s.visibility = "hidden";
    s.pointerEvents = "none";
    s.whiteSpace = "pre-wrap";
    s.wordBreak = "break-word";
    s.boxSizing = "border-box";
    document.body.appendChild(measurer);
  }
  return measurer;
}

/** Height (px) the text occupies when laid out in `widthPx`. */
export function measureTextHeight(o: MeasureOpts): number {
  const el = getMeasurer();
  if (!el) return 0;
  const s = el.style;
  s.width = `${Math.max(4, o.widthPx)}px`;
  s.fontFamily = o.fontFamily;
  s.fontSize = `${o.fontSize}px`;
  s.fontWeight = o.bold ? "700" : "400";
  s.fontStyle = o.italic ? "italic" : "normal";
  s.textTransform = o.uppercase ? "uppercase" : "none";
  s.letterSpacing = `${o.letterSpacing}px`;
  s.lineHeight = `${o.lineHeightPx}px`;
  el.textContent = o.text;
  return el.offsetHeight;
}

export interface TextLayout {
  /** Font size to render at (auto-fit may shrink it, floored at MIN_FONT_SIZE). */
  fontSize: number;
  /** Line height in px, or null to use the frame's multiplier. */
  lineHeightPx: number | null;
  /** True when the rendered block does not fit the box (Scribus-style warning). */
  overflows: boolean;
  /** Number of wrapped lines at `fontSize`. */
  lineCount: number;
  /** True when auto-fit had to clamp at the 12px floor. */
  atFloor: boolean;
}

/** Only the text-frame fields the layout math needs. */
export type TextLayoutParams = Pick<
  TextFrame,
  | "text"
  | "fontFamily"
  | "fontSize"
  | "bold"
  | "italic"
  | "uppercase"
  | "lineHeight"
  | "letterSpacing"
  | "autoFit"
  | "fillHeight"
  | "w"
  | "h"
  | "padding"
>;

const EPS = 0.5; // px tolerance for "fits"

/** Resolves true once webfonts have finished loading (re-measure trigger). */
export function useFontsReady(): boolean {
  // when the Font Loading API is unavailable there is nothing to wait for
  const [ready, setReady] = useState(() => {
    if (typeof document === "undefined") return true;
    return !(document as Document & { fonts?: FontFaceSet }).fonts;
  });
  useEffect(() => {
    if (ready) return;
    let alive = true;
    (document as Document & { fonts?: FontFaceSet }).fonts?.ready
      .then(() => {
        if (alive) setReady(true);
      })
      .catch(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [ready]);
  return ready;
}

/**
 * Derive the effective render layout for a text frame.
 * `fontsReady` re-triggers measurement after webfonts finish loading.
 */
export function computeTextLayout(p: TextLayoutParams, fontsReady: boolean): TextLayout {
  void fontsReady; // dependency marker — measurement re-runs when fonts load
  const availW = p.w - p.padding * 2;
  const availH = p.h - p.padding * 2;
  const widthPx = Math.max(4, availW);
  const stack = fontStack(p.fontFamily);
  const common = {
    text: p.text,
    fontFamily: stack,
    bold: p.bold,
    italic: p.italic,
    uppercase: p.uppercase,
    letterSpacing: p.letterSpacing,
    widthPx,
  };

  if (!p.text.trim()) {
    return {
      fontSize: p.fontSize,
      lineHeightPx: null,
      overflows: false,
      lineCount: 0,
      atFloor: false,
    };
  }

  const fits = (size: number, lhPx: number): boolean =>
    measureTextHeight({ ...common, fontSize: size, lineHeightPx: lhPx }) <= availH + EPS;

  // 1) resolve font size
  let size = p.fontSize;
  let atFloor = false;
  if (p.autoFit && availH > 0) {
    const normalLh = (s: number) => s * p.lineHeight;
    if (!fits(size, normalLh(size))) {
      if (fits(MIN_FONT_SIZE, normalLh(MIN_FONT_SIZE))) {
        // binary search the largest size in [MIN_FONT_SIZE, size] that fits
        let lo = MIN_FONT_SIZE;
        let hi = size;
        for (let i = 0; i < 14; i++) {
          const mid = (lo + hi) / 2;
          if (fits(mid, normalLh(mid))) lo = mid;
          else hi = mid;
        }
        size = Math.round(lo * 2) / 2; // snap to 0.5px steps
      } else {
        size = MIN_FONT_SIZE;
        atFloor = true;
      }
    }
  }

  // 2) resolve line spacing
  const lineH1 = measureTextHeight({
    ...common,
    fontSize: size,
    lineHeightPx: size, // line-height 1 → each line box is exactly `size` tall
  });
  const lineCount = Math.max(1, Math.round(lineH1 / size));

  let lineHeightPx: number | null = null;
  if (p.fillHeight && availH > 0) {
    const spread = availH / lineCount;
    // never tighten lines below line-height 1 — glyphs would overlap
    lineHeightPx = Math.max(spread, size);
  }

  // 3) overflow check with the final metrics
  const finalLh = lineHeightPx ?? size * p.lineHeight;
  const overflows = !fits(size, finalLh);

  return { fontSize: size, lineHeightPx, overflows, lineCount, atFloor };
}
