"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import {
  useEditor,
  guideBounds,
  hGuideBounds,
  PASTEBOARD_PX,
  PAGE_GAP_PX,
} from "@/lib/editor/store";
import { fromPx, rulerSteps } from "@/lib/editor/units";
import type { Doc, Unit } from "@/lib/editor/types";
import { PageView } from "./PageView";

const PAD = PASTEBOARD_PX;
const GAP = PAGE_GAP_PX;
/** Screen-px grab width around a guide line (independent of zoom). */
const GUIDE_STRIP = 9;
const DRAG_COLOR = "#f59e0b";

/** Transient snap-guide lines over the active page (subscribes independently). */
function SnapGuidesLayer({ zoom }: { zoom: number }) {
  const guides = useEditor((s) => s.snapGuides);
  const doc = useEditor((s) => s.doc);
  if (!doc || (!guides.v.length && !guides.h.length)) return null;
  const b = doc.bleed;
  const top = -b * zoom;
  const height = (doc.height + b * 2) * zoom;
  return (
    <div data-export-ignore="true" className="pointer-events-none absolute inset-0 z-30">
      {guides.v.map((x) => (
        <div
          key={`v${x}`}
          className="absolute bg-sky-500/90"
          style={{ left: x * zoom, top, width: 1, height }}
        />
      ))}
      {guides.h.map((y) => (
        <div
          key={`h${y}`}
          className="absolute bg-sky-500/90"
          style={{ top: y * zoom, left: -b * zoom, height: 1, width: (doc.width + b * 2) * zoom }}
        />
      ))}
    </div>
  );
}

/**
 * User-placed guides, drawn inside the scrolled content box (PAD pasteboard
 * included) so they scroll in lockstep with the pages — a guide placed past
 * the page edges stays visible on the pasteboard and can always be grabbed
 * again. Each guide belongs to ONE page: its line spans that page plus dashed
 * pasteboard tails (full pasteboard at the content-box edges, half the
 * inter-page gap toward neighbors) — it never draws straight across another
 * page, which may not use the same guides. Drag / double-click-delete only
 * work on the active page while the select tool is up.
 */
