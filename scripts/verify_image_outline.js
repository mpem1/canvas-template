/* Verify: (1) image aspect ratio is preserved in keep-aspect modes at every zoom/pan/resize
 *         (Tailwind preflight img clamp regression), (2) text outline width+color feature.
 */
const { chromium } = require("playwright");

let PASS = 0, FAIL = 0;
function check(label, cond, extra) {
  if (cond) PASS++;
  else FAIL++;
  console.log((cond ? "PASS " : "FAIL ") + label + (extra !== undefined ? "  " + JSON.stringify(extra) : ""));
}
const NATURAL = 1600 / 900; // 1.7778

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

  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1600; c.height = 900;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 1600, 900);
    grad.addColorStop(0, "#ef4444"); grad.addColorStop(1, "#3b82f6");
    g.fillStyle = grad; g.fillRect(0, 0, 1600, 900);
    g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = 4;
    for (let x = 0; x <= 1600; x += 100) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 900); g.stroke(); }
    for (let y = 0; y <= 900; y += 100) { g.beginPath(); g.moveTo(0, y); g.lineTo(1600, y); g.stroke(); }
    g.fillStyle = "#fff"; g.font = "bold 160px sans-serif"; g.fillText("16:9", 640, 500);
    return c.toDataURL("image/png");
  });

  await page.evaluate((src) => {
    const st = window.__pfStore.getState();
    st.setDoc({
      name: "AspectVerify", width: 816, height: 1056, unit: "in",
      margins: { top: 48, right: 48, bottom: 48, left: 48 }, bleed: 12,
      pages: [{ id: "p1", background: "#ffffff", frames: [] }],
    });
    st.addFrame({
      id: "img1", name: "Image 1", type: "image",
      x: 208, y: 200, w: 400, h: 300, rotation: 0, opacity: 1, locked: false,
      src, fileName: "test16x9.png", fit: "cover", radius: 0,
      imgW: 1600, imgH: 900, scale: 1, offsetX: 0, offsetY: 0,
    });
    st.select(["img1"]);
  }, dataUrl);
  await page.waitForTimeout(300);

  const measure = () => page.evaluate(() => {
    const pvs = [...document.querySelectorAll('[data-page-index="0"]')];
    const pv = pvs[pvs.length - 1];
    const img = pv.querySelector("img");
    const r = img.getBoundingClientRect();
    const z = window.__pfStore.getState().zoom;
    const f = window.__pfStore.getState().doc.pages[0].frames[0];
    const cs = getComputedStyle(img);
    return {
      elW: +(r.width / z).toFixed(1), elH: +(r.height / z).toFixed(1),
      dist: +((r.width / r.height) / (1600 / 900)).toFixed(4),
      fit: f.fit, scale: +f.scale.toFixed(4), fw: f.w, fh: f.h,
      maxWidth: cs.maxWidth, objectFit: cs.objectFit,
    };
  });
  const frameCenterPx = async () => page.evaluate(() => {
    const pvs = [...document.querySelectorAll('[data-page-index="0"]')];
    const pv = pvs[pvs.length - 1];
    const r = pv.getBoundingClientRect();
    const f = window.__pfStore.getState().doc.pages[0].frames[0];
    const z = window.__pfStore.getState().zoom;
    return { cx: r.left + (f.x + f.w / 2) * z, cy: r.top + (f.y + f.h / 2) * z };
  });

  /* ---------- A. keep-aspect (cover) at every stage ---------- */
  let m = await measure();
  check("A1 preflight clamp neutralized (max-width none)", m.maxWidth === "none", m.maxWidth);
  check("A2 cover@100%: uniform element 533x300, aspect kept",
    Math.abs(m.dist - 1) < 0.005 && Math.abs(m.elW - 533.3) < 1 && Math.abs(m.elH - 300) < 1, m);
  check("A2b cover safety net objectFit", m.objectFit === "cover", m.objectFit);

  const c = await frameCenterPx();
  await page.mouse.dblclick(c.cx, c.cy, { delay: 40 });
  await page.waitForTimeout(250);
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(40); }
  m = await measure();
  check("A3 zoomed ~2.2x: aspect EXACTLY preserved", Math.abs(m.dist - 1) < 0.005, m);

  await page.mouse.move(c.cx, c.cy);
  await page.mouse.down();
  await page.mouse.move(c.cx + 500, c.cy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  m = await measure();
  check("A4 panned past horizontal edge: aspect preserved", Math.abs(m.dist - 1) < 0.005, m);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const se = await page.evaluate(() => {
    const pvs = [...document.querySelectorAll('[data-page-index="0"]')];
    const pv = pvs[pvs.length - 1];
    const r = pv.getBoundingClientRect();
    const f = window.__pfStore.getState().doc.pages[0].frames[0];
    const z = window.__pfStore.getState().zoom;
    return { x: r.left + (f.x + f.w) * z, y: r.top + (f.y + f.h) * z };
  });
  await page.mouse.move(se.x, se.y);
  await page.mouse.down();
  await page.mouse.move(se.x - 260, se.y + 380, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  m = await measure();
  check("A5 frame resized narrow+tall (cover): aspect preserved", Math.abs(m.dist - 1) < 0.005, m);

  /* ---------- B. stretch mode = explicit, constant distortion ---------- */
  await page.evaluate(() => {
    window.__pfStore.getState().updateFrames(["img1"], (f) => {
      if (f.type === "image") { f.fit = "fill"; f.scale = 1; f.offsetX = 0; f.offsetY = 0; }
    });
  });
  await page.waitForTimeout(150);
  m = await measure();
  const stretchAt1 = m.dist;
  check("B1 stretch mode distorts by design (frame 12x868 vs 16:9)", Math.abs(stretchAt1 - 1) > 0.5, m);

  const c2 = await frameCenterPx();
  await page.mouse.dblclick(c2.cx, c2.cy, { delay: 40 });
  await page.waitForTimeout(250);
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(40); }
  m = await measure();
  check("B2 stretch zoom keeps SAME (constant) distortion", Math.abs(m.dist - stretchAt1) < 0.02, { now: m.dist, at1: stretchAt1 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  /* ---------- C. unknown dims → objectFit fallback never stretches ---------- */
  await page.evaluate(() => {
    const st = window.__pfStore.getState();
    st.updateFrames(["img1"], (f) => {
      if (f.type === "image") { f.fit = "cover"; f.imgW = 0; f.imgH = 0; f.scale = 1; f.offsetX = 0; f.offsetY = 0; }
    });
  });
  await page.waitForTimeout(200);
  m = await measure();
  check("C1 unknown dims + cover: objectFit cover crops (no stretch)", m.objectFit === "cover" && m.maxWidth === "none", m);
  await page.evaluate(() => {
    window.__pfStore.getState().updateFrames(["img1"], (f) => { if (f.type === "image") f.fit = "contain"; });
  });
  await page.waitForTimeout(200);
  m = await measure();
  check("C2 unknown dims + contain: objectFit contain", m.objectFit === "contain", m.objectFit);

  /* ---------- D. text outline ---------- */
  await page.evaluate(() => {
    const st = window.__pfStore.getState();
    st.addFrame({
      id: "txt1", name: "Text 1", type: "text",
      x: 60, y: 700, w: 500, h: 160, rotation: 0, opacity: 1, locked: false,
      text: "OUTLINE", fontFamily: "Anton", fontSize: 72, bold: true, italic: false,
      underline: false, uppercase: false, align: "left", vAlign: "top",
      lineHeight: 1.3, letterSpacing: 0, color: "#ffd700",
      outlineWidth: 0, outlineColor: "#000000", fill: "none", padding: 8,
      autoFit: false, fillHeight: false,
    });
    st.select(["txt1"]);
  });
  await page.waitForTimeout(300);

  const textCS = () => page.evaluate(() => {
    const pvs = [...document.querySelectorAll('[data-page-index="0"]')];
    const pv = pvs[pvs.length - 1];
    // the INNER text div is the LAST div whose textContent is exactly the text
    // (the outer TextBody wrapper also matches, but carries no text style)
    const target = [...pv.querySelectorAll("div")].filter((d) => d.textContent === "OUTLINE").pop();
    const cs = getComputedStyle(target);
    return {
      sw: cs.webkitTextStrokeWidth, sc: cs.webkitTextStrokeColor, po: cs.paintOrder,
      thumb: (() => {
        const t0 = document.querySelector('[data-page-index="0"]');
        const tt = [...t0.querySelectorAll("div")].filter((d) => d.textContent === "OUTLINE").pop();
        if (!tt) return null;
        const tcs = getComputedStyle(tt);
        return { sw: tcs.webkitTextStrokeWidth, sc: tcs.webkitTextStrokeColor };
      })(),
    };
  });

  let t = await textCS();
  check("D1 no outline by default (0px)", t.sw === "0px", t);

  // panel-driven: Outline px field → 3
  const outlineInput = page.getByLabel("Outline px");
  await outlineInput.click();
  await outlineInput.fill("3");
  await outlineInput.press("Enter");
  await page.waitForTimeout(300);

  // outline color via store (color input is native picker; hex field tested implicitly)
  await page.evaluate(() => {
    window.__pfStore.getState().updateFrames(["txt1"], (f) => {
      if (f.type === "text") f.outlineColor = "#ff0000";
    });
  });
  await page.waitForTimeout(250);

  t = await textCS();
  check("D2 panel width 3px + red outline applied", t.sw === "3px" && t.sc === "rgb(255, 0, 0)", t);
  check("D3 paint-order stroke (fill stays crisp)", t.po === "stroke", t.po);
  check("D4 thumbnail carries the same outline", t.thumb && t.thumb.sw === "3px" && t.thumb.sc === "rgb(255, 0, 0)", t.thumb);

  // editing surface carries the outline too
  const c3 = await page.evaluate(() => {
    const pvs = [...document.querySelectorAll('[data-page-index="0"]')];
    const pv = pvs[pvs.length - 1];
    const r = pv.getBoundingClientRect();
    const f = window.__pfStore.getState().doc.pages[0].frames.find((x) => x.id === "txt1");
    const z = window.__pfStore.getState().zoom;
    return { cx: r.left + (f.x + f.w / 2) * z, cy: r.top + (f.y + f.h / 2) * z };
  });
  await page.mouse.dblclick(c3.cx, c3.cy, { delay: 40 });
  await page.waitForTimeout(300);
  const editStroke = await page.evaluate(() => {
    const ce = document.querySelector('[contenteditable="true"]');
    if (!ce) return null;
    const cs = getComputedStyle(ce);
    return { sw: cs.webkitTextStrokeWidth, sc: cs.webkitTextStrokeColor };
  });
  check("D5 editing surface shows the outline", editStroke && editStroke.sw === "3px", editStroke);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // store values + undo/redo
  const storeVals = await page.evaluate(() => {
    const f = window.__pfStore.getState().doc.pages[0].frames.find((x) => x.id === "txt1");
    return { w: f.outlineWidth, c: f.outlineColor };
  });
  check("D6 store keeps outlineWidth 3 / #ff0000", storeVals.w === 3 && storeVals.c === "#ff0000", storeVals);

  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  const afterUndo = await page.evaluate(() => {
    const f = window.__pfStore.getState().doc.pages[0].frames.find((x) => x.id === "txt1");
    return { w: f.outlineWidth, c: f.outlineColor };
  });
  check("D7 undo reverts the color change (back to black, width kept)",
    afterUndo.c === "#000000" && afterUndo.w === 3, afterUndo);
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(200);

  // width 0 → outline gone
  await page.evaluate(() => {
    window.__pfStore.getState().updateFrames(["txt1"], (f) => { if (f.type === "text") f.outlineWidth = 0; });
  });
  await page.waitForTimeout(200);
  t = await textCS();
  check("D8 width 0 removes the outline", t.sw === "0px", t.sw);

  // migration: doc JSON without outline fields gets backfilled
  const mig = await page.evaluate(() => {
    const st = window.__pfStore.getState();
    const doc = JSON.parse(JSON.stringify(st.doc));
    for (const p of doc.pages) for (const f of p.frames) { delete f.outlineWidth; delete f.outlineColor; }
    st.setDoc(doc);
    // re-read FRESH state (the captured snapshot predates setDoc)
    const t1 = window.__pfStore.getState().doc.pages[0].frames.find((x) => x.id === "txt1");
    return { w: t1.outlineWidth, c: t1.outlineColor };
  });
  check("D9 migrateDoc backfills outline fields on old docs", mig.w === 0 && mig.c === "#000000", mig);

  console.log(`\nerrors: ${errors.length ? errors.join(" | ") : "none"}`);
  console.log(`RESULT ${PASS} pass / ${FAIL} fail`);
  await browser.close();
  process.exit(FAIL ? 1 : 0);
})();
