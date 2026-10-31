"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FolderDown,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useEditor } from "@/lib/editor/store";
import { buildTemplate, TEMPLATES } from "@/lib/editor/templates";
import {
  deleteUserTemplate,
  listUserTemplates,
  saveUserTemplate,
  templateSizeLabel,
  templateToDoc,
  type UserTemplate,
} from "@/lib/editor/userTemplates";
import {
  downloadTemplateBackup,
  downloadTemplateFile,
  parseTemplateFile,
} from "@/lib/editor/templateFiles";
import { PageView } from "./PageView";
import { cn } from "@/lib/utils";

const PREVIEW_W = 190;

export function TemplatesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [tab, setTab] = useState<"starter" | "mine">("starter");
  // null = still loading. Templates live in IndexedDB (async). Editor remounts
  // this dialog on every open via its key, so this effect re-runs per open and
  // save/delete handlers keep the list current within a session.
  const [mine, setMine] = useState<UserTemplate[] | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const doc = useEditor((s) => s.doc);

  useEffect(() => {
    let alive = true;
    listUserTemplates()
      .then((list) => {
        if (alive) setMine(list);
      })
      .catch(() => {
        if (alive) setMine([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const previews = useMemo(
    () =>
      TEMPLATES.map((t) => ({ t, doc: buildTemplate(t.id)! })).filter(
        (p) => p.doc,
      ),
    // rebuild each time the dialog opens so ids are fresh
    [open],
  );

  const applyStarter = (id: string) => {
    const doc = buildTemplate(id);
    if (!doc) return;
    useEditor.getState().setDoc(doc);
    onOpenChange(false);
    toast.success(`Template applied — “${doc.name}”`);
  };

  const applyMine = (t: UserTemplate) => {
    useEditor.getState().setDoc(templateToDoc(t));
    onOpenChange(false);
    toast.success(`Template applied — “${t.name}”`);
  };

  const save = async () => {
    if (!doc || saving) return;
    setSaving(true);
    try {
      const entry = await saveUserTemplate(name || doc.name, doc);
      setMine(await listUserTemplates());
      setName("");
      setTab("mine");
      toast.success(
        `Template saved — “${entry.name}” (${templateSizeLabel(entry.doc)})`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the template");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: UserTemplate) => {
    try {
      await deleteUserTemplate(t.id);
      setMine(await listUserTemplates());
      toast.success(`Template deleted — “${t.name}”`);
    } catch {
      toast.error("Could not delete the template");
    }
  };

  const exportOne = (t: UserTemplate) => {
    try {
      downloadTemplateFile(t);
      toast.success(
        `Template file downloaded — “${t.name}”. Keep it anywhere; re-import it anytime.`,
      );
    } catch {
      toast.error("Could not download the template file");
    }
  };

  const backupAll = () => {
    if (!mine || mine.length === 0) return;
    try {
      downloadTemplateBackup(mine);
      toast.success(
        `Backup downloaded — ${mine.length} template${mine.length === 1 ? "" : "s"} in one file.`,
      );
    } catch {
      toast.error("Could not download the backup");
    }
  };

  const onFilesPicked = async (files: FileList | null) => {
    if (!files || files.length === 0 || importing) return;
    setImporting(true);
    let added = 0;
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const entries = await parseTemplateFile(file);
        for (const entry of entries) {
          await saveUserTemplate(entry.name, entry.doc);
          added += 1;
        }
      } catch (err) {
        errors.push(
          `${file.name}: ${err instanceof Error ? err.message : "could not be imported"}`,
        );
      }
    }
    try {
      setMine(await listUserTemplates());
    } catch {
      // list refresh is best-effort; the save itself already succeeded or threw
    }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (added > 0) {
      setTab("mine");
      toast.success(
        `Imported ${added} template${added === 1 ? "" : "s"} — now safe from cache clears.`,
      );
    }
    for (const e of errors) toast.error(e);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Templates</DialogTitle>
          <DialogDescription>
            Start from a starter design or save your current design — page
            size, margins and all frames — as a reusable template.
          </DialogDescription>
        </DialogHeader>

        {/* save current design */}
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2">
          <Plus size={14} className="shrink-0 text-amber-600" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") void save();
            }}
            placeholder={`Name this template (default: “${doc?.name ?? "current design"}”)`}
            aria-label="Template name"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-800 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40"
          />
          <Button
            type="button"
            size="sm"
            className="h-7 shrink-0 bg-amber-500 text-xs text-white hover:bg-amber-600"
            onClick={() => void save()}
            disabled={!doc || saving}
            aria-label="Save current design as template"
          >
            {saving ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Saving…
              </>
            ) : (
              "Save current"
            )}
          </Button>
        </div>

        {/* tabs + file actions */}
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1" role="tablist" aria-label="Template groups">
            {(
              [
                ["starter", `Starter (${TEMPLATES.length})`],
                ["mine", mine ? `My templates (${mine.length})` : "My templates (…)"],
              ] as ["starter" | "mine", string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                  tab === id
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1.5 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            title="Import .pageforge.template.json files (backups and single templates)"
          >
            {importing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Upload size={12} />
            )}
            Import file
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1.5 text-xs"
            onClick={backupAll}
            disabled={!mine || mine.length === 0}
            title="Download all saved templates as one backup file"
          >
            <FolderDown size={12} />
            Backup all
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json,.pageforge.template.json,.pageforge.templates.json"
            multiple
            className="hidden"
            onChange={(e) => void onFilesPicked(e.target.files)}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>

        <ScrollArea className="max-h-[52vh] pr-2">
          {tab === "starter" ? (
            <div className="grid grid-cols-1 gap-3 pb-2 sm:grid-cols-2">
              {previews.map(({ t, doc }) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyStarter(t.id)}
                  className="group rounded-lg border border-zinc-200 bg-white p-3 text-left transition-colors hover:border-amber-400 hover:shadow-sm"
                >
                  <div
                    className="mx-auto overflow-hidden rounded border border-zinc-200 bg-white shadow-sm"
                    style={{ width: PREVIEW_W, height: (doc.height / doc.width) * PREVIEW_W }}
                  >
                    <PageView
                      doc={doc}
                      page={doc.pages[0]}
                      pageIndex={0}
                      zoom={PREVIEW_W / doc.width}
                      interactive={false}
                      mini
                      onCommitText={() => {}}
                    />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-800 group-hover:text-amber-700">
                      {t.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-zinc-400">{t.sizeLabel}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                    {t.description}
                  </p>
                </button>
              ))}
            </div>
          ) : !mine ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-zinc-400">
              <Loader2 size={14} className="animate-spin" /> Loading your templates…
            </div>
          ) : mine.length === 0 ? (
            <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-zinc-300 py-10 text-center">
              <span className="text-xs font-medium text-zinc-500">
                No saved templates yet
              </span>
              <span className="text-[11px] text-zinc-400">
                Design anything — any page size — then hit “Save current” above.
              </span>
              <span className="mt-1 text-[11px] text-zinc-400">
                Have template files? “Import file” restores them — presets survive
                even a cleared browser cache.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 pb-2 sm:grid-cols-2">
              {mine.map((t) => (
                <div
                  key={t.id}
                  className="group relative rounded-lg border border-zinc-200 bg-white p-3 transition-colors hover:border-amber-400 hover:shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => applyMine(t)}
                    className="block w-full text-left"
                    aria-label={`Apply template ${t.name}`}
                  >
                    <div
                      className="mx-auto overflow-hidden rounded border border-zinc-200 bg-white shadow-sm"
                      style={{
                        width: PREVIEW_W,
                        height: (t.doc.height / t.doc.width) * PREVIEW_W,
                      }}
                    >
                      <PageView
                        doc={t.doc}
                        page={t.doc.pages[0]}
                        pageIndex={0}
                        zoom={PREVIEW_W / t.doc.width}
                        interactive={false}
                        mini
                        onCommitText={() => {}}
                      />
                    </div>
                    <div className="mt-2 flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-zinc-800 group-hover:text-amber-700">
                        {t.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-zinc-400">
                        {templateSizeLabel(t.doc)} · {t.doc.pages.length}p
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    title="Download template file (.pageforge.template.json)"
                    aria-label={`Download template file ${t.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      exportOne(t);
                    }}
                    className="absolute right-9 top-2 flex h-6 w-6 items-center justify-center rounded bg-white/85 text-zinc-400 opacity-0 shadow-sm transition-opacity hover:text-amber-600 group-hover:opacity-100"
                  >
                    <Download size={12} />
                  </button>
                  <button
                    type="button"
                    title="Delete template"
                    aria-label={`Delete template ${t.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(t);
                    }}
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded bg-white/85 text-zinc-400 opacity-0 shadow-sm transition-opacity hover:text-red-600 group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end">
          <Button
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
