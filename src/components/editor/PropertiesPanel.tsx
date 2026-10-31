"use client";

import { useMemo } from "react";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ArrowLeftRight,
  ArrowUpDown,
  Bold,
  CaseUpper,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Crosshair,
  Italic,
  Lock,
  Maximize2,
  RotateCcw,
  SendToBack,
  Trash2,
  Underline,
  Unlock,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useEditor, type AlignMode } from "@/lib/editor/store";
import { computeTextLayout, useFontsReady } from "@/lib/editor/textFit";
import { fontStack } from "@/lib/editor/types";
import {
  FONT_FAMILIES,
  MAX_OUTLINE_WIDTH,
  MAX_SHADOW_BLUR,
  MAX_SHADOW_OFFSET,
  MIN_FONT_SIZE,
} from "@/lib/editor/types";
import type {
  Frame,
  HAlign,
  ImageFrame,
  ImageFit,
  ShapeFrame,
  ShapeKind,
  TextFrame,
  VAlign,
} from "@/lib/editor/types";
import { ColorField, NumberField, SectionTitle } from "./Fields";
import { cn } from "@/lib/utils";

function IconBtn({
  onClick,
  title,
  active,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7 flex-1 items-center justify-center rounded-md border text-zinc-600 disabled:pointer-events-none disabled:opacity-35",
        active
          ? "border-amber-400 bg-amber-100 text-amber-800"
          : "border-zinc-200 bg-white hover:bg-zinc-100 hover:text-zinc-900",
      )}
    >
      {children}
    </button>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-1.5">{children}</div>;
}

