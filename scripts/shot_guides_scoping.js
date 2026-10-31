/* Visual snapshot: guides scoped to their own page — dashed pasteboard tails
 * stop at the neighboring page, different guides per page, off-page dashed. */
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  await p.goto(`http://localhost:${process.env.PF_PORT ?? 3000}`, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => !!(window).__PF_BUILD, null, { timeout: 30000 });
  await p.waitForFunction(() => !!(window).__pfStore && (window).__pfStore.getState().hydrated, null, { timeout: 15000 });
  await p.evaluate(() => {
    localStorage.clear();
    const del = (n) => new Promise((r) => { const q = indexedDB.deleteDatabase(n); q.onsuccess = q.onerror = q.onblocked = () => r(null); });
    return Promise.all([del("pageforge-autosave"), del("pageforge-templates")]);
  });
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => !!(window).__pfStore && (window).__pfStore.getState().hydrated, null, { timeout: 15000 });
  await p.evaluate(() => {
    const st = window.__pfStore.getState();
    st.setDoc({
      name: "Guide scoping", width: 816, height: 1056, unit: "in",
      margins: { top: 48, right: 48, bottom: 48, left: 48 }, bleed: 12,
      pages: [
        { id: "p1", background: "#ffffff", frames: [], guides: { x: [], y: [] } },
        { id: "p2", background: "#ffffff", frames: [], guides: { x: [], y: [] } },
        { id: "p3", background: "#ffffff", frames: [], guides: { x: [], y: [] } },
      ],
    });
    const s2 = window.__pfStore.getState();
    s2.setGuideColor("#ec4899");
    /* page 1 guides */
    s2.setPageIdx(0);
    s2.addGuide("v", 192);
    s2.addGuide("v", 624);
    s2.addGuide("h", 288);
    s2.addGuide("h", -70); // LOST — dashed, above the page
    /* page 2 uses DIFFERENT guides */
    s2.setPageIdx(1);
    s2.addGuide("v", 408);
    s2.addGuide("h", 700);
    /* page 3 */
    s2.setPageIdx(2);
    s2.addGuide("h", 200);
    s2.setPageIdx(0);
    s2.addFrame({ id: "f1", name: "Hero", type: "shape", shape: "rect", x: 192, y: 288, w: 432, h: 240, rotation: 0, opacity: 1, locked: false, fill: "#0ea5e9", stroke: "#18181b", strokeWidth: 1, radius: 0 });
    s2.select([]);
  });
  await p.waitForTimeout(900);
  await p.evaluate(() => {
    /* scroll so page 1's bottom + the gap + page 2's top are in view */
    const vp = document.querySelector(".canvas-dotted");
    if (vp) vp.scrollTop = 420;
  });
  await p.waitForTimeout(400);
  await p.screenshot({ path: "/tmp/render/guides_scoping.png" });
  console.log("saved /tmp/render/guides_scoping.png");
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
