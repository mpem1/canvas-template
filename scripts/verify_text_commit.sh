#!/bin/bash
# Verification suite for the text-revert fix (commitText) + focus-steal fix (stable setEl).
# NOTE: agent-browser mouse coords must be INTEGERS (decimals break its arg parser).
set -e
AB="agent-browser"
PASS=0; FAIL=0
check() { # $1 = label, $2 = js expression returning boolean
  R=$($AB eval "$2" | tr -d '"')
  if [ "$R" = "true" ]; then echo "PASS  $1"; PASS=$((PASS+1));
  else echo "FAIL  $1  (got: $R)"; FAIL=$((FAIL+1)); fi
}

echo "== fresh state + 2-page doc with text frame =="
$AB open http://localhost:3000 >/dev/null
$AB storage local clear >/dev/null || true
$AB reload >/dev/null
$AB wait --fn "!!window.__pfStore && !!window.__pfStore.getState().hydrated" >/dev/null
$AB errors --clear >/dev/null || true

$AB eval "
(() => {
  const s = window.__pfStore.getState();
  s.setDoc({
    name: 'Verify', width: 816, height: 1056, unit: 'in',
    margins: { top: 48, right: 48, bottom: 48, left: 48 }, bleed: 12,
    pages: [
      { id: 'p1', background: '#ffffff', frames: [{
        id: 't1', name: 'T1', x: 100, y: 100, w: 320, h: 140, rotation: 0, opacity: 1, locked: false,
        type: 'text', text: 'old text', fontFamily: 'Inter', fontSize: 24,
        bold: false, italic: false, underline: false, uppercase: false,
        align: 'left', vAlign: 'top', lineHeight: 1.3, letterSpacing: 0,
        color: '#111111', fill: 'none', padding: 12, autoFit: true, fillHeight: false }] },
      { id: 'p2', background: '#ffffff', frames: [] },
    ],
  });
  return 'ok';
})()
" >/dev/null

# helper: enter edit mode on t1, replace text via execCommand (real input events)
enter_and_type() { # $1 = text
$AB eval "
(async () => {
  const s = window.__pfStore.getState();
  s.setPageIdx(0);
  await new Promise(r => setTimeout(r, 80));
  s.setEditing('t1');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const ed = document.querySelector('[contenteditable=\"true\"]');
  if (!ed) return 'NO EDITOR';
  ed.focus();
  document.execCommand('selectall', false, null);
  document.execCommand('insertText', false, '$1');
  return 'typed:' + ed.innerText;
})()
" | grep -q "typed:" || { echo "FAIL  editor did not mount"; exit 1; }
}

# helper: click the CANVAS page-2 wrapper (2nd match; 1st = panel thumbnail)
click_canvas_page2() {
$AB eval "
(async () => {
  const pv = document.querySelectorAll('[data-page-index=\"1\"]')[1];
  const wrap = pv.parentElement;
  wrap.scrollIntoView({ block: 'center' });
  await new Promise(r => setTimeout(r, 120));
  const r = wrap.getBoundingClientRect();
  const vp = document.querySelector('.canvas-dotted').getBoundingClientRect();
  const x = Math.round(Math.min(Math.max((r.left + r.width/2), vp.left + 30), vp.right - 30));
  const y = Math.round(Math.min(Math.max((r.top + r.height/2), vp.top + 30), vp.bottom - 30));
  window.__pt = { x, y };
  return JSON.stringify(window.__pt);
})()
" >/dev/null
local X Y; X=$($AB eval "window.__pt.x" | tr -d '"'); Y=$($AB eval "window.__pt.y" | tr -d '"')
$AB mouse move "$X" "$Y" >/dev/null
$AB mouse down left >/dev/null
$AB mouse up left >/dev/null
sleep 0.4
}

echo "== TEST 1: canvas page-switch while typing (the confirmed repro) =="
enter_and_type "canvas switch survives v6"
PAST_BEFORE=$($AB eval "window.__pfStore.getState().past.length" | tr -d '"')
click_canvas_page2
check "T1 text committed after canvas page switch" \
  "window.__pfStore.getState().doc.pages[0].frames.find(f=>f.id==='t1').text === 'canvas switch survives v6'"
check "T1 page switched to 2" \
  "window.__pfStore.getState().pageIdx === 1"
check "T1 exactly one history entry added" \
  "window.__pfStore.getState().past.length === $PAST_BEFORE + 1"

echo "== TEST 2: panel thumbnail page-switch while typing =="
enter_and_type "panel switch survives v7"
$AB find role button click --name "Go to page 2" >/dev/null
sleep 0.4
check "T2 text committed after thumbnail switch" \
  "window.__pfStore.getState().doc.pages[0].frames.find(f=>f.id==='t1').text === 'panel switch survives v7'"

