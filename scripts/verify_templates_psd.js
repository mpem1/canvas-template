/* Verify: (A) user templates — save current design (any/custom page size) as a
 * template, list with previews, apply with fresh ids, undo, persist across
 * reload, delete; starter templates still work.
 *           (B) PSD import — layered PSD → image+text frames with DPI-aware
 * page mapping; flattened PSD fallback at 300 dpi; invalid file rejected.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { writePsd } = require("ag-psd");

let PASS = 0, FAIL = 0;
function check(label, cond, extra) {
  if (cond) PASS++;
  else FAIL++;
  console.log((cond ? "PASS " : "FAIL ") + label + (extra !== undefined ? "  " + JSON.stringify(extra) : ""));
}

function solidImageData(w, h, [r, g, b]) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

/* Insert an 8BIM 0x03ED ResolutionInfo image resource so readPsd sees dpi. */
function insertResolutionInfo(buf, dpi) {
  const dv = new DataView(buf);
  const head = new Uint8Array(buf, 0, 26);
  if (String.fromCharCode(...head.slice(0, 4)) !== "8BPS") throw new Error("bad psd");
  const cmLen = dv.getUint32(26);
  const irLenOff = 26 + 4 + cmLen;
  const irLen = dv.getUint32(irLenOff);
  const irStart = irLenOff + 4;
  const irData = new Uint8Array(buf, irStart, irLen);
  const res = new Uint8Array(12 + 16);
  const rv = new DataView(res.buffer);
  res.set([0x38, 0x42, 0x49, 0x4d], 0); // "8BIM"
  rv.setUint16(4, 0x03ed);              // resource id: ResolutionInfo
  rv.setUint16(6, 0);                   // empty pascal name (len 0 + pad)
  rv.setUint32(8, 16);                  // data size
  rv.setUint32(12, dpi << 16);          // hRes fixed-point
  rv.setUint16(16, 1);                  // hResUnit: px/inch
  rv.setUint16(18, 2);                  // width display unit
  rv.setUint32(20, dpi << 16);          // vRes
  rv.setUint16(24, 1);
  rv.setUint16(26, 2);
  const tail = new Uint8Array(buf, irStart + irLen);
  const out = new Uint8Array(irStart + irLen + res.length + tail.length);
  out.set(new Uint8Array(buf, 0, irStart), 0);
  out.set(irData, irStart);
  out.set(res, irStart + irLen);
  out.set(tail, irStart + irLen + res.length);
  new DataView(out.buffer).setUint32(irLenOff, irLen + res.length);
  return out.buffer;
}

