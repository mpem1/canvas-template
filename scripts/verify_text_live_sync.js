/* Full verification: live text sync + commit + history + undo, real native events. */
const { chromium } = require("playwright");

let PASS = 0, FAIL = 0;
function check(label, cond, extra) {
  if (cond) { PASS++; console.log("PASS ", label); }
  else { FAIL++; console.log("FAIL ", label, extra !== undefined ? JSON.stringify(extra) : ""); }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForFunction("!!window.__pfStore && !!window.__pfStore.getState().hydrated");
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction("!!window.__pfStore && !!window.__pfStore.getState().hydrated");

  // build stamp present?
  const build = await page.evaluate(() => window.__PF_BUILD);
  check("build stamp exposed", typeof build === "string" && build.length > 0, build);

  await page.evaluate(() => {
    window.__commits = [];
    const st = window.__pfStore.getState();
    const origCommit = st.commitText;
    const origSync = st.syncText;
    window.__pfStore.setState({
      commitText: (id, text, live) => { window.__commits.push({ k: "commit", text, live }); return origCommit(id, text, live); },
      syncText: (id, text, first) => { window.__commits.push({ k: "sync", text, first }); return origSync(id, text, first); },
    }, false);
    window.__pfStore.getState().setDoc({
      name: "Verify", width: 816, height: 1056, unit: "in",
      margins: { top: 48, right: 48, bottom: 48, left: 48 }, bleed: 12,
      pages: [{ id: "p1", background: "#ffffff", frames: [] }],
    });
  });
  await page.waitForTimeout(250);

  const frameCenter = async () => page.evaluate(() => {
    const f = window.__pfStore.getState().doc.pages[0].frames[0];
    const pv = [...document.querySelectorAll('[data-page-index="0"]')].pop();
    const r = pv.getBoundingClientRect();
    const z = window.__pfStore.getState().zoom;
    return { cx: r.left + (f.x + f.w / 2) * z, cy: r.top + (f.y + f.h / 2) * z };
  });

  /* ---------- T1: tool-create flow + LIVE SYNC before click-off ---------- */
  await page.keyboard.press("t");
  await page.waitForTimeout(150);
  await page.mouse.move(600, 300);
  await page.mouse.down();
  await page.mouse.move(740, 400, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  let st = await page.evaluate(() => ({ e: !!window.__pfStore.getState().editingId, f: document.activeElement.isContentEditable }));
  check("T1 auto-edit + focus after drag-create", st.e && st.f, st);

  const pastBefore = await page.evaluate(() => window.__pfStore.getState().past.length);
  await page.keyboard.type("hello world", { delay: 45 });
  await page.waitForTimeout(450); // > 250ms debounce
  st = await page.evaluate(() => window.__pfStore.getState().doc.pages[0].frames[0].text);
  check("T1 LIVE SYNC: store has text DURING edit (before click-off)", st === "hello world", st);

  /* ---------- click-off: persistence + single history entry ---------- */
  await page.mouse.click(900, 700);
  await page.waitForTimeout(400);
  st = await page.evaluate(() => ({
    t: window.__pfStore.getState().doc.pages[0].frames[0].text,
    e: window.__pfStore.getState().editingId,
    past: window.__pfStore.getState().past.length,
  }));
  check("T1 text persisted after click-off", st.t === "hello world", st);
  check("T1 editing ended", st.e === null, st.e);
  check("T1 exactly ONE history entry for the whole session", st.past === pastBefore + 1, { before: pastBefore, after: st.past });

  /* ---------- T2: undo restores pre-edit text ---------- */
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  st = await page.evaluate(() => window.__pfStore.getState().doc.pages[0].frames[0].text);
  check("T2 undo returns pre-edit (empty) text", st === "", st);
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(200);
  st = await page.evaluate(() => window.__pfStore.getState().doc.pages[0].frames[0].text);
  check("T2 redo restores typed text", st === "hello world", st);

  /* ---------- T3: native dblclick edit + replace + click-off ---------- */
  const c = await frameCenter();
  await page.mouse.dblclick(c.cx, c.cy, { delay: 40 });
  await page.waitForTimeout(350);
  st = await page.evaluate(() => ({ e: !!window.__pfStore.getState().editingId, d: document.querySelector('[contenteditable="true"]')?.innerText }));
  check("T3 native dblclick enters edit with existing text", st.e && st.d === "hello world", st);

  const pastBefore3 = await page.evaluate(() => window.__pfStore.getState().past.length);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("replaced text", { delay: 40 });
  await page.waitForTimeout(450);
  st = await page.evaluate(() => window.__pfStore.getState().doc.pages[0].frames[0].text);
  check("T3 live sync replaced text during edit", st === "replaced text", st);
  await page.mouse.click(900, 700);
  await page.waitForTimeout(400);
  st = await page.evaluate(() => ({ t: window.__pfStore.getState().doc.pages[0].frames[0].text, past: window.__pfStore.getState().past.length }));
  check("T3 replaced text persists after click-off", st.t === "replaced text", st);
  check("T3 exactly ONE history entry for replace session", st.past === pastBefore3 + 1, { before: pastBefore3, after: st.past });

  /* ---------- T4: no-op blur adds zero history ---------- */
  const pastBefore4 = await page.evaluate(() => window.__pfStore.getState().past.length);
  await page.mouse.dblclick(c.cx, c.cy, { delay: 40 });
  await page.waitForTimeout(350);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("replaced text", { delay: 30 }); // identical text
  await page.waitForTimeout(450);
  await page.mouse.click(900, 700);
  await page.waitForTimeout(400);
  st = await page.evaluate(() => window.__pfStore.getState().past.length);
  check("T4 identical retype adds zero history", st === pastBefore4, { before: pastBefore4, after: st });

  /* ---------- T5: multiline ---------- */
  await page.mouse.dblclick(c.cx, c.cy, { delay: 40 });
  await page.waitForTimeout(350);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("line one", { delay: 30 });
  await page.keyboard.press("Enter");
  await page.keyboard.type("line two", { delay: 30 });
  await page.mouse.click(900, 700);
  await page.waitForTimeout(400);
  st = await page.evaluate(() => window.__pfStore.getState().doc.pages[0].frames[0].text);
  check("T5 multiline text persisted", st === "line one\nline two", st);

  /* ---------- T6: click from editor straight onto ANOTHER frame ---------- */
  await page.evaluate(() => {
    window.__pfStore.getState().addFrame({ id: "tB", name: "TB", x: 100, y: 700, w: 220, h: 100, rotation: 0, opacity: 1, locked: false, type: "text", text: "other", fontFamily: "Inter", fontSize: 24, bold: false, italic: false, underline: false, uppercase: false, align: "left", vAlign: "top", lineHeight: 1.3, letterSpacing: 0, color: "#111111", fill: "none", padding: 12, autoFit: true, fillHeight: false });
  });
  await page.waitForTimeout(150);
  await page.mouse.dblclick(c.cx, c.cy, { delay: 40 });
  await page.waitForTimeout(350);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("interupted edit", { delay: 30 });
  const other = await page.evaluate(() => {
    const f = window.__pfStore.getState().doc.pages[0].frames.find((x) => x.id === "tB");
    const pv = [...document.querySelectorAll('[data-page-index="0"]')].pop();
    const r = pv.getBoundingClientRect();
    const z = window.__pfStore.getState().zoom;
    return { cx: r.left + (f.x + f.w / 2) * z, cy: r.top + (f.y + f.h / 2) * z };
  });
  await page.mouse.click(other.cx, other.cy);
  await page.waitForTimeout(400);
  st = await page.evaluate(() => window.__pfStore.getState().doc.pages[0].frames[0].text);
  check("T6 click onto other frame commits first frame", st === "interupted edit", st);

  /* ---------- T7: clear-to-empty persists ---------- */
  await page.mouse.dblclick(c.cx, c.cy, { delay: 40 });
  await page.waitForTimeout(350);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(450);
  st = await page.evaluate(() => window.__pfStore.getState().doc.pages[0].frames[0].text);
  check("T7 live sync of cleared text during edit", st === "", st);
  await page.mouse.click(900, 700);
  await page.waitForTimeout(400);
  st = await page.evaluate(() => window.__pfStore.getState().doc.pages[0].frames[0].text);
  check("T7 cleared text persists after click-off", st === "", st);

  /* ---------- T8: page-switch commit via canvas ---------- */
  await page.evaluate(() => {
    const s = window.__pfStore.getState();
    s.addPage();
    s.setPageIdx(0);
  });
  await page.waitForTimeout(200);
  await page.mouse.dblclick(c.cx, c.cy, { delay: 40 });
  await page.waitForTimeout(350);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("page switch test", { delay: 30 });
  await page.waitForTimeout(450); // let live sync land first
  const pv2 = await page.evaluate(() => {
    const els = document.querySelectorAll('[data-page-index="1"]');
    const pv = els.length > 1 ? els[1] : els[0];
    pv.scrollIntoView({ block: "center" });
    const r = pv.getBoundingClientRect();
    const vp = document.querySelector(".canvas-dotted").getBoundingClientRect();
    return {
      x: Math.round(Math.min(Math.max(r.left + r.width / 2, vp.left + 30), vp.right - 30)),
      y: Math.round(Math.min(Math.max(r.top + r.height / 2, vp.top + 30), vp.bottom - 30)),
    };
  });
  await page.waitForTimeout(150);
  await page.mouse.click(pv2.x, pv2.y);
  await page.waitForTimeout(400);
  st = await page.evaluate(() => ({
    t: window.__pfStore.getState().doc.pages[0].frames[0].text,
    p: window.__pfStore.getState().pageIdx,
  }));
  check("T8 page switch commits typed text", st.t === "page switch test", st);
  check("T8 switched to page 2", st.p === 1, st.p);

  /* ---------- T9: reload persistence (autosave) ---------- */
  await page.waitForTimeout(900); // autosave debounce 600ms
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction("!!window.__pfStore && !!window.__pfStore.getState().hydrated");
  st = await page.evaluate(() => window.__pfStore.getState().doc.pages[0].frames[0].text);
  check("T9 text persisted across reload", st === "page switch test", st);

  /* ---------- console errors ---------- */
  check("zero console/page errors", errors.length === 0, errors.slice(0, 3));

  await browser.close();
  console.log(`\nRESULT: ${PASS} passed, ${FAIL} failed`);
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
