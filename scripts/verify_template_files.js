/* Verify: template PRESETS as portable files — "is there a way i can save a
 * preset as a file so i can still use it even if the web cache is cleared?"
 *
 * A. Single template export: save → card Download button → real file captured
 *    via Playwright download event; JSON shape { kind, name, doc } correct.
 * B. Backup-all export: 2 templates → one bundle file with both entries.
 * C. Cache-clear simulation: delete templates in the UI (storage empty), then
 *    IMPORT the single file back via the dialog's Import file input →
 *    "Imported 1 template" toast, card back, IndexedDB repopulated.
 * D. Apply the imported template → exact doc restored (name, width, pages).
 * E. Wipe storage → import the BACKUP bundle → both templates restored.
 * F. Raw .pageforge.json project file imports as a template too.
 * G. Junk .json is rejected with the honest error toast, count unchanged.
 * H. Persistence: reload → imported templates still in IndexedDB.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const os = require("os");

let PASS = 0, FAIL = 0;
function check(label, cond, extra) {
  if (cond) PASS++;
  else FAIL++;
  console.log((cond ? "PASS " : "FAIL ") + label + (extra !== undefined ? "  " + JSON.stringify(extra) : ""));
}

const mkDoc = (name, w, h) => ({
  name, width: w, height: h, unit: "px",
  margins: { top: 48, right: 48, bottom: 48, left: 48 }, bleed: 0,
  pages: [{ id: "p1", background: "#ffffff", frames: [] }],
});

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const base = `http://localhost:${process.env.PF_PORT ?? 3000}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pf-tpl-"));
  const singleFile = path.join(tmp, "file-preset.pageforge.template.json");
  const backupFile = path.join(tmp, "backup.pageforge.templates.json");

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
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__PF_BUILD, null, { timeout: 30000 });
    await page.waitForFunction(
      () => !!window.__pfStore && window.__pfStore.getState().hydrated,
      null,
      { timeout: 15000 },
    );
  };
  const openTpl = async () => {
    const toolbarBtn = page.locator('button[title="Start from a template"]');
    if (await toolbarBtn.count()) await toolbarBtn.click();
    else await page.click('button:has-text("Browse templates")');
    await page.waitForSelector('[aria-label="Template name"]', { timeout: 8000 });
  };
  const saveCurrent = async (name) => {
    await page.fill('[aria-label="Template name"]', name);
    await page.click('[aria-label="Save current design as template"]');
    await page
      .waitForSelector('[data-sonner-toast]:has-text("Template saved")', { timeout: 8000 })
      .catch(() => null);
    await page.waitForTimeout(300);
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
  const fileInput = 'div[role="dialog"] input[type="file"]';
  const importFiles = async (payloads) => {
    await page.setInputFiles(fileInput, payloads);
    await page.waitForTimeout(600);
  };
  const toasts = async () => (await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []));

  /* ---------- setup: clean slate ---------- */
  await gotoApp();
  await wipe();
  await gotoApp();

  const build = await page.evaluate(() => window.__PF_BUILD);
  check("build stamp 2026-10-31.4", build === "2026-10-31.4", build);

  /* ---------- A. single template export ---------- */
  const docA = mkDoc("File Preset", 700, 900);
  await page.evaluate((d) => window.__pfStore.getState().setDoc(d), docA);
  await openTpl();
  await saveCurrent("File Preset");
  await openMineTab();
  check("A: template card present", (await mineCards()) === 1, await mineCards());

  const dlBtn = page.locator('[aria-label="Download template file File Preset"]');
  check("A: download button on card", (await dlBtn.count()) === 1);
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 8000 }),
    dlBtn.click(),
  ]);
  await dl.saveAs(singleFile);
  check("A: filename", dl.suggestedFilename() === "file-preset.pageforge.template.json", dl.suggestedFilename());
  const single = JSON.parse(fs.readFileSync(singleFile, "utf8"));
  check("A: kind/version", single.kind === "pageforge-template" && single.version === 1, single.kind);
  check("A: name + doc size", single.name === "File Preset" && single.doc.width === 700 && single.doc.height === 900);
  const dlToast = await page
    .waitForSelector('[data-sonner-toast]:has-text("Template file downloaded")', { timeout: 5000 })
    .catch(() => null);
  check("A: toast mentions download", !!dlToast);

  /* ---------- B. backup-all export (2 templates) ---------- */
  const docB = mkDoc("Second Preset", 500, 500);
  await page.evaluate((d) => window.__pfStore.getState().setDoc(d), docB);
  await saveCurrent("Second Preset");
  await openMineTab();
  check("B: two cards", (await mineCards()) === 2, await mineCards());
  const [dl2] = await Promise.all([
    page.waitForEvent("download", { timeout: 8000 }),
    page.click('button[title="Download all saved templates as one backup file"]'),
  ]);
  await dl2.saveAs(backupFile);
  check("B: backup filename pattern", /^pageforge-templates-\d{4}-\d{2}-\d{2}\.pageforge\.templates\.json$/.test(dl2.suggestedFilename()), dl2.suggestedFilename());
  const backup = JSON.parse(fs.readFileSync(backupFile, "utf8"));
  check("B: backup kind", backup.kind === "pageforge-template-backup", backup.kind);
  check(
    "B: both templates in bundle",
    Array.isArray(backup.templates) && backup.templates.length === 2 &&
      backup.templates.map((t) => t.name).sort().join(",") === "File Preset,Second Preset",
    backup.templates && backup.templates.map((t) => t.name),
  );

  /* ---------- C. cache-clear simulation → import single file back ---------- */
  for (const nm of ["File Preset", "Second Preset"]) {
    await page.click(`[aria-label="Delete template ${nm}"]`);
    await page.waitForSelector('[data-sonner-toast]:has-text("Template deleted")', { timeout: 8000 }).catch(() => null);
    await page.waitForTimeout(300);
  }
  check("C: storage emptied (0 cards)", (await mineCards()) === 0, await mineCards());

  await importFiles([{ name: "file-preset.pageforge.template.json", mimeType: "application/json", buffer: fs.readFileSync(singleFile) }]);
  check("C: import toast", (await toasts()).some((t) => /Imported 1 template/.test(t)));
  check("C: card restored", (await mineCards()) === 1, await mineCards());
  const idbCount1 = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open("pageforge-templates");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const n = await new Promise((res) => {
      const rq = db.transaction("templates").objectStore("templates").count();
      rq.onsuccess = () => res(rq.result);
    });
    db.close();
    return n;
  });
  check("C: IndexedDB repopulated", idbCount1 === 1, idbCount1);

  /* ---------- D. apply the imported template ---------- */
  await page.click('[aria-label="Apply template File Preset"]');
  await page.waitForTimeout(500);
  const applied = await page.evaluate(() => {
    const d = window.__pfStore.getState().doc;
    return { name: d.name, w: d.width, h: d.height, pages: d.pages.length };
  });
  check(
    "D: applied doc restored",
    applied.name === "File Preset" && applied.w === 700 && applied.h === 900 && applied.pages === 1,
    applied,
  );

  /* ---------- E. wipe → import backup bundle ---------- */
  await wipe();
  await gotoApp();
  await openTpl();
  await importFiles([{ name: "backup.pageforge.templates.json", mimeType: "application/json", buffer: fs.readFileSync(backupFile) }]);
  check("E: bundle import toast", (await toasts()).some((t) => /Imported 2 templates/.test(t)));
  check("E: both cards back", (await mineCards()) === 2, await mineCards());

  /* ---------- F. raw project .pageforge.json imports as template ---------- */
  await importFiles([{ name: "my-project.pageforge.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(mkDoc("From Project", 1234, 777))) }]);
  check("F: project file imported", (await toasts()).some((t) => /Imported 1 template/.test(t)));
  check("F: three cards now", (await mineCards()) === 3, await mineCards());

  /* ---------- G. junk file rejected ---------- */
  await importFiles([{ name: "junk.json", mimeType: "application/json", buffer: Buffer.from('{"hello":1}') }]);
  check("G: honest error toast", (await toasts()).some((t) => /junk\.json.*Not a PageForge template or project file/.test(t)));
  check("G: count unchanged", (await mineCards()) === 3, await mineCards());

  /* ---------- H. persistence across reload ---------- */
  await gotoApp();
  await openTpl();
  await openMineTab();
  check("H: imported templates survive reload", (await mineCards()) === 3, await mineCards());

  check("zero page errors", errors.length === 0, errors);

  console.log(`\n${PASS} PASS, ${FAIL} FAIL`);
  await browser.close();
  process.exit(FAIL === 0 ? 0 : 1);
})().catch((e) => {
  console.error("SUITE ERROR:", e);
  process.exit(1);
});
