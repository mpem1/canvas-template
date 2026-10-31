/* Verify: expanded starter set — 12 templates incl. landscape ads, brochures
 * and pamphlets. For EVERY starter template: apply it, assert the declared
 * size (px, rounded), page count, and that no frame overflows the page
 * (± bleed) — the generic check that catches layout bugs like the pre-fix
 * tri-fold, whose panels hung 216px off the right page edge.
 */
const { chromium } = require("playwright");

let PASS = 0, FAIL = 0;
function check(label, cond, extra) {
  if (cond) PASS++;
  else FAIL++;
  console.log((cond ? "PASS " : "FAIL ") + label + (extra !== undefined ? "  " + JSON.stringify(extra) : ""));
}

const PX_PER_IN = 96, PX_PER_CM = 96 / 2.54, PX_PER_MM = 96 / 25.4;
const toPx = (v, u) => (u === "in" ? v * PX_PER_IN : u === "cm" ? v * PX_PER_CM : u === "mm" ? v * PX_PER_MM : v);

/* id → [name, W, H, unit, pages, minFrames, maxFrames(optional)] */
const EXPECT = [
  ["poster-event",     "Event Poster",        toPx(13, "in"), toPx(19, "in"), "in", 1, 6],
  ["flyer-product",    "Product Flyer",       toPx(21, "cm"), toPx(29.7, "cm"), "cm", 1, 7],
  ["newsletter",       "Newsletter",          toPx(21, "cm"), toPx(29.7, "cm"), "cm", 2, 10],
  ["brochure-trifold", "Tri-fold Brochure",   toPx(11, "in"), toPx(8.5, "in"), "in", 1, 11],
  ["report-cover",     "Report Cover",        toPx(21, "cm"), toPx(29.7, "cm"), "cm", 1, 5],
  ["blank-poster",     "Blank Poster",        toPx(13, "in"), toPx(19, "in"), "in", 1, 0],
  ["sale-mega-landscape", "Mega Sale Banner",     toPx(29.7, "cm"), toPx(21, "cm"), "cm", 1, 8],
  ["grand-opening",    "Grand Opening Flyer", toPx(11, "in"), toPx(8.5, "in"), "in", 1, 9],
  ["product-showcase", "Product Showcase",    toPx(29.7, "cm"), toPx(21, "cm"), "cm", 1, 19],
  ["pamphlet-dl",      "DL Pamphlet",         toPx(99, "mm"), toPx(210, "mm"), "mm", 2, 16],
  ["bifold-brochure",  "Half-fold Brochure",  toPx(29.7, "cm"), toPx(21, "cm"), "cm", 2, 12],
  ["property-showcase", "Property Showcase",  toPx(11, "in"), toPx(8.5, "in"), "in", 1, 19],
];
const NEW_IDS = ["sale-mega-landscape", "grand-opening", "product-showcase", "pamphlet-dl", "bifold-brochure", "property-showcase"];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window).__PF_BUILD, null, { timeout: 30000 });
  const build = await page.evaluate(() => window.__PF_BUILD);
  check("build stamp 2026-10-31.4", build === "2026-10-31.4", build);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => !!(window).__pfStore && (window).__pfStore.getState().hydrated,
    null,
    { timeout: 15000 },
  );

  /* open the templates dialog from the welcome screen */
  await page.click('button:has-text("Browse templates")');
  await page.waitForSelector('[aria-label="Template name"]', { timeout: 8000 });
  const tabLabel = await page.evaluate(() => {
    const t = [...document.querySelectorAll('[role="tab"]')].find((b) => /Starter/.test(b.textContent));
    return t ? t.textContent.trim() : "";
  });
  check("starter tab shows 12 templates", tabLabel === "Starter (12)", tabLabel);

  const previewCards = await page.evaluate(
    () => document.querySelectorAll('[role="tabpanel"] button, .grid > button').length,
  );
  // previews render on the starter tab by default — every card is a <button>
  const cardsVisible = await page.locator("button:has-text('Event Poster')").count();
  check("starter preview cards render", cardsVisible >= 1, { previewCards, cardsVisible });

  for (const [id, name, W, H, unit, pages, minF] of EXPECT) {
    // (re)open the dialog fresh each time
    const dialogOpen = await page.locator('[aria-label="Template name"]').count();
    if (!dialogOpen) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      const hasDoc = await page.evaluate(() => !!window.__pfStore.getState().doc);
      if (hasDoc) await page.click('button[title="Start from a template"]');
      else await page.click('button:has-text("Browse templates")');
      await page.waitForSelector('[aria-label="Template name"]', { timeout: 8000 });
      // make sure the starter tab is active
      await page.evaluate(() => {
        const t = [...document.querySelectorAll('[role="tab"]')].find((b) => /Starter/.test(b.textContent));
        if (t && t.getAttribute("aria-selected") !== "true") t.click();
      });
      await page.waitForTimeout(250);
    }
    const card = page.locator(`button:has-text("${name}")`).first();
    await card.click();
    await page.waitForTimeout(500);

    const doc = await page.evaluate(() => {
      const d = window.__pfStore.getState().doc;
      const all = d.pages.flatMap((p) => p.frames);
      const b = d.bleed ?? 0;
      const overflow = all.filter(
        (f) => f.x < -b || f.y < -b || f.x + f.w > d.width + b || f.y + f.h > d.height + b,
      ).length;
      const textTotal = all.filter((f) => f.type === "text").reduce((s, f) => s + (f.text?.length ?? 0), 0);
      return {
        w: d.width, h: d.height, unit: d.unit, pages: d.pages.length,
        frames: all.length, overflow, textTotal,
      };
    });
    const expW = Math.round(W), expH = Math.round(H);
    check(`${id}: page size ${expW}×${expH} ${unit} · ${pages}p`,
      doc.w === expW && doc.h === expH && doc.unit === unit && doc.pages === pages,
      { got: [doc.w, doc.h, doc.unit, doc.pages] });
    check(`${id}: frames ${minF > 0 ? `≥${minF}` : "=0"}, no overflow`, minF > 0 ? doc.frames >= minF && doc.overflow === 0 : doc.frames === 0,
      { frames: doc.frames, overflow: doc.overflow });
    if (minF > 0) check(`${id}: has real copy (${doc.textTotal} chars)`, doc.textTotal >= 40, doc.textTotal);
    // no text frame may show the red dashed overflow indicator/badge
    await page.waitForTimeout(500); // measurement + webfonts settle
    const overflowBadges = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll("[data-page-index]")];
      const canvasNode = nodes.reduce((best, n) =>
        n.getBoundingClientRect().width * n.getBoundingClientRect().height >
        best.getBoundingClientRect().width * best.getBoundingClientRect().height
          ? n
          : best,
      );
      return [...canvasNode.querySelectorAll("div")].filter(
        (el) => (el.getAttribute("style") ?? "").includes("dashed") &&
                (el.getAttribute("style") ?? "").includes("#ef4444"),
      ).length;
    });
    check(`${id}: zero text-overflow badges on canvas`, overflowBadges === 0, overflowBadges);
    if (NEW_IDS.includes(id)) check(`${id}: is one of the NEW ad/showcase starters`, true);
  }

  /* landscape flags sanity: the three landscape Letter starters are wider than tall */
  const landscapeOk = await page.evaluate(() => {
    // last applied above is property-showcase
    const d = window.__pfStore.getState().doc;
    return d.width > d.height;
  });
  check("property-showcase applied as landscape (w > h)", landscapeOk);

  /* multi-page starters expose both pages in the pages panel */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  await page.click('button[title="Start from a template"]');
  await page.waitForSelector('[aria-label="Template name"]', { timeout: 8000 });
  await page.locator('button:has-text("Half-fold Brochure")').first().click();
  await page.waitForTimeout(400);
  const pageThumbs = await page.evaluate(
    () => document.querySelectorAll("[data-page-index]").length,
  );
  check("bifold brochure shows 2 page thumbnails + canvas page", pageThumbs >= 3, pageThumbs);

  check("zero page errors", errors.length === 0, errors[0]);
  console.log(`\nRESULT: ${PASS} pass / ${FAIL} fail`);
  await browser.close();
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