function UserGuidesOverlay({
  pageRefs,
  zoom,
}: {
  pageRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  zoom: number;
}) {
  const doc = useEditor((s) => s.doc);
  const pageIdx = useEditor((s) => s.pageIdx);
  const tool = useEditor((s) => s.tool);
  const panMode = useEditor((s) => s.panMode);
  const showGuides = useEditor((s) => s.showGuides);
  const guideColor = useEditor((s) => s.guideColor);
  const [dragKey, setDragKey] = useState<string | null>(null);

  if (!doc || !showGuides) return null;

  const interactive = tool === "select" && !panMode;

  const startDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    axis: "v" | "h",
    from: number,
    pageId: string,
    key: string,
  ) => {
    if (!interactive) return;
    if (useEditor.getState().panMode) return;
    const pageEl = pageRefs.current.get(pageId);
    if (!pageEl) return;
    e.stopPropagation();
    e.preventDefault();
    let cur = from;
    let pushed = false;
    const startX = e.clientX;
    const startY = e.clientY;
    setDragKey(key);

    /* window listeners: the line remounts whenever its store position value
     * changes, so the drag must live above the render tree */
    const onMove = (ev: PointerEvent) => {
      if (
        !pushed &&
        Math.abs(ev.clientX - startX) < 2 &&
        Math.abs(ev.clientY - startY) < 2
      )
        return;
      if (!pushed) {
        useEditor.getState().pushSnapshot(useEditor.getState().doc!);
        pushed = true;
      }
      const rect = pageEl.getBoundingClientRect();
      const p =
        axis === "v"
          ? (ev.clientX - rect.left) / zoom
          : (ev.clientY - rect.top) / zoom;
      useEditor.getState().moveGuide(axis, cur, p);
      cur = p;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDragKey(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const half = GUIDE_STRIP / 2;
  const HZ = doc.height * zoom; // page height, content px
  const WZ = doc.width * zoom;
  const n = doc.pages.length;
  const contentH = PAD * 2 + n * HZ + (n - 1) * GAP;
  const contentW = WZ + PAD * 2;
  /* each page owns ONE half of every inter-page gap: a guide may reach past
   * its own edges onto the pasteboard, but never across a neighboring page */
  const gapHalf = GAP / 2;
  const dash = (col: string, dir: "bottom" | "right") =>
    `repeating-linear-gradient(to ${dir}, ${col} 0 7px, transparent 7px 13px)`;
  const lines: React.ReactNode[] = [];

  doc.pages.forEach((p, i) => {
    /* page i's top edge inside the content box, in content px */
    const pageTop = PAD + i * (HZ + GAP);
    const isFirst = i === 0;
    const isLast = i === n - 1;
    const active = interactive && i === pageIdx;

    /* ---- vertical guides: line spans THIS page + pasteboard tails only ---- */
    const vTop = Math.max(0, pageTop - (isFirst ? PAD : gapHalf));
    const vBottom = Math.min(contentH, pageTop + HZ + (isLast ? PAD : gapHalf));
    const stripH = vBottom - vTop;
    const headH = pageTop - vTop; // dashed tail above the page
    const tailTop = headH + HZ; // dashed tail below the page
    const tailH = stripH - tailTop;

    (p.guides?.x ?? []).forEach((x, gi) => {
      const left = PAD + x * zoom;
      const off = x < 0 || x > doc.width; // off-page → whole line dashed
      const key = `v:${p.id}:${gi}`;
      const col = dragKey === key ? DRAG_COLOR : guideColor;
      lines.push(
        <div
          key={key}
          data-guide="v"
          data-guide-pos={x}
          data-guide-page={p.id}
          data-guide-off={off || undefined}
          className={`absolute ${active ? "pointer-events-auto" : ""}`}
          style={{
            left: left - half,
            top: vTop,
            height: stripH,
            width: GUIDE_STRIP,
            cursor: active ? "ew-resize" : undefined,
          }}
          onPointerDown={(e) => startDrag(e, "v", x, p.id, key)}
          onDoubleClick={() => {
            if (active) useEditor.getState().removeGuide("v", x);
          }}
          title={active ? "Guide — drag to move · double-click to delete" : undefined}
        >
          {off ? (
            <div
              data-guide-seg="main"
              data-guide-core="true"
              className="absolute"
              style={{ left: half - 0.5, top: 0, width: 1, height: stripH, background: dash(col, "bottom") }}
            />
          ) : (
            <>
              {headH > 0 && (
                <div
                  data-guide-seg="head"
                  className="absolute"
                  style={{ left: half - 0.5, top: 0, width: 1, height: headH, background: dash(col, "bottom"), opacity: 0.85 }}
                />
              )}
              <div
                data-guide-seg="main"
                className="absolute"
                style={{ left: half - 1.5, top: headH, width: 3, height: HZ, background: col, opacity: 0.35 }}
              />
              <div
                data-guide-core="true"
                className="absolute"
                style={{ left: half - 0.5, top: headH, width: 1, height: HZ, background: col }}
              />
              {tailH > 0 && (
                <div
                  data-guide-seg="tail"
                  className="absolute"
                  style={{ left: half - 0.5, top: tailTop, width: 1, height: tailH, background: dash(col, "bottom"), opacity: 0.85 }}
                />
              )}
            </>
          )}
        </div>,
      );
    });

    /* ---- horizontal guides: full-width line, position clamped so it can
     * never sit across a neighboring page (guards legacy stored values) ---- */
    const hClampLo = -(isFirst ? PAD : GAP);
    const hClampHi = HZ + (isLast ? PAD : GAP);

    (p.guides?.y ?? []).forEach((y, gi) => {
      const yScreen = Math.max(hClampLo, Math.min(hClampHi, y * zoom));
      const top = pageTop + yScreen;
      const off = y < 0 || y > doc.height;
      const key = `h:${p.id}:${gi}`;
      const col = dragKey === key ? DRAG_COLOR : guideColor;
      lines.push(
        <div
          key={key}
          data-guide="h"
          data-guide-pos={y}
          data-guide-page={p.id}
          data-guide-off={off || undefined}
          className={`absolute ${active ? "pointer-events-auto" : ""}`}
          style={{
            top: top - half,
            left: 0,
            right: 0,
            height: GUIDE_STRIP,
            cursor: active ? "ns-resize" : undefined,
          }}
          onPointerDown={(e) => startDrag(e, "h", y, p.id, key)}
          onDoubleClick={() => {
            if (active) useEditor.getState().removeGuide("h", y);
          }}
          title={active ? "Guide — drag to move · double-click to delete" : undefined}
        >
          {off ? (
            <div
              data-guide-seg="main"
              data-guide-core="true"
              className="absolute"
              style={{ left: 0, top: half - 0.5, width: contentW, height: 1, background: dash(col, "right") }}
            />
          ) : (
            <>
              <div
                data-guide-seg="head"
                className="absolute"
                style={{ left: 0, top: half - 0.5, width: PAD, height: 1, background: dash(col, "right"), opacity: 0.85 }}
              />
              <div
                data-guide-seg="main"
                className="absolute"
                style={{ left: PAD, top: half - 1.5, width: WZ, height: 3, background: col, opacity: 0.35 }}
              />
              <div
                data-guide-core="true"
                className="absolute"
                style={{ left: PAD, top: half - 0.5, width: WZ, height: 1, background: col }}
              />
              <div
                data-guide-seg="tail"
                className="absolute"
                style={{ left: PAD + WZ, top: half - 0.5, width: contentW - PAD - WZ, height: 1, background: dash(col, "right"), opacity: 0.85 }}
              />
            </>
          )}
        </div>,
      );
    });
  });

  return (
    <div
      data-export-ignore="true"
      data-guides-overlay="true"
      className="pointer-events-none absolute inset-0 z-40"
    >
      {lines}
    </div>
  );
}

function RulerTicks({
  length,
  zoom,
  unit,
  vertical = false,
}: {
  length: number;
  zoom: number;
  unit: Unit;
  vertical?: boolean;
}) {
  const ticks = useMemo(() => {
    const steps = rulerSteps(unit);
    const step = steps.find((s) => s.px * zoom >= 46) ?? steps[steps.length - 1];
    const minorDiv = (step.px / 4) * zoom >= 7 ? 4 : 2;
    const majors: { pos: number; label: string }[] = [];
    const minors: number[] = [];
    for (let k = 0; ; k++) {
      const pos = k * step.px * zoom;
      if (pos > length) break;
      majors.push({ pos, label: k === 0 ? "0" : step.label });
    }
    for (let p = 0; p <= length; p += (step.px / minorDiv) * zoom) {
      const nearMajor =
        Math.abs(p / (step.px * zoom) - Math.round(p / (step.px * zoom))) < 0.01;
      if (!nearMajor) minors.push(p);
    }
    return { majors, minors };
  }, [length, zoom, unit]);

  if (vertical) {
    return (
      <div className="absolute inset-x-0 top-0 select-none" style={{ height: length }}>
        {ticks.majors.map((t) => (
          <div
            key={`m${t.pos}`}
            className="absolute right-0 h-px w-2.5 bg-zinc-400"
            style={{ top: t.pos }}
          >
            <span
              className="absolute right-3 top-0 text-[8.5px] leading-none text-zinc-500"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              {t.label}
            </span>
          </div>
        ))}
        {ticks.minors.map((p) => (
          <div key={`n${p}`} className="absolute right-0 h-px w-1.5 bg-zinc-300" style={{ top: p }} />
        ))}
      </div>
    );
  }

  return (
    <div className="absolute inset-y-0 left-0 select-none" style={{ width: length }}>
      {ticks.majors.map((t) => (
        <div
          key={`m${t.pos}`}
          className="absolute bottom-0 w-px h-2.5 bg-zinc-400"
          style={{ left: t.pos }}
        >
          <span className="absolute bottom-3 left-0 text-[8.5px] leading-none text-zinc-500">
            {t.label}
          </span>
        </div>
      ))}
      {ticks.minors.map((p) => (
        <div key={`n${p}`} className="absolute bottom-0 w-px h-1.5 bg-zinc-300" style={{ left: p }} />
      ))}
    </div>
  );
}

interface CanvasProps {
  pageRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  onCommitText: (id: string, text: string, liveSynced: boolean) => void;
}

export function Canvas({ pageRefs, onCommitText }: CanvasProps) {
  const doc = useEditor((s) => s.doc);
  const zoom = useEditor((s) => s.zoom);
  const showRulers = useEditor((s) => s.showRulers);
  const showGuides = useEditor((s) => s.showGuides);
  const guideColor = useEditor((s) => s.guideColor);
  const panMode = useEditor((s) => s.panMode);
  const pageIdx = useEditor((s) => s.pageIdx);
  const viewportRef = useRef<HTMLDivElement>(null);
  const topInnerRef = useRef<HTMLDivElement>(null);
  const leftInnerRef = useRef<HTMLDivElement>(null);
  /** Ghost guide line while dragging one out of a ruler. */
  const [guideGhost, setGuideGhost] = useState<{
    axis: "v" | "h";
    pos: number;
  } | null>(null);

  /*
   * Drag a guide out of a ruler: top ruler → horizontal guide, left ruler →
   * vertical guide. The ghost follows the pointer over the ACTIVE page; the
   * guide is committed on release only if it lands within the visible
   * pasteboard (a plain click on the ruler never leaves the ruler, so it
   * places nothing).
   */
  const startGuideFromRuler = (
    e: React.PointerEvent<HTMLDivElement>,
    axis: "v" | "h",
  ) => {
    const s = useEditor.getState();
    if (s.panMode || e.button !== 0 || !s.doc) return;
    const page = s.doc.pages[s.pageIdx];
    const pageEl = pageRefs.current.get(page.id);
    if (!pageEl) return;
    e.preventDefault();
    const rulerEl = e.currentTarget;
    rulerEl.setPointerCapture(e.pointerId);
    const zoomAtStart = s.zoom;
    /* horizontal guides stop at the neighboring pages' band; vertical guides
     * may use the full left/right pasteboard (single-column layout) */
    const [gLo, gHi] =
      axis === "h"
        ? hGuideBounds(
            s.doc.height,
            zoomAtStart,
            s.pageIdx === 0,
            s.pageIdx === s.doc.pages.length - 1,
          )
        : guideBounds(s.doc.width, zoomAtStart);
    let last: number | null = null;

    const compute = (ev: PointerEvent) => {
      const rect = pageEl.getBoundingClientRect();
      return axis === "h"
        ? (ev.clientY - rect.top) / zoomAtStart
        : (ev.clientX - rect.left) / zoomAtStart;
    };
    const onMove = (ev: PointerEvent) => {
      const p = compute(ev);
      last = p;
      setGuideGhost(p >= gLo && p <= gHi ? { axis, pos: p } : null);
    };
    const onUp = () => {
      rulerEl.removeEventListener("pointermove", onMove);
      rulerEl.removeEventListener("pointerup", onUp);
      rulerEl.removeEventListener("pointercancel", onUp);
      setGuideGhost(null);
      try {
        rulerEl.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      if (last !== null && last >= gLo && last <= gHi) {
        useEditor.getState().addGuide(axis, last);
      }
    };
    rulerEl.addEventListener("pointermove", onMove);
    rulerEl.addEventListener("pointerup", onUp);
    rulerEl.addEventListener("pointercancel", onUp);
  };

  const syncRulers = () => {
    const vp = viewportRef.current;
    if (!vp) return;
    if (topInnerRef.current)
      topInnerRef.current.style.transform = `translateX(${-vp.scrollLeft}px)`;
    if (leftInnerRef.current)
      leftInnerRef.current.style.transform = `translateY(${-vp.scrollTop}px)`;
  };

  /* ctrl/cmd + wheel zoom around the cursor */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const s = useEditor.getState();
      const old = s.zoom;
      const next = Math.min(4, Math.max(0.05, old * Math.exp(-e.deltaY * 0.0016)));
      const rect = vp.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const contentX = vp.scrollLeft + cx;
      const contentY = vp.scrollTop + cy;
      const k = next / old;
      vp.scrollLeft = contentX * k - cx;
      vp.scrollTop = contentY * k - cy;
      s.setZoom(next);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, []);

  /* auto-fit when the page size changes or a new document loads */
  const prevDoc = useRef<Doc | null>(null);
  useEffect(() => {
    const vp = viewportRef.current;
    const prev = prevDoc.current;
    prevDoc.current = doc;
    if (!doc || !vp) return;
    const sizeChanged = !prev || prev.width !== doc.width || prev.height !== doc.height;
    const newDoc = !prev || prev.pages[0]?.id !== doc.pages[0]?.id;
    if (sizeChanged || newDoc) {
      const z = Math.min(
        (vp.clientWidth - 100) / doc.width,
        (vp.clientHeight - 100) / doc.height,
        1.5,
      );
      useEditor.getState().setZoom(Math.max(0.05, Math.round(z * 100) / 100));
      vp.scrollLeft = Math.max(0, PAD - 40);
      vp.scrollTop = Math.max(0, PAD - 40);
    }
  }, [doc]);

  /* middle-mouse / space-drag panning */
  const onPointerDownCapture = (e: React.PointerEvent) => {
    const s = useEditor.getState();
    if (!(s.panMode || e.button === 1)) return;
    e.preventDefault();
    e.stopPropagation();
    const vp = viewportRef.current;
    if (!vp) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const sl = vp.scrollLeft;
    const st = vp.scrollTop;
    const move = (ev: PointerEvent) => {
      vp.scrollLeft = sl - (ev.clientX - startX);
      vp.scrollTop = st - (ev.clientY - startY);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const fit = () => {
    const vp = viewportRef.current;
    if (!vp || !doc) return;
    useEditor.getState().fitZoom(vp.clientWidth, vp.clientHeight);
  };

  if (!doc) return null;

  const contentW = doc.width * zoom + PAD * 2;
  const contentH = PAD * 2 + doc.pages.length * (doc.height * zoom) + (doc.pages.length - 1) * GAP;
  const rulerW = Math.max(contentW, 2000);
  const rulerH = Math.max(contentH, 2000);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {showRulers && (
        <div
          data-ruler="top"
          onPointerDown={(e) => startGuideFromRuler(e, "h")}
          className="relative h-5 shrink-0 cursor-ns-resize overflow-hidden border-b border-zinc-300 bg-zinc-100"
          title="Drag onto the page to place a horizontal guide"
        >
          <div ref={topInnerRef} className="absolute inset-y-0 left-0" style={{ width: rulerW }}>
            <RulerTicks length={rulerW} zoom={zoom} unit={doc.unit} />
          </div>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        {showRulers && (
          <div
            data-ruler="left"
            onPointerDown={(e) => startGuideFromRuler(e, "v")}
            className="relative w-5 shrink-0 cursor-ew-resize overflow-hidden border-r border-zinc-300 bg-zinc-100"
            title="Drag onto the page to place a vertical guide"
          >
            <div ref={leftInnerRef} className="absolute inset-x-0 top-0" style={{ height: rulerH }}>
              <RulerTicks length={rulerH} zoom={zoom} unit={doc.unit} vertical />
            </div>
          </div>
        )}
        <div
          ref={viewportRef}
          onScroll={syncRulers}
          onPointerDownCapture={onPointerDownCapture}
          className="canvas-dotted min-h-0 flex-1 overflow-auto"
          style={{ cursor: panMode ? "grab" : undefined }}
        >
          <div className="relative" style={{ width: contentW, height: contentH }}>
            {doc.pages.map((p, i) => (
              <div
                key={p.id}
                className="absolute"
                style={{
                  left: PAD,
                  top: PAD + i * (doc.height * zoom + GAP),
                  width: doc.width * zoom,
                  height: doc.height * zoom,
                }}
                onPointerDownCapture={() => {
                  if (i !== pageIdx) useEditor.getState().setPageIdx(i);
                }}
              >
                {/* bleed guide — outside the page div so exports stay exact */}
                {showGuides && doc.bleed > 0 && (
                  <div
                    data-export-ignore="true"
                    className="pointer-events-none absolute border border-dashed border-rose-400/90"
                    style={{
                      left: -doc.bleed * zoom,
                      top: -doc.bleed * zoom,
                      width: (doc.width + doc.bleed * 2) * zoom,
                      height: (doc.height + doc.bleed * 2) * zoom,
                    }}
                    title={`Bleed ${(doc.bleed / 96).toFixed(3)}″`}
                  />
                )}
                <PageView
                  doc={doc}
                  page={p}
                  pageIndex={i}
                  zoom={zoom}
                  interactive={i === pageIdx}
                  registerRef={(el) => {
                    if (el) pageRefs.current.set(p.id, el);
                    else pageRefs.current.delete(p.id);
                  }}
                  onCommitText={onCommitText}
                />
                {i === pageIdx && <SnapGuidesLayer zoom={zoom} />}
                {i === pageIdx && guideGhost && (
                  <div data-export-ignore="true" className="pointer-events-none absolute inset-0 z-30">
                    {guideGhost.axis === "h" ? (
                      <div
                        className="absolute border-t border-dashed"
                        style={{
                          top: guideGhost.pos * zoom,
                          left: -PAD,
                          right: -PAD,
                          borderColor: guideColor,
                        }}
                      />
                    ) : (
                      <div
                        className="absolute border-l border-dashed"
                        style={{
                          left: guideGhost.pos * zoom,
                          top: -PAD,
                          bottom: -PAD,
                          borderColor: guideColor,
                        }}
                      />
                    )}
                  </div>
                )}
                <div
                  data-export-ignore="true"
                  className="pointer-events-none absolute left-0 right-0 text-center text-[11px] text-zinc-500"
                  style={{ top: doc.height * zoom + 8 }}
                >
                  {`Page ${i + 1} — ${Math.round(fromPx(doc.width, doc.unit) * 100) / 100} × ${
                    Math.round(fromPx(doc.height, doc.unit) * 100) / 100
                  } ${doc.unit}`}
                </div>
              </div>
            ))}
            <UserGuidesOverlay pageRefs={pageRefs} zoom={zoom} />
          </div>
        </div>
      </div>

      {/* floating zoom pill */}
      <div className="absolute bottom-3 right-4 z-50 flex items-center gap-0.5 rounded-full border border-zinc-200 bg-white/95 px-1.5 py-1 shadow-md backdrop-blur">
        <button
          aria-label="Zoom out"
          className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100"
          onClick={() => useEditor.getState().setZoom(useEditor.getState().zoom / 1.25)}
        >
          <ZoomOut size={15} />
        </button>
        <button
          aria-label="Reset zoom to 100%"
          className="min-w-12 rounded-full px-2 py-0.5 text-center text-xs font-medium text-zinc-700 hover:bg-zinc-100"
          onClick={() => useEditor.getState().setZoom(1)}
          title="Reset to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          aria-label="Zoom in"
          className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100"
          onClick={() => useEditor.getState().setZoom(useEditor.getState().zoom * 1.25)}
        >
          <ZoomIn size={15} />
        </button>
        <div className="mx-0.5 h-4 w-px bg-zinc-200" />
        <button
          aria-label="Fit page"
          title="Fit page in view"
          className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100"
          onClick={fit}
        >
          <Maximize size={14} />
        </button>
      </div>
    </div>
  );
}
