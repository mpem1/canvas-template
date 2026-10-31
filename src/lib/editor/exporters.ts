"use client";

import type { Doc } from "./types";
import { PX_PER_INCH } from "./units";

export function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "pageforge"
  );
}

function captureFilter(node: Node): boolean {
  if (node instanceof HTMLElement && node.dataset?.exportIgnore === "true") {
    return false;
  }
  return true;
}

async function capturePage(
  el: HTMLElement,
  w: number,
  h: number,
  pixelRatio: number,
): Promise<string> {
  const { toPng } = await import("html-to-image");
  return toPng(el, {
    width: w,
    height: h,
    pixelRatio,
    backgroundColor: "#ffffff",
    cacheBust: true,
    filter: captureFilter,
    style: {
      transform: "none",
      transformOrigin: "top left",
      margin: "0",
      borderRadius: "0",
      boxShadow: "none",
    },
  });
}

/** Export one page as a PNG data-url download. */
export async function exportPagePng(
  el: HTMLElement,
  doc: Doc,
  pageIndex: number,
  scale = 2,
): Promise<void> {
  const dataUrl = await capturePage(el, doc.width, doc.height, scale);
  triggerDownload(dataUrl, `${slugify(doc.name)}-page-${pageIndex + 1}.png`);
}

/** Export all pages as a multi-page PDF with exact physical page size. */
export async function exportPdf(
  doc: Doc,
  els: (HTMLElement | null | undefined)[],
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const wIn = doc.width / PX_PER_INCH;
  const hIn = doc.height / PX_PER_INCH;
  const orientation = doc.width > doc.height ? "landscape" : "portrait";
  const pdf = new jsPDF({
    unit: "in",
    format: [wIn, hIn],
    orientation,
    compress: true,
  });
  for (let i = 0; i < doc.pages.length; i++) {
    const el = els[i];
    if (!el) continue;
    const dataUrl = await capturePage(el, doc.width, doc.height, 2);
    if (i > 0) pdf.addPage([wIn, hIn], orientation);
    pdf.addImage(dataUrl, "PNG", 0, 0, wIn, hIn, `p${i}`, "FAST");
  }
  pdf.save(`${slugify(doc.name)}.pdf`);
}

/** Download the whole project as an editable JSON file. */
export function exportJson(doc: Doc): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${slugify(doc.name)}.pageforge.json`);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Read + validate an uploaded project JSON file. */
export function importJson(file: File): Promise<Doc> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const doc = JSON.parse(String(reader.result)) as Doc;
        if (
          doc &&
          typeof doc.width === "number" &&
          typeof doc.height === "number" &&
          Array.isArray(doc.pages) &&
          doc.pages.length > 0
        ) {
          resolve(doc);
        } else {
          reject(new Error("Not a valid PageForge project file."));
        }
      } catch {
        reject(new Error("Could not parse the project file."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsText(file);
  });
}

/** Read an uploaded image file into a data URL. */
export function readImageFile(file: File): Promise<{ src: string; name: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Not an image file."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ src: String(reader.result), name: file.name });
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });
}

/** Natural pixel dimensions of an image data-url (0×0 for SVGs w/o intrinsic size). */
export function readImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not load the image."));
    img.src = src;
  });
}
