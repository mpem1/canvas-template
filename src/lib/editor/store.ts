"use client";

import { create } from "zustand";
import { createDoc, migrateDoc, migrateFrame, uid } from "./factory";
import { idbGet, idbPut, openIdb } from "./idb";
import { sameGuides } from "./snap";
import type { Doc, Frame, Guides, Tool, Unit } from "./types";

const STORAGE_KEY = "pageforge-doc-v1";
const MAX_HISTORY = 80;

/**
 * Screen-space width of the dotted pasteboard drawn around the pages
 * (Canvas lays pages out with this padding on every side).
 */
export const PASTEBOARD_PX = 120;

/**
 * Screen-space gap Canvas leaves between stacked pages (Canvas imports this —
 * single source of truth). Guides may extend into the gap, but never across
 * the neighboring page on the far side of it.
 */
export const PAGE_GAP_PX = 64;

/**
 * Guides may live past the page edges on the pasteboard so they stay visible
 * and grabbable if they get dragged off the page. The overshoot mirrors the
 * visible pasteboard at the current zoom, so a guide can never be dragged
 * beyond the area where it would still be on screen.
 */
export function guideBounds(max: number, zoom: number): [number, number] {
  const over = PASTEBOARD_PX / Math.max(zoom, 0.05);
  return [-over, max + over];
}

/**
 * Position bounds for HORIZONTAL guides of one page. Vertically the pages are
 * stacked, so "past the edge" space is limited: the full pasteboard above the
 * first page / below the last page, but only the inter-page gap between
 * neighbors — a horizontal guide dragged further would be drawn straight
 * across a neighboring page that may not use the same guides (user report).
 * Vertical guides are unconstrained this way: in the single-column layout
 * there is no page to the left or right, so guideBounds() still applies.
 */
export function hGuideBounds(
  docH: number,
  zoom: number,
  isFirst: boolean,
  isLast: boolean,
): [number, number] {
  const z = Math.max(zoom, 0.05);
  const overTop = (isFirst ? PASTEBOARD_PX : PAGE_GAP_PX) / z;
  const overBottom = (isLast ? PASTEBOARD_PX : PAGE_GAP_PX) / z;
  return [-overTop, docH + overBottom];
}

export const DEFAULT_GUIDE_COLOR = "#10b981";

export type AlignMode =
  | "left"
  | "hcenter"
  | "right"
  | "top"
  | "vcenter"
  | "bottom";

interface EditorState {
  doc: Doc | null;
  hydrated: boolean;
  pageIdx: number;
  selection: string[];
  editingId: string | null;
  tool: Tool;
  zoom: number;
  showGuides: boolean;
  showRulers: boolean;
  /** Master switch for edge snapping (bleed / margins / page / frames). */
  snapEnabled: boolean;
  /** Transient snap guide lines for the active page (doc px), not persisted. */
  snapGuides: { v: number[]; h: number[] };
  panMode: boolean;
  /** "Page guides" dialog visibility (transient UI state). */
  guidesOpen: boolean;
  /** Color of user-placed guide lines (UI preference, not part of the doc). */
  guideColor: string;
  imagePickerFor: string | null;
  /** Frame whose inner image is being adjusted (pan / zoom inside the box). */
  imageAdjustId: string | null;
  exporting: boolean;
  past: Doc[];
  future: Doc[];
  clipboard: Frame[] | null;

  hydrate: () => Promise<void>;
  restoreSaved: () => Promise<boolean>;

  setDoc: (d: Doc) => void;
  updateDocProps: (p: Partial<Pick<Doc, "name" | "width" | "height" | "unit">>) => void;
  updateMargins: (m: Partial<Doc["margins"]>) => void;
  updateBleed: (px: number) => void;
  setPageBackground: (c: string) => void;

