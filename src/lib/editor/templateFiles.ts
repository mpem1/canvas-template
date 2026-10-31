/**
 * Template files: save presets as real files so they survive a cleared
 * browser cache, a new computer, or a switch of browser — the IndexedDB
 * template store is per-device, but a downloaded .pageforge.template.json
 * can be re-imported anywhere, anytime.
 *
 * Accepted on import (largest first):
 *   1. Backup bundle  { kind: "pageforge-template-backup", templates: [...] }
 *   2. Template file  { kind: "pageforge-template", name, doc }
 *   3. Raw project    a plain .pageforge.json Doc (becomes a template)
 */

import { slugify, triggerDownload } from "./exporters";
import { migrateDoc } from "./factory";
import type { Doc } from "./types";
import type { UserTemplate } from "./userTemplates";

export const TEMPLATE_FILE_EXT = ".pageforge.template.json";
const BACKUP_FILE_EXT = ".pageforge.templates.json";

interface TemplateFileV1 {
  kind: "pageforge-template";
  version: 1;
  name: string;
  createdAt: number;
  doc: Doc;
}

interface TemplateBackupFileV1 {
  kind: "pageforge-template-backup";
  version: 1;
  exportedAt: number;
  templates: { name?: string; createdAt?: number; doc: Doc }[];
}

function validDoc(d: unknown): d is Doc {
  const o = d as Doc;
  return (
    !!o &&
    typeof o.width === "number" &&
    typeof o.height === "number" &&
    Array.isArray(o.pages) &&
    o.pages.length > 0
  );
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Download one saved template as a portable .pageforge.template.json file. */
export function downloadTemplateFile(t: UserTemplate): void {
  const payload: TemplateFileV1 = {
    kind: "pageforge-template",
    version: 1,
    name: t.name,
    createdAt: t.createdAt,
    doc: t.doc,
  };
  downloadJson(payload, `${slugify(t.name)}${TEMPLATE_FILE_EXT}`);
}

/** Download every saved template in one bundle file. */
export function downloadTemplateBackup(list: UserTemplate[]): void {
  const payload: TemplateBackupFileV1 = {
    kind: "pageforge-template-backup",
    version: 1,
    exportedAt: Date.now(),
    templates: list.map((t) => ({ name: t.name, createdAt: t.createdAt, doc: t.doc })),
  };
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  downloadJson(payload, `pageforge-templates-${stamp}${BACKUP_FILE_EXT}`);
}

/** Normalize one validated entry into what saveUserTemplate expects. */
export interface ParsedTemplateEntry {
  name: string;
  createdAt?: number;
  doc: Doc;
}

/**
 * Read + validate an uploaded template file. Resolves with one entry per
 * template found (1 for single files, N for backup bundles); rejects with a
 * user-facing message otherwise.
 */
export function parseTemplateFile(file: File): Promise<ParsedTemplateEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch {
        reject(new Error("Could not parse the file — is it a PageForge file?"));
        return;
      }
      const entries: ParsedTemplateEntry[] = [];
      if (parsed && typeof parsed === "object") {
        const obj = parsed as { kind?: string; doc?: unknown; templates?: unknown };
        if (obj.kind === "pageforge-template-backup" && Array.isArray(obj.templates)) {
          for (const item of obj.templates) {
            const o = item as { name?: string; createdAt?: number; doc?: unknown };
            if (validDoc(o.doc)) {
              entries.push({
                name: (o.name || "Imported template").slice(0, 60),
                createdAt: typeof o.createdAt === "number" ? o.createdAt : undefined,
                doc: migrateDoc(structuredClone(o.doc) as Doc),
              });
            }
          }
          if (entries.length > 0) {
            resolve(entries);
            return;
          }
          reject(new Error("The backup file contains no valid templates."));
          return;
        }
        if (obj.kind === "pageforge-template" && validDoc(obj.doc)) {
          const t = parsed as TemplateFileV1;
          entries.push({
            name: (t.name || "Imported template").slice(0, 60),
            createdAt: t.createdAt,
            doc: migrateDoc(structuredClone(t.doc) as Doc),
          });
          resolve(entries);
          return;
        }
      }
      // raw project file (.pageforge.json) — accept it as a single template
      if (validDoc(parsed)) {
        entries.push({
          name: (parsed.name || file.name.replace(/\.json$/i, "") || "Imported template").slice(0, 60),
          doc: migrateDoc(structuredClone(parsed) as Doc),
        });
        resolve(entries);
        return;
      }
      reject(new Error("Not a PageForge template or project file."));
    };
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsText(file);
  });
}
