import type { Unit } from "./types";

export const PX_PER_INCH = 96;
export const PX_PER_CM = 96 / 2.54; // ≈ 37.795
export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;

/** Convert a value in the given unit to internal pixels (96 dpi). */
export function toPx(v: number, u: Unit): number {
  switch (u) {
    case "in":
      return v * PX_PER_INCH;
    case "cm":
      return v * PX_PER_CM;
    case "mm":
      return (v / MM_PER_INCH) * PX_PER_INCH;
    case "pt":
      return (v / PT_PER_INCH) * PX_PER_INCH;
    default:
      return v;
  }
}

/** Convert internal pixels to the given unit. */
export function fromPx(px: number, u: Unit): number {
  switch (u) {
    case "in":
      return px / PX_PER_INCH;
    case "cm":
      return px / PX_PER_CM;
    case "mm":
      return (px / PX_PER_INCH) * MM_PER_INCH;
    case "pt":
      return (px / PX_PER_INCH) * PT_PER_INCH;
    default:
      return px;
  }
}

/** Format pixels as a rounded value string in the unit. */
export function fmtPx(px: number, u: Unit, decimals = 2): string {
  const v = fromPx(px, u);
  const f = Math.round(v * 10 ** decimals) / 10 ** decimals;
  return `${f}`;
}

/** Round a unit value nicely for display. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Ruler step candidates per unit: { px, label } pairs (major ticks).
 * Ordered small → large; the first whose on-screen size (px * zoom)
 * exceeds the minimum is chosen.
 */
export function rulerSteps(unit: Unit): { px: number; label: string }[] {
  switch (unit) {
    case "in":
      return [
        { px: 24, label: '¼"' },
        { px: 48, label: '½"' },
        { px: 96, label: '1"' },
        { px: 192, label: '2"' },
        { px: 384, label: '4"' },
        { px: 768, label: '8"' },
      ];
    case "cm": {
      const cm = (c: number) => ({
        px: c * PX_PER_CM,
        label: `${c}`,
      });
      return [cm(1), cm(2), cm(5), cm(10), cm(20), cm(50), cm(100)];
    }
    case "mm": {
      const mm = (m: number) => ({
        px: (m / MM_PER_INCH) * PX_PER_INCH,
        label: `${m}`,
      });
      return [mm(2), mm(5), mm(10), mm(20), mm(50), mm(100), mm(200)];
    }
    case "pt": {
      const pt = (p: number) => ({
        px: (p / PT_PER_INCH) * PX_PER_INCH,
        label: `${p}`,
      });
      return [pt(18), pt(36), pt(72), pt(144), pt(288), pt(576)];
    }
    default:
      return [10, 25, 50, 100, 250, 500, 1000].map((p) => ({
        px: p,
        label: `${p}`,
      }));
  }
}
