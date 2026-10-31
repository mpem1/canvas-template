/* Screenshot a few new starter templates for a visual quality check (UI apply). */
const { chromium } = require("playwright");

const SHOTS = [
  { name: "Mega Sale Banner", zoom: 0.42, page: 0, out: "/tmp/render/tpl-mega.png" },
  { name: "DL Pamphlet", zoom: 0.75, page: 0, out: "/tmp/render/tpl-dl-1.png" },
  { name: "DL Pamphlet", zoom: 0.75, page: 1, out: "/tmp/render/tpl-dl-2.png" },
  { name: "Half-fold Brochure", zoom: 0.42, page: 1, out: "/tmp/render/tpl-bifold-2.png" },
  { name: "Property Showcase", zoom: 0.5, page: 0, out: "/tmp/render/tpl-property.png" },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 980 } });
  await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window).__PF_BUILD, null, { timeout: 30000 });
  await page.waitForFunction(
    () => !!(window).__pfStore && (window).__pfStore.getState().hydrated,
    null,
    { timeout: 15000 },
  );
  await page.evaluate(() => localStorage.clear());

  const openDialog = async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const hasDoc = await page.evaluate(() => !!window.__pfStore.getState().doc);
    if (hasDoc) await page.click('button[title="Start from a template"]');
    else await page.click('button:has-text("Browse templates")');
    await page.waitForSelector('[aria-label="Template name"]', { timeout: 8000 });
    await page.evaluate(() => {
      const t = [...document.querySelectorAll('[role="tab"]')].find((b) => /Starter/.test(b.textContent));
      if (t && t.getAttribute("aria-selected") !== "true") t.click();
    });
    await page.waitForTimeout(300);
  };

  for (const s of SHOTS) {
    await openDialog();
    await page.locator(`button:has-text("${s.name}")`).first().click();
    await page.waitForTimeout(600);
    if (s.page > 0) {
      await page.evaluate((p) => window.__pfStore.getState().setPageIdx(p), s.page);
    }
    await page.evaluate((z) => window.__pfStore.getState().setZoom(z), s.zoom);
    await page.waitForTimeout(900); // fonts + layout settle
    // the canvas PageView is the LARGEST [data-page-index] node (thumbnails
    // are small); .last() is unreliable for multi-page docs
    const canvas = await page.evaluateHandle(() => {
      const nodes = [...document.querySelectorAll("[data-page-index]")];
      return nodes.reduce((best, n) =>
        n.getBoundingClientRect().width * n.getBoundingClientRect().height >
        best.getBoundingClientRect().width * best.getBoundingClientRect().height
          ? n
          : best,
      );
    });
    await canvas.asElement().screenshot({ path: s.out });
    console.log("shot:", s.out);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