echo "== TEST 3: same-page empty-area click while typing =="
enter_and_type "same page survives v8"
$AB eval "
(() => {
  const pv = document.querySelectorAll('[data-page-index=\"0\"]')[1];
  const r = pv.getBoundingClientRect();
  window.__pt = { x: Math.round(r.right - 30), y: Math.round(r.bottom - 30) };
  return JSON.stringify(window.__pt);
})()
" >/dev/null
X=$($AB eval "window.__pt.x" | tr -d '"'); Y=$($AB eval "window.__pt.y" | tr -d '"')
$AB mouse move "$X" "$Y" >/dev/null; $AB mouse down left >/dev/null; $AB mouse up left >/dev/null
sleep 0.4
check "T3 text committed after same-page click-away" \
  "window.__pfStore.getState().doc.pages[0].frames.find(f=>f.id==='t1').text === 'same page survives v8'"
check "T3 editing ended" "window.__pfStore.getState().editingId === null"

echo "== TEST 4: Escape commits and exits =="
enter_and_type "escape survives v9"
$AB eval "document.activeElement && document.activeElement.blur(); 'blurred'" >/dev/null
$AB eval "
(async () => {
  const s = window.__pfStore.getState();
  s.setEditing('t1');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const ed = document.querySelector('[contenteditable=\"true\"]');
  ed.focus();
  document.execCommand('selectall', false, null);
  document.execCommand('insertText', false, 'escape survives v9b');
  return 'ok';
})()
" >/dev/null
$AB press Escape
sleep 0.3
check "T4 text committed on Escape" \
  "window.__pfStore.getState().doc.pages[0].frames.find(f=>f.id==='t1').text === 'escape survives v9b'"
check "T4 editing ended on Escape" "window.__pfStore.getState().editingId === null"

echo "== TEST 5: clearing all text commits empty string =="
enter_and_type ""
$AB eval "
(() => {
  const ed = document.querySelector('[contenteditable=\"true\"]');
  document.execCommand('selectall', false, null);
  document.execCommand('delete', false, null);
  return 'cleared:' + JSON.stringify(ed.innerText);
})()
" >/dev/null
$AB eval "document.activeElement && document.activeElement.blur(); 'b'" >/dev/null
sleep 0.3
check "T5 empty text committed" \
  "window.__pfStore.getState().doc.pages[0].frames.find(f=>f.id==='t1').text === ''"

echo "== TEST 6: no-op blur does not add history (retype identical text) =="
PAST6=$($AB eval "window.__pfStore.getState().past.length" | tr -d '"')
$AB eval "
(async () => {
  const s = window.__pfStore.getState();
  s.setPageIdx(0);
  await new Promise(r => setTimeout(r, 80));
  const cur = s.doc.pages[0].frames.find(f => f.id === 't1').text;
  s.setEditing('t1');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const ed = document.querySelector('[contenteditable=\"true\"]');
  ed.focus();
  document.execCommand('selectall', false, null);
  document.execCommand('insertText', false, cur); // identical text = no-op
  document.activeElement.blur();
  await new Promise(r => setTimeout(r, 300));
  return 'ok';
})()
" >/dev/null
check "T6 history unchanged after no-op blur" \
  "window.__pfStore.getState().past.length === $PAST6"

echo "== TEST 7: no focus steal after commit / external re-render =="
$AB eval "
(async () => {
  const s = window.__pfStore.getState();
  s.setPageIdx(0);
  await new Promise(r => setTimeout(r, 80));
  s.setEditing('t1');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const ed = document.querySelector('[contenteditable=\"true\"]');
  ed.focus();
  document.execCommand('selectall', false, null);
  document.execCommand('insertText', false, 'focus probe');
  document.activeElement.blur();          // blur -> commit -> re-render
  await new Promise(r => setTimeout(r, 300));
  window.__steal1 = document.activeElement.isContentEditable;
  s.updateFrames(['t1'], (f) => { if (f.type === 'text') f.fontSize = 40; });
  await new Promise(r => setTimeout(r, 300));
  window.__steal2 = document.activeElement.isContentEditable;
  return 'ok';
})()
" >/dev/null
check "T7 focus not stolen after blur-commit re-render" "window.__steal1 === false"
check "T7 focus not stolen after external update re-render" "window.__steal2 === false"

echo "== TEST 8: reload persistence =="
enter_and_type "reload survives v10"
$AB eval "document.activeElement && document.activeElement.blur(); 'b'" >/dev/null
sleep 1.2   # autosave debounce 600ms
$AB reload >/dev/null
$AB wait --fn "!!window.__pfStore && !!window.__pfStore.getState().hydrated" >/dev/null
check "T8 text persisted across reload" \
  "window.__pfStore.getState().doc.pages[0].frames.find(f=>f.id==='t1').text === 'reload survives v10'"

echo "== console errors =="
$AB errors || true
echo "== RESULT: $PASS passed, $FAIL failed =="
[ "$FAIL" = "0" ]
