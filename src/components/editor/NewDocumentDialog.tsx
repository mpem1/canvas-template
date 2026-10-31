"use client";

import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useEditor } from "@/lib/editor/store";
import { createDoc } from "@/lib/editor/factory";
import { fromPx, round2, toPx } from "@/lib/editor/units";
import { PAGE_PRESETS } from "@/lib/editor/types";
import type { Unit } from "@/lib/editor/types";

export function NewDocumentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = useState("Untitled document");
  const [presetId, setPresetId] = useState("poster-13x19");
  const [unit, setUnit] = useState<Unit>("in");
  const [w, setW] = useState("13");
  const [h, setH] = useState("19");
  const [m, setM] = useState("0.5");
  const [bleed, setBleed] = useState("0.125");

  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = PAGE_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setUnit(p.unit);
    setW(String(round2(fromPx(toPx(p.w, p.unit), p.unit))));
    setH(String(round2(fromPx(toPx(p.h, p.unit), p.unit))));
  };

  const px = useMemo(() => {
    const wn = parseFloat(w);
    const hn = parseFloat(h);
    if (Number.isNaN(wn) || Number.isNaN(hn)) return null;
    return { wPx: Math.round(toPx(wn, unit)), hPx: Math.round(toPx(hn, unit)) };
  }, [w, h, unit]);

  const create = () => {
    if (!px || px.wPx < 16 || px.hPx < 16) {
      toast.error("Enter a valid width and height");
      return;
    }
    const mn = parseFloat(m);
    const mPx = Number.isNaN(mn) ? toPx(0.5, "in") : toPx(mn, unit);
    const bn = parseFloat(bleed);
    const bPx = Number.isNaN(bn) ? 0 : Math.max(0, toPx(bn, unit));
    const doc = createDoc({
      name: name.trim() || "Untitled document",
      widthPx: px.wPx,
      heightPx: px.hPx,
      unit,
      marginPx: { top: mPx, right: mPx, bottom: mPx, left: mPx },
      bleedPx: bPx,
    });
    useEditor.getState().setDoc(doc);
    onOpenChange(false);
    toast.success(`Created “${doc.name}” — ${px.wPx} × ${px.hPx} px`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New document</DialogTitle>
          <DialogDescription>
            Pick a preset or enter custom dimensions. Internal precision is 96 dpi
            (1 inch = 96 px).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="doc-name" className="text-xs">
              Document name
            </Label>
            <Input
              id="doc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Preset</Label>
            <Select value={presetId} onValueChange={applyPreset}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {PAGE_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.w} × {p.h} {p.unit}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-5 items-end gap-2">
            <div className="col-span-1 space-y-1.5">
              <Label className="text-xs">Unit</Label>
              <Select
                value={unit}
                onValueChange={(u) => {
                  const old = unit;
                  const wn = parseFloat(w);
                  const hn = parseFloat(h);
                  setUnit(u as Unit);
                  if (!Number.isNaN(wn)) setW(String(round2(fromPx(toPx(wn, old), u as Unit))));
                  if (!Number.isNaN(hn)) setH(String(round2(fromPx(toPx(hn, old), u as Unit))));
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">in</SelectItem>
                  <SelectItem value="cm">cm</SelectItem>
                  <SelectItem value="mm">mm</SelectItem>
                  <SelectItem value="pt">pt</SelectItem>
                  <SelectItem value="px">px</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-w" className="text-xs">
                Width
              </Label>
              <Input
                id="doc-w"
                inputMode="decimal"
                value={w}
                onChange={(e) => {
                  setW(e.target.value);
                  setPresetId("custom");
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-h" className="text-xs">
                Height
              </Label>
              <Input
                id="doc-h"
                inputMode="decimal"
                value={h}
                onChange={(e) => {
                  setH(e.target.value);
                  setPresetId("custom");
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-m" className="text-xs">
                Margin
              </Label>
              <Input
                id="doc-m"
                inputMode="decimal"
                value={m}
                onChange={(e) => setM(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-b" className="text-xs">
                Bleed
              </Label>
              <Input
                id="doc-b"
                inputMode="decimal"
                value={bleed}
                onChange={(e) => setBleed(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setW(h);
              setH(w);
              setPresetId("custom");
            }}
            className="text-[11px] font-medium text-amber-700 underline underline-offset-2 hover:text-amber-800"
          >
            ⇄ Swap width / height (portrait ↔ landscape)
          </button>

          <p className="rounded-md bg-zinc-50 px-3 py-2 text-[11px] text-zinc-500">
            {px
              ? `Canvas size: ${px.wPx} × ${px.hPx} px  ·  print size ${(
                  px.wPx / 96
                ).toFixed(2)}″ × ${(px.hPx / 96).toFixed(2)}″`
              : "Enter numeric width and height."}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-8 text-xs">
            Cancel
          </Button>
          <Button onClick={create} className="h-8 bg-zinc-900 text-xs text-white hover:bg-zinc-700">
            Create document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