  setTool: (t: Tool) => void;
  setZoom: (z: number) => void;
  fitZoom: (vw: number, vh: number) => void;
  toggleGuides: () => void;
  toggleRulers: () => void;
  toggleSnap: () => void;
  setSnapGuides: (g: { v: number[]; h: number[] }) => void;
  setPanMode: (v: boolean) => void;
  setGuidesOpen: (v: boolean) => void;
  /** Add a user guide on the active page: "v" = vertical (x), "h" = horizontal (y). */
  addGuide: (axis: "v" | "h", pos: number) => void;
  /** Remove guides within ~1px of pos on the active page. */
  removeGuide: (axis: "v" | "h", pos: number) => void;
  /** Move the guide nearest to `from` to `to` (no history — drag pushes its own snapshot). */
  moveGuide: (axis: "v" | "h", from: number, to: number) => void;
  /** Clear guides on the active page or on every page. */
  clearGuides: (scope: "page" | "doc") => void;
  /** Clamp every off-page guide of the active page back into the page. Returns how many moved. */
  recoverOutGuides: () => number;
  setGuideColor: (c: string) => void;
  setImagePickerFor: (id: string | null) => void;
  setImageAdjust: (id: string | null) => void;
  setExporting: (v: boolean) => void;

  select: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  setEditing: (id: string | null) => void;

  pushSnapshot: (d: Doc) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  addFrame: (f: Frame) => void;
  updateFrames: (ids: string[], fn: (f: Frame) => void, record?: boolean) => void;
  /**
   * Live text sync while the user types (debounced, no history of its own).
   * `first` = first change of this editing session; pushes the pre-edit
   * snapshot exactly once so undo still returns to the original text.
   */
  syncText: (id: string, text: string, first: boolean) => void;
  /** Page-independent text commit from the inline text editor. */
  commitText: (id: string, text: string, liveSynced?: boolean) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  paste: () => void;
  nudgeSelection: (dx: number, dy: number) => void;
  reorderSelection: (mode: "front" | "back" | "forward" | "backward") => void;

  align: (mode: AlignMode) => void;
  distribute: (axis: "h" | "v") => void;

  setPageIdx: (i: number) => void;
  addPage: () => void;
  duplicatePage: (i: number) => void;
  deletePage: (i: number) => void;
  movePage: (from: number, to: number) => void;
}

type Get = () => EditorState;
type Set = (partial: Partial<EditorState>) => void;

/**
 * Clone the doc, apply the mutator, optionally record a history step.
 * Any doc mutation invalidates the redo stack (future) — otherwise a
 * record=false gesture (drag, live text sync) could silently revive stale
 * redo states.
 */
function edit(get: Get, set: Set, mutator: (d: Doc) => void, record = true) {
  const { doc, past } = get();
  if (!doc) return;
  const next = structuredClone(doc) as Doc;
  mutator(next);
  if (record) {
    set({ doc: next, past: [...past.slice(-(MAX_HISTORY - 1)), doc], future: [] });
  } else {
    set({ doc: next, future: [] });
  }
}

function currentPageOf(d: Doc, pageIdx: number) {
  return d.pages[Math.min(pageIdx, d.pages.length - 1)];
}

function sanitizeSelection(d: Doc, pageIdx: number, sel: string[]): string[] {
  const page = currentPageOf(d, pageIdx);
  const ids = new Set(page.frames.map((f) => f.id));
  return sel.filter((id) => ids.has(id));
}

