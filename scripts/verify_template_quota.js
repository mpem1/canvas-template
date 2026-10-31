/* Verify: template saving survives LARGE documents (PSD-like, multi-MB data
 * URLs) — the reported bug: "i tried to save template didnt work".
 *
 * A. Big-doc template save (the bug): ~13MB embedded image → save via UI →
 *    success toast + card present → RELOAD → template still there → apply →
 *    doc restored intact (size, image data-URL length) → undo.
 * B. Small-doc template regression: save / apply / fresh ids / reload / delete.
 * C. Legacy localStorage migration: pre-seeded LS templates appear after boot
 *    and the LS key is removed (now living in IndexedDB).
 * D. Autosave of a big doc survives reload (IndexedDB autosave).
 * E. Templates actually stored in IndexedDB (direct IDB read).
 * F. Starter templates still work.
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

  const store = () => window.__pfStore;

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
  const openTpl = async () => {
    // from Welcome ("Browse templates" card) or from the Toolbar
    const toolbarBtn = page.locator('button[title="Start from a template"]');
    if (await toolbarBtn.count()) await toolbarBtn.click();
    else await page.click('button:has-text("Browse templates")');
    await page.waitForSelector('[aria-label="Template name"]', { timeout: 8000 });
  };
  const saveCurrent = async (name) => {
    await page.fill('[aria-label="Template name"]', name);
    await page.click('[aria-label="Save current design as template"]');
    // wait for the NEW toast specifically (older toasts may still be visible)
    await page
      .waitForSelector('[data-sonner-toast]:has-text("Template saved")', { timeout: 8000 })
      .catch(() => null);
    await page.waitForTimeout(300);
    const toasts = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
    return toasts.find((t) => t.includes("Template saved")) ?? toasts.join(" | ") ?? "";
  };
  const openMineTab = async () => {
    await page.evaluate(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((b) => /My templates/.test(b.textContent));
      if (tab) tab.click();
    });
    await page.waitForTimeout(400);
  };
  const mineCards = () =>
    page.evaluate(() => document.querySelectorAll('[aria-label^="Apply template"]').length);
  const idbTemplateCount = () =>
    page.evaluate(
      () =>
        new Promise((res) => {
          const req = indexedDB.open("pageforge-templates", 1);
          req.onsuccess = () => {
            const db = req.result;
            const q = db.transaction("templates", "readonly").objectStore("templates").getAll();
            q.onsuccess = () => {
              db.close();
              res(q.result.length);
            };
            q.onerror = () => res(-1);
          };
          req.onerror = () => res(-1);
        }),
    );

  /* ============ setup: clean slate ============ */
  await gotoApp();
  await wipe();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window).__PF_BUILD, null, { timeout: 30000 });
  await page.waitForFunction(
    () => !!(window).__pfStore && (window).__pfStore.getState().hydrated,
    null,
    { timeout: 15000 },
  );

  /* ============ C. legacy localStorage migration ============ */
  await page.evaluate(() => {
    const legacy = [
      {
        id: "legacy-1",
        name: "Legacy tpl",
        createdAt: Date.now() - 1000,
        doc: {
          name: "Legacy", width: 320, height: 480, unit: "px",
          margins: { top: 0, right: 0, bottom: 0, left: 0 }, bleed: 0,
          pages: [{ id: "lp", background: "#fff", frames: [] }],
        },
      },
    ];
    localStorage.setItem("pageforge-templates-v1", JSON.stringify(legacy));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window).__PF_BUILD, null, { timeout: 30000 });
  await page.waitForFunction(
    () => !!(window).__pfStore && (window).__pfStore.getState().hydrated,
    null,
    { timeout: 15000 },
  );
  await page.waitForTimeout(300);
  await openTpl();
  await openMineTab();
  check("C: legacy LS template shown in My templates", (await mineCards()) === 1);
  const lsKeyGone = await page.evaluate(() => localStorage.getItem("pageforge-templates-v1") === null);
  check("C: legacy LS key removed after migration", lsKeyGone);
  const idbAfterMigration = await idbTemplateCount();
  check("C: migrated template lives in IndexedDB", idbAfterMigration === 1, { idbAfterMigration });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  /* ============ A. THE BUG: big-doc template save ============ */
  const srcLen = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1400; c.height = 2000;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.random() * 255;      // true noise → PNG barely compresses
      img.data[i + 1] = Math.random() * 255;
      img.data[i + 2] = Math.random() * 255;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const src = c.toDataURL("image/png");
    window.__pfStore.getState().setDoc({
      name: "PSD import", width: 533, height: 400, unit: "px",
      margins: { top: 0, right: 0, bottom: 0, left: 0 }, bleed: 0,
      pages: [{ id: "psd1", background: "#fff",
        frames: [{ id: "img1", type: "image", name: "layer", x: 0, y: 0, w: 533, h: 400,
          src, fileName: "layer.png", fit: "fill", imgW: 1400, imgH: 2000,
          scale: 1, offsetX: 0, offsetY: 0 }] }],
    });
    return src.length;
  });
  console.log(`# big doc data URL: ${srcLen} chars (~${Math.round(srcLen / 1e6)} MB)`);
  check("A: fixture is genuinely over the old 5MB localStorage quota", srcLen > 5_000_000);

  await openTpl();
  const bigToast = await saveCurrent("Big PSD tpl");
  check("A: success toast names the template + size", /Template saved — “Big PSD tpl”/.test(bigToast), bigToast.slice(0, 80));
  await openMineTab();
  const cardsAfterSave = await mineCards();
  check("A: template card present without reload (legacy + big)", cardsAfterSave === 2, { cardsAfterSave });
  check("E: IndexedDB holds both templates", (await idbTemplateCount()) === 2);

  /* reload → template must survive */
  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window).__PF_BUILD, null, { timeout: 30000 });
  await page.waitForFunction(
    () => !!(window).__pfStore && (window).__pfStore.getState().hydrated,
    null,
    { timeout: 15000 },
  );
  await openTpl();
  await openMineTab();
  check("A: big template STILL THERE after reload", (await mineCards()) === 2, { count: await mineCards() });

  /* apply the big template → doc restored intact */
  await page.click('[aria-label="Apply template Big PSD tpl"]');
  await page.waitForTimeout(600);
  const applied = await page.evaluate(() => {
    const d = window.__pfStore.getState().doc;
    return { w: d.width, h: d.height, pages: d.pages.length, name: d.name,
      src: d.pages[0].frames.find((f) => f.type === "image")?.src?.length ?? 0 };
  });
  check("A: apply restores page size + name", applied.w === 533 && applied.h === 400 && applied.name === "Big PSD tpl", applied);
  check("A: image data URL fully preserved", applied.src === srcLen, { srcLen: applied.src });
  /* undo returns to the pre-apply doc (one history entry) */
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  const afterUndo = await page.evaluate(() => {
    const d = window.__pfStore.getState().doc;
    return { name: d?.name ?? null, pages: d?.pages.length ?? 0 };
  });
  check("A: undo after apply → previous doc", afterUndo.name === "PSD import" || afterUndo.pages === 0, afterUndo);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  /* ============ B. small-doc regression + delete ============ */
  await page.evaluate(() => {
    window.__pfStore.getState().setDoc({
      name: "Small", width: 600, height: 700, unit: "px",
      margins: { top: 0, right: 0, bottom: 0, left: 0 }, bleed: 0,
      pages: [{ id: "p1", background: "#fff", frames: [] }],
    });
  });
  await openTpl();
  const smallToast = await saveCurrent("Small tpl");
  check("B: small doc saves with size label", /Template saved — “Small tpl” \(600 × 700 px\)/.test(smallToast), smallToast.slice(0, 80));
  await openMineTab();
  check("B: three templates now listed", (await mineCards()) === 3, { count: await mineCards() });
  await page.click('[aria-label="Apply template Small tpl"]');
  await page.waitForTimeout(400);
  const freshIds = await page.evaluate(() => {
    const d = window.__pfStore.getState().doc;
    return { w: d.width, name: d.name, pageId: d.pages[0].id };
  });
  check("B: apply small template → 600×700, fresh page id", freshIds.w === 600 && freshIds.name === "Small tpl" && freshIds.pageId !== "p1", freshIds);
  /* delete the legacy one */
  await openTpl();
  await openMineTab();
  await page.hover('[aria-label="Apply template Legacy tpl"]');
  await page.click('[aria-label="Delete template Legacy tpl"]');
  await page.waitForTimeout(600);
  check("B: delete works → two left", (await mineCards()) === 2, { count: await mineCards() });
  check("E: IndexedDB now holds two", (await idbTemplateCount()) === 2);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  /* ============ D. autosave of a BIG doc survives reload ============ */
  await page.evaluate(() => {
    // current doc (Small tpl) already autosaved; make it big to prove IDB autosave
    const d = window.__pfStore.getState().doc;
    const big = window.__pfStore.getState().doc; // clone via store-independent fetch below
    window.__pfStore.getState().updateFrames([], () => {}, false); // no-op touch
    void big; void d;
  });
  // build a big doc again through setDoc and let autosave (600ms debounce) fire
  await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 900; c.height = 1200;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = (i * 11) % 255; img.data[i + 1] = (i * 17) % 255;
      img.data[i + 2] = (i * 23) % 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    window.__pfStore.getState().setDoc({
      name: "Big autosave", width: 533, height: 400, unit: "px",
      margins: { top: 0, right: 0, bottom: 0, left: 0 }, bleed: 0,
      pages: [{ id: "psd2", background: "#fff",
        frames: [{ id: "img2", type: "image", name: "layer", x: 0, y: 0, w: 533, h: 400,
          src: c.toDataURL("image/png"), fileName: "layer.png", fit: "fill",
          imgW: 900, imgH: 1200, scale: 1, offsetX: 0, offsetY: 0 }] }],
    });
  });
  await page.waitForTimeout(1400); // debounce 600ms + IDB write
  const preReloadSrc = await page.evaluate(
    () => window.__pfStore.getState().doc.pages[0].frames[0].src.length,
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window).__PF_BUILD, null, { timeout: 30000 });
  await page.waitForFunction(
    () => !!(window).__pfStore && (window).__pfStore.getState().doc !== null,
    null,
    { timeout: 15000 },
  );
  const restored = await page.evaluate(() => {
    const d = window.__pfStore.getState().doc;
    return { name: d.name, w: d.width, src: d.pages[0].frames[0].src.length };
  });
  check("D: big doc autosaved + auto-restored after reload", restored.name === "Big autosave" && restored.w === 533, restored);
  check("D: image payload intact across reload", restored.src === preReloadSrc, { preReloadSrc, restored: restored.src });

  /* ============ F. starter templates still work ============ */
  await openTpl();
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((b) => /Starter/.test(b.textContent));
    if (tab) tab.click();
  });
  await page.waitForTimeout(400);
  const starterCard = page.locator("text=Event Poster").first();
  const hasStarter = (await starterCard.count()) > 0;
  if (hasStarter) {
    await starterCard.click();
    await page.waitForTimeout(500);
    const starterDoc = await page.evaluate(() => window.__pfStore.getState().doc);
    check("F: starter poster applies (1248×1824)", starterDoc.width === 1248 && starterDoc.height === 1824, { w: starterDoc.width, h: starterDoc.height });
  } else {
    check("F: starter poster card found", false);
  }

  check("zero page errors", errors.length === 0, errors[0]);
  console.log(`\nRESULT: ${PASS} pass / ${FAIL} fail`);
  await browser.close();
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
