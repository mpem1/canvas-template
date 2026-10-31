#!/bin/bash
# Deep instrumentation: trace WHO commits text and WHEN relative to click events.
set -e
AB="agent-browser"

$AB eval "
(() => {
  // reset
  window.__logs = [];
  const log = (m) => window.__logs.push(m);

  // 1) wrap updateFrames to capture call stacks
  const st = window.__pfStore.getState();
  const orig = st.updateFrames.bind(st);
  window.__pfStore.setState({
    updateFrames: (ids, fn, record) => {
      const stack = new Error().stack.split('\n').slice(1, 6).join(' <= ');
      log('UPDATEFRAMES ids=' + JSON.stringify(ids) + ' stack: ' + stack);
      return orig(ids, fn, record);
    },
  });

  // 2) event tracing
  for (const type of ['pointerdown', 'mousedown', 'focusout', 'focusin']) {
    document.addEventListener(type, (e) => {
      const t = e.target;
      log('EVT ' + type + ' target=' + (t.tagName || '?') + '/' + (t.getAttribute && t.getAttribute('contenteditable') !== null ? 'CE' : t.className && String(t.className).slice(0, 30) || ''));
    }, true);
  }

  // 3) store transitions
  window.__pfStore.subscribe((s) => {
    const f = s.doc?.pages[0]?.frames?.find(f => f.id === 't1');
    log('STORE pageIdx=' + s.pageIdx + ' editingId=' + s.editingId + ' text=\"' + (f ? f.text : '?') + '\"');
  });
  return 'instrumented';
})()
"

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
  document.execCommand('insertText', false, 'trace version v3');
  await new Promise(r => setTimeout(r, 150));
  window.__logs.push('--- now real click on page-2 wrapper ---');
  return 'typed+waited';
})()
"

$AB mouse move 139 440 >/dev/null
$AB mouse down left >/dev/null
$AB mouse up left >/dev/null
sleep 0.6

$AB eval "window.__logs.join('\n')"