export const useEditor = create<EditorState>((set, get) => ({
  doc: null,
  hydrated: false,
  pageIdx: 0,
  selection: [],
  editingId: null,
  tool: "select",
  zoom: 0.5,
  showGuides: true,
  showRulers: true,
  snapEnabled: true,
  snapGuides: { v: [], h: [] },
  panMode: false,
  guidesOpen: false,
  guideColor: DEFAULT_GUIDE_COLOR,
  imagePickerFor: null,
  imageAdjustId: null,
  exporting: false,
  past: [],
  future: [],
  clipboard: null,

  hydrate: async () => {
    if (get().hydrated) return;
    const looksValid = (d: unknown): d is Doc => {
      const o = d as Doc;
      return !!o && Array.isArray(o.pages) && o.pages.length > 0 && typeof o.width === "number";
    };
    let stored: Doc | null = null;
    // autosave lives in IndexedDB — localStorage's ~5MB quota cannot hold a
    // PSD-imported document (layer canvases are multi-MB data URLs)
    try {
      const db = await openAutosaveDb();
      const fromIdb = await idbGet<Doc>(db, "kv", "doc");
      if (looksValid(fromIdb)) stored = fromIdb;
    } catch {
      // IndexedDB unavailable — legacy localStorage below
    }
    if (!stored) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Doc;
          if (looksValid(parsed)) {
            stored = parsed;
            // migrate into IndexedDB, then drop the legacy copy (double-truth)
            try {
              const db = await openAutosaveDb();
              await idbPut(db, "kv", parsed, "doc");
              localStorage.removeItem(STORAGE_KEY);
            } catch {
              // keep the localStorage copy
            }
          }
        }
      } catch {
        // corrupted storage — ignore
      }
    }
    // a doc may have been set while storage was being read (restore/E2E race)
    // — never clobber it, just finish hydration
    if (stored && !get().doc) {
      set({ doc: migrateDoc(stored), pageIdx: 0, past: [], future: [] });
    }
    set({ hydrated: true });
  },

  restoreSaved: async () => {
    const looksValid = (d: unknown): d is Doc => {
      const o = d as Doc;
      return !!o && Array.isArray(o.pages) && o.pages.length > 0;
    };
    try {
      const db = await openAutosaveDb();
      const fromIdb = await idbGet<Doc>(db, "kv", "doc");
      if (looksValid(fromIdb)) {
        set({ doc: migrateDoc(fromIdb), pageIdx: 0, selection: [], past: [], future: [] });
        return true;
      }
    } catch {
      // fall through to legacy
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const doc = JSON.parse(raw) as Doc;
      if (looksValid(doc)) {
        set({ doc: migrateDoc(doc), pageIdx: 0, selection: [], past: [], future: [] });
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  },

  setDoc: (d) =>
    set({
      doc: migrateDoc(d),
      pageIdx: 0,
      selection: [],
      editingId: null,
      imageAdjustId: null,
      past: get().doc ? [...get().past, get().doc as Doc] : [],
      future: [],
    }),

  updateDocProps: (p) =>
    edit(get, set, (d) => {
      if (p.name !== undefined) d.name = p.name;
      if (p.unit !== undefined) d.unit = p.unit;
      if (p.width !== undefined) d.width = Math.max(16, Math.round(p.width));
      if (p.height !== undefined) d.height = Math.max(16, Math.round(p.height));
    }),

  updateMargins: (m) =>
    edit(get, set, (d) => {
      d.margins = { ...d.margins, ...m };
    }),

  updateBleed: (px) =>
    edit(get, set, (d) => {
      d.bleed = Math.max(0, Math.round(px));
    }),

  setPageBackground: (c) =>
    edit(get, set, (d) => {
      currentPageOf(d, get().pageIdx).background = c;
    }),

  setTool: (t) => set({ tool: t, editingId: null }),
  setZoom: (z) => set({ zoom: Math.min(4, Math.max(0.05, z)) }),
  fitZoom: (vw, vh) => {
    const { doc } = get();
    if (!doc) return;
    const z = Math.min((vw - 120) / doc.width, (vh - 120) / doc.height, 1.5);
    set({ zoom: Math.max(0.05, Math.round(z * 100) / 100) });
  },
  toggleGuides: () => set({ showGuides: !get().showGuides }),
  toggleRulers: () => set({ showRulers: !get().showRulers }),
  toggleSnap: () =>
    set({ snapEnabled: !get().snapEnabled, snapGuides: { v: [], h: [] } }),
  setSnapGuides: (g) => {
    const cur = get().snapGuides;
    if (!sameGuides(cur, g)) set({ snapGuides: g });
  },
  setPanMode: (v) => set({ panMode: v }),
  setGuidesOpen: (v) => set({ guidesOpen: v }),
  addGuide: (axis, pos) => {
    const { doc, pageIdx } = get();
    if (!doc) return;
    const page = currentPageOf(doc, pageIdx);
    const arr = axis === "v" ? (page.guides?.x ?? []) : (page.guides?.y ?? []);
    /* clamp into the axis bounds — horizontal guides may never land on a
     * neighboring page's band (dialog/ruler validate first; this is the net) */
    let p = Math.round(pos * 100) / 100;
    const [lo, hi] =
      axis === "v"
        ? guideBounds(doc.width, get().zoom)
        : hGuideBounds(
            doc.height,
            get().zoom,
            pageIdx === 0,
            pageIdx === doc.pages.length - 1,
          );
    p = Math.max(lo, Math.min(hi, p));
    if (arr.some((v) => Math.abs(v - p) < 0.5)) return; // duplicate — no history churn
    edit(get, set, (d) => {
      const pg = currentPageOf(d, pageIdx);
      const g: Guides = pg.guides ?? { x: [], y: [] };
      const list = axis === "v" ? g.x : g.y;
      list.push(p);
      list.sort((a, b) => a - b);
      pg.guides = g;
    });
  },
  removeGuide: (axis, pos) => {
    const { doc, pageIdx } = get();
    if (!doc) return;
    const page = currentPageOf(doc, pageIdx);
    const arr = axis === "v" ? (page.guides?.x ?? []) : (page.guides?.y ?? []);
    if (!arr.some((v) => Math.abs(v - pos) < 1)) return; // nothing to remove
    edit(get, set, (d) => {
      const pg = currentPageOf(d, pageIdx);
      if (!pg.guides) return;
      if (axis === "v") pg.guides.x = pg.guides.x.filter((v) => Math.abs(v - pos) >= 1);
      else pg.guides.y = pg.guides.y.filter((v) => Math.abs(v - pos) >= 1);
    });
  },
  moveGuide: (axis, from, to) => {
    const { doc, pageIdx } = get();
    if (!doc) return;
    const page = currentPageOf(doc, pageIdx);
    const arr = axis === "v" ? (page.guides?.x ?? []) : (page.guides?.y ?? []);
    if (!arr.some((v) => Math.abs(v - from) < 1.5)) return; // guide vanished (undo mid-drag)
    const [lo, hi] =
      axis === "v"
        ? guideBounds(doc.width, get().zoom)
        : hGuideBounds(
            doc.height,
            get().zoom,
            pageIdx === 0,
            pageIdx === doc.pages.length - 1,
          );
    const t = Math.max(lo, Math.min(hi, Math.round(to * 100) / 100));
    edit(
      get,
      set,
      (d) => {
        const pg = currentPageOf(d, pageIdx);
        if (!pg.guides) return;
        const list = axis === "v" ? pg.guides.x : pg.guides.y;
        let best = 1.5;
        let idx = -1;
        for (let i = 0; i < list.length; i++) {
          const dist = Math.abs(list[i] - from);
          if (dist < best) {
            best = dist;
            idx = i;
          }
        }
        if (idx >= 0) list[idx] = t;
      },
      false,
    );
  },
  clearGuides: (scope) => {
    const { doc, pageIdx } = get();
    if (!doc) return;
    const dirty =
      scope === "doc"
        ? doc.pages.some((p) => (p.guides?.x.length ?? 0) + (p.guides?.y.length ?? 0) > 0)
        : (currentPageOf(doc, pageIdx).guides?.x.length ?? 0) +
            (currentPageOf(doc, pageIdx).guides?.y.length ?? 0) >
          0;
    if (!dirty) return;
    edit(get, set, (d) => {
      if (scope === "doc") {
        for (const p of d.pages) p.guides = { x: [], y: [] };
      } else {
        currentPageOf(d, pageIdx).guides = { x: [], y: [] };
      }
    });
  },
  recoverOutGuides: () => {
    const { doc, pageIdx } = get();
    if (!doc) return 0;
    const page = currentPageOf(doc, pageIdx);
    if (!page.guides) return 0;
    const out =
      page.guides.x.some((v) => v < 0 || v > doc.width) ||
      page.guides.y.some((v) => v < 0 || v > doc.height);
    if (!out) return 0;
    let moved = 0;
    edit(get, set, (d) => {
      const pg = currentPageOf(d, pageIdx);
      if (!pg.guides) return;
      pg.guides.x = pg.guides.x.map((v) => {
        if (v < 0 || v > doc.width) {
          moved++;
          return Math.max(0, Math.min(doc.width, v));
        }
        return v;
      });
      pg.guides.y = pg.guides.y.map((v) => {
        if (v < 0 || v > doc.height) {
          moved++;
          return Math.max(0, Math.min(doc.height, v));
        }
        return v;
      });
    });
    return moved;
  },
  setGuideColor: (c) => set({ guideColor: c }),
  setImagePickerFor: (id) => set({ imagePickerFor: id }),
  setImageAdjust: (id) =>
    set({ imageAdjustId: id, editingId: id ? null : get().editingId }),
  setExporting: (v) => set({ exporting: v }),

  select: (ids) => set({ selection: ids, editingId: null }),
  toggleSelect: (id) => {
    const sel = get().selection;
    set({
      selection: sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id],
    });
  },
  selectAll: () => {
    const { doc, pageIdx } = get();
    if (!doc) return;
    set({ selection: currentPageOf(doc, pageIdx).frames.map((f) => f.id) });
  },
  setEditing: (id) => {
    set({
      editingId: id,
      imageAdjustId: id ? null : get().imageAdjustId,
      selection: id ? [id] : get().selection,
      tool: id ? "select" : get().tool,
    });
  },

  pushSnapshot: (d) => set({ past: [...get().past.slice(-(MAX_HISTORY - 1)), d], future: [] }),
  pushHistory: () => {
    const { doc } = get();
    if (doc) set({ past: [...get().past.slice(-(MAX_HISTORY - 1)), doc], future: [] });
  },

  undo: () => {
    const { past, future, doc } = get();
    if (!past.length || !doc) return;
    const prev = past[past.length - 1];
    const pageIdx = Math.min(get().pageIdx, prev.pages.length - 1);
    set({
      doc: prev,
      past: past.slice(0, -1),
      future: [...future.slice(-(MAX_HISTORY - 1)), doc],
      pageIdx,
      selection: sanitizeSelection(prev, pageIdx, get().selection),
      editingId: null,
    });
  },

  redo: () => {
    const { past, future, doc } = get();
    if (!future.length || !doc) return;
    const next = future[future.length - 1];
    const pageIdx = Math.min(get().pageIdx, next.pages.length - 1);
    set({
      doc: next,
      past: [...past.slice(-(MAX_HISTORY - 1)), doc],
      future: future.slice(0, -1),
      pageIdx,
      selection: sanitizeSelection(next, pageIdx, get().selection),
      editingId: null,
    });
  },

  addFrame: (fr) => {
    const f = migrateFrame(fr); // field-complete even for hand-built frames
    const id = f.id;
    edit(get, set, (d) => {
      currentPageOf(d, get().pageIdx).frames.push(f);
    });
    set({ selection: [id] });
  },

  updateFrames: (ids, fn, record = true) =>
    edit(
      get,
      set,
      (d) => {
        const idSet = new Set(ids);
        for (const f of currentPageOf(d, get().pageIdx).frames) {
          if (idSet.has(f.id)) fn(f);
        }
      },
      record,
    ),

  /*
   * Text writes are resolved across ALL pages (ids are unique doc-wide) because
   * they can arrive from EditableText's blur/unmount cleanup AFTER the store
   * state that ended the edit (page switch, addPage, tool change...). Resolving
   * by the CURRENT pageIdx misses and silently drops the typed text — the
   * classic "my text reverted" bug.
   *
   * syncText keeps the store in sync DURING typing (debounced ~250ms) so the
   * typed text can never be lost, whatever ends the edit session; the pre-edit
   * snapshot is pushed once per session so undo still works. commitText lands
   * the final text and records history only when no live sync happened.
   */
  syncText: (id, text, first) => {
    const { doc } = get();
    if (!doc) return;
    const dirty = doc.pages.some(
      (p) => p.frames.some((f) => f.id === id && f.type === "text" && f.text !== text),
    );
    if (!dirty) return;
    if (first) get().pushSnapshot(doc); // exactly one pre-edit snapshot per session
    edit(get, set, (d) => {
      for (const page of d.pages) {
        const f = page.frames.find((x) => x.id === id);
        if (f && f.type === "text") {
          f.text = text;
          return;
        }
      }
    }, false);
  },

  commitText: (id, text, liveSynced = false) => {
    const { doc } = get();
    if (!doc) return;
    const dirty = doc.pages.some((p) =>
      p.frames.some((f) => f.id === id && f.type === "text" && f.text !== text),
    );
    if (!dirty) return; // unchanged text or frame gone — no history churn
    edit(
      get,
      set,
      (d) => {
        for (const page of d.pages) {
          const f = page.frames.find((x) => x.id === id);
          if (f && f.type === "text") {
            f.text = text;
            return;
          }
        }
      },
      !liveSynced, // live sync already pushed the pre-edit snapshot
    );
  },

  deleteSelection: () => {
    const sel = new Set(get().selection);
    if (!sel.size) return;
    edit(get, set, (d) => {
      const page = currentPageOf(d, get().pageIdx);
      page.frames = page.frames.filter((f) => !sel.has(f.id));
    });
    set({ selection: [], editingId: null });
  },

  duplicateSelection: () => {
    const { doc, pageIdx, selection } = get();
    if (!doc || !selection.length) return;
    const page = currentPageOf(doc, pageIdx);
    const copies = page.frames
      .filter((f) => selection.includes(f.id))
      .map((f) => ({ ...structuredClone(f), id: uid(), x: f.x + 16, y: f.y + 16 }) as Frame);
    if (!copies.length) return;
    edit(get, set, (d) => {
      currentPageOf(d, pageIdx).frames.push(...copies);
    });
    set({ selection: copies.map((c) => c.id) });
  },

  copySelection: () => {
    const { doc, pageIdx, selection } = get();
    if (!doc) return;
    const frames = currentPageOf(doc, pageIdx).frames.filter((f) =>
      selection.includes(f.id),
    );
    if (frames.length) set({ clipboard: structuredClone(frames) as Frame[] });
  },

  cutSelection: () => {
    get().copySelection();
    get().deleteSelection();
  },

  paste: () => {
    const { clipboard, doc, pageIdx } = get();
    if (!clipboard || !clipboard.length || !doc) return;
    const copies = clipboard.map(
      (f) => ({ ...structuredClone(f), id: uid(), x: f.x + 20, y: f.y + 20 }) as Frame,
    );
    edit(get, set, (d) => {
      currentPageOf(d, pageIdx).frames.push(...copies);
    });
    set({ selection: copies.map((c) => c.id) });
  },

  nudgeSelection: (dx, dy) => {
    const sel = new Set(get().selection);
    if (!sel.size) return;
    edit(get, set, (d) => {
      for (const f of currentPageOf(d, get().pageIdx).frames) {
        if (sel.has(f.id) && !f.locked) {
          f.x += dx;
          f.y += dy;
        }
      }
    });
  },

  reorderSelection: (mode) => {
    const sel = new Set(get().selection);
    if (!sel.size) return;
    edit(get, set, (d) => {
      const page = currentPageOf(d, get().pageIdx);
      const picked = page.frames.filter((f) => sel.has(f.id) && !f.locked);
      if (!picked.length) return;
      const rest = page.frames.filter((f) => !(sel.has(f.id) && !f.locked));
      if (mode === "front") page.frames = [...rest, ...picked];
      else if (mode === "back") page.frames = [...picked, ...rest];
      else if (mode === "forward") {
        // move selected frames one position later (towards top), last-first
        const idxs = page.frames
          .map((f, i) => (sel.has(f.id) && !f.locked ? i : -1))
          .filter((i) => i >= 0);
        for (let k = idxs.length - 1; k >= 0; k--) {
          const i = idxs[k];
          if (i < page.frames.length - 1) {
            const [f] = page.frames.splice(i, 1);
            page.frames.splice(i + 1, 0, f);
          }
        }
      } else {
        // move selected frames one position earlier (towards bottom), first-last
        const idxs = page.frames
          .map((f, i) => (sel.has(f.id) && !f.locked ? i : -1))
          .filter((i) => i >= 0);
        for (let k = 0; k < idxs.length; k++) {
          const i = idxs[k];
          if (i > 0) {
            const [f] = page.frames.splice(i, 1);
            page.frames.splice(i - 1, 0, f);
          }
        }
      }
    });
  },

  align: (mode) => {
    const { doc, pageIdx, selection } = get();
    if (!doc || !selection.length) return;
    edit(get, set, (d) => {
      const page = currentPageOf(d, pageIdx);
      const sel = page.frames.filter((f) => selection.includes(f.id) && !f.locked);
      if (!sel.length) return;
      const single = sel.length === 1;
      const minX = single ? 0 : Math.min(...sel.map((f) => f.x));
      const maxX = single
        ? doc.width
        : Math.max(...sel.map((f) => f.x + f.w));
      const minY = single ? 0 : Math.min(...sel.map((f) => f.y));
      const maxY = single
        ? doc.height
        : Math.max(...sel.map((f) => f.y + f.h));
      for (const f of sel) {
        switch (mode) {
          case "left":
            f.x = minX;
            break;
          case "right":
            f.x = maxX - f.w;
            break;
          case "hcenter":
            f.x = (minX + maxX) / 2 - f.w / 2;
            break;
          case "top":
            f.y = minY;
            break;
          case "bottom":
            f.y = maxY - f.h;
            break;
          case "vcenter":
            f.y = (minY + maxY) / 2 - f.h / 2;
            break;
        }
      }
    });
  },

  distribute: (axis) => {
    const { doc, pageIdx, selection } = get();
    if (!doc || !selection.length) return;
    edit(get, set, (d) => {
      const page = currentPageOf(d, pageIdx);
      const sel = page.frames
        .filter((f) => selection.includes(f.id) && !f.locked)
        .sort((a, b) => (axis === "h" ? a.x - b.x : a.y - b.y));
      const n = sel.length;
      if (n < 2) return;

      if (n === 2) {
        // Two frames: spread to the printable area (inside margins)
        const m = doc.margins;
        if (axis === "h") {
          sel[0].x = m.left;
          sel[1].x = doc.width - m.right - sel[1].w;
        } else {
          sel[0].y = m.top;
          sel[1].y = doc.height - m.bottom - sel[1].h;
        }
        return;
      }

      if (axis === "h") {
        const first = sel[0];
        const last = sel[n - 1];
        const span = last.x + last.w - first.x;
        const totalW = sel.reduce((s, f) => s + f.w, 0);
        const gap = n > 1 ? (span - totalW) / (n - 1) : 0;
        let cursor = first.x;
        for (const f of sel) {
          f.x = Math.round(cursor);
          cursor += f.w + gap;
        }
      } else {
        const first = sel[0];
        const last = sel[n - 1];
        const span = last.y + last.h - first.y;
        const totalH = sel.reduce((s, f) => s + f.h, 0);
        const gap = n > 1 ? (span - totalH) / (n - 1) : 0;
        let cursor = first.y;
        for (const f of sel) {
          f.y = Math.round(cursor);
          cursor += f.h + gap;
        }
      }
    });
  },

  setPageIdx: (i) =>
    set({
      pageIdx: Math.max(0, Math.min(i, (get().doc?.pages.length ?? 1) - 1)),
      selection: [],
      editingId: null,
      imageAdjustId: null,
    }),

  addPage: () => {
    edit(get, set, (d) => {
      d.pages.splice(get().pageIdx + 1, 0, {
        id: uid(),
        background: "#ffffff",
        frames: [],
        guides: { x: [], y: [] },
      });
    });
    set({ pageIdx: get().pageIdx + 1, selection: [] });
  },

  duplicatePage: (i) => {
    const { doc } = get();
    if (!doc || i < 0 || i >= doc.pages.length) return;
    const copy = structuredClone(doc.pages[i]);
    copy.id = uid();
    for (const f of copy.frames) f.id = uid();
    edit(get, set, (d) => {
      d.pages.splice(i + 1, 0, copy);
    });
    set({ pageIdx: i + 1, selection: [] });
  },

  deletePage: (i) => {
    const { doc } = get();
    if (!doc || doc.pages.length <= 1) return;
    edit(get, set, (d) => {
      d.pages.splice(i, 1);
    });
    set({ pageIdx: Math.max(0, Math.min(i, get().doc!.pages.length - 1)), selection: [], editingId: null });
  },

  movePage: (from, to) => {
    const { doc } = get();
    if (!doc || from === to) return;
    if (from < 0 || from >= doc.pages.length) return;
    edit(get, set, (d) => {
      const [p] = d.pages.splice(from, 1);
      d.pages.splice(Math.max(0, Math.min(to, d.pages.length)), 0, p);
    });
    set({ pageIdx: Math.max(0, Math.min(to, get().doc!.pages.length - 1)), selection: [] });
  },
}));

/**
 * Debounced autosave subscription — call once after hydration.
 *
 * The document is written to IndexedDB (key "doc"): it routinely contains
 * multi-MB image data URLs (PSD import) that exceed localStorage's quota.
 */
let autosaveDb: Promise<IDBDatabase> | null = null;
function openAutosaveDb(): Promise<IDBDatabase> {
  if (!autosaveDb) {
    autosaveDb = openIdb("pageforge-autosave", 1, (db) => {
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    });
    autosaveDb.catch(() => {
      autosaveDb = null; // allow a retry on the next call
    });
  }
  return autosaveDb;
}

export function attachAutosave() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return useEditor.subscribe((state) => {
    if (!state.hydrated || !state.doc) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const { doc } = useEditor.getState();
      if (!doc) return;
      openAutosaveDb()
        .then((db) => idbPut(db, "kv", doc, "doc"))
        .catch(() => {
          // storage unavailable — last resort: try legacy localStorage
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
          } catch {
            console.warn("[PageForge] autosave failed — browser storage unavailable");
          }
        });
    }, 600);
  });
}

export function currentUnit(): Unit {
  return useEditor.getState().doc?.unit ?? "in";
}
