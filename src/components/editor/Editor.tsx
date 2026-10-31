"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FilePlus2,
  FolderOpen,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Magnet,
  PanelLeft,
  PanelRight,
  Type,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { attachAutosave, useEditor } from "@/lib/editor/store";
import { PF_BUILD } from "@/lib/editor/build";
import { readImageFile, readImageSize } from "@/lib/editor/exporters";
import { Canvas } from "./Canvas";
import { GuidesDialog } from "./GuidesDialog";
import { NewDocumentDialog } from "./NewDocumentDialog";
import { PagesPanel } from "./PagesPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { TemplatesDialog } from "./TemplatesDialog";
import { ToolRail } from "./ToolRail";
import { Toolbar } from "./Toolbar";
import { fromPx } from "@/lib/editor/units";

function Welcome({
  onNew,
  onTemplates,
  onOpen,
}: {
  onNew: () => void;
  onTemplates: () => void;
  onOpen: () => void;
}) {
  const cards = [
    {
      icon: <FilePlus2 size={20} />,
      title: "New document",
      desc: "Presets from A4 to 24×36″ posters, or any custom size",
      onClick: onNew,
      primary: true,
    },
    {
      icon: <LayoutTemplate size={20} />,
      title: "Browse templates",
      desc: "Flyers, newsletters, brochures with text & image frames ready",
      onClick: onTemplates,
    },
    {
      icon: <FolderOpen size={20} />,
      title: "Open project file",
      desc: "Continue a .pageforge.json project saved on disk",
      onClick: onOpen,
    },
  ];
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-100 px-4">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 text-lg font-bold text-amber-400">
          Pf
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            PageForge Studio
          </h1>
          <p className="text-xs text-zinc-500">
            Web desktop publishing — inspired by Scribus
          </p>
        </div>
      </div>

      <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <button
            key={c.title}
            type="button"
            onClick={c.onClick}
            className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
              c.primary
                ? "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800"
                : "border-zinc-200 bg-white hover:border-amber-400"
            }`}
          >
            <span className={c.primary ? "text-amber-400" : "text-amber-600"}>
              {c.icon}
            </span>
            <span className="text-sm font-semibold">{c.title}</span>
            <span
              className={`text-[11px] leading-snug ${
                c.primary ? "text-zinc-300" : "text-zinc-500"
              }`}
            >
              {c.desc}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-8 flex max-w-xl flex-wrap justify-center gap-1.5">
        {[
          "Custom page sizes (in / mm / pt / px)",
          "Text & image frames",
          "PNG · JPEG · SVG · WebP · GIF",
          "Align & equal-spacing tools",
          "Multi-page documents",
          "PDF / PNG export",
        ].map((f) => (
          <span
            key={f}
            className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10.5px] text-zinc-500"
          >
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusBar() {
  const doc = useEditor((s) => s.doc);
  const pageIdx = useEditor((s) => s.pageIdx);
  const zoom = useEditor((s) => s.zoom);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const snapEnabled = useEditor((s) => s.snapEnabled);
  if (!doc) return null;
  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 overflow-hidden border-t border-zinc-200 bg-white px-3 text-[11px] text-zinc-500">
      <span className="font-medium text-zinc-600">{doc.name}</span>
      <span>
        {Math.round(fromPx(doc.width, doc.unit) * 100) / 100} ×{" "}
        {Math.round(fromPx(doc.height, doc.unit) * 100) / 100} {doc.unit} (
        {Math.round(doc.width)}×{Math.round(doc.height)} px)
      </span>
      <span>
        Page {pageIdx + 1}/{doc.pages.length}
      </span>
      <span>{selection.length} selected</span>
      <button
        type="button"
        onClick={() => useEditor.getState().toggleSnap()}
        title="Snap frames to bleed marks, page edges, margins and other frames"
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors ${
          snapEnabled
            ? "bg-sky-50 text-sky-700 hover:bg-sky-100"
            : "text-zinc-400 hover:bg-zinc-100"
        }`}
      >
        <Magnet size={12} />
        Snap {snapEnabled ? "on" : "off"}
      </button>
      {doc.bleed > 0 && <span>bleed {(doc.bleed / 96).toFixed(3)}″</span>}
      <span className="ml-auto capitalize">{tool} tool</span>
      <span>{Math.round(zoom * 100)}%</span>
      <span className="tabular-nums text-zinc-400" title="Client build stamp">
        b{PF_BUILD.split(".")[1]}
      </span>
    </footer>
  );
}

