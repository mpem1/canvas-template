"use client";

import { useCallback, useState } from "react";
import type { PointerEvent as RPointerEvent, DragEvent as RDragEvent } from "react";
import { toast } from "sonner";
import { useEditor } from "@/lib/editor/store";
import { frameForTool } from "@/lib/editor/factory";
import { readImageFile, readImageSize } from "@/lib/editor/exporters";
import type { Doc, DocPage, ImageFrame } from "@/lib/editor/types";
import { FrameItem } from "./FrameItem";

interface PageViewProps {
  doc: Doc;
  page: DocPage;
  pageIndex: number;
  zoom: number;
  interactive: boolean;
  mini?: boolean;
  registerRef?: (el: HTMLDivElement | null) => void;
  onCommitText: (id: string, text: string, liveSynced: boolean) => void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function PageView({
  doc,
  page,
  pageIndex,
  zoom,
  interactive,
  mini = false,
  registerRef,
  onCommitText,
}: PageViewProps) {
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [drawing, setDrawing] = useState<Rect | null>(null);
  const selection = useEditor((s) => s.selection);
  const editingId = useEditor((s) => s.editingId);
  const imageAdjustId = useEditor((s) => s.imageAdjustId);
  const isActive = interactive && !mini;

  const pageCoords = useCallback(
    (e: { clientX: number; clientY: number }, el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / zoom,
        y: (e.clientY - rect.top) / zoom,
      };
    },
    [zoom],
  );

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    const s = useEditor.getState();
    if (!interactive || s.panMode || e.button !== 0) return;
    const el = e.currentTarget;

    if (s.editingId) s.setEditing(null);
    if (s.imageAdjustId) s.setImageAdjust(null);

    if (s.tool === "select") {
      /* ---------- marquee selection ---------- */
      e.stopPropagation();
      const start = pageCoords(e, el);
      const baseSel = e.shiftKey ? [...useEditor.getState().selection] : [];
      if (!e.shiftKey) s.select([]);
      el.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const p = pageCoords(ev, el);
        const r = {
          x: Math.min(start.x, p.x),
          y: Math.min(start.y, p.y),
          w: Math.abs(p.x - start.x),
          h: Math.abs(p.y - start.y),
        };
        setMarquee(r);
        const st = useEditor.getState();
        const hits = st
          .doc!.pages[st.pageIdx].frames.filter(
            (f) =>
              !(f.x > r.x + r.w || f.x + f.w < r.x || f.y > r.y + r.h || f.y + f.h < r.y),
          )
          .map((f) => f.id);
        const merged =
          baseSel.length && hits.length
            ? Array.from(new Set([...baseSel, ...hits]))
            : baseSel.length
              ? baseSel
              : hits;
        st.select(merged);
      };
      const onUp = () => {
        setMarquee(null);
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
      return;
    }

    /* ---------- draw to create a frame ---------- */
    e.stopPropagation();
    const start = pageCoords(e, el);
    el.setPointerCapture(e.pointerId);
    const tool = s.tool;

    const onMove = (ev: PointerEvent) => {
      const p = pageCoords(ev, el);
      setDrawing({
        x: Math.min(start.x, p.x),
        y: Math.min(start.y, p.y),
        w: Math.abs(p.x - start.x),
        h: Math.abs(p.y - start.y),
      });
    };
    const onUp = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      const p = pageCoords(ev, el);
      let x = Math.min(start.x, p.x);
      let y = Math.min(start.y, p.y);
      let w = Math.abs(p.x - start.x);
      let h = Math.abs(p.y - start.y);
      setDrawing(null);

