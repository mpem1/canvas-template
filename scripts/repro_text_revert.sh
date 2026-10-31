#!/bin/bash
# Repro: text typed into a frame reverts when the user switches pages while editing.
# The unmount-commit looks the frame up on the CURRENT pageIdx — which has already
# changed by the time the cleanup runs → typed text silently dropped.

set -e
AB="agent-browser"

echo "== open app, fresh state =="
$AB open http://localhost:3000 >/dev/null
$AB storage local clear >/dev/null || true
$AB reload >/dev/null
$AB wait --fn "!!window.__pfStore && !!window.__pfStore.getState().hydrated" >/dev/null

echo "== seed 2-page doc with a text frame (old text) =="
$AB eval "
(() => {
  const s = window.__pfStore.getState();
  s.setDoc({
    name: 'Repro', width: 816, height: 1056, unit: 'in',
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
  return 'seeded p1+t1, p2';
})()
"

echo "== enter edit mode + type new text =="
$AB eval "
(async () => {
  window.__pfStore.getState().setEditing('t1');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const ed = document.querySelector('[contenteditable=\"true\"]');
  if (!ed) return 'NO EDITOR MOUNTED';
  ed.focus();
  document.execCommand('selectall', false, null);
  document.execCommand('insertText', false, 'brand new text');
  return 'typed: ' + ed.innerText;
})()
"

echo "== TEST A: click page-2 wrapper on the CANVAS while editing =="
$AB eval "
(() => {
  const pv = document.querySelector('[data-page-index=\"1\"]');
  const wrap = pv.parentElement;
  const r = wrap.getBoundingClientRect();
  window.__reproRect = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  return JSON.stringify(window.__reproRect);
})()
"
RX=$($AB eval "window.__reproRect.x" | tr -d '"')
RY=$($AB eval "window.__reproRect.y" | tr -d '"')
$AB mouse move "$RX" "$RY" >/dev/null
$AB mouse down left >/dev/null
$AB mouse up left >/dev/null
$AB wait 300 >/dev/null

$AB eval "
(() => {
  const s = window.__pfStore.getState();
  const f = s.doc.pages[0].frames[0];
  return 'TEST A RESULT: pageIdx=' + s.pageIdx +
    ' | frame text=\"' + f.text + '\"' +
    ' | editingId=' + s.editingId +
    ' => ' + (f.text === 'brand new text' ? 'COMMITTED (ok)' : 'REVERTED (bug)');
})()
"

echo "== TEST B: click the PagesPanel page-2 thumbnail while editing =="
$AB eval "
(async () => {
  const s = window.__pfStore.getState();
  s.setPageIdx(0);
  s.setEditing('t1');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const ed = document.querySelector('[contenteditable=\"true\"]');
  if (!ed) return 'NO EDITOR MOUNTED';
  ed.focus();
  document.execCommand('selectall', false, null);
  document.execCommand('insertText', false, 'third version');
  return 'on page ' + s.pageIdx + ', typed: ' + ed.innerText;
})()
"
$AB find role button click --name "Go to page 2" >/dev/null || echo "(find click failed)"
$AB wait 300 >/dev/null

$AB eval "
(() => {
  const s = window.__pfStore.getState();
  const f = s.doc.pages[0].frames[0];
  return 'TEST B RESULT: pageIdx=' + s.pageIdx +
    ' | frame text=\"' + f.text + '\"' +
    ' => ' + (f.text === 'third version' ? 'COMMITTED (ok)' : 'REVERTED (bug)');
})()
"

echo "== console errors =="
$AB errors || true
