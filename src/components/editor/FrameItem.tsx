"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type { CSSProperties, PointerEvent as RPointerEvent } from "react";
import { Image as ImageIcon, Maximize2, Move, ZoomIn } from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import { textToHtml } from "@/lib/editor/factory";
import { computeTextLayout, useFontsReady } from "@/lib/editor/textFit";
import { collectSnapTargets, snapAxis } from "@/lib/editor/snap";
import { fontStack, IMAGE_CENTER_SNAP, MIN_FONT_SIZE } from "@/lib/editor/types";
import type { Frame, ImageFrame, ShapeFrame, TextFrame } from "@/lib/editor/types";

const HANDLE = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type HandleId = (typeof HANDLE)[number];

const CURSORS: Record<HandleId, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

/* ---------------------------------- text ---------------------------------- */

const EditableText = memo(function EditableText({
  frameId,
  initialHtml,
  style,
  onCommit,
}: {
  frameId: string;
  initialHtml: string;
  style: CSSProperties;
  onCommit: (t: string, liveSynced: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Snapshot of the DOM node so the unmount commit can read it even after
  // React has detached the ref.
  const nodeRef = useRef<HTMLDivElement | null>(null);
  // Text captured at the last pointerdown while the node was still attached —
  // used as the unmount fallback because React nulls refs before passive
  // cleanups run and a detached element no longer reports accurate innerText.
  const pendingText = useRef<string | null>(null);
  const lastCommitted = useRef<string | null>(null);
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  });

  // Live sync: while the user types, the store receives the text every ~250ms
  // (debounced). The pre-edit snapshot is pushed exactly once per session, so
  // the typed text survives ANY exit path — unmount, page switch, tab close,
  // engine-specific blur quirks — and undo still returns the original text.
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveSyncedRef = useRef(false);
  const clearSyncTimer = () => {
    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
      syncTimer.current = null;
    }
  };

  // The editing surface owns its DOM: the initial html is injected ONCE,
  // imperatively, by the stable ref callback below. The <div> is rendered with
  // NO dangerouslySetInnerHTML and NO children — React 19 re-applies
  // dangerouslySetInnerHTML on re-renders whenever the live DOM differs from
  // the prop (which is ALWAYS true once the user has typed), wiping the typed
  // content mid-session; with no content prop React never touches it again.
  const htmlRef = useRef(initialHtml);

  const readText = () => {
    const el = nodeRef.current;
    return el ? el.innerText.replace(/\n$/, "") : null;
  };

  const commit = () => {
    clearSyncTimer();
    const t = readText();
    if (t === null) return;
    lastCommitted.current = t;
    commitRef.current(t, liveSyncedRef.current);
  };

  /*
   * Commit on unmount: edit mode can end without a blur event whenever the
   * component is removed synchronously (clicking the page, switching pages,
   * changing tools, undo). The latest text is stashed on every pointerdown
   * (capture phase — before React handlers that may unmount this editor), so
   * the cleanup can still commit what the user typed.
   */
  useEffect(() => {
    const stash = () => {
      const el = nodeRef.current;
      if (el) pendingText.current = el.innerText.replace(/\n$/, "");
    };
    document.addEventListener("pointerdown", stash, true);
    return () => {
      document.removeEventListener("pointerdown", stash, true);
      clearSyncTimer(); // a pending live sync would double-write after commit
      const el = nodeRef.current;
      const t =
        el && el.isConnected ? el.innerText.replace(/\n$/, "") : pendingText.current;
      if (t !== null && t !== lastCommitted.current) {
        commitRef.current(t, liveSyncedRef.current);
      }
    };
  }, []);

  /*
   * STABLE ref callback (empty deps): an inline callback would be re-attached
   * on EVERY render, and React re-invokes it (null → node) each time — the
   * innerHTML injection + focus() + caret-to-end below would then run again
   * mid-edit (wiping text / stealing focus) whenever anything re-renders.
   */
  const setEl = useCallback((el: HTMLDivElement | null) => {
    ref.current = el;
    nodeRef.current = el;
    if (el) {
      el.innerHTML = htmlRef.current; // initial content — set exactly once
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, []);

  return (
    <div
      ref={setEl}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={style}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          // window shortcuts never see keys from the editor (stopPropagation),
          // so exit-and-commit is handled right here
          commit();
          useEditor.getState().setEditing(null);
        }
      }}
      onInput={(e) => {
        const t = (e.currentTarget as HTMLDivElement).innerText.replace(/\n$/, "");
        pendingText.current = t;
        if (syncTimer.current) clearTimeout(syncTimer.current);
        syncTimer.current = setTimeout(() => {
          syncTimer.current = null;
          useEditor.getState().syncText(frameId, t, !liveSyncedRef.current);
          liveSyncedRef.current = true;
        }, 250);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPaste={(e) => {
        // strip rich text so the plain-text model stays in sync with the DOM
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        if (text) document.execCommand("insertText", false, text);
      }}
    />
  );
});

