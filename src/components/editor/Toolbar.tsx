"use client";

import { useRef, useState } from "react";
import {
  Crosshair,
  FileDown,
  FileImage,
  FileJson,
  FilePlus2,
  FolderOpen,
  Layers,
  LayoutTemplate,
  Loader2,
  Redo2,
  Save,
  Undo2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useEditor } from "@/lib/editor/store";
import {
  exportJson,
  exportPagePng,
  exportPdf,
  importJson,
} from "@/lib/editor/exporters";
import { importPsdFile } from "@/lib/editor/psdImport";
import type { Doc } from "@/lib/editor/types";

interface ToolbarProps {
  pageRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  onNew: () => void;
  onTemplates: () => void;
}

function TBtn({
  onClick,
  label,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  label?: string;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="flex h-8 items-center gap-1.5 rounded-md px-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
      {label && <span className="hidden text-xs font-medium lg:inline">{label}</span>}
    </button>
  );
}

export function Toolbar({ pageRefs, onNew, onTemplates }: ToolbarProps) {
  const doc = useEditor((s) => s.doc);
  const pastLen = useEditor((s) => s.past.length);
  const futureLen = useEditor((s) => s.future.length);
  const exporting = useEditor((s) => s.exporting);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const psdInputRef = useRef<HTMLInputElement>(null);
  const [psdBusy, setPsdBusy] = useState(false);

  if (!doc) return null;

  const quiet = () => {
    const s = useEditor.getState();
    if (s.editingId) s.setEditing(null);
    const keep = s.selection;
    s.select([]);
    return keep;
  };

  const withCapture = async (fn: () => Promise<void>, okMsg: string) => {
    const keep = quiet();
    useEditor.getState().setExporting(true);
    try {
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
      await fn();
      toast.success(okMsg);
    } catch (err) {
      console.error(err);
      toast.error("Export failed. Try a smaller zoom or fewer pages.");
    } finally {
      useEditor.getState().setExporting(false);
      if (keep.length) useEditor.getState().select(keep);
    }
  };

  const pageEls = (d: Doc) => d.pages.map((p) => pageRefs.current.get(p.id) ?? null);

  const exportPdfAll = () =>
    withCapture(async () => {
      const s = useEditor.getState();
      await exportPdf(s.doc!, pageEls(s.doc!));
    }, "PDF exported — check your downloads");

  const exportPngCurrent = () =>
    withCapture(async () => {
      const s = useEditor.getState();
      const el = pageRefs.current.get(s.doc!.pages[s.pageIdx].id);
      if (!el) throw new Error("page not rendered");
      await exportPagePng(el, s.doc!, s.pageIdx, 2);
    }, "PNG exported — check your downloads");

  const exportPngAll = () =>
    withCapture(async () => {
      const s = useEditor.getState();
      for (let i = 0; i < s.doc!.pages.length; i++) {
        const el = pageRefs.current.get(s.doc!.pages[i].id);
        if (!el) continue;
         
        await exportPagePng(el, s.doc!, i, 2);
         
        await new Promise((r) => setTimeout(r, 350));
      }
    }, "All pages exported as PNG");

  const saveJson = () => {
    const s = useEditor.getState();
    if (!s.doc) return;
    exportJson(s.doc);
    toast.success("Project file saved");
  };

  const openJson = async (file: File) => {
    try {
      const imported = await importJson(file);
      useEditor.getState().setDoc(imported);
      toast.success(`Opened “${imported.name}”`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open file");
    }
  };

  const openPsd = async (file: File) => {
    setPsdBusy(true);
    try {
      const { doc: imported, stats } = await importPsdFile(file);
      useEditor.getState().setDoc(imported);
      toast.success(
        stats.flattened
          ? "PSD imported as a flattened composite (no editable layers found)"
          : `PSD imported — ${stats.images} image layer${stats.images === 1 ? "" : "s"}, ${stats.texts} text layer${stats.texts === 1 ? "" : "s"}${stats.skipped ? `, ${stats.skipped} skipped` : ""}`,
      );
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not import PSD");
    } finally {
      setPsdBusy(false);
    }
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-2">
      {/* brand */}
      <div className="flex items-center gap-2 pl-1 pr-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-[13px] font-bold text-amber-400">
          Pf
        </div>
        <div className="hidden flex-col leading-none sm:flex">
          <span className="text-[13px] font-semibold text-zinc-900">PageForge</span>
          <span className="text-[9px] uppercase tracking-widest text-zinc-400">
            Studio
          </span>
        </div>
      </div>

      <div className="h-6 w-px bg-zinc-200" />

      {/* doc name */}
      <input
        value={doc.name}
        onChange={(e) => useEditor.getState().updateDocProps({ name: e.target.value })}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label="Document name"
        className="ml-1 w-32 rounded-md border border-transparent px-2 py-1 text-xs font-medium text-zinc-700 outline-none hover:border-zinc-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40 md:w-48"
      />

      <div className="h-6 w-px bg-zinc-200" />

      <TBtn onClick={onNew} title="New document">
        <FilePlus2 size={16} />
        <span className="hidden text-xs font-medium lg:inline">New</span>
      </TBtn>
      <TBtn onClick={onTemplates} title="Start from a template">
        <LayoutTemplate size={16} />
        <span className="hidden text-xs font-medium lg:inline">Templates</span>
      </TBtn>
      <TBtn onClick={() => jsonInputRef.current?.click()} title="Open a .pageforge.json project">
        <FolderOpen size={16} />
        <span className="hidden text-xs font-medium lg:inline">Open</span>
      </TBtn>
      <TBtn onClick={() => psdInputRef.current?.click()} title="Import a Photoshop .psd file" disabled={psdBusy}>
        {psdBusy ? <Loader2 size={16} className="animate-spin" /> : <Layers size={16} />}
        <span className="hidden text-xs font-medium lg:inline">{psdBusy ? "Importing…" : "Import PSD"}</span>
      </TBtn>
      <TBtn onClick={saveJson} title="Save project file to disk">
        <Save size={16} />
        <span className="hidden text-xs font-medium lg:inline">Save</span>
      </TBtn>
      <TBtn
        onClick={() => useEditor.getState().setGuidesOpen(true)}
        title="Add page guides (drag from rulers, snap targets)">
        <Crosshair size={16} />
        <span className="hidden text-xs font-medium lg:inline">Guides</span>
      </TBtn>

      <div className="h-6 w-px bg-zinc-200" />

      <TBtn
        onClick={() => useEditor.getState().undo()}
        title="Undo (Ctrl+Z)"
        disabled={pastLen === 0}
      >
        <Undo2 size={16} />
      </TBtn>
      <TBtn
        onClick={() => useEditor.getState().redo()}
        title="Redo (Ctrl+Shift+Z)"
        disabled={futureLen === 0}
      >
        <Redo2 size={16} />
      </TBtn>

      <div className="flex-1" />

      {exporting && (
        <span className="mr-2 flex items-center gap-1.5 text-xs text-zinc-500">
          <Loader2 size={13} className="animate-spin" /> Exporting…
        </span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-700"
          >
            <FileDown size={15} />
            Export
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-[11px] text-zinc-500">
            Print &amp; images
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={exportPdfAll}>
            <FileDown size={14} /> PDF — all pages (exact size)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportPngCurrent}>
            <FileImage size={14} /> PNG — current page (2×)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportPngAll}>
            <FileImage size={14} /> PNG — all pages
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={saveJson}>
            <FileJson size={14} /> Project file (.pageforge.json)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={jsonInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void openJson(f);
        }}
      />
      <input
        ref={psdInputRef}
        type="file"
        accept=".psd,image/vnd.adobe.photoshop,application/x-photoshop,application/photoshop"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void openPsd(f);
        }}
      />
    </header>
  );
}
