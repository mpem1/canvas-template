/* REPRO: "i tried to save template didnt work"
 * Hypothesis: image-heavy docs (e.g. PSD imports carry multi-MB PNG data
 * URLs) blow through the ~5MB localStorage quota; persist() swallows the
 * quota error, the dialog still toasts success, and the template silently
 * never persists. Control case: a small doc saves fine.
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

  await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window).__PF_BUILD, null, { timeout: 30000 });
  await page.evaluate(() => localStorage.clear());

  const store = () => window.__pfStore;
  const openTpl = async () => {
    await page.click('button[title="Start from a template"]');
    await page.waitForSelector('[aria-label="Template name"]', { timeout: 8000 });
  };
  const saveCurrent = async (name) => {
    await page.fill('[aria-label="Template name"]', name);
    await page.click('[aria-label="Save current design as template"]');
    await page.waitForTimeout(700); // toast + write settle
    return page.locator("[data-sonner-toast]").last().innerText().catch(() => "");
  };
  const mineCount = async () =>
    page.evaluate(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((b) => /My templates/.test(b.textContent));
      return tab ? (tab.textContent.match(/\((\d+)\)/) || [0, 0])[1] : "-1";
    });

  /* ---------- CONTROL: small doc saves fine ---------- */
  await page.evaluate(() => {
    window.__pfStore.getState().setDoc({
      name: "Small", width: 600, height: 700, unit: "px",
      margins: { top: 0, right: 0, bottom: 0, left: 0 }, bleed: 0,
      pages: [{ id: "p1", background: "#fff", frames: [] }],
    });
  });
  await openTpl();
  const smallToast = await saveCurrent("Small tpl");
  const lsAfterSmall = await page.evaluate(() => localStorage.getItem("pageforge-templates-v1"));
  check("control: small doc → success toast", /Template saved/.test(smallToast), smallToast.slice(0, 90));
  check("control: template really in localStorage", !!lsAfterSmall && lsAfterSmall.includes("Small tpl"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  /* ---------- BUG CASE: doc with a huge embedded image (PSD-like) ---------- */
  const srcLen = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1400; c.height = 2000;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.random() * 255;      // noise → PNG barely compresses
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
  console.log(`# big doc: data URL length = ${srcLen} chars (~${Math.round(srcLen / 1e6)} MB)`);

  await openTpl();
  const bigToast = await saveCurrent("Big PSD tpl");
  const lsAfterBig = await page.evaluate(() => localStorage.getItem("pageforge-templates-v1"));
  const lsHasBig = !!lsAfterBig && lsAfterBig.includes("Big PSD tpl");
  console.log(`# toast after big save: ${JSON.stringify(bigToast.slice(0, 120))}`);
  console.log(`# localStorage really contains big template: ${lsHasBig}`);

  /* reload → does the template survive? */
  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window).__PF_BUILD, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  await openTpl();
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((b) => /My templates/.test(b.textContent));
    if (tab) tab.click();
  });
  await page.waitForTimeout(400);
  const countAfterReload = await mineCount();
  console.log(`# My templates count after reload: ${countAfterReload}`);

  check("BUG: big doc save shows SUCCESS toast (user sees 'saved')", /Template saved/.test(bigToast));
  check("BUG: big template actually persisted", lsHasBig);
  check("BUG: template survives reload (count includes it)", Number(countAfterReload) >= 2, { countAfterReload });

  console.log(`\npage errors: ${errors.length}${errors.length ? " → " + errors[0] : ""}`);
  console.log(`REPRO RESULT: ${PASS} pass / ${FAIL} fail`);
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
