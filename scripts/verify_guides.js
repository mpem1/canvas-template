/* Verify: user-placed page guidelines (the request: "is there an option to add
 * my own template guidelines to a blank page?").
 *
 * A. Drag from the TOP ruler onto the page  → horizontal guide at that y.
 * B. Drag from the LEFT ruler onto the page → vertical guide at that x.
 * C. Guides dialog: numeric add (unit-aware), column/row presets, list count.
 * D. Frames snap to custom guides while dragging.
 * E. Drag a guide to move it; history: undo/redo across guide move + delete.
 * F. Double-click deletes a guide.
 * G. Clear page guides (+ undo restores).
 * H. Per-page isolation (page 2 guides don't touch page 1).
 * I. Guides persist across reload (IndexedDB autosave), both pages.
 * J. Guides toggle hides/shows the lines; guide layers are export-ignored.
 * K. Starter template apply still works with the guides field present.
 * L. Guide color picker (swatches + custom) recolors the rendered lines.
 * M. Pasteboard guides: drop past the page edge, still visible on screen,
 *    drag back onto the page, off-page badges + "pull back" recovery.
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

  async function wipe() {
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
  }
  const gotoApp = async () => {
    await page.goto(`http://localhost:${process.env.PF_PORT ?? 3000}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!(window).__PF_BUILD, null, { timeout: 30000 });
    await page.waitForFunction(
      () => !!(window).__pfStore && (window).__pfStore.getState().hydrated,
      null,
      { timeout: 15000 },
    );
  };

  await gotoApp();
  await wipe();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window).__PF_BUILD, null, { timeout: 30000 });
  await page.waitForFunction(
    () => !!(window).__pfStore && (window).__pfStore.getState().hydrated,
    null,
    { timeout: 15000 },
  );

  /* create an 8.5×11in doc (816×1056px, 0.5in margins = 48px) */
  await page.click('button:has-text("New document")');
  await page.waitForSelector("#doc-w", { timeout: 8000 });
  await page.fill("#doc-w", "8.5");
  await page.fill("#doc-h", "11");
  await page.click('button:has-text("Create document")');
  await page.waitForTimeout(600);
  const dims = await page.evaluate(() => {
    const d = window.__pfStore.getState().doc;
    return { w: d.width, h: d.height, guides: d.pages[0].guides };
  });
  check("setup: doc is 816×1056 with empty guides", dims.w === 816 && dims.h === 1056 && Array.isArray(dims.guides?.x), dims);

  const zoom = await page.evaluate(() => window.__pfStore.getState().zoom);
  const pageBox = await page.locator('main [data-page-index="0"]').boundingBox();
  const px = (docX) => pageBox.x + docX * zoom; // doc px → screen px (x)
  const py = (docY) => pageBox.y + docY * zoom;
  const guides = () =>
    page.evaluate(() => {
      const g = window.__pfStore.getState().doc.pages[0].guides;
      return { x: g.x, y: g.y };
    });
  const near = (arr, v, tol = 1.5) => arr.some((n) => Math.abs(n - v) <= tol);

  /* ============ A. top ruler → horizontal guide ============ */
  const topRuler = await page.locator('[data-ruler="top"]').boundingBox();
  await page.mouse.move(px(200), topRuler.y + 9);
  await page.mouse.down();
  await page.mouse.move(px(200), py(300), { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  let g = await guides();
  check("A: top-ruler drag places horizontal guide at y=300", near(g.y, 300) && g.x.length === 0, g);
  check("A: guide line rendered in DOM", (await page.locator('[data-guide="h"]').count()) === 1);
  const lineBox = await page.locator('[data-guide="h"]').first().boundingBox();
  check(
    "A: guide renders at the dragged position on screen",
    Math.abs(lineBox.y + 4.5 - py(300)) < 2.5, // 9px screen-space strip, line centered
    { lineTop: lineBox.y, expect: py(300) },
  );

  /* ============ B. left ruler → vertical guide ============ */
  const leftRuler = await page.locator('[data-ruler="left"]').boundingBox();
  await page.mouse.move(leftRuler.x + 9, py(600));
  await page.mouse.down();
  await page.mouse.move(px(192), py(600), { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  g = await guides();
  check("B: left-ruler drag places vertical guide at x=192 (2in)", near(g.x, 192) && g.y.length === 1, g);

  /* plain click on the ruler must NOT create a guide */
  await page.mouse.move(px(400), topRuler.y + 9);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(150);
  g = await guides();
  check("A: plain ruler click places nothing", g.y.length === 1 && g.x.length === 1, g);

  /* ============ C. guides dialog: numeric + presets ============ */
  await page.click('button[aria-label="Page guides"]');
  await page.waitForSelector("#guide-pos", { timeout: 8000 });
  await page.fill("#guide-pos", "3"); // 3in = 288px
  await page.click('button:has-text("Vertical")');
  await page.click('button:has-text("Horizontal")');
  await page.waitForTimeout(150);
  g = await guides();
  check("C: numeric add → vertical + horizontal at 3in (288px)", near(g.x, 288) && near(g.y, 288), g);

  await page.fill("#guide-count", "4");
  await page.click('button:has-text("Columns")');
  await page.fill("#guide-count", "2");
  await page.click('button:has-text("Rows")');
  await page.waitForTimeout(150);
  g = await guides();
  // 4 columns → 3 inner boundaries: 48 + 720·i/4 = 228, 408, 588
  // 2 rows → 1 boundary: 48 + 960/2 = 528
  check(
    "C: column/row presets land inside margins",
    near(g.x, 228) && near(g.x, 408) && near(g.x, 588) && near(g.y, 528),
    g,
  );
  const chipCount = await page
    .locator('[role="dialog"] button[aria-label^="Delete"]')
    .count();
  check("C: dialog lists every guide chip (8)", chipCount === 8, { chipCount });
  await page.click('button:has-text("Done")');
  await page.waitForTimeout(250);

  /* ============ D. frame snaps to a custom guide ============ */
  await page.evaluate(() => {
    window.__pfStore.getState().addFrame({
      id: "gx1", name: "R", type: "shape", shape: "rect",
      x: 100, y: 100, w: 200, h: 120, rotation: 0, opacity: 1,
      locked: false, fill: "#f59e0b", stroke: "#18181b", strokeWidth: 1, radius: 0,
    });
  });
  await page.waitForTimeout(250);
  // drag frame so its LEFT edge ends 4 screen-px short of the 288px guide → snap
  // (grab at x=210, i.e. 110px right of the frame's left edge, clear of the
  // 192px guide's grab strip)
  const grabDocX = 210, grabOffset = 110;
  const targetGrabDoc = 288 - 4 / zoom + grabOffset;
  const dxScreen = (targetGrabDoc - grabDocX) * zoom;
  await page.mouse.move(px(grabDocX), py(160));
  await page.mouse.down();
  await page.mouse.move(px(grabDocX) + dxScreen, py(160), { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const frameX = await page.evaluate(
    () => window.__pfStore.getState().doc.pages[0].frames.find((f) => f.id === "gx1").x,
  );
  check("D: frame left edge snapped to custom guide (288)", Math.abs(frameX - 288) <= 1, { frameX });

  /* ============ E. drag a guide to move it ============ */
  await page.mouse.move(px(192), py(700));
  await page.mouse.down();
  await page.mouse.move(px(192) + 60 * zoom, py(700), { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  g = await guides();
  check("E: guide moved 192 → ~252", near(g.x, 252, 2) && !near(g.x, 192, 0.9), g);

  /* ============ F. double-click deletes ============ */
  const pos252 = await page.evaluate(() =>
    window.__pfStore.getState().doc.pages[0].guides.x.find((v) => Math.abs(v - 252) < 2),
  );
  await page.mouse.dblclick(px(pos252), py(750));
  await page.waitForTimeout(200);
  g = await guides();
  check("F: double-click deletes the guide", !near(g.x, pos252, 1), g);

  /* undo → guide back; undo again → back at 192; redo ×2 → deleted again */
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(150);
  g = await guides();
  check("E/F: undo #1 restores the moved guide", near(g.x, pos252, 1.5), g);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(150);
  g = await guides();
  check("E: undo #2 returns guide to 192", near(g.x, 192, 1.5) && !near(g.x, 252, 1), g);
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(120);
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(150);
  g = await guides();
  // redo #1 → post-drag (252 present, 192 gone); redo #2 → post-delete (252 gone)
  check(
    "E/F: redo ×2 restores post-delete state",
    !near(g.x, 252, 1) && !near(g.x, 192, 1) && g.x.length === 4,
    g,
  );

  /* ============ G. clear page guides + undo ============ */
  await page.click('button[aria-label="Page guides"]');
  await page.waitForSelector("#guide-pos", { timeout: 8000 });
  await page.click('button:has-text("Clear page guides")');
  await page.waitForTimeout(200);
  g = await guides();
  check("G: clear page guides empties both arrays", g.x.length === 0 && g.y.length === 0, g);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(150);
  g = await guides();
  check("G: undo restores the cleared guides", g.x.length >= 4 && g.y.length >= 3, g);

  /* ============ H. per-page isolation ============ */
  await page.evaluate(() => {
    const st = window.__pfStore.getState();
    st.addPage(); // → page 2, becomes active
    st.addGuide("v", 100);
  });
  await page.waitForTimeout(150);
  const perPage = await page.evaluate(() => {
    const d = window.__pfStore.getState().doc;
    return {
      p1x: d.pages[0].guides.x,
      p2x: d.pages[1].guides.x,
      idx: window.__pfStore.getState().pageIdx,
    };
  });
  check(
    "H: page 2 guide does not leak to page 1",
    !near(perPage.p1x, 100, 1) && near(perPage.p2x, 100, 1) && perPage.idx === 1,
    perPage,
  );

  /* ============ I. persistence across reload ============ */
  const beforeReload = await page.evaluate(() => {
    const d = window.__pfStore.getState().doc;
    return {
      p1: d.pages[0].guides,
      p2: d.pages[1].guides,
      w: d.width,
    };
  });
  await page.waitForTimeout(1000); // autosave debounce 600ms + IDB write
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window).__PF_BUILD, null, { timeout: 30000 });
  await page.waitForFunction(
    () => !!(window).__pfStore && (window).__pfStore.getState().doc !== null,
    null,
    { timeout: 15000 },
  );
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const d = window.__pfStore.getState().doc;
    return { p1: d.pages[0].guides, p2: d.pages[1].guides, w: d.width };
  });
  check(
    "I: guides persist across reload (page 1 + page 2)",
    after.w === 816 &&
      JSON.stringify(after.p1) === JSON.stringify(beforeReload.p1) &&
      JSON.stringify(after.p2) === JSON.stringify(beforeReload.p2),
    { beforeReload, after },
  );

  /* ============ J. visibility toggle + export safety ============ */
  await page.click('[aria-label="Toggle guides"]');
  await page.waitForTimeout(200);
  const hiddenCount = await page.locator('[data-guide="v"]').count();
  await page.click('[aria-label="Toggle guides"]');
  await page.waitForTimeout(200);
  const shownCount = await page.locator('[data-guide="v"]').count();
  check("J: guides toggle hides and re-shows guide lines", hiddenCount === 0 && shownCount >= 1, { hiddenCount, shownCount });
  const exportSafe = await page.evaluate(() => {
    const el = document.querySelector('[data-guide="v"]');
    return !!(el && el.closest('[data-export-ignore="true"]'));
  });
  check("J: guide layer is export-ignored (never printed/exported)", exportSafe);

  /* ============ L. guide color picker ============ */
  await page.click('button[aria-label="Page guides"]');
  await page.waitForSelector("#guide-pos", { timeout: 8000 });
  await page.click('button[data-guide-color="#ec4899"]');
  await page.waitForTimeout(150);
  const colorState = await page.evaluate(() => window.__pfStore.getState().guideColor);
  check("L: swatch click sets the guide color", colorState === "#ec4899", colorState);
  await page.evaluate(() => {
    const inp = document.querySelector('input[aria-label="Custom guide color"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(inp, "#ff6600");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(150);
  const colorState2 = await page.evaluate(() => window.__pfStore.getState().guideColor);
  check("L: custom color input sets the guide color", colorState2.toLowerCase() === "#ff6600", colorState2);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  const coreColor = await page.evaluate(() => {
    const el = document.querySelector('[data-guide="v"] [data-guide-core]');
    return el ? getComputedStyle(el).backgroundColor : null;
  });
  check("L: rendered guide lines use the chosen color", coreColor === "rgb(255, 102, 0)", coreColor);

  /* ============ M. pasteboard guides (past the page edges) ============ */
  await page.evaluate(() => window.__pfStore.getState().setPageIdx(1));
  await page.locator('main [data-page-index="1"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(350); // rAF layoutTick → overlay re-measures after scroll
  const pb2 = await page.locator('main [data-page-index="1"]').boundingBox();
  const zoom2 = await page.evaluate(() => window.__pfStore.getState().zoom);
  const px2 = (docX) => pb2.x + docX * zoom2;
  const py2 = (docY) => pb2.y + docY * zoom2;

  const topRuler2 = await page.locator('[data-ruler="top"]').boundingBox();
  // drop 60 doc-px ABOVE the page top edge — on the pasteboard
  await page.mouse.move(px2(200), topRuler2.y + 9);
  await page.mouse.down();
  await page.mouse.move(px2(200), py2(-60), { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  let gm = await page.evaluate(() => window.__pfStore.getState().doc.pages[1].guides);
  check("M: ruler drag drops a guide PAST the page edge (y=-60)", near(gm.y, -60, 3), gm);

  const offVis = await page.evaluate(() => {
    const st = window.__pfStore.getState();
    const pid = st.doc.pages[1].id;
    const el = document.querySelector(`[data-guide="h"][data-guide-page="${pid}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, onScreen: r.top > 0 && r.top < window.innerHeight };
  });
  check(
    "M: off-page guide line is visible on screen past the workspace edge",
    !!offVis && offVis.onScreen && Math.abs(offVis.top + 4.5 - py2(-60)) < 2.5,
    { offVis, expect: py2(-60) },
  );

  // drag the lost guide back onto the page
  await page.mouse.move(px2(200), py2(-60));
  await page.mouse.down();
  await page.mouse.move(px2(200), py2(140), { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  gm = await page.evaluate(() => window.__pfStore.getState().doc.pages[1].guides);
  check("M: off-page guide drags back onto the page (~140)", near(gm.y, 140, 3), gm);

  // recovery: numerically place a lost guide, then pull everything back
  await page.evaluate(() => window.__pfStore.getState().addGuide("v", -100));
  await page.waitForTimeout(150);
  await page.click('button[aria-label="Page guides"]');
  await page.waitForSelector("#guide-pos", { timeout: 8000 });
  const badgeCount = await page.locator('[role="dialog"] :text("off-page")').count();
  check("M: dialog flags off-page guides with a badge", badgeCount >= 1, { badgeCount });
  const pullBtn = page.locator('button:has-text("pull back onto the page")');
  check("M: recovery button appears for lost guides", (await pullBtn.count()) === 1);
  await pullBtn.click();
  await page.waitForTimeout(200);
  gm = await page.evaluate(() => window.__pfStore.getState().doc.pages[1].guides);
  check("M: pull-back clamps the lost guide to the page edge (x=0)", !near(gm.x, -100, 1) && near(gm.x, 0, 1), gm);
  await page.click('button:has-text("Done")');
  await page.waitForTimeout(250);

  /* ============ K. starter template still applies ============ */
  const toolbarTpl = page.locator('button[title="Start from a template"]');
  await toolbarTpl.click();
  await page.waitForSelector('[aria-label="Template name"]', { timeout: 8000 });
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((b) => /Starter/.test(b.textContent));
    if (tab) tab.click();
  });
  await page.waitForTimeout(400);
  await page.locator("text=Event Poster").first().click();
  await page.waitForTimeout(600);
  const starterDoc = await page.evaluate(() => {
    const d = window.__pfStore.getState().doc;
    return { w: d.width, h: d.height, g: d.pages[0].guides };
  });
  check(
    "K: starter template applies and carries a guides field",
    starterDoc.w === 1248 && starterDoc.h === 1824 && Array.isArray(starterDoc.g?.x),
    starterDoc,
  );

  check("zero page errors", errors.length === 0, errors[0]);
  console.log(`\nRESULT: ${PASS} pass / ${FAIL} fail`);
  await browser.close();
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
