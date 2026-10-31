import type { Doc } from "./types";

/**
 * Snapping engine: collects candidate guide lines (page edges, bleed marks,
 * margin guides, other frames' edges/centers) and resolves the smallest
 * correction delta for the moving edges within a screen-space threshold.
 */

export interface SnapTargets {
  x: number[];
  y: number[];
}

export interface SnapOutcome {
  /** Correction to add to the raw movement delta. */
  dx: number;
  dy: number;
  /** Guide lines (doc px) the frame snapped to — for rendering. */
  vLines: number[];
  hLines: number[];
}

const EMPTY: SnapTargets = { x: [], y: [] };

/**
 * All snap lines for the active page: page edges, bleed marks (page bounds
 * extended by the bleed), margin guides, and every other frame's edges and
 * centers. Coordinates are document px relative to the page origin.
 */
export function collectSnapTargets(
  doc: Doc,
  pageIdx: number,
  excludeIds: Set<string>,
): SnapTargets {
  const page = doc.pages[Math.min(pageIdx, doc.pages.length - 1)];
  if (!page) return EMPTY;

  const xs: number[] = [0, doc.width];
  const ys: number[] = [0, doc.height];

  const b = doc.bleed;
  if (b > 0) {
    xs.push(-b, doc.width + b);
    ys.push(-b, doc.height + b);
  }

  const m = doc.margins;
  if (m.left > 0) xs.push(m.left);
  if (doc.width - m.right > 0 && m.right > 0) xs.push(doc.width - m.right);
  if (m.top > 0) ys.push(m.top);
  if (doc.height - m.bottom > 0 && m.bottom > 0) ys.push(doc.height - m.bottom);

  // user-placed page guides
  if (page.guides) {
    xs.push(...page.guides.x);
    ys.push(...page.guides.y);
  }

  for (const f of page.frames) {
    if (excludeIds.has(f.id)) continue;
    xs.push(f.x, f.x + f.w / 2, f.x + f.w);
    ys.push(f.y, f.y + f.h / 2, f.y + f.h);
  }

  return { x: xs, y: ys };
}

/**
 * Snap a set of moving edge positions against target lines.
 * `positions` are the moving candidates (e.g. [left, centerX, right]).
 * Returns the single smallest correction (one target wins per axis) and the
 * target lines that were matched, or a null delta when nothing is in range.
 */
export function snapAxis(
  positions: number[],
  targets: number[],
  threshold: number,
): { delta: number; lines: number[] } {
  let best = threshold;
  let bestDelta = 0;
  const lines: number[] = [];
  for (const p of positions) {
    for (const t of targets) {
      const d = t - p;
      const ad = Math.abs(d);
      if (ad <= threshold && ad < best) {
        best = ad;
        bestDelta = d;
      }
    }
  }
  if (bestDelta !== 0) {
    for (const p of positions) {
      for (const t of targets) {
        if (Math.abs(t - (p + bestDelta)) < 0.01) lines.push(t);
      }
    }
  }
  return { delta: bestDelta, lines: Array.from(new Set(lines)) };
}

/** Deduplicated guide lines snapshot for the store's transient snap state. */
export function sameGuides(
  a: { v: number[]; h: number[] },
  b: { v: number[]; h: number[] },
): boolean {
  return (
    a.v.length === b.v.length &&
    a.h.length === b.h.length &&
    a.v.every((x, i) => x === b.v[i]) &&
    a.h.every((y, i) => y === b.h[i])
  );
}