export function PropertiesPanel() {
  const doc = useEditor((s) => s.doc);
  const pageIdx = useEditor((s) => s.pageIdx);
  const selection = useEditor((s) => s.selection);
  const imageAdjustId = useEditor((s) => s.imageAdjustId);
  const fontsReady = useFontsReady();

  /* layout of the single selected text frame — drives fit/fill hints */
  const selText = useMemo(() => {
    if (!doc) return null;
    const page = doc.pages[pageIdx];
    if (!page) return null;
    const picked = page.frames.filter((f) => selection.includes(f.id));
    if (picked.length !== 1 || picked[0].type !== "text") return null;
    const t = picked[0] as TextFrame;
    return {
      frame: t,
      layout: computeTextLayout(
        {
          text: t.text,
          fontFamily: t.fontFamily,
          fontSize: t.fontSize,
          bold: t.bold,
          italic: t.italic,
          uppercase: t.uppercase,
          lineHeight: t.lineHeight,
          letterSpacing: t.letterSpacing,
          autoFit: t.autoFit,
          fillHeight: t.fillHeight,
          w: t.w,
          h: t.h,
          padding: t.padding,
        },
        fontsReady,
      ),
    };
  }, [doc, pageIdx, selection, fontsReady]);

  if (!doc) return null;
  const page = doc.pages[pageIdx];
  const sel = page.frames.filter((f) => selection.includes(f.id));
  const one = sel.length === 1 ? sel[0] : null;
  const unit = doc.unit;

  const applyTo = (fn: (f: Frame) => void, record = true) =>
    useEditor.getState().updateFrames(
      sel.map((f) => f.id),
      fn,
      record,
    );

  const applyText = (fn: (f: TextFrame) => void) =>
    applyTo((f) => {
      if (f.type === "text") fn(f);
    });

  /* ------------------------------- align bar ------------------------------ */
  const alignBtns: { mode: AlignMode; icon: React.ReactNode; title: string }[] = [
    { mode: "left", icon: <AlignStartVertical size={14} />, title: "Align left edges" },
    { mode: "hcenter", icon: <AlignCenterVertical size={14} />, title: "Center horizontally" },
    { mode: "right", icon: <AlignEndVertical size={14} />, title: "Align right edges" },
    { mode: "top", icon: <AlignStartHorizontal size={14} />, title: "Align top edges" },
    { mode: "vcenter", icon: <AlignCenterHorizontal size={14} />, title: "Center vertically" },
    { mode: "bottom", icon: <AlignEndHorizontal size={14} />, title: "Align bottom edges" },
  ];

  const alignSection = (
    <div>
      <SectionTitle>Align &amp; space</SectionTitle>
      <div className="flex gap-1">
        {alignBtns.map((b) => (
          <IconBtn
            key={b.mode}
            title={`${b.title}${sel.length === 1 ? " (to page)" : ""}`}
            disabled={!sel.length}
            onClick={() => useEditor.getState().align(b.mode)}
          >
            {b.icon}
          </IconBtn>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1">
        <IconBtn
          title={
            sel.length === 2
              ? "Spread to margins (2 selected)"
              : "Distribute with equal horizontal spacing"
          }
          disabled={sel.length < 2}
          onClick={() => {
            useEditor.getState().distribute("h");
            toast.success(
              sel.length === 2
                ? "Spread to margins — add a 3rd object to equalize gaps"
                : "Equal horizontal spacing applied",
            );
          }}
        >
          <AlignHorizontalSpaceAround size={14} />
        </IconBtn>
        <IconBtn
          title={
            sel.length === 2
              ? "Spread to margins (2 selected)"
              : "Distribute with equal vertical spacing"
          }
          disabled={sel.length < 2}
          onClick={() => {
            useEditor.getState().distribute("v");
            toast.success(
              sel.length === 2
                ? "Spread to margins — add a 3rd object to equalize gaps"
                : "Equal vertical spacing applied",
            );
          }}
        >
          <AlignVerticalSpaceAround size={14} />
        </IconBtn>
        <span className="ml-1 self-center text-[10px] leading-tight text-zinc-400">
          {sel.length < 2
            ? "Select 2+ objects"
            : sel.length === 2
              ? "2 selected → spreads to margins"
              : `${sel.length} selected → equal gaps`}
        </span>
      </div>
    </div>
  );

  /* --------------------------- document section --------------------------- */
  if (!sel.length) {
    return (
      <div className="flex w-72 shrink-0 flex-col border-l border-zinc-200 bg-white">
        <div className="flex h-9 items-center border-b border-zinc-200 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Document
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-3 p-3 pb-8">
            <div>
              <SectionTitle>Page size</SectionTitle>
              <Row>
                <NumberField
                  label="Width"
                  suffix={unit}
                  unit={unit}
                  valuePx={doc.width}
                  min={0.2}
                  onCommitPx={(v) => useEditor.getState().updateDocProps({ width: v })}
                />
                <NumberField
                  label="Height"
                  suffix={unit}
                  unit={unit}
                  valuePx={doc.height}
                  min={0.2}
                  onCommitPx={(v) => useEditor.getState().updateDocProps({ height: v })}
                />
              </Row>
              <div className="mt-1.5 flex items-center gap-1">
                <Select
                  value={unit}
                  onValueChange={(u) => useEditor.getState().updateDocProps({ unit: u as typeof unit })}
                >
                  <SelectTrigger className="h-7 flex-1 text-xs" aria-label="Display unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">inches</SelectItem>
                    <SelectItem value="cm">centimeters</SelectItem>
                    <SelectItem value="mm">millimeters</SelectItem>
                    <SelectItem value="pt">points</SelectItem>
                    <SelectItem value="px">pixels</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  title="Swap width / height"
                  onClick={() =>
                    useEditor.getState().updateDocProps({
                      width: doc.height,
                      height: doc.width,
                    })
                  }
                >
                  <ArrowLeftRight size={13} />
                  <ArrowUpDown size={13} className="-ml-1" />
                </Button>
              </div>
              <p className="mt-1.5 text-[10px] text-zinc-400">
                = {Math.round(doc.width)} × {Math.round(doc.height)} px @ 96 dpi · print size{" "}
                {(doc.width / 96).toFixed(2)}″ × {(doc.height / 96).toFixed(2)}″
              </p>
            </div>

            <Separator />

            <div>
              <SectionTitle>Margins (guides)</SectionTitle>
              <Row>
                <NumberField
                  label="Left"
                  suffix={unit}
                  unit={unit}
                  valuePx={doc.margins.left}
                  min={0}
                  onCommitPx={(v) => useEditor.getState().updateMargins({ left: v })}
                />
                <NumberField
                  label="Top"
                  suffix={unit}
                  unit={unit}
                  valuePx={doc.margins.top}
                  min={0}
                  onCommitPx={(v) => useEditor.getState().updateMargins({ top: v })}
                />
                <NumberField
                  label="Right"
                  suffix={unit}
                  unit={unit}
                  valuePx={doc.margins.right}
                  min={0}
                  onCommitPx={(v) => useEditor.getState().updateMargins({ right: v })}
                />
                <NumberField
                  label="Bottom"
                  suffix={unit}
                  unit={unit}
                  valuePx={doc.margins.bottom}
                  min={0}
                  onCommitPx={(v) => useEditor.getState().updateMargins({ bottom: v })}
                />
              </Row>
            </div>

            <Separator />

            <div>
              <SectionTitle>Bleed (print-safe zone)</SectionTitle>
              <Row>
                <NumberField
                  label="All sides"
                  suffix={unit}
                  unit={unit}
                  valuePx={doc.bleed}
                  min={0}
                  onCommitPx={(v) => useEditor.getState().updateBleed(v)}
                />
              </Row>
              <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-400">
                Objects snap to the bleed marks when moved. Extend artwork to the
                bleed line so it trims edge-to-edge after printing.
              </p>
            </div>

            <Separator />

            <div>
              <SectionTitle>Page background</SectionTitle>
              <ColorField
                value={page.background}
                onChange={(c) => useEditor.getState().setPageBackground(c)}
              />
            </div>

            <Separator />

            <p className="text-[11px] leading-relaxed text-zinc-400">
              Click any frame on the page to edit it. Drag with a tool from the left
              rail to create text, image or shape frames. Select several frames to
              align and space them evenly.
            </p>
          </div>
        </ScrollArea>
      </div>
    );
  }

  /* ---------------------------- frame inspector --------------------------- */
  const first = one ?? sel[0];
  const allText = sel.every((f) => f.type === "text");
  const allImage = sel.every((f) => f.type === "image");
  const allShape = sel.every((f) => f.type === "shape");
  const imgOne = one && one.type === "image" ? (one as ImageFrame) : null;
  const imgAdjusting = !!imgOne && imageAdjustId === imgOne.id;

  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-zinc-200 bg-white">
      <div className="flex h-9 items-center justify-between border-b border-zinc-200 px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {one ? `${first.type} frame` : `${sel.length} frames selected`}
        </span>
        {one && <span className="max-w-32 truncate text-[11px] text-zinc-400">{one.name}</span>}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3 pb-8">
          {alignSection}

          <Separator />

          <div>
            <SectionTitle>Position &amp; size</SectionTitle>
            {one ? (
              <>
                <Row>
                  <NumberField
                    label="X"
                    suffix={unit}
                    unit={unit}
                    valuePx={first.x}
                    onCommitPx={(v) => applyTo((f) => (f.x = Math.round(v)))}
                  />
                  <NumberField
                    label="Y"
                    suffix={unit}
                    unit={unit}
                    valuePx={first.y}
                    onCommitPx={(v) => applyTo((f) => (f.y = Math.round(v)))}
                  />
                  <NumberField
                    label="W"
                    suffix={unit}
                    unit={unit}
                    valuePx={first.w}
                    min={8 / 96}
                    onCommitPx={(v) => applyTo((f) => (f.w = Math.round(v)))}
                  />
                  <NumberField
                    label="H"
                    suffix={unit}
                    unit={unit}
                    valuePx={first.h}
                    min={8 / 96}
                    onCommitPx={(v) => applyTo((f) => (f.h = Math.round(v)))}
                  />
                </Row>
                <div className="mt-1.5 grid grid-cols-2 items-end gap-1.5">
                  <NumberField
                    label="Rotation °"
                    valuePx={first.rotation}
                    min={-360}
                    max={360}
                    onCommitPx={(v) => applyTo((f) => (f.rotation = v))}
                  />
                  <div className="flex items-center justify-between rounded-md border border-zinc-200 px-2 py-1.5">
                    <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                      {first.locked ? <Lock size={12} /> : <Unlock size={12} />}
                      Locked
                    </span>
                    <Switch
                      checked={first.locked}
                      onCheckedChange={(v) => applyTo((f) => (f.locked = v))}
                      aria-label="Lock frame"
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    <span>Opacity</span>
                    <span className="text-zinc-400">{Math.round(first.opacity * 100)}%</span>
                  </div>
                  <Slider
                    value={[first.opacity]}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={([v]) => applyTo((f) => (f.opacity = v), false)}
                    onValueCommit={([v]) => applyTo((f) => (f.opacity = v), true)}
                    aria-label="Frame opacity"
                  />
                </div>
              </>
            ) : (
              <p className="text-[11px] text-zinc-400">
                {sel.length} frames — position fields apply to single selections.
              </p>
            )}
          </div>

          {allText && (
            <>
              <Separator />
              <div>
                <SectionTitle>Typography</SectionTitle>
                <Select
                  value={(first as TextFrame).fontFamily}
                  onValueChange={(v) => applyText((f) => (f.fontFamily = v))}
                >
                  <SelectTrigger className="h-8 text-xs" aria-label="Font family">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {FONT_FAMILIES.map((g) => (
                      <SelectGroup key={g.group}>
                        <SelectLabel className="text-[10px] text-zinc-400">
                          {g.group}
                        </SelectLabel>
                        {g.fonts.map((f) => (
                          <SelectItem key={f} value={f} style={{ fontFamily: fontStack(f) }}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>

                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <NumberField
                    label="Size (px)"
                    valuePx={(first as TextFrame).fontSize}
                    min={4}
                    onCommitPx={(v) => applyText((f) => (f.fontSize = Math.round(v)))}
                  />
                  <NumberField
                    label="Line height ×"
                    valuePx={(first as TextFrame).lineHeight}
                    min={0.6}
                    max={4}
                    decimals={2}
                    onCommitPx={(v) => applyText((f) => (f.lineHeight = Math.round(v * 100) / 100))}
                  />
                </div>

                <div className="mt-1.5 flex gap-1">
                  <IconBtn
                    title="Bold"
                    active={(first as TextFrame).bold}
                    onClick={() => applyText((f) => (f.bold = !f.bold))}
                  >
                    <Bold size={13} />
                  </IconBtn>
                  <IconBtn
                    title="Italic"
                    active={(first as TextFrame).italic}
                    onClick={() => applyText((f) => (f.italic = !f.italic))}
                  >
                    <Italic size={13} />
                  </IconBtn>
                  <IconBtn
                    title="Underline"
                    active={(first as TextFrame).underline}
                    onClick={() => applyText((f) => (f.underline = !f.underline))}
                  >
                    <Underline size={13} />
                  </IconBtn>
                  <IconBtn
                    title="Uppercase"
                    active={(first as TextFrame).uppercase}
                    onClick={() => applyText((f) => (f.uppercase = !f.uppercase))}
                  >
                    <CaseUpper size={13} />
                  </IconBtn>
                </div>

                <div className="mt-1.5 flex gap-1">
                  {(
                    [
                      ["left", <AlignLeft key="l" size={13} />, "Align left"],
                      ["center", <AlignCenter key="c" size={13} />, "Center text"],
                      ["right", <AlignRight key="r" size={13} />, "Align right"],
                      ["justify", <AlignJustify key="j" size={13} />, "Justify"],
                    ] as [HAlign, React.ReactNode, string][]
                  ).map(([mode, icon, title]) => (
                    <IconBtn
                      key={mode}
                      title={title}
                      active={(first as TextFrame).align === mode}
                      onClick={() => applyText((f) => (f.align = mode))}
                    >
                      {icon}
                    </IconBtn>
                  ))}
                  <div className="w-px" />
                  {(
                    [
                      ["top", "Align top"],
                      ["middle", "Middle"],
                      ["bottom", "Bottom"],
                    ] as [VAlign, string][]
                  ).map(([mode, title]) => (
                    <button
                      key={mode}
                      type="button"
                      title={title}
                      onClick={() => applyText((f) => (f.vAlign = mode))}
                      className={cn(
                        "flex h-7 flex-1 items-center justify-center rounded-md border text-[9px] font-semibold",
                        (first as TextFrame).vAlign === mode
                          ? "border-amber-400 bg-amber-100 text-amber-800"
                          : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100",
                      )}
                    >
                      {mode === "top" ? "TOP" : mode === "middle" ? "MID" : "BOT"}
                    </button>
                  ))}
                </div>

                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <NumberField
                    label="Letter spacing px"
                    valuePx={(first as TextFrame).letterSpacing}
                    onCommitPx={(v) => applyText((f) => (f.letterSpacing = v))}
                  />
                  <NumberField
                    label="Padding px"
                    valuePx={(first as TextFrame).padding}
                    min={0}
                    onCommitPx={(v) => applyText((f) => (f.padding = Math.round(v)))}
                  />
                </div>

                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <ColorField
                    label="Text color"
                    value={(first as TextFrame).color}
                    onChange={(c) => applyText((f) => (f.color = c))}
                  />
                  <ColorField
                    label="Frame fill"
                    allowNone
                    value={(first as TextFrame).fill}
                    onChange={(c) => applyText((f) => (f.fill = c))}
                  />
                </div>

                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <NumberField
                    label="Outline px"
                    valuePx={(first as TextFrame).outlineWidth}
                    min={0}
                    max={MAX_OUTLINE_WIDTH}
                    decimals={1}
                    onCommitPx={(v) =>
                      applyText((f) => (f.outlineWidth = Math.round(v * 10) / 10))
                    }
                  />
                  <ColorField
                    label="Outline color"
                    value={(first as TextFrame).outlineColor}
                    onChange={(c) => applyText((f) => (f.outlineColor = c))}
                  />
                </div>
                <p className="mt-1 text-[9.5px] leading-snug text-zinc-400">
                  0 = no outline. The stroke sits behind the glyphs so the fill stays crisp.
                </p>

                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <NumberField
                    label="Shadow offset X px"
                    valuePx={(first as TextFrame).shadowOffsetX}
                    min={-MAX_SHADOW_OFFSET}
                    max={MAX_SHADOW_OFFSET}
                    onCommitPx={(v) =>
                      applyText((f) => (f.shadowOffsetX = Math.round(v)))
                    }
                  />
                  <NumberField
                    label="Shadow offset Y px"
                    valuePx={(first as TextFrame).shadowOffsetY}
                    min={-MAX_SHADOW_OFFSET}
                    max={MAX_SHADOW_OFFSET}
                    onCommitPx={(v) =>
                      applyText((f) => (f.shadowOffsetY = Math.round(v)))
                    }
                  />
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <NumberField
                    label="Shadow blur px"
                    valuePx={(first as TextFrame).shadowBlur}
                    min={0}
                    max={MAX_SHADOW_BLUR}
                    onCommitPx={(v) =>
                      applyText((f) => (f.shadowBlur = Math.round(v)))
                    }
                  />
                  <ColorField
                    label="Shadow color"
                    value={(first as TextFrame).shadowColor}
                    onChange={(c) => applyText((f) => (f.shadowColor = c))}
                  />
                </div>
                <p className="mt-1 text-[9.5px] leading-snug text-zinc-400">
                  Offsets move the shadow (negatives go up/left); blur softens it.
                  0 / 0 / 0 = no shadow.
                </p>

                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between rounded-md border border-zinc-200 px-2 py-1.5">
                    <span className="flex flex-col">
                      <span className="text-[11px] font-medium text-zinc-700">Shrink to fit box</span>
                      <span className="text-[9.5px] text-zinc-400">
                        Text stays inside the frame · never below {MIN_FONT_SIZE} px
                      </span>
                    </span>
                    <Switch
                      checked={(first as TextFrame).autoFit}
                      onCheckedChange={(v) => applyText((f) => (f.autoFit = v))}
                      aria-label="Shrink text to fit the frame"
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-zinc-200 px-2 py-1.5">
                    <span className="flex flex-col">
                      <span className="text-[11px] font-medium text-zinc-700">
                        Fill box top → bottom
                      </span>
                      <span className="text-[9.5px] text-zinc-400">
                        Line spacing stretches so text spans the full height
                      </span>
                    </span>
                    <Switch
                      checked={(first as TextFrame).fillHeight}
                      onCheckedChange={(v) => applyText((f) => (f.fillHeight = v))}
                      aria-label="Spread line spacing to fill the frame height"
                    />
                  </div>
                  {selText &&
                    selText.layout.fontSize !== selText.frame.fontSize && (
                      <p className="text-[10px] text-amber-600">
                        Renders at {selText.layout.fontSize} px (set size: {selText.frame.fontSize} px)
                      </p>
                    )}
                  {selText?.layout.atFloor && (
                    <p className="text-[10px] text-red-600">
                      Minimum {MIN_FONT_SIZE} px reached — shorten the text or enlarge the frame.
                    </p>
                  )}
                  {selText?.layout.overflows && !selText.layout.atFloor && (
                    <p className="text-[10px] text-red-600">
                      Text overflows the frame — it will be clipped.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {allImage && (
            <>
              <Separator />
              <div>
                <SectionTitle>Image</SectionTitle>
                <Select
                  value={(first as ImageFrame).fit}
                  onValueChange={(v) =>
                    applyTo((f) => {
                      if (f.type === "image") f.fit = v as ImageFit;
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs" aria-label="Image fit mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">Keep aspect — fill box (crop)</SelectItem>
                    <SelectItem value="contain">Keep aspect — fit inside</SelectItem>
                    <SelectItem value="fill">Stretch to box (distorts)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[9.5px] leading-snug text-zinc-400">
                  Stretch ignores the image&apos;s proportions — the other two never distort it.
                </p>
                <div className="mt-1.5">
                  <NumberField
                    label="Corner radius px"
                    valuePx={(first as ImageFrame).radius}
                    min={0}
                    onCommitPx={(v) =>
                      applyTo((f) => {
                        if (f.type === "image") f.radius = Math.round(v);
                      })
                    }
                  />
                </div>

                {one && (
                  <div className="mt-2">
                    <Button
                      variant={imgAdjusting ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-full text-xs"
                      disabled={!(first as ImageFrame).src}
                      onClick={() =>
                        useEditor
                          .getState()
                          .setImageAdjust(imgAdjusting ? null : (first as ImageFrame).id)
                      }
                    >
                      <Maximize2 size={12} />
                      {imgAdjusting ? "Finish adjusting" : "Adjust inside frame"}
                    </Button>
                    <p className="mt-1 text-[10px] leading-snug text-zinc-400">
                      Double-click the frame to drag the image inside its box and scroll to
                      zoom it.
                    </p>
                  </div>
                )}

                {one && (first as ImageFrame).src && (
                  <>
                    <div className="mt-2">
                      <div className="mb-1 flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                        <span>Zoom in frame</span>
                        <span className="text-zinc-400">
                          {Math.round((first as ImageFrame).scale * 100)}%
                        </span>
                      </div>
                      <Slider
                        value={[(first as ImageFrame).scale]}
                        min={0.05}
                        max={4}
                        step={0.01}
                        onValueChange={([v]) =>
                          applyTo(
                            (f) => {
                              if (f.type === "image") f.scale = v;
                            },
                            false,
                          )
                        }
                        onValueCommit={([v]) =>
                          applyTo(
                            (f) => {
                              if (f.type === "image") f.scale = v;
                            },
                            true,
                          )
                        }
                        aria-label="Image zoom inside frame"
                      />
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      <NumberField
                        label="Offset X px"
                        valuePx={(first as ImageFrame).offsetX}
                        onCommitPx={(v) =>
                          applyTo((f) => {
                            if (f.type === "image") f.offsetX = Math.round(v);
                          })
                        }
                      />
                      <NumberField
                        label="Offset Y px"
                        valuePx={(first as ImageFrame).offsetY}
                        onCommitPx={(v) =>
                          applyTo((f) => {
                            if (f.type === "image") f.offsetY = Math.round(v);
                          })
                        }
                      />
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        title="Re-center the image inside the frame"
                        onClick={() =>
                          applyTo((f) => {
                            if (f.type === "image") {
                              f.offsetX = 0;
                              f.offsetY = 0;
                            }
                          })
                        }
                      >
                        <Crosshair size={12} /> Center
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        title="Back to 100% and centered"
                        onClick={() =>
                          applyTo((f) => {
                            if (f.type === "image") {
                              f.scale = 1;
                              f.offsetX = 0;
                              f.offsetY = 0;
                            }
                          })
                        }
                      >
                        <RotateCcw size={12} /> Reset
                      </Button>
                    </div>
                    {imgOne && imgOne.imgW > 0 && imgOne.imgH > 0 && (
                      <p className="mt-1 text-[10px] text-zinc-400">
                        Native {imgOne.imgW} × {imgOne.imgH} px
                      </p>
                    )}
                  </>
                )}
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => useEditor.getState().setImagePickerFor(first.id)}
                  >
                    <Upload size={12} /> {one && (first as ImageFrame).src ? "Replace" : "Upload"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!one || !(first as ImageFrame).src}
                    onClick={() =>
                      applyTo((f) => {
                        if (f.type === "image") {
                          f.src = "";
                          f.fileName = "";
                        }
                      })
                    }
                  >
                    <Trash2 size={12} /> Remove
                  </Button>
                </div>
                {one && (first as ImageFrame).fileName && (
                  <p className="mt-1.5 truncate text-[10px] text-zinc-400">
                    {decodeURIComponent((first as ImageFrame).fileName.split("/").pop() || "")}
                  </p>
                )}
              </div>
            </>
          )}

          {allShape && (
            <>
              <Separator />
              <div>
                <SectionTitle>Shape</SectionTitle>
                <Select
                  value={(first as ShapeFrame).shape}
                  onValueChange={(v) =>
                    applyTo((f) => {
                      if (f.type === "shape") f.shape = v as ShapeKind;
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs" aria-label="Shape kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rect">Rectangle</SelectItem>
                    <SelectItem value="ellipse">Ellipse</SelectItem>
                    <SelectItem value="line">Line</SelectItem>
                  </SelectContent>
                </Select>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <ColorField
                    label="Fill"
                    allowNone
                    value={(first as ShapeFrame).fill}
                    onChange={(c) =>
                      applyTo((f) => {
                        if (f.type === "shape") f.fill = c;
                      })
                    }
                  />
                  <ColorField
                    label="Stroke"
                    allowNone
                    value={(first as ShapeFrame).stroke}
                    onChange={(c) =>
                      applyTo((f) => {
                        if (f.type === "shape") f.stroke = c;
                      })
                    }
                  />
                  <NumberField
                    label="Stroke width px"
                    valuePx={(first as ShapeFrame).strokeWidth}
                    min={0}
                    max={60}
                    onCommitPx={(v) =>
                      applyTo((f) => {
                        if (f.type === "shape") f.strokeWidth = Math.round(v);
                      })
                    }
                  />
                  <NumberField
                    label="Corner radius px"
                    valuePx={(first as ShapeFrame).radius}
                    min={0}
                    onCommitPx={(v) =>
                      applyTo((f) => {
                        if (f.type === "shape") f.radius = Math.round(v);
                      })
                    }
                  />
                </div>
              </div>
            </>
          )}

          <Separator />

          <div>
            <SectionTitle>Arrange</SectionTitle>
            <div className="flex gap-1">
              <IconBtn title="Bring to front" onClick={() => useEditor.getState().reorderSelection("front")}>
                <SendToBack size={13} className="scale-y-[-1]" />
              </IconBtn>
              <IconBtn title="Bring forward" onClick={() => useEditor.getState().reorderSelection("forward")}>
                <ChevronsUp size={14} />
              </IconBtn>
              <IconBtn title="Send backward" onClick={() => useEditor.getState().reorderSelection("backward")}>
                <ChevronsDown size={14} />
              </IconBtn>
              <IconBtn title="Send to back" onClick={() => useEditor.getState().reorderSelection("back")}>
                <SendToBack size={13} />
              </IconBtn>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => useEditor.getState().duplicateSelection()}
              >
                <Copy size={12} /> Duplicate
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => useEditor.getState().deleteSelection()}
              >
                <Trash2 size={12} /> Delete
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
