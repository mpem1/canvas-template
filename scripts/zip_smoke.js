const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto("http://localhost:3101", { waitUntil: "networkidle" });
  await p.waitForFunction(
    "!!window.__pfStore && !!window.__pfStore.getState().hydrated",
    { timeout: 30000 },
  );
  const build = await p.evaluate(() => window.__PF_BUILD);
  await p.evaluate(() => {
    window.__pfStore.getState().setDoc({
      name: "Smoke", width: 816, height: 1056, unit: "in",
      margins: { top: 48, right: 48, bottom: 48, left: 48 }, bleed: 12,
      pages: [{ id: "p1", background: "#ffffff", frames: [] }],
    });
  });
  await p.waitForTimeout(500);
  const psdBtn = await p.getByTitle("Import a Photoshop .psd file").count();
  const tplBtn = await p.getByTitle("Start from a template").count();
  console.log("build:", build, "| PSD button:", psdBtn, "| Templates button:", tplBtn, "| errors:", errs.length);
  const ok = build === "2026-10-31.4" && psdBtn === 1 && tplBtn === 1 && errs.length === 0;
  console.log(ok ? "ZIP SMOKE PASS" : "ZIP SMOKE FAIL");
  await b.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
