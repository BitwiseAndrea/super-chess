// src/ui/play/bugReportModal.ts
//
// Modal triggered by the "🐞 bug report" button in the play header. Shows:
//   - Validation summary (pass / fail with per-issue rows)
//   - A pretty-printed JSON snapshot of state + debug log
//   - "Copy" and "Download .json" buttons
//   - An optional user note field that gets included in the report
//
// The modal is theme-aware (uses CSS variables) and dismisses on backdrop
// click or Escape.

import type { SuperChessState } from '../../game/types.ts';
import type { BugReport, ValidationIssue } from '../../game/debug.ts';
import { buildBugReport } from '../../game/debug.ts';
import type { DebugLog } from './debugLog.ts';
import {
  submitBugReportToTrello,
  BugReportSubmitError,
} from './bugReportApi.ts';

export interface BugReportOptions {
  state: SuperChessState;
  debugLog: DebugLog;
  config: Record<string, unknown>;
}

export function showBugReportModal(opts: BugReportOptions): void {
  // Build the report once up-front so the user sees a stable snapshot —
  // game state will keep changing in the background as the bot thinks etc.
  let report: BugReport = buildBugReport(opts.state, {
    config: opts.config,
    debugLog: opts.debugLog.getEntries(),
  });

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 900;
    background: rgba(8, 5, 3, 0.65);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const card = document.createElement('div');
  card.style.cssText = `
    background: var(--sc-panel-soft);
    border: 1px solid var(--sc-border);
    border-radius: 14px;
    width: 100%; max-width: 820px;
    max-height: 88vh;
    display: flex; flex-direction: column;
    overflow: hidden;
    color: var(--sc-text);
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.55);
  `;
  overlay.appendChild(card);

  // --- header ---
  const head = document.createElement('header');
  head.style.cssText = `
    padding: 18px 24px 14px;
    border-bottom: 1px solid var(--sc-border);
    display: flex; align-items: center; gap: 14px;
  `;
  card.appendChild(head);

  const title = document.createElement('div');
  title.style.cssText = `
    flex: 1;
    display: flex; flex-direction: column; gap: 2px;
  `;
  title.innerHTML = `
    <div style="font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:var(--sc-text-secondary);">bug report</div>
    <div style="font-size:18px;font-weight:500;color:var(--sc-text);">snapshot of current game</div>
  `;
  head.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'sc-btn';
  closeBtn.textContent = 'close';
  closeBtn.addEventListener('click', close);
  head.appendChild(closeBtn);

  // --- body (scrolling) ---
  const body = document.createElement('div');
  body.style.cssText = `
    flex: 1; min-height: 0;
    overflow-y: auto;
    padding: 18px 24px 24px;
    display: flex; flex-direction: column; gap: 18px;
  `;
  card.appendChild(body);

  // Validation summary.
  body.appendChild(renderValidation(report));

  // User note.
  const noteWrap = document.createElement('div');
  noteWrap.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
  noteWrap.innerHTML = `
    <label style="font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:var(--sc-text-secondary);">
      describe what went wrong (optional)
    </label>
  `;
  const noteInput = document.createElement('textarea');
  noteInput.placeholder = 'e.g. "after I played Trade, my rook disappeared from a1 but didn\u2019t appear on the bot side"';
  noteInput.rows = 3;
  noteInput.style.cssText = `
    width: 100%;
    background: var(--sc-bg);
    border: 1px solid var(--sc-border);
    border-radius: 8px;
    padding: 10px 12px;
    color: var(--sc-text);
    font-family: inherit;
    font-size: 13px;
    line-height: 1.5;
    resize: vertical;
  `;
  noteInput.addEventListener('input', () => {
    report = { ...report, userNote: noteInput.value };
  });
  noteWrap.appendChild(noteInput);
  body.appendChild(noteWrap);

  // FEN line (quick paste for a Lichess analysis).
  body.appendChild(renderField('fen (chess.com / lichess paste)', report.fen, true));

  // Hands by name.
  body.appendChild(renderField(
    'your hand',
    formatHand(report, opts.config.humanColor as ('w'|'b')) || '(empty)',
    false,
  ));
  body.appendChild(renderField(
    'opponent hand',
    formatHand(report, opts.config.humanColor === 'w' ? 'b' : 'w') || '(empty)',
    false,
  ));

  // Recent events.
  body.appendChild(renderEvents(report));

  // Debug log (collapsible).
  body.appendChild(renderDebugLog(report));

  // Raw JSON (collapsible — the big one).
  body.appendChild(renderRawJson(report));

  // --- footer (sticky actions) ---
  //
  // Two stacked rows so the "send to Trello" CTA gets its own line at
  // the top (primary action, plus a status banner that grows under it
  // on send / success / error). The bottom row keeps the unchanged
  // copy / download buttons and the chat hint.
  const foot = document.createElement('footer');
  foot.style.cssText = `
    border-top: 1px solid var(--sc-border);
    padding: 14px 24px;
    display: flex; flex-direction: column; gap: 10px;
    background: var(--sc-panel);
  `;
  card.appendChild(foot);

  const sendRow = document.createElement('div');
  sendRow.style.cssText = 'display: flex; gap: 10px; align-items: center;';
  foot.appendChild(sendRow);

  const sendBtn = document.createElement('button');
  sendBtn.className = 'sc-btn sc-btn--primary';
  sendBtn.textContent = 'send to Trello \u2192';
  sendBtn.title = 'Create a card on the Super Chess Trello board with this snapshot';
  sendRow.appendChild(sendBtn);

  // Status banner — empty until the first send attempt. Lives outside
  // the button so it can persist after the button text resets.
  const status = document.createElement('div');
  status.style.cssText = `
    flex: 1;
    font-size: 12px; line-height: 1.5;
    color: var(--sc-text-secondary);
    font-family: system-ui, sans-serif;
  `;
  sendRow.appendChild(status);

  let sending = false;
  sendBtn.addEventListener('click', async () => {
    if (sending) return;
    sending = true;
    sendBtn.disabled = true;
    sendBtn.textContent = 'sending\u2026';
    status.style.color = 'var(--sc-text-secondary)';
    status.textContent = 'posting to Trello\u2026';
    try {
      const result = await submitBugReportToTrello(report);
      status.style.color = 'var(--sc-text)';
      if (result.url) {
        // innerHTML is safe here: result.url comes straight from the
        // Worker which only forwards Trello's response, and the link
        // text is built from a stable shortLink (24-hex chars at most).
        const safeUrl = result.url.replace(/"/g, '&quot;');
        const label = result.shortLink ?? 'card';
        status.innerHTML =
          `\u2713 filed on Trello \u2014 ` +
          `<a href="${safeUrl}" target="_blank" rel="noreferrer" ` +
          `style="color: var(--sc-accent); text-decoration: underline;">` +
          `view ${escapeHtml(label)} \u2192</a>`;
      } else {
        status.textContent = '\u2713 filed on Trello (no URL returned)';
      }
      sendBtn.textContent = 'sent \u2713';
      // Leave the button disabled after a successful send so the user
      // can't accidentally double-file the same snapshot. They can
      // close the modal and re-open it to send a fresh report.
    } catch (err) {
      const e = err as BugReportSubmitError | Error;
      status.style.color = 'var(--sc-accent-danger)';
      const isConfigError =
        err instanceof BugReportSubmitError && err.status === 503;
      if (isConfigError) {
        status.textContent =
          '\u2715 Trello isn\u2019t configured on this deploy \u2014 use copy or download instead.';
      } else {
        status.textContent = `\u2715 ${e.message}`;
      }
      sendBtn.disabled = false;
      sendBtn.textContent = 'retry send';
      sending = false;
    }
  });

  // --- bottom row: copy + download + hint -----------------------------
  const actionsRow = document.createElement('div');
  actionsRow.style.cssText = 'display: flex; gap: 10px; align-items: center;';
  foot.appendChild(actionsRow);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'sc-btn';
  copyBtn.textContent = 'copy report';
  copyBtn.addEventListener('click', async () => {
    const json = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      copyBtn.textContent = 'copied!';
      setTimeout(() => { copyBtn.textContent = 'copy report'; }, 1600);
    } catch {
      // Fallback: select & prompt
      const ta = document.createElement('textarea');
      ta.value = json;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); copyBtn.textContent = 'copied!'; }
      catch { copyBtn.textContent = 'copy failed'; }
      document.body.removeChild(ta);
      setTimeout(() => { copyBtn.textContent = 'copy report'; }, 1600);
    }
  });
  actionsRow.appendChild(copyBtn);

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'sc-btn';
  downloadBtn.textContent = 'download .json';
  downloadBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = report.capturedAt.replace(/[:.]/g, '-');
    a.download = `super-chess-bug-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  actionsRow.appendChild(downloadBtn);

  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  actionsRow.appendChild(spacer);

  const hint = document.createElement('div');
  hint.style.cssText = `
    font-size: 11px; letter-spacing: 0.06em;
    color: var(--sc-text-muted);
    font-family: system-ui, sans-serif;
  `;
  hint.textContent = 'or paste the JSON into chat and we can debug it together';
  actionsRow.appendChild(hint);

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', escHandler);

  document.body.appendChild(overlay);
  // Focus the textarea so the user can type immediately.
  setTimeout(() => noteInput.focus(), 50);

  function close(): void {
    document.removeEventListener('keydown', escHandler);
    overlay.remove();
  }
}

// ─── section renderers ─────────────────────────────────────────────────────

function renderValidation(report: BugReport): HTMLElement {
  const v = report.validation;
  const wrap = document.createElement('section');
  wrap.style.cssText = `
    display: flex; flex-direction: column; gap: 8px;
    padding: 14px 16px;
    border-radius: 10px;
    border: 1px solid ${v.ok && v.warnings.length === 0
      ? 'color-mix(in srgb, var(--sc-accent) 35%, var(--sc-border))'
      : v.ok
        ? 'color-mix(in srgb, var(--sc-accent) 55%, var(--sc-border))'
        : 'color-mix(in srgb, var(--sc-accent-danger) 55%, var(--sc-border))'};
    background: ${v.ok && v.warnings.length === 0
      ? 'color-mix(in srgb, var(--sc-accent) 8%, var(--sc-panel))'
      : v.ok
        ? 'color-mix(in srgb, var(--sc-accent) 10%, var(--sc-panel))'
        : 'color-mix(in srgb, var(--sc-accent-danger) 12%, var(--sc-panel))'};
  `;

  const heading = document.createElement('div');
  heading.style.cssText = `
    display: flex; align-items: baseline; gap: 10px;
    font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase;
    color: var(--sc-text);
  `;
  const status = v.ok && v.warnings.length === 0
    ? { icon: '\u2713', label: 'state passes all checks', color: 'var(--sc-text)' }
    : v.ok
      ? { icon: '!', label: `${v.warnings.length} warning${v.warnings.length === 1 ? '' : 's'}`, color: 'var(--sc-accent)' }
      : { icon: '\u2715', label: `${v.errors.length} error${v.errors.length === 1 ? '' : 's'}, ${v.warnings.length} warning${v.warnings.length === 1 ? '' : 's'}`, color: 'var(--sc-accent-danger)' };
  heading.innerHTML = `
    <span style="font-size:18px;font-weight:700;color:${status.color};letter-spacing:0;">${status.icon}</span>
    <span>validation</span>
    <span style="font-size:11px;letter-spacing:0.16em;color:var(--sc-text-secondary);font-family:system-ui,sans-serif;text-transform:none;">${status.label}</span>
  `;
  wrap.appendChild(heading);

  if (v.errors.length || v.warnings.length) {
    const list = document.createElement('ul');
    list.style.cssText = `
      margin: 0; padding: 0; list-style: none;
      display: flex; flex-direction: column; gap: 4px;
      font-family: ui-monospace, 'JetBrains Mono', Menlo, monospace;
      font-size: 12px;
    `;
    for (const issue of [...v.errors, ...v.warnings]) {
      list.appendChild(renderIssue(issue));
    }
    wrap.appendChild(list);
  }

  return wrap;
}

function renderIssue(issue: ValidationIssue): HTMLElement {
  const li = document.createElement('li');
  const color = issue.severity === 'error' ? 'var(--sc-accent-danger)' : 'var(--sc-accent)';
  const icon = issue.severity === 'error' ? '\u2715' : '!';
  li.style.cssText = `
    display: flex; gap: 8px; align-items: flex-start;
    color: var(--sc-text-secondary);
    line-height: 1.5;
  `;
  li.innerHTML = `
    <span style="color:${color};font-weight:700;width:14px;flex-shrink:0;">${icon}</span>
    <span style="color:var(--sc-text-muted);font-size:10.5px;letter-spacing:0.14em;text-transform:uppercase;width:90px;flex-shrink:0;">${issue.tag}</span>
    <span style="flex:1;color:var(--sc-text);">${escapeHtml(issue.message)}${issue.square ? ` <span style="color:var(--sc-text-muted);">(@ ${issue.square})</span>` : ''}</span>
  `;
  return li;
}

function renderField(label: string, value: string, mono: boolean): HTMLElement {
  const wrap = document.createElement('section');
  wrap.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

  const lbl = document.createElement('div');
  lbl.style.cssText = `
    font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase;
    color: var(--sc-text-secondary);
  `;
  lbl.textContent = label;
  wrap.appendChild(lbl);

  const val = document.createElement('div');
  val.style.cssText = `
    padding: 10px 12px;
    background: var(--sc-bg);
    border: 1px solid var(--sc-border);
    border-radius: 8px;
    color: var(--sc-text);
    font-size: ${mono ? '12.5px' : '13px'};
    line-height: 1.5;
    word-break: break-all;
    ${mono ? "font-family: ui-monospace, 'JetBrains Mono', Menlo, monospace;" : ''}
  `;
  val.textContent = value;
  wrap.appendChild(val);
  return wrap;
}

function renderEvents(report: BugReport): HTMLElement {
  const det = document.createElement('details');
  det.open = false;
  det.style.cssText = `
    background: var(--sc-bg);
    border: 1px solid var(--sc-border);
    border-radius: 8px;
    padding: 0;
  `;
  const sum = document.createElement('summary');
  sum.style.cssText = `
    padding: 10px 12px;
    cursor: pointer;
    font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase;
    color: var(--sc-text-secondary);
    user-select: none;
  `;
  sum.textContent = `recent events (${report.recentEvents.length})`;
  det.appendChild(sum);

  const list = document.createElement('div');
  list.style.cssText = `
    padding: 4px 12px 12px;
    font-family: ui-monospace, 'JetBrains Mono', Menlo, monospace;
    font-size: 11.5px;
    line-height: 1.6;
    color: var(--sc-text-secondary);
    max-height: 220px;
    overflow-y: auto;
  `;
  for (const ev of report.recentEvents) {
    const row = document.createElement('div');
    row.innerHTML = `<span style="color:var(--sc-text-muted);">[${ev.turn}]</span> <span style="color:var(--sc-text-muted);">${ev.type}</span> <span style="color:var(--sc-text);">${escapeHtml(ev.summary)}</span>`;
    list.appendChild(row);
  }
  det.appendChild(list);
  return det;
}

function renderDebugLog(report: BugReport): HTMLElement {
  const det = document.createElement('details');
  det.open = report.debugLog.some((e) => e.kind === 'error' || e.kind === 'warn');
  det.style.cssText = `
    background: var(--sc-bg);
    border: 1px solid var(--sc-border);
    border-radius: 8px;
  `;
  const sum = document.createElement('summary');
  sum.style.cssText = `
    padding: 10px 12px;
    cursor: pointer;
    font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase;
    color: var(--sc-text-secondary);
    user-select: none;
  `;
  const errors = report.debugLog.filter((e) => e.kind === 'error').length;
  const warns = report.debugLog.filter((e) => e.kind === 'warn').length;
  sum.innerHTML = `debug log <span style="color:var(--sc-text-muted);font-family:system-ui;font-size:11px;letter-spacing:0.06em;text-transform:none;">(${report.debugLog.length} entries${errors ? `, ${errors} errors` : ''}${warns ? `, ${warns} warnings` : ''})</span>`;
  det.appendChild(sum);

  const list = document.createElement('div');
  list.style.cssText = `
    padding: 4px 12px 12px;
    font-family: ui-monospace, 'JetBrains Mono', Menlo, monospace;
    font-size: 11px;
    line-height: 1.6;
    max-height: 260px;
    overflow-y: auto;
  `;
  if (report.debugLog.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color: var(--sc-text-muted); padding: 6px 0; font-style: italic;';
    empty.textContent = 'no events yet';
    list.appendChild(empty);
  } else {
    for (const entry of report.debugLog) {
      list.appendChild(renderLogEntry(entry));
    }
  }
  det.appendChild(list);
  return det;
}

function renderLogEntry(entry: import('../../game/debug.ts').DebugLogEntry): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display: flex; gap: 8px; align-items: flex-start; margin-bottom: 2px;';
  const color =
    entry.kind === 'error' ? 'var(--sc-accent-danger)' :
    entry.kind === 'warn' ? 'var(--sc-accent)' :
    'var(--sc-text-secondary)';
  const ms = String(entry.ms).padStart(5, ' ');
  let dataStr = '';
  if (entry.data !== undefined) {
    try { dataStr = ' ' + JSON.stringify(entry.data); }
    catch { dataStr = ' [unserializable]'; }
  }
  row.innerHTML = `
    <span style="color:var(--sc-text-muted);font-variant-numeric:tabular-nums;flex-shrink:0;">${ms}ms</span>
    <span style="color:${color};text-transform:uppercase;font-size:9.5px;letter-spacing:0.14em;width:50px;flex-shrink:0;line-height:1.6;">${entry.kind}</span>
    <span style="color:var(--sc-text-muted);width:70px;flex-shrink:0;">${entry.tag}</span>
    <span style="color:var(--sc-text);flex:1;word-break:break-all;">${escapeHtml(entry.message)}${dataStr ? `<span style="color:var(--sc-text-muted);"> ${escapeHtml(dataStr)}</span>` : ''}</span>
  `;
  return row;
}

function renderRawJson(report: BugReport): HTMLElement {
  const det = document.createElement('details');
  det.style.cssText = `
    background: var(--sc-bg);
    border: 1px solid var(--sc-border);
    border-radius: 8px;
  `;
  const sum = document.createElement('summary');
  sum.style.cssText = `
    padding: 10px 12px;
    cursor: pointer;
    font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase;
    color: var(--sc-text-secondary);
    user-select: none;
  `;
  sum.textContent = 'full json snapshot';
  det.appendChild(sum);

  const pre = document.createElement('pre');
  pre.style.cssText = `
    margin: 0; padding: 8px 12px 12px;
    font-family: ui-monospace, 'JetBrains Mono', Menlo, monospace;
    font-size: 11px;
    line-height: 1.5;
    color: var(--sc-text);
    max-height: 320px;
    overflow: auto;
    white-space: pre;
  `;
  pre.textContent = JSON.stringify(report, null, 2);
  det.appendChild(pre);
  return det;
}

function formatHand(report: BugReport, color: 'w' | 'b'): string {
  const arr = color === 'w' ? report.hands.white : report.hands.black;
  return arr.length > 0 ? arr.join(', ') : '';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
