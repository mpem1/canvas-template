import { migrateDoc, uid } from "./factory";
import { idbDelete, idbGetAll, idbPut, openIdb } from "./idb";
import type { Doc } from "./types";
import { fromPx, round2 } from "./units";

/**
 * User-saved templates: full document snapshots (page size, unit, margins,
 * bleed, pages and frames) persisted across reloads. Applying a template
 * clones it with FRESH ids so the same template can be used many times.
 *
 * Storage: IndexedDB (no practical size cap). localStorage's ~5MB quota
 * cannot even hold ONE Photoshop-imported template — its layers are stored
 * as multi-MB PNG data URLs — so saves used to fail silently. Legacy
 * localStorage templates are migrated into IndexedDB automatically, and if
 * IndexedDB is unavailable (rare) we fall back to localStorage, where an
 * oversized save now THROWS instead of failing silently.
 */

const DB_NAME = "pageforge-templates";
const STORE = "templates";
const LEGACY_LS_KEY = "pageforge-templates-v1";
const LS_FALLBACK_KEY = "pageforge-templates-fallback";
const MAX_TEMPLATES = 60;

export interface UserTemplate {
  id: string;
  name: string;
  createdAt: number;
  /** Complete document snapshot — size/unit/margins/bleed/pages/frames. */
  doc: Doc;
}

function validTemplate(t: unknown): t is UserTemplate {
  const o = t as UserTemplate;
  return !!o && typeof o.id === "string" && !!o.doc && Array.isArray(o.doc.pages);
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openIdb(DB_NAME, 1, (db) => {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    });
    dbPromise.catch(() => {
      dbPromise = null; // allow a retry on the next call
    });
  }
  return dbPromise;
}

/* ---------------- legacy localStorage migration ---------------- */

let legacyMigrated = false;

/** Move pre-IDB templates (plain localStorage JSON) into IndexedDB once. */
async function migrateLegacy(): Promise<void> {
  if (legacyMigrated) return;
  legacyMigrated = true; // attempt once per session, whatever the outcome
  try {
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr)) {
      for (const t of arr) {
        if (validTemplate(t)) await idbPut(await getDb(), STORE, t);
      }
    }
  } catch {
    // unreadable or unwritable legacy data — start fresh rather than block
  }
  try {
    localStorage.removeItem(LEGACY_LS_KEY);
  } catch {
    // ignore
  }
}

/* ---------------- localStorage fallback backend ---------------- */

function lsList(): UserTemplate[] {
  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter(validTemplate) : [];
  } catch {
    return [];
  }
}

function lsPersist(list: UserTemplate[]): void {
  // throws on quota — callers surface that to the user
  localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(list));
}

/* ---------------- public API (async) ---------------- */

export async function listUserTemplates(): Promise<UserTemplate[]> {
  await migrateLegacy();
  let raw: UserTemplate[];
  try {
    raw = await idbGetAll<UserTemplate>(await getDb(), STORE);
  } catch {
    return lsList(); // IndexedDB unavailable — fallback store
  }
  return raw
    .filter(validTemplate)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((t) => ({ ...t, doc: migrateDoc(t.doc) }));
}

/** Snapshot the current document under a template name. Throws on failure. */
export async function saveUserTemplate(name: string, doc: Doc): Promise<UserTemplate> {
  const cleanName = name.trim() || doc.name || "My template";
  const entry: UserTemplate = {
    id: uid(),
    name: cleanName.slice(0, 60),
    createdAt: Date.now(),
    doc: migrateDoc(structuredClone(doc) as Doc),
  };
  try {
    const db = await getDb();
    await idbPut(db, STORE, entry);
    // enforce the cap: drop the oldest beyond MAX_TEMPLATES
    const all = await idbGetAll<UserTemplate>(db, STORE);
    const excess = all
      .filter(validTemplate)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, Math.max(0, all.length - MAX_TEMPLATES));
    for (const t of excess) await idbDelete(db, STORE, t.id);
  } catch {
    // IndexedDB unavailable — fall back to localStorage, honestly
    try {
      lsPersist([entry, ...lsList()].slice(0, 10));
    } catch {
      throw new Error(
        "Browser storage is unavailable or full, so the template could not be saved.",
      );
    }
  }
  return entry;
}

export async function deleteUserTemplate(id: string): Promise<void> {
  try {
    await idbDelete(await getDb(), STORE, id);
  } catch {
    // fall through to the fallback store
  }
  try {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(lsList().filter((t) => t.id !== id)));
  } catch {
    // ignore — nothing we can do about a failing fallback
  }
}

/**
 * Turn a template into a brand-new working document: deep clone with fresh
 * ids for every page and frame so ids never collide with anything.
 */
export function templateToDoc(t: UserTemplate): Doc {
  const doc = structuredClone(t.doc) as Doc;
  doc.name = t.name;
  for (const page of doc.pages) {
    page.id = uid();
    for (const f of page.frames) f.id = uid();
  }
  return migrateDoc(doc);
}

/** "13″ × 19″" / "21 × 29.7 cm" style label from the doc's own unit. */
export function templateSizeLabel(doc: Doc): string {
  const fmt = (px: number) => String(round2(fromPx(px, doc.unit)));
  return `${fmt(doc.width)} × ${fmt(doc.height)} ${doc.unit}`;
}
