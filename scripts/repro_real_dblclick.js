/* Reproduce the user's EXACT flow with TRUE native events (clickCount=2 dblclick). */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE ERROR:", m.text());
  });

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForFunction("!!window.__pfStore && !!window.__pfStore.getState().hydrated");
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction("!!window.__pfStore && !!window.__pfStore.getState().hydrated");

  // instrument commitText
  await page.evaluate(() => {
    window.__commits = [];
    const st = window.__pfStore.getState();
    const orig = st.commitText;
    window.__pfStore.setState({
      commitText: (id, text) => {
        window.__commits.push({ id, text });
        return orig(id, text);
      },
    }, false);
  });

  // ---------- SCENARIO A: real tool flow ----------
  await page.evaluate(() => {
    window.__pfStore.getState().setDoc({
      name: "Repro", width: 816, height: 1056, unit: "in",
      margins: { top: 48, right: 48, bottom: 48, left: 48 }, bleed: 12,
      pages: [{ id: "p1", background: "#ffffff", frames: [] }],
    });
  });
  await page.waitForTimeout(200);

  // text tool via real keyboard 't'
  await page.keyboard.press("t");
  await page.waitForTimeout(150);

  // real drag on canvas to create frame
  await page.mouse.move(600, 300);
  await page.mouse.down();
  await page.mouse.move(740, 400, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  let st = await page.evaluate(() => ({
    editing: !!window.__pfStore.getState().editingId,
    frames: window.__pfStore.getState().doc.pages[0].frames.length,
    ceFocused: document.activeElement && document.activeElement.isContentEditable,
  }));
  console.log("A1 after drag-create:", JSON.stringify(st));

  // REAL typing
  await page.keyboard.type("test", { delay: 60 });
  await page.waitForTimeout(150);

  const domTxt = await page.evaluate(() => {
    const ce = document.querySelector('[contenteditable="true"]');
    return ce ? ce.innerText : null;
  });
  console.log("A2 dom after typing:", JSON.stringify(domTxt));

  // REAL click off (empty page area)
  await page.mouse.click(900, 700);
  await page.waitForTimeout(500);

  st = await page.evaluate(() => ({
    commits: window.__commits,
    store: window.__pfStore.getState().doc.pages[0].frames[0].text,
    editing: window.__pfStore.getState().editingId,
  }));
  console.log("A3 after click-off:", JSON.stringify(st));

  // ---------- SCENARIO B: real NATIVE double-click into existing frame ----------
  // find the frame element on canvas
  const frameBox = await page.evaluate(() => {
    const f = window.__pfStore.getState().doc.pages[0].frames[0];
    const pv = [...document.querySelectorAll('[data-page-index="0"]')].pop();
    const r = pv.getBoundingClientRect();
    const z = window.__pfStore.getState().zoom;
    return {
      cx: r.left + (f.x + f.w / 2) * z,
      cy: r.top + (f.y + f.h / 2) * z,
    };
  });
  console.log("B1 frame center:", JSON.stringify(frameBox));

  await page.mouse.dblclick(frameBox.cx, frameBox.cy, { delay: 40 });
  await page.waitForTimeout(400);

  st = await page.evaluate(() => ({
    editing: !!window.__pfStore.getState().editingId,
    ceFocused: document.activeElement && document.activeElement.isContentEditable,
    dom: (() => { const ce = document.querySelector('[contenteditable="true"]'); return ce ? ce.innerText : null; })(),
  }));
  console.log("B2 after native dblclick:", JSON.stringify(st));

  // retype replacing selection: real select-all + type
  await page.keyboard.press("Control+a");
  await page.keyboard.type("replaced text", { delay: 50 });
  await page.waitForTimeout(150);

  // click off onto empty area
  await page.mouse.click(900, 700);
  await page.waitForTimeout(500);

  st = await page.evaluate(() => ({
    commits: window.__commits,
    store: window.__pfStore.getState().doc.pages[0].frames[0].text,
    editing: window.__pfStore.getState().editingId,
  }));
  console.log("B3 after click-off:", JSON.stringify(st));

  // ---------- SCENARIO C: type + Enter (multiline) + click off ----------
  await page.mouse.dblclick(frameBox.cx, frameBox.cy, { delay: 40 });
  await page.waitForTimeout(400);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("line1", { delay: 40 });
  await page.keyboard.press("Enter");
  await page.keyboard.type("line2", { delay: 40 });
  await page.mouse.click(900, 700);
  await page.waitForTimeout(500);
  st = await page.evaluate(() => ({
    commits: window.__commits.slice(-2),
    store: window.__pfStore.getState().doc.pages[0].frames[0].text,
  }));
  console.log("C1 multiline:", JSON.stringify(st));

  // ---------- SCENARIO D: dblclick into frame, type, click onto ANOTHER text frame ----------
  await page.evaluate(() => {
    const s = window.__pfStore.getState();
    s.addFrame({ id: "tB", name: "TB", x: 100, y: 700, w: 220, h: 100, rotation: 0, opacity: 1, locked: false, type: "text", text: "other frame", fontFamily: "Inter", fontSize: 24, bold: false, italic: false, underline: false, uppercase: false, align: "left", vAlign: "top", lineHeight: 1.3, letterSpacing: 0, color: "#111111", fill: "none", padding: 12, autoFit: true, fillHeight: false });
  });
  await page.waitForTimeout(150);
  const otherBox = await page.evaluate(() => {
    const f = window.__pfStore.getState().doc.pages[0].frames.find((x) => x.id === "tB");
    const pv = [...document.querySelectorAll('[data-page-index="0"]')].pop();
    const r = pv.getBoundingClientRect();
    const z = window.__pfStore.getState().zoom;
    return { cx: r.left + (f.x + f.w / 2) * z, cy: r.top + (f.y + f.h / 2) * z };
  });
  await page.mouse.dblclick(frameBox.cx, frameBox.cy, { delay: 40 });
  await page.waitForTimeout(400);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("editing again", { delay: 40 });
  // click straight onto the OTHER frame (real single click)
  await page.mouse.click(otherBox.cx, otherBox.cy);
  await page.waitForTimeout(500);
  st = await page.evaluate(() => ({
    commits: window.__commits.slice(-3),
    texts: window.__pfStore.getState().doc.pages[0].frames.map((f) => f.text),
    editing: window.__pfStore.getState().editingId,
  }));
  console.log("D1 click onto other frame:", JSON.stringify(st));

  await browser.close();
  console.log("DONE");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