(async () => {
  /* ---------- build PSD fixtures ---------- */
  const dir = fs.mkdtempSync("/tmp/psdfix-");
  const textStyle = {
    fontSize: 30,
    font: { name: "Arial-BoldMT" },
    fillColor: { r: 185, g: 28, b: 28 },
  };
  const layered = writePsd(
    {
      width: 400, height: 300,
      children: [
        { name: "Blue box", left: 200, top: 180, right: 320, bottom: 240,
          imageData: solidImageData(120, 60, [37, 99, 235]) },
        { name: "Red box", left: 40, top: 50, right: 140, bottom: 130,
          imageData: solidImageData(100, 80, [220, 38, 38]) },
        { name: "Headline", left: 20, top: 10, right: 300, bottom: 60,
          text: {
            text: "Hello\rPSD", transform: [1, 0, 0, 1, 0, 0],
            left: 20, top: 10, right: 300, bottom: 60,
            style: textStyle,
            styleRuns: [{ length: 9, style: textStyle }],
            paragraphStyle: { justification: "center" },
          } },
      ],
    },
    { generateThumbnail: false },
  );
  const flat = writePsd(
    {
      width: 600, height: 400, imageData: solidImageData(600, 400, [250, 250, 250]),
      imageResources: {
        resolutionInfo: {
          horizontalResolution: 300, horizontalResolutionUnit: "PPI",
          widthUnit: "Inches", verticalResolution: 300, verticalResolutionUnit: "PPI", heightUnit: "Inches",
        },
      },
    },
    { generateThumbnail: false },
  );
  const psd1 = path.join(dir, "mockup_layers.psd");
  const psd2 = path.join(dir, "flat_300dpi.psd");
  const psd3 = path.join(dir, "garbage.psd");
  fs.writeFileSync(psd1, Buffer.from(layered));
  fs.writeFileSync(psd2, Buffer.from(flat));
  fs.writeFileSync(psd3, Buffer.from("this is not a photoshop file at all"));
  // sanity: ag-psd must read back what we wrote (skip pixels — no DOM in Node)
  const { readPsd } = require("ag-psd");
  const r1 = readPsd(fs.readFileSync(psd1), { skipLayerImageData: true, skipCompositeImageData: true });
  console.log(`fixtures: layered children=${r1.children.length} text='${(r1.children[2].text || {}).text}' dpi2=${readPsd(fs.readFileSync(psd2), { skipLayerImageData: true, skipCompositeImageData: true }).imageResources?.resolutionInfo?.horizontalResolution}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForFunction("!!window.__pfStore && !!window.__pfStore.getState().hydrated");
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction("!!window.__pfStore && !!window.__pfStore.getState().hydrated");

  const openDialog = async () => {
    await page.getByTitle("Start from a template").click();
    await page.waitForTimeout(350);
  };
  const gotoTab = async (which) => {
    await page.getByRole("tab", { name: which === "mine" ? /^My templates/ : /^Starter/ }).click();
    await page.waitForTimeout(200);
  };
  const toastText = () =>
    page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.textContent).join(" | "));

  /* ================= A. USER TEMPLATES ================= */
  // custom-size doc with distinctive frames
  await page.evaluate(() => {
    const st = window.__pfStore.getState();
    st.setDoc({
      name: "Custom 600x700", width: 600, height: 700, unit: "in",
      margins: { top: 24, right: 24, bottom: 24, left: 24 }, bleed: 0,
      pages: [
        { id: "pa", background: "#ffffff", frames: [] },
        { id: "pb", background: "#f5f5f4", frames: [] },
      ],
    });
    window.__pfStore.getState().addFrame({
      id: "orig-t", name: "Tagline", type: "text", x: 40, y: 60, w: 400, h: 90,
      rotation: 0, opacity: 1, locked: false, text: "TEMPLATE MARK",
      fontFamily: "Anton", fontSize: 40, bold: false, italic: false, underline: false,
      uppercase: false, align: "left", vAlign: "top", lineHeight: 1.3, letterSpacing: 0,
      color: "#18181b", outlineWidth: 0, outlineColor: "#000000",
      shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0, shadowColor: "#000000",
      fill: "none", padding: 8, autoFit: false, fillHeight: false,
    });
    window.__pfStore.getState().addFrame({
      id: "orig-s", name: "Dot", type: "shape", shape: "ellipse", x: 300, y: 400, w: 120, h: 120,
      rotation: 0, opacity: 1, locked: false, fill: "#10b981", stroke: "none", strokeWidth: 0, radius: 0,
    });
  });
  await page.waitForTimeout(300);

  await openDialog();
  await gotoTab("mine");
  const emptyState = await page.getByText("No saved templates yet").isVisible().catch(() => false);
  check("A1 empty state before any save", emptyState);

  await page.getByLabel("Template name").fill("My Custom 600x700");
  await page.getByRole("button", { name: "Save current design as template" }).click();
  await page.waitForTimeout(400);
  const saveToast = await toastText();
  check("A2 save toast with size label", /Template saved/.test(saveToast) && /6\.25 × 7\.29 in/.test(saveToast), saveToast);
  const cardCount = await page.getByRole("button", { name: "Apply template My Custom 600x700" }).count();
  check("A3 saved card appears in My templates", cardCount === 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  // different doc, then apply the template
  await page.evaluate(() => {
    window.__pfStore.getState().setDoc({
      name: "Scratch", width: 400, height: 400, unit: "px",
      margins: { top: 10, right: 10, bottom: 10, left: 10 }, bleed: 0,
      pages: [{ id: "px", background: "#ffffff", frames: [] }],
    });
  });
  await page.waitForTimeout(250);
  const pastBefore = await page.evaluate(() => window.__pfStore.getState().past.length);
  await openDialog();
  await gotoTab("mine");
  await page.getByRole("button", { name: "Apply template My Custom 600x700" }).click();
  await page.waitForTimeout(400);
  const applied = await page.evaluate(() => {
    const d = window.__pfStore.getState().doc;
    const f = d.pages[0].frames;
    return {
      w: d.width, h: d.height, unit: d.unit, name: d.name,
      pages: d.pages.length, p2bg: d.pages[1]?.background,
      frames: f.length, ids: f.map((x) => x.id),
      text: f.find((x) => x.type === "text")?.text,
      textId: f.find((x) => x.type === "text")?.id,
      shape: f.find((x) => x.type === "shape")?.shape,
      margins: d.margins.left,
    };
  });
  check("A4 applied doc restores custom size/unit/pages",
    applied.w === 600 && applied.h === 700 && applied.unit === "in" && applied.pages === 2 && applied.p2bg === "#f5f5f4", applied);
  check("A5 applied doc restores frames + content", applied.frames === 2 && applied.text === "TEMPLATE MARK" && applied.shape === "ellipse", applied);
  check("A6 frame ids are FRESH (no collision)", applied.ids.includes("orig-t") === false && applied.ids.includes("orig-s") === false, applied.ids);
  check("A7 doc renamed to template name", applied.name === "My Custom 600x700", applied.name);
  const pastAfter = await page.evaluate(() => window.__pfStore.getState().past.length);
  check("A8 apply pushes history (undoable)", pastAfter === pastBefore + 1, { pastBefore, pastAfter });
  await page.evaluate(() => window.__pfStore.getState().undo());
  const afterUndo = await page.evaluate(() => ({ w: window.__pfStore.getState().doc.width, n: window.__pfStore.getState().doc.name }));
  check("A9 undo returns to scratch doc", afterUndo.w === 400 && afterUndo.n === "Scratch", afterUndo);

  // persistence across reload
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction("!!window.__pfStore && !!window.__pfStore.getState().hydrated");
  await openDialog();
  await gotoTab("mine");
  check("A10 template persists across reload",
    (await page.getByRole("button", { name: "Apply template My Custom 600x700" }).count()) === 1);

  // delete
  await page.getByTitle("Delete template").first().click();
  await page.waitForTimeout(300);
  const goneEmpty = await page.getByText("No saved templates yet").isVisible().catch(() => false);
  check("A11 delete removes the card + empty state back", goneEmpty);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // starter templates still fine
  await openDialog();
  await gotoTab("starter");
  await page.getByRole("button", { name: /Event Poster/ }).click();
  await page.waitForTimeout(400);
  const poster = await page.evaluate(() => window.__pfStore.getState().doc);
  check("A12 starter template still applies (13×19in poster)", poster.width === 1248 && poster.height === 1824, { w: poster.width, h: poster.height });

  /* ================= B. PSD IMPORT ================= */
  const psdInput = page.locator('input[accept^=".psd"]');
  const docSnapshot = () => page.evaluate(() => {
    const d = window.__pfStore.getState().doc;
    const f = d.pages[0].frames;
    return {
      name: d.name, w: d.width, h: d.height, unit: d.unit, margins: d.margins.left,
      n: f.length,
      imgs: f.filter((x) => x.type === "image").map((x) => ({ x: x.x, y: x.y, w: x.w, h: x.h, iw: x.imgW, ih: x.imgH, fit: x.fit, hasSrc: !!x.src })),
      texts: f.filter((x) => x.type === "text").map((x) => ({ text: x.text, fs: x.fontSize, color: x.color, font: x.fontFamily, bold: x.bold, align: x.align, x: x.x, y: x.y })),
    };
  });

  // B1. layered PSD @ 72dpi → k = 96/72 = 4/3
  await psdInput.setInputFiles(psd1);
  await page.waitForFunction(() => {
    const d = window.__pfStore.getState().doc;
    return d && d.name === "mockup_layers";
  }, { timeout: 15000 });
  await page.waitForTimeout(400);
  let s = await docSnapshot();
  const toast1 = await toastText();
  check("B1 import toast counts layers", /PSD imported — 2 image layers, 1 text layer/.test(toast1), toast1);
  check("B2 page mapped 400×300@72dpi → 533×400 app px", s.w === 533 && s.h === 400 && s.unit === "in" && s.margins === 0, s);
  const red = s.imgs.find((i) => i.iw === 100);
  const blue = s.imgs.find((i) => i.iw === 120);
  check("B3 red box at 40,50 100×80 → 53,67 133×107", red && red.x === 53 && red.y === 67 && red.w === 133 && red.h === 107, red);
  check("B4 blue box at 200,180 120×60 → 267,240 160×80", blue && blue.x === 267 && blue.y === 240 && blue.w === 160 && blue.h === 80, blue);
  check("B5 image layers use fit=fill + real PNG src", red && blue && red.fit === "fill" && blue.hasSrc === true, red);
  const t = s.texts[0];
  check("B6 text layer: content + newlines", t && t.text === "Hello\nPSD", t);
  check("B7 text 30pt → 40px, red, Arial, bold, centered",
    t && Math.abs(t.fs - 40) < 0.1 && t.color === "#b91c1c" && t.font === "Arial" && t.bold === true && t.align === "center", t);
  // stack order: text (top in PSD children last→) — frames reversed: [text, red, blue]
  const order = await page.evaluate(() =>
    window.__pfStore.getState().doc.pages[0].frames.map((f) => f.type));
  check("B8 z-order reversed (PSD bottom→top)", JSON.stringify(order) === '["text","image","image"]', order);
  // visible render: text on canvas + 2 <img> elements
  const render = await page.evaluate(() => {
    const pvs = [...document.querySelectorAll('[data-page-index="0"]')];
    const pv = pvs[pvs.length - 1];
    return { imgs: pv.querySelectorAll("img").length, hasText: !![...pv.querySelectorAll("div")].find((d) => d.textContent === "Hello\nPSD" || d.textContent === "HelloPSD" || /^Hello/.test(d.textContent || "")) };
  });
  check("B9 canvas renders both layers + text", render.imgs === 2 && render.hasText, render);

  // B10. flattened 300dpi PSD → composite fallback, 600×400@300 → 192×128
  await psdInput.setInputFiles(psd2);
  await page.waitForFunction(() => {
    const d = window.__pfStore.getState().doc;
    return d && d.name === "flat_300dpi";
  }, { timeout: 15000 });
  await page.waitForTimeout(400);
  s = await docSnapshot();
  const toast2 = await toastText();
  check("B10 300dpi flattened: 600×400 → 192×128", s.w === 192 && s.h === 128 && s.n === 1, s);
  check("B11 composite covers page as fill image", s.imgs[0] && s.imgs[0].x === 0 && s.imgs[0].w === 192 && s.imgs[0].h === 128 && s.imgs[0].fit === "fill", s.imgs[0]);
  check("B12 flattened toast", /flattened composite/.test(toast2), toast2);

  // B13. invalid file → error toast, doc unchanged
  const beforeBad = await page.evaluate(() => window.__pfStore.getState().doc.name);
  await psdInput.setInputFiles(psd3);
  await page.waitForTimeout(600);
  const toast3 = await toastText();
  const afterBad = await page.evaluate(() => window.__pfStore.getState().doc.name);
  check("B13 invalid PSD rejected with error toast, doc kept", /Not a valid Photoshop/.test(toast3) && afterBad === beforeBad, toast3);

  console.log(`\nerrors: ${errors.length ? errors.join(" | ") : "none"}`);
  console.log(`RESULT ${PASS} pass / ${FAIL} fail`);
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
