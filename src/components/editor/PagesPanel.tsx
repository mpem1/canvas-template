"use client";

import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import { useEditor } from "@/lib/editor/store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { PageView } from "./PageView";
import { cn } from "@/lib/utils";

const THUMB_W = 168;

export function PagesPanel() {
  const doc = useEditor((s) => s.doc);
  const pageIdx = useEditor((s) => s.pageIdx);
  if (!doc) return null;

  const thumbH = (doc.height / doc.width) * THUMB_W;

  return (
    <div className="flex w-52 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50">
      <div className="flex h-9 items-center justify-between border-b border-zinc-200 px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Pages · {doc.pages.length}
        </span>
        <button
          type="button"
          title="Add page after current"
          aria-label="Add page"
          onClick={() => {
            useEditor.getState().addPage();
            toast.success("Page added");
          }}
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
        >
          <Plus size={14} />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-2.5">
          {doc.pages.map((p, i) => (
            <div key={p.id}>
              <button
                type="button"
                onClick={() => useEditor.getState().setPageIdx(i)}
                className={cn(
                  "group relative block w-full overflow-hidden rounded-md border bg-white transition-shadow",
                  i === pageIdx
                    ? "border-amber-500 ring-1 ring-amber-400"
                    : "border-zinc-200 hover:border-zinc-300",
                )}
                style={{ height: thumbH }}
                aria-label={`Go to page ${i + 1}`}
                aria-current={i === pageIdx}
              >
                <div style={{ width: THUMB_W, height: thumbH }}>
                  <PageView
                    doc={doc}
                    page={p}
                    pageIndex={i}
                    zoom={THUMB_W / doc.width}
                    interactive={false}
                    mini
                    onCommitText={() => {}}
                  />
                </div>
                <span className="absolute left-1 top-1 rounded bg-zinc-900/75 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                  {i + 1}
                </span>
              </button>
              <div className="mt-0.5 flex items-center justify-center gap-0.5">
                <button
                  type="button"
                  title="Move page up"
                  aria-label={`Move page ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => useEditor.getState().movePage(i, i - 1)}
                  className="flex h-5 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-30"
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  type="button"
                  title="Move page down"
                  aria-label={`Move page ${i + 1} down`}
                  disabled={i === doc.pages.length - 1}
                  onClick={() => useEditor.getState().movePage(i, i + 1)}
                  className="flex h-5 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-30"
                >
                  <ChevronDown size={12} />
                </button>
                <button
                  type="button"
                  title="Duplicate page"
                  aria-label={`Duplicate page ${i + 1}`}
                  onClick={() => {
                    useEditor.getState().duplicatePage(i);
                    toast.success(`Page ${i + 1} duplicated`);
                  }}
                  className="flex h-5 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                >
                  <Copy size={11} />
                </button>
                <button
                  type="button"
                  title="Delete page"
                  aria-label={`Delete page ${i + 1}`}
                  disabled={doc.pages.length === 1}
                  onClick={() => {
                    useEditor.getState().deletePage(i);
                    toast.success("Page deleted");
                  }}
                  className="flex h-5 w-6 items-center justify-center rounded text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t border-zinc-200 p-2">
        <button
          type="button"
          onClick={() => useEditor.getState().addPage()}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-zinc-300 py-1.5 text-xs text-zinc-500 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700"
        >
          <Plus size={13} /> Add page
        </button>
      </div>
    </div>
  );
}
