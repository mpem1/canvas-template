/* Cross-engine repro: webkit + firefox, real user flow. */
const { webkit, firefox } = require("playwright");

async function runEngine(name, engineType) {
  const browser = await (engineType === "webkit" ? webkit : firefox).launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[${name}] CONSOLE ERROR:`, m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => console.log(`[${name}] PAGE ERROR:`, String(e).slice(0, 300)));

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForFunction("!!window.__pfStore && !!window.__pfStore.getState().hydrated");
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction("!!window.__pfStore && !!window.__pfStore.getState().hydrated");

  await page.evaluate(() => {
    window.__commits = [];
    const st = window.__pfStore.getState();
    const orig = st.commitText;
    window.__pfStore.setState({
      commitText: (id, text) => { window.__commits.push({ id, text }); return orig(id, text); },
    }, false);
    window.__pfStore.getState().setDoc({
      name: "Repro", width: 816, height: 1056, unit: "in",
      margins: { top: 48, right: 48, bottom: 48, left: 48 }, bleed: 12,
      pages: [{ id: "p1", background: "#ffffff", frames: [] }],
    });
  });
  await page.waitForTimeout(250);

  // text tool + drag create
  await page.keyboard.press("t");
  await page.waitForTimeout(150);
  await page.mouse.move(600, 300);
  await page.mouse.down();
  await page.mouse.move(740, 400, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  let st = await page.evaluate(() => ({
    editing: !!window.__pfStore.getState().editingId,
    focused: document.activeElement && document.activeElement.isContentEditable,
  }));
  console.log(`[${name}] create+autofocus:`, JSON.stringify(st));

  await page.keyboard.type("test", { delay: 50 });
  await page.waitForTimeout(150);

  const dom = await page.evaluate(() => {
    const ce = document.querySelector('[contenteditable="true"]');
    return ce ? ce.innerText : null;
  });
  console.log(`[${name}] dom after typing:`, JSON.stringify(dom));

  await page.mouse.click(900, 700);
  await page.waitForTimeout(500);
  st = await page.evaluate(() => ({
    commits: window.__commits,
    store: window.__pfStore.getState().doc.pages[0].frames[0].text,
    editing: window.__pfStore.getState().editingId,
  }));
  console.log(`[${name}] after click-off:`, JSON.stringify(st));

  // dblclick into existing + retype + click off
  const c = await page.evaluate(() => {
    const f = window.__pfStore.getState().doc.pages[0].frames[0];
    const pv = [...document.querySelectorAll('[data-page-index="0"]')].pop();
    const r = pv.getBoundingClientRect();
    const z = window.__pfStore.getState().zoom;
    return { cx: r.left + (f.x + f.w / 2) * z, cy: r.top + (f.y + f.h / 2) * z };
  });
  await page.mouse.dblclick(c.cx, c.cy, { delay: 40 });
  await page.waitForTimeout(400);
  st = await page.evaluate(() => ({
    editing: !!window.__pfStore.getState().editingId,
    dom: (() => { const ce = document.querySelector('[contenteditable="true"]'); return ce ? ce.innerText : null; })(),
  }));
  console.log(`[${name}] after dblclick:`, JSON.stringify(st));
  await page.keyboard.press("Control+a");
  await page.keyboard.type("replaced", { delay: 40 });
  await page.mouse.click(900, 700);
  await page.waitForTimeout(500);
  st = await page.evaluate(() => ({
    commits: window.__commits.slice(-2),
    store: window.__pfStore.getState().doc.pages[0].frames[0].text,
  }));
  console.log(`[${name}] final:`, JSON.stringify(st));

  await browser.close();
}

(async () => {
  for (const [name, t] of [["webkit", "webkit"], ["firefox", "firefox"]]) {
    try {
      await runEngine(name, t);
    } catch (e) {
      console.log(`[${name}] FATAL:`, String(e).slice(0, 300));
    }
  }
  console.log("DONE");
})();