      const st = useEditor.getState();
      if (w < 12 || h < 12) {
        // simple click → default-sized frame at the click point
        w = tool === "text" ? 320 : tool === "image" ? 300 : 240;
        h = tool === "text" ? 140 : tool === "image" ? 220 : 160;
        x = Math.max(0, Math.min(start.x - w / 2, doc.width - w));
        y = Math.max(0, Math.min(start.y - h / 2, doc.height - h));
      }
      const f = frameForTool(tool, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
      if (!f) return;
      f.x = Math.max(-doc.width, Math.min(f.x, doc.width - 20));
      f.y = Math.max(-doc.height, Math.min(f.y, doc.height - 20));
      st.addFrame(f);
      st.setTool("select");
      if (f.type === "text") st.setEditing(f.id);
      else if (f.type === "image") st.setImagePickerFor(f.id);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  const onDragOver = (e: RDragEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
  };

  const onDrop = async (e: RDragEvent<HTMLDivElement>) => {
    const s = useEditor.getState();
    if (!interactive || s.panMode) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const { src, name } = await readImageFile(file);
      let dims = { w: 0, h: 0 };
      try {
        dims = await readImageSize(src);
      } catch {
        // natural size stays unknown → objectFit fallback rendering
      }
      const st = useEditor.getState();
      const el = e.currentTarget;
      const p = pageCoords(e, el);

      // dropped onto an existing empty/any image frame? place into it
      const target = st
        .doc!.pages[st.pageIdx].frames.filter((f) => f.type === "image")
        .reverse()
        .find(
          (f) => p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h,
        );
      if (target) {
        st.updateFrames([target.id], (f) => {
          if (f.type === "image") {
            f.src = src;
            f.fileName = name;
            f.imgW = dims.w;
            f.imgH = dims.h;
            f.scale = 1;
            f.offsetX = 0;
            f.offsetY = 0;
          }
        });
      } else {
        const w = Math.min(320, doc.width - 20);
        const h = Math.min(240, doc.height - 20);
        const nf = frameForTool("image", 0, 0, w, h)!;
        nf.x = Math.round(Math.max(0, Math.min(p.x - w / 2, doc.width - w)));
        nf.y = Math.round(Math.max(0, Math.min(p.y - h / 2, doc.height - h)));
        (nf as ImageFrame).src = src;
        (nf as ImageFrame).fileName = name;
        (nf as ImageFrame).imgW = dims.w;
        (nf as ImageFrame).imgH = dims.h;
        st.addFrame(nf);
      }
      toast.success(`Placed ${name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load image");
    }
  };

  const m = doc.margins;
  const guideStyle = "absolute border-pink-500/70";

  return (
    <div
      ref={registerRef}
      data-page-index={pageIndex}
      className={`relative overflow-hidden bg-white ${
        interactive ? "shadow-[0_2px_16px_rgba(0,0,0,0.18)]" : "shadow-sm"
      }`}
      style={{
        width: doc.width,
        height: doc.height,
        transform: `scale(${zoom})`,
        transformOrigin: "top left",
        background: page.background,
      }}
      onPointerDown={interactive ? onPointerDown : undefined}
      onDragOver={onDragOver}
      onDrop={interactive ? onDrop : undefined}
    >
      {interactive && !mini && (
        <div data-export-ignore="true" className="pointer-events-none absolute inset-0 z-10">
          {m.top > 0 && (
            <div
              className={`${guideStyle} left-0 right-0 border-t border-dashed`}
              style={{ top: m.top }}
            />
          )}
          {m.bottom > 0 && (
            <div
              className={`${guideStyle} left-0 right-0 border-t border-dashed`}
              style={{ top: doc.height - m.bottom }}
            />
          )}
          {m.left > 0 && (
            <div
              className={`${guideStyle} top-0 bottom-0 border-l border-dashed`}
              style={{ left: m.left }}
            />
          )}
          {m.right > 0 && (
            <div
              className={`${guideStyle} top-0 bottom-0 border-l border-dashed`}
              style={{ left: doc.width - m.right }}
            />
          )}
        </div>
      )}

      {page.frames.map((f) => (
        <FrameItem
          key={f.id}
          frame={f}
          zoom={zoom}
          selected={isActive && selection.includes(f.id)}
          editing={isActive && editingId === f.id}
          adjusting={isActive && imageAdjustId === f.id}
          interactive={isActive}
          onCommitText={onCommitText}
        />
      ))}

      {isActive && (
        <div data-export-ignore="true" className="pointer-events-none absolute inset-0 z-20">
          {marquee && (
            <div
              className="absolute border border-amber-500 bg-amber-500/10"
              style={{
                left: marquee.x,
                top: marquee.y,
                width: marquee.w,
                height: marquee.h,
              }}
            />
          )}
          {drawing && (
            <div
              className="absolute border-2 border-dashed border-amber-500 bg-amber-500/5"
              style={{
                left: drawing.x,
                top: drawing.y,
                width: drawing.w,
                height: drawing.h,
              }}
            />
          )}
        </div>
      )}

      {/* user-placed guides render in Canvas's screen-space UserGuidesOverlay
          so they extend past the page edges and never get clipped */}
    </div>
  );
}