export default function Editor() {
  const hydrated = useEditor((s) => s.hydrated);
  const doc = useEditor((s) => s.doc);
  const imagePickerFor = useEditor((s) => s.imagePickerFor);
  const guidesOpen = useEditor((s) => s.guidesOpen);
  const pageRefs = useRef<Map<string, HTMLElement>>(new Map());
  const imgInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [mobileLeft, setMobileLeft] = useState(false);
  const [mobileRight, setMobileRight] = useState(false);

  /* hydrate + autosave */
  useEffect(() => {
    void useEditor.getState().hydrate();
    const unsub = attachAutosave();
    // expose for E2E testing / console debugging
    (window as unknown as { __pfStore?: typeof useEditor }).__pfStore = useEditor;
    (window as unknown as { __PF_BUILD?: string }).__PF_BUILD = PF_BUILD;
    console.info(`[PageForge Studio] build ${PF_BUILD}`);
    return unsub;
  }, []);

  /* commit text helper — delegates to the page-independent store action */
  const onCommitText = useCallback((id: string, text: string, liveSynced: boolean) => {
    useEditor.getState().commitText(id, text, liveSynced);
  }, []);

  /* image picker: opens whenever imagePickerFor is set */
  useEffect(() => {
    if (imagePickerFor) imgInputRef.current?.click();
  }, [imagePickerFor]);

  const onImagePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const id = useEditor.getState().imagePickerFor;
    const file = e.target.files?.[0];
    e.target.value = "";
    useEditor.getState().setImagePickerFor(null);
    if (!id || !file) return;
    try {
      const { src, name } = await readImageFile(file);
      let dims = { w: 0, h: 0 };
      try {
        dims = await readImageSize(src);
      } catch {
        // natural size stays unknown → objectFit fallback rendering
      }
      useEditor.getState().updateFrames([id], (f) => {
        if (f.type === "image") {
          f.src = src;
          f.fileName = name;
          f.imgW = dims.w;
          f.imgH = dims.h;
          // fresh placement starts centered at base fit
          f.scale = 1;
          f.offsetX = 0;
          f.offsetY = 0;
        }
      });
      toast.success(`Placed ${name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load image");
    }
  };

  /* global keyboard shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.isContentEditable ||
          t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT");

      if (e.code === "Space" && !typing) {
        e.preventDefault();
        useEditor.getState().setPanMode(true);
        return;
      }
      if (typing) {
        if (e.key === "Escape") t?.blur();
        return;
      }

      const s = useEditor.getState();
      if (!s.doc) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && k === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && k === "d") {
        e.preventDefault();
        s.duplicateSelection();
        return;
      }
      if (mod && k === "a") {
        e.preventDefault();
        s.selectAll();
        return;
      }
      if (mod && k === "c") {
        s.copySelection();
        return;
      }
      if (mod && k === "x") {
        s.cutSelection();
        return;
      }
      if (mod && k === "v") {
        s.paste();
        return;
      }
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        s.setZoom(s.zoom * 1.25);
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        s.setZoom(s.zoom / 1.25);
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case "Delete":
        case "Backspace":
          if (s.selection.length) {
            e.preventDefault();
            s.deleteSelection();
          }
          break;
        case "Escape":
          if (s.imageAdjustId) {
            s.setImageAdjust(null);
          } else {
            s.select([]);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          s.nudgeSelection(-step, 0);
          break;
        case "ArrowRight":
          e.preventDefault();
          s.nudgeSelection(step, 0);
          break;
        case "ArrowUp":
          e.preventDefault();
          s.nudgeSelection(0, -step);
          break;
        case "ArrowDown":
          e.preventDefault();
          s.nudgeSelection(0, step);
          break;
        case "v":
          s.setTool("select");
          break;
        case "t":
          s.setTool("text");
          break;
        case "i":
          s.setTool("image");
          break;
        case "r":
          s.setTool("rect");
          break;
        case "o":
          s.setTool("ellipse");
          break;
        case "l":
          s.setTool("line");
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") useEditor.getState().setPanMode(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100">
        <Loader2 className="animate-spin text-zinc-400" size={28} />
      </div>
    );
  }

  if (!doc) {
    return (
      <>
        <Welcome
          onNew={() => setNewOpen(true)}
          onTemplates={() => setTplOpen(true)}
          onOpen={() => jsonInputRef.current?.click()}
        />
        <NewDocumentDialog open={newOpen} onOpenChange={setNewOpen} />
        <TemplatesDialog key={tplOpen ? "tpl-open" : "tpl-closed"} open={tplOpen} onOpenChange={setTplOpen} />
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const { importJson } = await import("@/lib/editor/exporters");
            try {
              const imported = await importJson(f);
              useEditor.getState().setDoc(imported);
              toast.success(`Opened “${imported.name}”`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not open file");
            }
          }}
        />
        <Toaster position="bottom-center" richColors />
      </>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-100">
      <Toolbar
        pageRefs={pageRefs}
        onNew={() => setNewOpen(true)}
        onTemplates={() => setTplOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        {/* desktop panels */}
        <div className="hidden md:flex">
          <ToolRail />
          <PagesPanel />
        </div>

        <main className="relative min-w-0 flex-1">
          <Canvas pageRefs={pageRefs} onCommitText={onCommitText} />

          {/* mobile panel toggles */}
          <button
            type="button"
            aria-label="Open pages panel"
            onClick={() => setMobileLeft(true)}
            className="absolute bottom-3 left-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white/95 shadow-md backdrop-blur md:hidden"
          >
            <PanelLeft size={16} className="text-zinc-600" />
          </button>
          <button
            type="button"
            aria-label="Open properties panel"
            onClick={() => setMobileRight(true)}
            className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white/95 shadow-md backdrop-blur lg:hidden"
          >
            <PanelRight size={16} className="text-zinc-600" />
          </button>
        </main>

        <div className="hidden lg:flex">
          <PropertiesPanel />
        </div>
      </div>

      <StatusBar />

      {/* mobile drawers */}
      <Sheet open={mobileLeft} onOpenChange={setMobileLeft}>
        <SheetContent side="left" className="flex gap-0 p-0 sm:max-w-xs">
          <SheetTitle className="sr-only">Pages and tools</SheetTitle>
          <ToolRail />
          <PagesPanel />
        </SheetContent>
      </Sheet>
      <Sheet open={mobileRight} onOpenChange={setMobileRight}>
        <SheetContent side="right" className="p-0 sm:max-w-xs">
          <SheetTitle className="sr-only">Properties</SheetTitle>
          <PropertiesPanel />
        </SheetContent>
      </Sheet>

      <NewDocumentDialog open={newOpen} onOpenChange={setNewOpen} />
      <TemplatesDialog key={tplOpen ? "tpl-open" : "tpl-closed"} open={tplOpen} onOpenChange={setTplOpen} />
      <GuidesDialog
        open={guidesOpen}
        onOpenChange={(v) => useEditor.getState().setGuidesOpen(v)}
      />

      {/* hidden image picker */}
      <input
        ref={imgInputRef}
        type="file"
        accept="image/png,image/jpeg,image/pjpeg,image/svg+xml,image/webp,image/gif,image/avif,image/bmp,image/tiff,image/*"
        className="hidden"
        onChange={onImagePicked}
      />

      <Toaster position="bottom-center" richColors />
    </div>
  );
}
