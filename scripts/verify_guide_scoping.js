/* Verify: guides are scoped to their OWN page (user report: "when the guide
 * lines are the whole page they extend to the next page that may not use the
 * same guides").
 *
 * A. Setup: 3-page letter doc; per-page guides in the store stay isolated.
 * B. Single-page doc: a vertical guide still spans the FULL pasteboard
 *    (pre-Task-15 behavior preserved when there are no neighbors).
 * C. DOM renders one strip per guide; counts match.
 * D. NO CROSS-PAGE BLEED: vertical strips never intersect another page's
 *    rect; horizontal guide CORE lines never intersect another page's rect.
 * E. Vertical strip geometry: own page + dashed tails (full pasteboard at
 *    the content-box outer edges, half the inter-page gap toward neighbors).
 * F. Horizontal guide segments: dashed head/tail = pasteboard, solid main =
 *    exactly the page width.
 * G. Off-page guides render dashed (data-guide-off) and recovery re-solidifies.
 * H. Dragging still works with the new strip geometry.
 * I. Ruler-drop beyond the inter-page gap is rejected on interior pages;
 *    within the gap it is accepted.
 * J. Legacy stored guides that would land on a neighbor are DRAWN clamped to
 *    the neighbor's edge (never across it).
 */
const { chromium } = require("playwright");

