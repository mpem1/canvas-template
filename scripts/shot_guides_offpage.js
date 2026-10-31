/* Visual snapshot: guides spanning the pasteboard + an off-page guide + custom color. */
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
      name: "Guides demo", width: 816, height: 1056, unit: "in",
      margins: { top: 48, right: 48, bottom: 48, left: 48 }, bleed: 12,
      pages: [{ id: "p1", background: "#ffffff", frames: [], guides: { x: [], y: [] } }],
    });
    const s2 = window.__pfStore.getState();
    s2.setGuideColor("#ec4899"); // pink — easy to tell apart from the old emerald
    s2.addGuide("v", 192);
    s2.addGuide("v", 624);
    s2.addGuide("h", 288);
    s2.addGuide("h", -70); // LOST guide — sits past the top page edge
    s2.addGuide("v", 900); // LOST guide — sits past the right page edge (816)
    s2.addFrame({ id: "f1", name: "Hero", type: "shape", shape: "rect", x: 192, y: 288, w: 432, h: 240, rotation: 0, opacity: 1, locked: false, fill: "#0ea5e9", stroke: "#18181b", strokeWidth: 1, radius: 0 });
    s2.select([]);
  });
  await p.waitForTimeout(900);
  await p.screenshot({ path: "/tmp/render/guides_offpage.png" });
  // open the Page guides dialog to capture swatches + off-page badge + recovery
  await p.click('button[aria-label="Page guides"]');
  await p.waitForSelector("#guide-pos", { timeout: 8000 });
  await p.waitForTimeout(400);
  await p.screenshot({ path: "/tmp/render/guides_dialog.png" });
  console.log("saved /tmp/render/guides_offpage.png + guides_dialog.png");
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
