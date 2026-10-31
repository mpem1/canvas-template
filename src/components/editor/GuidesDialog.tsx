"use client";

import { useState } from "react";
import { Plus, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  DEFAULT_GUIDE_COLOR,
  guideBounds,
  hGuideBounds,
  PASTEBOARD_PX,
  useEditor,
} from "@/lib/editor/store";
import { fromPx, round2, toPx } from "@/lib/editor/units";

/** One-click guide colors (the first is the default). */
const GUIDE_SWATCHES = [
  "#10b981",
  "#0ea5e9",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#18181b",
];

/**
 * "Page guides" dialog — add custom guideline lines to the active page
 * numerically (in the document unit) or via column/row presets, review and
 * delete existing ones. Guides are per-page and snap-aware.
 */
export function GuidesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const doc = useEditor((s) => s.doc);
  const pageIdx = useEditor((s) => s.pageIdx);
  const zoom = useEditor((s) => s.zoom);
  const guideColor = useEditor((s) => s.guideColor);
  const [pos, setPos] = useState("");
  const [count, setCount] = useState("3");

  if (!doc) return null;
  const page = doc.pages[Math.min(pageIdx, doc.pages.length - 1)];
  const unit = doc.unit;
  const vx = page.guides?.x ?? [];
  const hy = page.guides?.y ?? [];

  const addAt = (axis: "v" | "h") => {
    const v = parseFloat(pos);
    if (Number.isNaN(v)) {
      toast.error("Enter a numeric position");
      return;
    }
    const px = toPx(v, unit);
    const [lo, hi] =
      axis === "v"
        ? guideBounds(doc.width, zoom)
        : hGuideBounds(
            doc.height,
            zoom,
            pageIdx === 0,
            pageIdx === doc.pages.length - 1,
          );
    if (px < lo || px > hi) {
      toast.error(
        `Position must be between ${round2(fromPx(lo, unit))} and ${round2(
          fromPx(hi, unit),
        )} ${unit} (off-page pasteboard is allowed${
          axis === "h" ? " — stopping at the neighboring page" : ""
        })`,
      );
      return;
    }
    useEditor.getState().addGuide(axis, px);
  };

  const addEven = (axis: "v" | "h", n: number) => {
    const m = doc.margins;
    const span = axis === "v" ? doc.width - m.left - m.right : doc.height - m.top - m.bottom;
    if (span <= 40) {
      toast.error("Margins leave no room — reduce them first");
      return;
    }
    const start = axis === "v" ? m.left : m.top;
    for (let i = 1; i < n; i++) useEditor.getState().addGuide(axis, start + (span * i) / n);
    toast.success(`Added ${n - 1} ${axis === "v" ? "column" : "row"} guide${n > 2 ? "s" : ""}`);
  };

  const addPresets = (axis: "v" | "h") => {
    const n = parseInt(count, 10);
    if (!Number.isInteger(n) || n < 2 || n > 12) {
      toast.error("Count must be between 2 and 12");
      return;
    }
    addEven(axis, n);
  };

  const offPage = (axis: "v" | "h", p: number) =>
    p < 0 || p > (axis === "v" ? doc.width : doc.height);
  const offCount = vx.filter((p) => offPage("v", p)).length + hy.filter((p) => offPage("h", p)).length;

  const recover = () => {
    const n = useEditor.getState().recoverOutGuides();
    if (n > 0) toast.success(`Pulled ${n} lost guide${n > 1 ? "s" : ""} back onto the page`);
  };

  const guideRow = (axis: "v" | "h", p: number) => (
    <span
      key={`${axis}${p}`}
      className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white py-0.5 pl-2 pr-0.5 text-[11px] tabular-nums text-zinc-700"
    >
      {axis === "v" ? "Vertical" : "Horizontal"} · {round2(fromPx(p, unit))} {unit}
      {offPage(axis, p) && (
        <em
          className="rounded bg-amber-100 px-1 py-px text-[9.5px] font-medium not-italic text-amber-700"
          title="This guide sits outside the page — drag it back or pull it onto the page"
        >
          off-page
        </em>
      )}
      <button
        type="button"
        aria-label={`Delete ${axis === "v" ? "vertical" : "horizontal"} guide at ${round2(
          fromPx(p, unit),
        )} ${unit}`}
        onClick={() => useEditor.getState().removeGuide(axis, p)}
        className="flex h-4 w-4 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-rose-600"
      >
        <X size={11} />
      </button>
    </span>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Page guides</DialogTitle>
          <DialogDescription>
            Add your own guideline lines to page {pageIdx + 1} — they magnetically
            snap frames and never print or export. Guides can sit past the page
            edges on the pasteboard, so a lost one stays visible, but they never
            draw across a neighboring page that may not use the same guides.
            Tip: you can also drag a guide straight out of the rulers;
            double-click a guide to delete it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="guide-pos" className="text-xs">
              Add a guide at position ({unit})
            </Label>
            <div className="flex gap-2">
              <Input
                id="guide-pos"
                inputMode="decimal"
                value={pos}
                onChange={(e) => setPos(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") addAt("v");
                }}
                placeholder={`${round2(fromPx(-PASTEBOARD_PX / Math.max(zoom, 0.05), unit))} – ${round2(
                  fromPx(doc.width + PASTEBOARD_PX / Math.max(zoom, 0.05), unit),
                )}`}
                className="h-8 text-xs"
              />
              <Button
                variant="outline"
                onClick={() => addAt("v")}
                className="h-8 shrink-0 text-xs"
                title="Add a vertical guide at this position"
              >
                <Plus size={12} /> Vertical
              </Button>
              <Button
                variant="outline"
                onClick={() => addAt("h")}
                className="h-8 shrink-0 text-xs"
                title="Add a horizontal guide at this position"
              >
                <Plus size={12} /> Horizontal
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="guide-count" className="text-xs">
              Evenly spaced guides (columns / rows inside the margins)
            </Label>
            <div className="flex gap-2">
              <Input
                id="guide-count"
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-8 w-20 text-xs"
              />
              <Button
                variant="outline"
                onClick={() => addPresets("v")}
                className="h-8 shrink-0 text-xs"
                title="Add column boundary guides"
              >
                Columns
              </Button>
              <Button
                variant="outline"
                onClick={() => addPresets("h")}
                className="h-8 shrink-0 text-xs"
                title="Add row boundary guides"
              >
                Rows
              </Button>
            </div>
            <p className="text-[10.5px] leading-snug text-zinc-400">
              e.g. 3 columns adds 2 vertical guides at the column boundaries.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Guide color</Label>
            <div className="flex items-center gap-1.5">
              {GUIDE_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  data-guide-color={c}
                  aria-label={`Guide color ${c}`}
                  title={c === DEFAULT_GUIDE_COLOR ? "Default guide color" : c}
                  onClick={() => useEditor.getState().setGuideColor(c)}
                  className={`h-6 w-6 shrink-0 rounded-full border border-black/10 transition-shadow ${
                    guideColor.toLowerCase() === c
                      ? "ring-2 ring-zinc-900 ring-offset-1"
                      : "hover:ring-2 hover:ring-zinc-300 hover:ring-offset-1"
                  }`}
                  style={{ background: c }}
                />
              ))}
              <label
                className="ml-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-dashed border-zinc-300 text-[9px] font-semibold text-zinc-500 hover:border-zinc-400"
                title="Custom guide color"
              >
                +
                <input
                  type="color"
                  aria-label="Custom guide color"
                  className="sr-only"
                  value={guideColor}
                  onChange={(e) => useEditor.getState().setGuideColor(e.target.value)}
                />
              </label>
            </div>
            <p className="text-[10.5px] leading-snug text-zinc-400">
              Colors your placed guide lines everywhere — pick a strong contrast
              if a guide disappears against your images.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              Guides on this page ({vx.length + hy.length})
            </Label>
            {offCount > 0 && (
              <button
                type="button"
                onClick={recover}
                className="flex w-full items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
              >
                <Undo2 size={12} />
                {offCount} guide{offCount > 1 ? "s" : ""} lost off-page — pull back onto the page
              </button>
            )}
            {vx.length + hy.length === 0 ? (
              <p className="rounded-md bg-zinc-50 px-3 py-2 text-[11px] text-zinc-500">
                No guides yet — add one above or drag from the rulers.
              </p>
            ) : (
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-zinc-100 p-2">
                {vx.map((p) => guideRow("v", p))}
                {hy.map((p) => guideRow("h", p))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              useEditor.getState().clearGuides("page");
            }}
            disabled={vx.length + hy.length === 0}
            className="h-8 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            Clear page guides
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            className="h-8 bg-zinc-900 text-xs text-white hover:bg-zinc-700"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