let PASS = 0, FAIL = 0;
function check(label, cond, extra) {
  if (cond) PASS++;
  else FAIL++;
  console.log((cond ? "PASS " : "FAIL ") + label + (extra !== undefined ? "  " + JSON.stringify(extra) : ""));
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`http://localhost:${process.env.PF_PORT ?? 3000}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window).__PF_BUILD, null, { timeout: 30000 });
  await page.evaluate(async () => {
    localStorage.clear();
    const del = (name) =>
      new Promise((res) => {
        const r = indexedDB.deleteDatabase(name);
        r.onsuccess = r.onerror = r.onblocked = () => res(null);
      });
    await del("pageforge-templates");
    await del("pageforge-autosave");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window).__PF_BUILD, null, { timeout: 30000 });
  await page.waitForFunction(
    () => !!(window).__pfStore && (window).__pfStore.getState().hydrated,
    null,
    { timeout: 15000 },
  );

  const build = await page.evaluate(() => window.__PF_BUILD);
  check("build stamp 2026-10-31.4", build === "2026-10-31.4", build);

  /* create an 8.5×11in doc (816×1056px) */
  await page.click('button:has-text("New document")');
  await page.waitForSelector("#doc-w", { timeout: 8000 });
  await page.fill("#doc-w", "8.5");
  await page.fill("#doc-h", "11");
  await page.click('button:has-text("Create document")');
  await page.waitForTimeout(600);

  const zoom = await page.evaluate(() => window.__pfStore.getState().zoom);
  const HZ = 1056 * zoom; // page height on screen

  /* B. single-page: v guide spans the whole pasteboard */
  await page.evaluate(() => {
    const st = window.__pfStore.getState();
    st.addGuide("v", 300);
    st.addGuide("h", 500);
  });
  await page.waitForTimeout(250);
  const b0 = await page.locator('main [data-page-index="0"]').boundingBox();
  const single = await page.evaluate(() => {
    const el = document.querySelector('[data-guide="v"]');
    const r = el.getBoundingClientRect();
    return { top: r.top, height: r.height };
  });
  check(
    "B: single-page doc — v guide spans full pasteboard (page + 120 above/below)",
    Math.abs(single.height - (HZ + 240)) < 3 && Math.abs(single.top - (b0.y - 120)) < 3,
    { ...single, expectH: HZ + 240, expectTop: b0.y - 120 },
  );

  /* A. make it 3 pages and give each page its own guides */
  await page.evaluate(() => {
    const st = window.__pfStore.getState();
    st.addPage();
    st.addPage();
    st.setPageIdx(1);
    st.addGuide("v", 500);
    st.setPageIdx(2);
    st.addGuide("h", 200);
    st.setPageIdx(0);
  });
  await page.waitForTimeout(300);
  const store = await page.evaluate(() => {
    const d = window.__pfStore.getState().doc;
    return {
      p0: { x: d.pages[0].guides.x, y: d.pages[0].guides.y },
      p1: { x: d.pages[1].guides.x, y: d.pages[1].guides.y },
      p2: { x: d.pages[2].guides.x, y: d.pages[2].guides.y },
      ids: d.pages.map((p) => p.id),
    };
  });
  check(
    "A: per-page guide arrays stay isolated in the store",
    JSON.stringify(store.p0) === JSON.stringify({ x: [300], y: [500] }) &&
      JSON.stringify(store.p1) === JSON.stringify({ x: [500], y: [] }) &&
      JSON.stringify(store.p2) === JSON.stringify({ x: [], y: [200] }),
    store,
  );

  /* C. one strip per guide */
  const vCount = await page.locator('[data-guide="v"]').count();
  const hCount = await page.locator('[data-guide="h"]').count();
  check("C: 2 vertical + 2 horizontal guide strips rendered", vCount === 2 && hCount === 2, { vCount, hCount });

  /* D. the core no-cross-page checks */
  const bleed = await page.evaluate(() => {
    const st = window.__pfStore.getState();
    /* canvas page rects only (panel thumbnails share the data attribute) */
    const pages = [...document.querySelectorAll("main [data-page-index]")]
      .map((el) => ({
        idx: Number(el.getAttribute("data-page-index")),
        r: el.getBoundingClientRect(),
      }))
      .filter((p) => p.r.width > 200);
    const overlap = (a, b) => ({
      h: Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)),
      w: Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)),
    });
    const bad = [];
    /* vertical strips must not touch ANY other page */
    document.querySelectorAll('[data-guide="v"]').forEach((el) => {
      const r = el.getBoundingClientRect();
      pages.forEach(({ idx, r: pr }) => {
        if (el.getAttribute("data-guide-page") === st.doc.pages[idx].id) return;
        const o = overlap(r, pr);
        if (o.h > 0.6 && o.w > 0.6) bad.push({ kind: "v-strip", page: idx, o });
      });
    });
    /* horizontal CORE lines must not reach into any other page */
    document.querySelectorAll('[data-guide="h"] [data-guide-core]').forEach((el) => {
      const r = el.getBoundingClientRect();
      pages.forEach(({ idx, r: pr }) => {
        if (el.closest('[data-guide="h"]').getAttribute("data-guide-page") === st.doc.pages[idx].id) return;
        const o = overlap(r, pr);
        if (o.h > 0.6 && o.w > 0.6) bad.push({ kind: "h-core", page: idx, o });
      });
    });
    return bad;
  });
  check("D: no guide line or strip crosses onto a neighboring page", bleed.length === 0, bleed);

  /* E. vertical strip geometry: page + tails */
  const b1 = await page.locator('main [data-page-index="1"]').boundingBox();
  const geo = await page.evaluate(() => {
    const st = window.__pfStore.getState();
    const grab = (idx) => {
      const pid = st.doc.pages[idx].id;
      const el = document.querySelector(`[data-guide="v"][data-guide-page="${pid}"]`);
      const r = el.getBoundingClientRect();
      return { top: r.top, height: r.height };
    };
    return { p0: grab(0), p1: grab(1) };
  });
  check(
    "E: page 1 (first) v guide = page + 120 tail above + 32 tail below",
    Math.abs(geo.p0.height - (HZ + 152)) < 3 && Math.abs(geo.p0.top - (b0.y - 120)) < 3,
    { ...geo.p0, expectH: HZ + 152, expectTop: b0.y - 120 },
  );
  check(
    "E: page 2 (interior) v guide = page + 32 tails both sides",
    Math.abs(geo.p1.height - (HZ + 64)) < 3 && Math.abs(geo.p1.top - (b1.y - 32)) < 3,
    { ...geo.p1, expectH: HZ + 64, expectTop: b1.y - 32 },
  );

  /* F. horizontal guide segments: dashed pasteboard + solid page span */
  const segs = await page.evaluate(() => {
    const st = window.__pfStore.getState();
    const pid = st.doc.pages[0].id;
    const strip = document.querySelector(`[data-guide="h"][data-guide-page="${pid}"]`);
    const w = (sel) => {
      const el = strip.querySelector(sel);
      return el ? el.getBoundingClientRect().width : null;
    };
    return { head: w('[data-guide-seg="head"]'), main: w('[data-guide-seg="main"]'), tail: w('[data-guide-seg="tail"]') };
  });
  check(
    "F: h guide = 120 dashed | 816·zoom solid | 120 dashed",
    Math.abs(segs.head - 120) < 2 &&
      Math.abs(segs.main - 816 * zoom) < 2 &&
      Math.abs(segs.tail - 120) < 2,
    { ...segs, expectMain: 816 * zoom },
  );

  /* G. off-page guides render dashed; recovery re-solidifies */
  await page.evaluate(() => {
    const st = window.__pfStore.getState();
    st.setPageIdx(2);
    st.addGuide("h", 1056 + 90 / window.__pfStore.getState().zoom);
  });
  await page.waitForTimeout(250);
  const b2 = await page.locator('main [data-page-index="2"]').boundingBox();
  const offH = await page.evaluate(() => {
    const st = window.__pfStore.getState();
    const pid = st.doc.pages[2].id;
    const strip = document.querySelector(`[data-guide="h"][data-guide-page="${pid}"][data-guide-off]`);
    if (!strip) return null;
    const core = strip.querySelector("[data-guide-core]");
    const r = core.getBoundingClientRect();
    return { dashed: /repeating-linear-gradient/.test(getComputedStyle(core).backgroundImage), top: r.top };
  });
  check(
    "G: h guide 90px below the last page is dashed and rendered there",
    !!offH && offH.dashed && Math.abs(offH.top + 0.5 - (b2.y + HZ + 90)) < 3,
    { ...offH, expectTop: b2.y + HZ + 90 },
  );

  await page.evaluate(() => {
    const st = window.__pfStore.getState();
    st.setPageIdx(0);
    st.addGuide("v", -80);
  });
  await page.waitForTimeout(250);
  const offV = await page.evaluate(() => {
    const st = window.__pfStore.getState();
    const pid = st.doc.pages[0].id;
    const strip = document.querySelector(`[data-guide="v"][data-guide-page="${pid}"][data-guide-off]`);
    return strip ? /repeating-linear-gradient/.test(getComputedStyle(strip.querySelector("[data-guide-core]")).backgroundImage) : null;
  });
  check("G: off-page vertical guide (x=-80) renders dashed", offV === true, offV);
  await page.evaluate(() => window.__pfStore.getState().recoverOutGuides());
  await page.waitForTimeout(250);
  const afterRecover = await page.evaluate(() => {
    const st = window.__pfStore.getState();
    return {
      x: st.doc.pages[0].guides.x,
      offLeft: document.querySelectorAll('[data-guide="v"][data-guide-page="' + st.doc.pages[0].id + '"][data-guide-off]').length,
    };
  });
  check(
    "G: pull-back clamps x=-80 → 0 and the line is solid again",
    Math.abs(afterRecover.x[0] - 0) < 1 && afterRecover.offLeft === 0,
    afterRecover,
  );

  /* H. dragging a guide still works with the scoped strips */
  await page.locator('main [data-page-index="0"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  const b0v2 = await page.locator('main [data-page-index="0"]').boundingBox();
  const z2 = await page.evaluate(() => window.__pfStore.getState().zoom);
  const px = (docX) => b0v2.x + docX * z2;
  const py = (docY) => b0v2.y + docY * z2;
  await page.mouse.move(px(300), py(700));
  await page.mouse.down();
  await page.mouse.move(px(300) + 60 * z2, py(700), { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const dragged = await page.evaluate(() => window.__pfStore.getState().doc.pages[0].guides.x);
  check("H: v guide drags 300 → ~360 with the new strip geometry", dragged.some((v) => Math.abs(v - 360) <= 2), dragged);

  /* I. ruler drop past the inter-page gap is rejected on an interior page */
  await page.evaluate(() => window.__pfStore.getState().setPageIdx(1));
  await page.locator('main [data-page-index="1"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  const b1v2 = await page.locator('main [data-page-index="1"]').boundingBox();
  const z3 = await page.evaluate(() => window.__pfStore.getState().zoom);
  const px1 = (docX) => b1v2.x + docX * z3;
  const py1 = (docY) => b1v2.y + docY * z3;
  const topRuler = await page.locator('[data-ruler="top"]').boundingBox();
  /* 100 screen px below page 2's bottom edge = 36px INTO page 3's band → reject */
  await page.mouse.move(px1(200), topRuler.y + 9);
  await page.mouse.down();
  await page.mouse.move(px1(200), py1(1056 + 100 / z3), { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  let p1y = await page.evaluate(() => window.__pfStore.getState().doc.pages[1].guides.y);
  check("I: ruler drop onto a neighboring page is rejected", p1y.length === 0, p1y);
  /* 40 screen px below the bottom edge = inside the gap → accepted */
  await page.mouse.move(px1(300), topRuler.y + 9);
  await page.mouse.down();
  await page.mouse.move(px1(300), py1(1056 + 40 / z3), { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  p1y = await page.evaluate(() => window.__pfStore.getState().doc.pages[1].guides.y);
  check("I: ruler drop within the inter-page gap is accepted", p1y.some((v) => Math.abs(v - (1056 + 40 / z3)) <= 3), p1y);

  /* J. legacy out-of-band guide is DRAWN clamped to the neighbor's edge */
  await page.evaluate((z) => {
    const st = window.__pfStore.getState();
    const clone = JSON.parse(JSON.stringify(st.doc));
    clone.pages = clone.pages.map((p) => ({ ...p, guides: { x: [], y: [] } }));
    clone.pages[0].guides.x = [300];
    clone.pages[0].guides.y = [1056 + 300 / z]; // would land deep inside page 2
    st.setDoc(clone);
    st.setPageIdx(0);
  }, z3);
  await page.waitForTimeout(400);
  const b1v3 = await page.locator('main [data-page-index="1"]').boundingBox();
  const legacy = await page.evaluate(() => {
    const st = window.__pfStore.getState();
    const strip = document.querySelector('[data-guide="h"][data-guide-page="' + st.doc.pages[0].id + '"]');
    const r = strip.querySelector("[data-guide-core]").getBoundingClientRect();
    return { center: r.top + 0.5, stored: st.doc.pages[0].guides.y[0] };
  });
  check(
    "J: legacy guide drawn AT the neighbor's top edge, never across it",
    Math.abs(legacy.center - b1v3.y) < 2.5,
    { ...legacy, expect: b1v3.y },
  );

  check("zero page errors", errors.length === 0, errors[0]);
  console.log(`\nRESULT: ${PASS} pass / ${FAIL} fail`);
  await browser.close();
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