function TextBody({
  frame,
  editing,
  onCommit,
}: {
  frame: TextFrame;
  editing: boolean;
  onCommit: (id: string, text: string, liveSynced: boolean) => void;
}) {
  const fontsReady = useFontsReady();
  const {
    text,
    fontFamily,
    fontSize,
    bold,
    italic,
    uppercase,
    lineHeight,
    letterSpacing,
    autoFit,
    fillHeight,
    w,
    h,
    padding,
  } = frame;

  const layout = useMemo(
    () =>
      computeTextLayout(
        {
          text,
          fontFamily,
          fontSize,
          bold,
          italic,
          uppercase,
          lineHeight,
          letterSpacing,
          autoFit,
          fillHeight,
          w,
          h,
          padding,
        },
        fontsReady,
      ),
    [
      text,
      fontFamily,
      fontSize,
      bold,
      italic,
      uppercase,
      lineHeight,
      letterSpacing,
      autoFit,
      fillHeight,
      w,
      h,
      padding,
      fontsReady,
    ],
  );

  const textStyle: CSSProperties = {
    fontFamily: fontStack(frame.fontFamily),
    fontSize: layout.fontSize,
    fontWeight: frame.bold ? 700 : 400,
    fontStyle: frame.italic ? "italic" : "normal",
    textDecoration: frame.underline ? "underline" : "none",
    textTransform: frame.uppercase ? "uppercase" : "none",
    textAlign: frame.align,
    lineHeight: layout.lineHeightPx !== null ? `${layout.lineHeightPx}px` : frame.lineHeight,
    letterSpacing: frame.letterSpacing,
    color: frame.color,
    width: "100%",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    outline: "none",
  };
  if (frame.outlineWidth > 0) {
    // stroke behind the fill so thick outlines don't eat into the glyphs
    textStyle.WebkitTextStroke = `${frame.outlineWidth}px ${frame.outlineColor}`;
    textStyle.paintOrder = "stroke";
  }
  // Drop shadow: active whenever any of its components is non-zero.
  if (
    frame.shadowOffsetX !== 0 ||
    frame.shadowOffsetY !== 0 ||
    frame.shadowBlur > 0
  ) {
    textStyle.textShadow = `${frame.shadowOffsetX}px ${frame.shadowOffsetY}px ${frame.shadowBlur}px ${frame.shadowColor}`;
  }
  const outer: CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent:
      frame.vAlign === "top"
        ? "flex-start"
        : frame.vAlign === "middle"
          ? "center"
          : "flex-end",
    background: frame.fill !== "none" ? frame.fill : undefined,
    padding: frame.padding,
    overflow: "hidden",
    boxSizing: "border-box",
  };
  if (editing) {
    return (
      <div style={outer}>
        <EditableText
          frameId={frame.id}
          initialHtml={textToHtml(frame.text)}
          style={textStyle}
          onCommit={(t, liveSynced) => onCommit(frame.id, t, liveSynced)}
        />
      </div>
    );
  }
  return (
    <div style={outer}>
      <div style={textStyle}>
        {frame.text ? (
          frame.text
        ) : (
          <span data-export-ignore="true" style={{ opacity: 0.4 }}>
            Double-click to edit text
          </span>
        )}
      </div>
      {layout.overflows && (
        <div
          data-export-ignore="true"
          className="pointer-events-none absolute inset-0"
          style={{ border: "1.5px dashed #ef4444" }}
        />
      )}
      {layout.atFloor && (
        <div
          data-export-ignore="true"
          className="pointer-events-none absolute bottom-0 left-0 bg-red-500 px-1 py-px text-[9px] font-semibold leading-tight text-white"
        >
          Min {MIN_FONT_SIZE}px — overflow
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- image ---------------------------------- */

function ImageBody({
  frame,
  adjusting,
  zoom,
}: {
  frame: ImageFrame;
  adjusting: boolean;
  zoom: number;
}) {
  const hasDims = frame.imgW > 0 && frame.imgH > 0;
  const usePx = hasDims && frame.fit !== "fill";

  const imgStyle: CSSProperties = useMemo(() => {
    const pos: CSSProperties = {
      position: "absolute",
      left: `calc(50% + ${frame.offsetX}px)`,
      top: `calc(50% + ${frame.offsetY}px)`,
      transform: "translate(-50%, -50%)",
      // Tailwind preflight sets `img { max-width: 100%; height: auto }`, which
      // clamps the precisely-sized element to the frame width and destroys the
      // image's aspect ratio (the image stretches vertically as soon as its
      // zoomed width passes the frame edge). Neutralize it so the computed
      // size below always rules.
      maxWidth: "none",
    };
    if (usePx) {
      const bw = frame.w / frame.imgW;
      const bh = frame.h / frame.imgH;
      const base = frame.fit === "cover" ? Math.max(bw, bh) : Math.min(bw, bh);
      return {
        ...pos,
        width: frame.imgW * base * frame.scale,
        height: frame.imgH * base * frame.scale,
        // safety net: if the stored natural dims ever drift from the actual
        // image, crop instead of stretching
        objectFit: frame.fit === "cover" ? "cover" : "contain",
      };
    }
    return {
      ...pos,
      width: `${frame.scale * 100}%`,
      height: `${frame.scale * 100}%`,
      objectFit: frame.fit,
    };
  }, [
    frame.offsetX,
    frame.offsetY,
    frame.scale,
    frame.fit,
    frame.w,
    frame.h,
    frame.imgW,
    frame.imgH,
    usePx,
  ]);

  if (!frame.src) {
    return (
      <div
        data-export-ignore="true"
        className="flex h-full w-full flex-col items-center justify-center gap-1 border-2 border-dashed border-zinc-300 bg-zinc-50 text-zinc-400"
      >
        <ImageIcon size={22} strokeWidth={1.5} />
        <span className="text-[11px] font-medium">Place image</span>
      </div>
    );
  }

  const captureSize = (nw: number, nh: number) => {
    if (nw > 0 && nh > 0 && (frame.imgW !== nw || frame.imgH !== nh)) {
      useEditor.getState().updateFrames(
        [frame.id],
        (f) => {
          if (f.type === "image") {
            f.imgW = nw;
            f.imgH = nh;
          }
        },
        false,
      );
    }
  };

  const snapX = adjusting && frame.offsetX === 0;
  const snapY = adjusting && frame.offsetY === 0;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ borderRadius: frame.radius || undefined }}
    >
      <img
        src={frame.src}
        alt={frame.fileName || "Placed image"}
        draggable={false}
        className="select-none"
        style={{ ...imgStyle, borderRadius: frame.radius || undefined }}
        onLoad={(e) => captureSize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
      />
      {adjusting && (
        <>
          {snapY && (
            <div
              data-export-ignore="true"
              className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-emerald-500/80"
              style={{ top: "50%" }}
            />
          )}
          {snapX && (
            <div
              data-export-ignore="true"
              className="pointer-events-none absolute bottom-0 top-0 border-l border-dashed border-emerald-500/80"
              style={{ left: "50%" }}
            />
          )}
          <div
            data-export-ignore="true"
            className="pointer-events-none absolute bottom-1 left-1 flex items-center gap-1 rounded bg-zinc-900/80 px-1.5 py-0.5 font-medium text-white"
            style={{ fontSize: Math.max(9, 10 / zoom) }}
          >
            <ZoomIn size={Math.max(10, 11 / zoom)} />
            {Math.round(frame.scale * 100)}%
            {snapX && snapY ? " · centered" : ""}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------- shape ---------------------------------- */

function ShapeBody({ frame }: { frame: ShapeFrame }) {
  if (frame.shape === "line") {
    const w = Math.max(frame.w, 1);
    const h = Math.max(frame.h, 1);
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <line
          x1="0"
          y1={h / 2}
          x2={w}
          y2={h / 2}
          stroke={frame.stroke === "none" ? "#18181b" : frame.stroke}
          strokeWidth={frame.strokeWidth}
        />
      </svg>
    );
  }
  return (
    <div
      className="h-full w-full"
      style={{
        background: frame.fill !== "none" ? frame.fill : undefined,
        border:
          frame.strokeWidth > 0 && frame.stroke !== "none"
            ? `${frame.strokeWidth}px solid ${frame.stroke}`
            : undefined,
        borderRadius: frame.shape === "ellipse" ? "50%" : frame.radius || undefined,
        boxSizing: "border-box",
      }}
    />
  );
}

/* -------------------------------- content --------------------------------- */

function FrameContent({
  frame,
  editing,
  adjusting,
  zoom,
  onCommitText,
}: {
  frame: Frame;
  editing: boolean;
  adjusting: boolean;
  zoom: number;
  onCommitText: (id: string, text: string, liveSynced: boolean) => void;
}) {
  if (frame.type === "text")
    return <TextBody frame={frame} editing={editing} onCommit={onCommitText} />;
  if (frame.type === "image")
    return <ImageBody frame={frame} adjusting={adjusting} zoom={zoom} />;
  return <ShapeBody frame={frame} />;
}

/* ------------------------------- frame item ------------------------------- */

interface FrameItemProps {
  frame: Frame;
  zoom: number;
  selected: boolean;
  editing: boolean;
  adjusting: boolean;
  interactive: boolean;
  onCommitText: (id: string, text: string, liveSynced: boolean) => void;
}

export const FrameItem = memo(function FrameItem({
  frame,
  zoom,
  selected,
  editing,
  adjusting,
  interactive,
  onCommitText,
}: FrameItemProps) {
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const isImage = frame.type === "image";

  /* wheel = zoom the image inside its frame while adjusting (native, non-passive) */
  useEffect(() => {
    if (!adjusting || !isImage) return;
    const el = wheelRef.current;
    if (!el) return;
    let lastPush = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const s = useEditor.getState();
      const f = s.doc?.pages[s.pageIdx]?.frames.find((x) => x.id === frame.id);
      if (!f || f.type !== "image") return;
      const factor = e.deltaY < 0 ? 1.06 : 1 / 1.06;
      const next = Math.min(8, Math.max(0.05, f.scale * factor));
      if (next === f.scale) return;
      const now = Date.now();
      if (now - lastPush > 800) {
        s.pushSnapshot(s.doc!);
        lastPush = now;
      }
      s.updateFrames(
        [frame.id],
        (fr) => {
          if (fr.type === "image") fr.scale = next;
        },
        false,
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [adjusting, isImage, frame.id]);

  const content = (
    <FrameContent
      frame={frame}
      editing={editing}
      adjusting={adjusting}
      zoom={zoom}
      onCommitText={onCommitText}
    />
  );

  if (!interactive) {
    return (
      <div
        className="absolute overflow-hidden"
        style={{
          left: frame.x,
          top: frame.y,
          width: frame.w,
          height: frame.h,
          opacity: frame.opacity,
        }}
      >
        {content}
      </div>
    );
  }

  /* ---- drag to move ---- */
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    const s = useEditor.getState();
    if (s.panMode || s.tool !== "select" || e.button !== 0) return;

    /* image adjust mode: pan the image inside the frame instead of the frame */
    if (adjusting && isImage && !frame.locked) {
      startImagePan(e);
      return;
    }
    if (s.imageAdjustId && s.imageAdjustId !== frame.id) s.setImageAdjust(null);

    if (editing) {
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    if (e.shiftKey) {
      s.toggleSelect(frame.id);
      return;
    }
    if (!s.selection.includes(frame.id)) s.select([frame.id]);
    if (frame.locked) return;

    const ids = useEditor.getState().selection;
    const state = useEditor.getState();
    const page = state.doc!.pages[state.pageIdx];
    const origins = new Map<string, { x: number; y: number }>();
    for (const f of page.frames) {
      if (ids.includes(f.id) && !f.locked) origins.set(f.id, { x: f.x, y: f.y });
    }
    if (!origins.size) return;

    /* bounding box of the moving frames — snapping reference */
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const f of page.frames) {
      if (!origins.has(f.id)) continue;
      bx0 = Math.min(bx0, f.x);
      by0 = Math.min(by0, f.y);
      bx1 = Math.max(bx1, f.x + f.w);
      by1 = Math.max(by1, f.y + f.h);
    }
    const targets = state.snapEnabled
      ? collectSnapTargets(state.doc!, state.pageIdx, new Set(origins.keys()))
      : null;
    const thresh = 6 / zoom;

    const startX = e.clientX;
    const startY = e.clientY;
    let pushed = false;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (
        !pushed &&
        Math.abs(ev.clientX - startX) < 3 &&
        Math.abs(ev.clientY - startY) < 3
      )
        return;
      if (!pushed) {
        useEditor.getState().pushSnapshot(useEditor.getState().doc!);
        pushed = true;
      }
      let sdx = dx;
      let sdy = dy;
      if (targets) {
        const sx = snapAxis([bx0 + dx, (bx0 + bx1) / 2 + dx, bx1 + dx], targets.x, thresh);
        const sy = snapAxis([by0 + dy, (by0 + by1) / 2 + dy, by1 + dy], targets.y, thresh);
        sdx += sx.delta;
        sdy += sy.delta;
        useEditor.getState().setSnapGuides({ v: sx.lines, h: sy.lines });
      }
      useEditor.getState().updateFrames(
        [...origins.keys()],
        (f) => {
          const o = origins.get(f.id)!;
          f.x = Math.round(o.x + sdx);
          f.y = Math.round(o.y + sdy);
        },
        false,
      );
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      useEditor.getState().setSnapGuides({ v: [], h: [] });
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  /* ---- pan the image inside its frame (adjust mode) ---- */
  const startImagePan = (e: RPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (frame.type !== "image") return;
    const st = { x: frame.offsetX, y: frame.offsetY };
    const startX = e.clientX;
    const startY = e.clientY;
    let pushed = false;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (!pushed) {
        useEditor.getState().pushSnapshot(useEditor.getState().doc!);
        pushed = true;
      }
      let nx = st.x + dx;
      let ny = st.y + dy;
      if (Math.abs(nx) < IMAGE_CENTER_SNAP) nx = 0;
      if (Math.abs(ny) < IMAGE_CENTER_SNAP) ny = 0;
      useEditor.getState().updateFrames(
        [frame.id],
        (f) => {
          if (f.type === "image") {
            f.offsetX = Math.round(nx);
            f.offsetY = Math.round(ny);
          }
        },
        false,
      );
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  /* ---- resize ---- */
  const startResize = (handle: HandleId, e: RPointerEvent<HTMLDivElement>) => {
    const s = useEditor.getState();
    if (frame.locked || e.button !== 0) return;
    e.stopPropagation();
    const st = { x: frame.x, y: frame.y, w: frame.w, h: frame.h };
    const targets = s.snapEnabled
      ? collectSnapTargets(s.doc!, s.pageIdx, new Set([frame.id]))
      : null;
    const thresh = 6 / zoom;
    const startX = e.clientX;
    const startY = e.clientY;
    let pushed = false;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      if (!pushed) {
        useEditor.getState().pushSnapshot(useEditor.getState().doc!);
        pushed = true;
      }
      let { x, y, w, h } = st;
      if (handle.includes("e")) w = st.w + dx;
      if (handle.includes("s")) h = st.h + dy;
      if (handle.includes("w")) {
        w = st.w - dx;
        x = st.x + dx;
      }
      if (handle.includes("n")) {
        h = st.h - dy;
        y = st.y + dy;
      }
      const isCorner = handle.length === 2;
      if (isCorner && ev.shiftKey && st.w > 0 && st.h > 0) {
        const ratio = st.w / st.h;
        if (Math.abs(w - st.w) >= Math.abs(h - st.h)) h = w / ratio;
        else w = h * ratio;
        if (handle.includes("w")) x = st.x + (st.w - w);
        if (handle.includes("n")) y = st.y + (st.h - h);
      }

      /* snap the moving edges to bleed / margins / page / other frames */
      let guideV: number[] = [];
      let guideH: number[] = [];
      if (targets) {
        if (handle.includes("e")) {
          const r = snapAxis([x + w], targets.x, thresh);
          w += r.delta;
          guideV = r.lines;
        }
        if (handle.includes("w")) {
          const l = snapAxis([x], targets.x, thresh);
          x += l.delta;
          w -= l.delta;
          guideV = l.lines;
        }
        if (handle.includes("s")) {
          const b = snapAxis([y + h], targets.y, thresh);
          h += b.delta;
          guideH = b.lines;
        }
        if (handle.includes("n")) {
          const t = snapAxis([y], targets.y, thresh);
          y += t.delta;
          h -= t.delta;
          guideH = t.lines;
        }
        useEditor.getState().setSnapGuides({ v: guideV, h: guideH });
      }

      w = Math.max(8, w);
      h = Math.max(8, h);
      useEditor.getState().updateFrames(
        [frame.id],
        (f) => {
          f.x = Math.round(x);
          f.y = Math.round(y);
          f.w = Math.round(w);
          f.h = Math.round(h);
        },
        false,
      );
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      useEditor.getState().setSnapGuides({ v: [], h: [] });
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  const onDoubleClick = () => {
    const s = useEditor.getState();
    if (frame.locked) return;
    if (frame.type === "text") {
      s.setEditing(frame.id);
    } else if (frame.type === "image") {
      // toggle adjust mode; open the picker when the frame is still empty
      if (adjusting) s.setImageAdjust(null);
      else if (frame.src) s.setImageAdjust(frame.id);
      else s.setImagePickerFor(frame.id);
    }
  };

  const hs = 9 / zoom;
  const bo = 1.5 / zoom; // selection border width
  const pillFont = Math.max(9, 10.5 / zoom);
  const pillPad = `${Math.max(2, 3 / zoom)}px ${Math.max(4, 7 / zoom)}px`;

  const handlePos = (id: HandleId): CSSProperties => {
    const mid = `calc(50% - ${hs / 2}px)`;
    switch (id) {
      case "nw":
        return { left: -hs / 2, top: -hs / 2 };
      case "n":
        return { left: mid, top: -hs / 2 };
      case "ne":
        return { right: -hs / 2, top: -hs / 2 };
      case "e":
        return { right: -hs / 2, top: mid };
      case "se":
        return { right: -hs / 2, bottom: -hs / 2 };
      case "s":
        return { left: mid, bottom: -hs / 2 };
      case "sw":
        return { left: -hs / 2, bottom: -hs / 2 };
      case "w":
        return { left: -hs / 2, top: mid };
    }
  };

  return (
    <div
      ref={wheelRef}
      className="absolute"
      style={{
        left: frame.x,
        top: frame.y,
        width: frame.w,
        height: frame.h,
        transform: frame.rotation ? `rotate(${frame.rotation}deg)` : undefined,
        opacity: frame.opacity,
        cursor: adjusting
          ? "grab"
          : editing
            ? "text"
            : frame.locked
              ? "default"
              : "move",
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      {content}
      {adjusting && (
        <>
          <div
            data-export-ignore="true"
            className="pointer-events-none absolute inset-0"
            style={{ border: `${bo}px solid #10b981` }}
          />
          <div
            data-export-ignore="true"
            className="pointer-events-none absolute left-0 flex items-center gap-1 whitespace-nowrap rounded bg-emerald-600 font-medium text-white shadow"
            style={{
              top: -Math.max(20, 24 / zoom),
              fontSize: pillFont,
              padding: pillPad,
            }}
          >
            <Move size={pillFont + 1} />
            Drag to move · Scroll to zoom · Dbl-click/Esc to finish
          </div>
        </>
      )}
      {selected && !editing && !adjusting && (
        <>
          <div
            data-export-ignore="true"
            className="pointer-events-none absolute inset-0"
            style={{ border: `${bo}px solid #f59e0b` }}
          />
          {frame.locked ? (
            <div
              data-export-ignore="true"
              className="pointer-events-none absolute flex items-center justify-center bg-amber-500 text-white"
              style={{ left: -bo, top: -bo, width: 14 / zoom, height: 14 / zoom, fontSize: 9 / zoom }}
            >
              <svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor">
                <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z" />
              </svg>
            </div>
          ) : (
            HANDLE.map((id) => (
              <div
                key={id}
                data-export-ignore="true"
                className="absolute rounded-[1px] border border-amber-600 bg-white"
                style={{
                  ...handlePos(id),
                  width: hs,
                  height: hs,
                  cursor: CURSORS[id],
                  borderWidth: Math.max(1, 1 / zoom),
                }}
                onPointerDown={(e) => startResize(id, e)}
              />
            ))
          )}
        </>
      )}
      {selected && !editing && adjusting && (
        <div
          data-export-ignore="true"
          className="pointer-events-none absolute left-1 top-1 flex items-center gap-1 rounded bg-emerald-600 text-white"
          style={{ fontSize: pillFont, padding: pillPad }}
        >
          <Maximize2 size={pillFont + 1} />
          Adjusting image inside frame
        </div>
      )}
    </div>
  );
});
