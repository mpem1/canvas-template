/* Verify: adjustable text drop shadow (offset X/Y, blur, color).
 * Covers: defaults off, store-driven rendering, negative offsets, blur-only
 * glow, panel fields + clamping, thumbnail + editing surfaces, all-zero-off,
 * undo/redo history, autosave persistence, migrateDoc backfill.
 */
const { chromium } = require("playwright");

let PASS = 0, FAIL = 0;
function check(label, cond, extra) {
  if (cond) PASS++;
  else FAIL++;
  console.log((cond ? "PASS " : "FAIL ") + label + (extra !== undefined ? "  " + JSON.stringify(extra) : ""));
}
/* Computed text-shadow serialization differs (Chromium puts color first),
 * so parse it: px numbers in order [ox, oy, blur] + the color substring. */
function parseShadow(s) {
  if (!s || s === "none") return { nums: [], colorPart: "" };
  const nums = (s.match(/-?[\d.]+px/g) || []).map((x) => parseFloat(x));
  const colorPart = s.replace(/-?[\d.]+px/g, "").trim().replace(/\s+/g, " ");
  return { nums, colorPart };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForFunction("!!window.__pfStore && !!window.__pfStore.getState().hydrated");
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction("!!window.__pfStore && !!window.__pfStore.getState().hydrated");

  // Fresh doc + a hand-built text frame WITHOUT shadow fields — addFrame must
  // migrate it to field-complete defaults (also covers old autosaved docs).
  await page.evaluate(() => {
    const st = window.__pfStore.getState();
    st.setDoc({
      name: "ShadowVerify", width: 816, height: 1056, unit: "in",
      margins: { top: 48, right: 48, bottom: 48, left: 48 }, bleed: 12,
      pages: [{ id: "p1", background: "#ffffff", frames: [] }],
    });
    st.addFrame({
      id: "txt1", name: "Text 1", type: "text",
      x: 60, y: 120, w: 560, h: 180, rotation: 0, opacity: 1, locked: false,
      text: "Shadow FX", fontFamily: "Anton", fontSize: 64, bold: true, italic: false,
      underline: false, uppercase: false, align: "left", vAlign: "top",
      lineHeight: 1.3, letterSpacing: 0, color: "#18181b",
      outlineWidth: 0, outlineColor: "#000000", fill: "none", padding: 8,
      autoFit: false, fillHeight: false,
    });
    st.select(["txt1"]);
  });
  await page.waitForTimeout(350);

  const canvasShadow = () => page.evaluate(() => {
    const pvs = [...document.querySelectorAll('[data-page-index="0"]')];
    const pv = pvs[pvs.length - 1]; // canvas PageView is LAST (thumbnails first)
    const target = [...pv.querySelectorAll("div")].filter((d) => d.textContent === "Shadow FX").pop();
    return getComputedStyle(target).textShadow;
  });
  // reference: how Chromium serializes a given hex color
  const colorProbe = (hex) => page.evaluate((h) => {
    const el = document.createElement("div");
    el.style.color = h;
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  }, hex);
  const storeShadow = () => page.evaluate(() => {
    const f = window.__pfStore.getState().doc.pages[0].frames.find((x) => x.id === "txt1");
    return { x: f.shadowOffsetX, y: f.shadowOffsetY, b: f.shadowBlur, c: f.shadowColor };
  });

  /* ---------- A. defaults ---------- */
  const a0 = await storeShadow();
  check("A1 addFrame backfills shadow defaults (0/0/0/#000000)",
    a0.x === 0 && a0.y === 0 && a0.b === 0 && a0.c === "#000000", a0);
  const a1 = parseShadow(await canvasShadow());
  check("A2 no text-shadow rendered by default", a1.nums.length === 0, a1);

  /* ---------- B. store-driven shadow ---------- */
  await page.evaluate(() => {
    window.__pfStore.getState().updateFrames(["txt1"], (f) => {
      if (f.type === "text") { f.shadowOffsetX = 8; f.shadowOffsetY = 6; f.shadowBlur = 4; f.shadowColor = "#ff0000"; }
    });
  });
  await page.waitForTimeout(250);
  const redProbe = await colorProbe("#ff0000");
  let cs = parseShadow(await canvasShadow());
  check("B1 canvas text-shadow 8/6/4 with red", JSON.stringify(cs.nums) === "[8,6,4]" && cs.colorPart === redProbe, cs);

  /* ---------- C. negative offsets ---------- */
  await page.evaluate(() => {
    window.__pfStore.getState().updateFrames(["txt1"], (f) => { if (f.type === "text") f.shadowOffsetX = -12; });
  });
  await page.waitForTimeout(200);
  cs = parseShadow(await canvasShadow());
  check("C1 negative X offset renders (-12 6 4)", JSON.stringify(cs.nums) === "[-12,6,4]", cs);

  /* ---------- D. blur-only glow (offsets 0) stays active ---------- */
  await page.evaluate(() => {
    window.__pfStore.getState().updateFrames(["txt1"], (f) => {
      if (f.type === "text") { f.shadowOffsetX = 0; f.shadowOffsetY = 0; f.shadowBlur = 8; }
    });
  });
  await page.waitForTimeout(200);
  cs = parseShadow(await canvasShadow());
  check("D1 blur-only halo active (0 0 8)", JSON.stringify(cs.nums) === "[0,0,8]", cs);

  /* ---------- E. panel-driven fields ---------- */
  const ox = page.getByLabel("Shadow offset X px");
  const oy = page.getByLabel("Shadow offset Y px");
  const bl = page.getByLabel("Shadow blur px");
  await ox.click(); await ox.fill("15"); await ox.press("Enter");
  await oy.click(); await oy.fill("10"); await oy.press("Enter");
  await bl.click(); await bl.fill("6"); await bl.press("Enter");
  await page.waitForTimeout(300);
  let sv = await storeShadow();
  check("E1 panel commits offsets 15/10 and blur 6", sv.x === 15 && sv.y === 10 && sv.b === 6, sv);
  cs = parseShadow(await canvasShadow());
  check("E2 canvas renders panel values", JSON.stringify(cs.nums) === "[15,10,6]", cs);

  // clamp: blur 500 → MAX_SHADOW_BLUR (100)
  await bl.click(); await bl.fill("500"); await bl.press("Enter");
  await page.waitForTimeout(250);
  sv = await storeShadow();
  check("E3 blur clamped to 100", sv.b === 100, sv);
  await bl.click(); await bl.fill("6"); await bl.press("Enter");
  await page.waitForTimeout(200);

  /* ---------- F. thumbnail carries the same shadow ---------- */
  const thumbShadow = await page.evaluate(() => {
    const t0 = document.querySelector('[data-page-index="0"]'); // first = panel thumbnail
    const tt = [...t0.querySelectorAll("div")].filter((d) => d.textContent === "Shadow FX").pop();
    return getComputedStyle(tt).textShadow;
  });
  const tps = parseShadow(thumbShadow);
  check("F1 thumbnail text-shadow matches", JSON.stringify(tps.nums) === "[15,10,6]" && tps.colorPart === redProbe, tps);

  /* ---------- G. editing surface + text survives exit ---------- */
  const fc = await page.evaluate(() => {
    const pvs = [...document.querySelectorAll('[data-page-index="0"]')];
    const pv = pvs[pvs.length - 1];
    const r = pv.getBoundingClientRect();
    const f = window.__pfStore.getState().doc.pages[0].frames.find((x) => x.id === "txt1");
    const z = window.__pfStore.getState().zoom;
    return { cx: r.left + (f.x + f.w / 2) * z, cy: r.top + (f.y + f.h / 2) * z };
  });
  await page.mouse.dblclick(fc.cx, fc.cy, { delay: 40 });
  await page.waitForTimeout(300);
  const editShadow = parseShadow(await page.evaluate(() => {
    const ce = document.querySelector('[contenteditable="true"]');
    return ce ? getComputedStyle(ce).textShadow : null;
  }));
  check("G1 editing surface shows the shadow", JSON.stringify(editShadow.nums) === "[15,10,6]", editShadow);
  await page.keyboard.press("Escape"); // commit + exit
  await page.waitForTimeout(250);
  const g2 = await page.evaluate(() => {
    const f = window.__pfStore.getState().doc.pages[0].frames.find((x) => x.id === "txt1");
    return f.text;
  });
  check("G2 text intact after edit enter/exit with shadow", g2 === "Shadow FX", g2);

  /* ---------- H. all zeros → shadow off ---------- */
  await page.evaluate(() => {
    window.__pfStore.getState().updateFrames(["txt1"], (f) => {
      if (f.type === "text") { f.shadowOffsetX = 0; f.shadowOffsetY = 0; f.shadowBlur = 0; }
    });
  });
  await page.waitForTimeout(200);
  cs = parseShadow(await canvasShadow());
  check("H1 0/0/0 renders no shadow", cs.nums.length === 0, cs);

  /* ---------- I. undo/redo history semantics ---------- */
  const pastBefore = await page.evaluate(() => window.__pfStore.getState().past.length);
  await page.evaluate(() => {
    window.__pfStore.getState().updateFrames(["txt1"], (f) => { if (f.type === "text") f.shadowOffsetX = 33; });
  });
  await page.waitForTimeout(200);
  const pastAfter = await page.evaluate(() => ({
    n: window.__pfStore.getState().past.length,
    x: window.__pfStore.getState().doc.pages[0].frames.find((x) => x.id === "txt1").shadowOffsetX,
  }));
  check("I1 one history entry per change", pastAfter.n === pastBefore + 1 && pastAfter.x === 33, { before: pastBefore, ...pastAfter });
  await page.evaluate(() => window.__pfStore.getState().undo());
  await page.waitForTimeout(150);
  const undone = await page.evaluate(() => window.__pfStore.getState().doc.pages[0].frames.find((x) => x.id === "txt1").shadowOffsetX);
  check("I2 undo reverts offset to 0", undone === 0, undone);
  await page.evaluate(() => window.__pfStore.getState().redo());
  await page.waitForTimeout(150);
  const redone = await page.evaluate(() => window.__pfStore.getState().doc.pages[0].frames.find((x) => x.id === "txt1").shadowOffsetX);
  check("I3 redo restores 33", redone === 33, redone);

  /* ---------- J. autosave persistence across reload ---------- */
  await page.evaluate(() => {
    window.__pfStore.getState().updateFrames(["txt1"], (f) => {
      if (f.type === "text") { f.shadowOffsetX = 20; f.shadowOffsetY = 14; f.shadowBlur = 8; f.shadowColor = "#0ea5e9"; }
    });
  });
  await page.waitForTimeout(1000); // autosave debounce 600ms
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction("!!window.__pfStore && !!window.__pfStore.getState().hydrated");
  sv = await storeShadow();
  check("J1 shadow persists after reload", sv.x === 20 && sv.y === 14 && sv.b === 8 && sv.c === "#0ea5e9", sv);
  const skyProbe = await colorProbe("#0ea5e9");
  cs = parseShadow(await canvasShadow());
  check("J2 canvas re-renders persisted shadow", JSON.stringify(cs.nums) === "[20,14,8]" && cs.colorPart === skyProbe, cs);

  /* ---------- K. migrateDoc backfill on legacy doc JSON ---------- */
  const mig = await page.evaluate(() => {
    const st = window.__pfStore.getState();
    const doc = JSON.parse(JSON.stringify(st.doc));
    for (const p of doc.pages) for (const f of p.frames) {
      delete f.shadowOffsetX; delete f.shadowOffsetY; delete f.shadowBlur; delete f.shadowColor;
    }
    st.setDoc(doc);
    const t1 = window.__pfStore.getState().doc.pages[0].frames.find((x) => x.id === "txt1");
    return { x: t1.shadowOffsetX, y: t1.shadowOffsetY, b: t1.shadowBlur, c: t1.shadowColor };
  });
  check("K1 migrateDoc backfills shadow fields", mig.x === 0 && mig.y === 0 && mig.b === 0 && mig.c === "#000000", mig);

  console.log(`\nerrors: ${errors.length ? errors.join(" | ") : "none"}`);
  console.log(`RESULT ${PASS} pass / ${FAIL} fail`);
  await browser.close();
  process.exit(FAIL ? 1 : 0);
})();
