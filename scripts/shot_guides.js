/* Visual snapshot: blank page + custom guides (ruler-dragged + dialog presets). */
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
  // blank Letter doc, then guides: dialog presets + numeric, plus a frame
  await p.evaluate(() => {
    const st = window.__pfStore.getState();
    st.setDoc({
      name: "Guides demo", width: 816, height: 1056, unit: "in",
      margins: { top: 48, right: 48, bottom: 48, left: 48 }, bleed: 12,
      pages: [{ id: "p1", background: "#ffffff", frames: [], guides: { x: [], y: [] } }],
    });
    const s2 = window.__pfStore.getState();
    s2.addGuide("v", 192);
    s2.addGuide("v", 408);
    s2.addGuide("v", 624);
    s2.addGuide("h", 288);
    s2.addGuide("h", 768);
    s2.addFrame({ id: "f1", name: "Hero", type: "shape", shape: "rect", x: 192, y: 288, w: 432, h: 240, rotation: 0, opacity: 1, locked: false, fill: "#f59e0b", stroke: "#18181b", strokeWidth: 1, radius: 0 });
    s2.select([]);
  });
  await p.waitForTimeout(900);
  await p.screenshot({ path: "/tmp/render/guides_demo.png" });
  console.log("saved /tmp/render/guides_demo.png");
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
