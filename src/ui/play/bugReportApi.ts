// src/ui/play/bugReportApi.ts
//
// Thin client for `POST /api/bug-report` — the Cloudflare Worker route
// defined in `src/worker/index.ts`. Sole reason this exists as its own
// module: keeps the modal free of fetch/JSON plumbing so it can focus
// on UI, and gives us a single place to evolve the wire format.
//
// The Worker takes { title, description } and returns either
// { ok: true, url } (200) or { error, detail? } (4xx / 5xx).

import type { BugReport } from '../../game/debug.ts';

export interface SubmitBugReportResult {
  /** Trello card URL on success — open this in a new tab. */
  url: string | null;
  /** Trello short link, useful as a fallback display id. */
  shortLink: string | null;
}

export class BugReportSubmitError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'BugReportSubmitError';
  }
}

export async function submitBugReportToTrello(
  report: BugReport,
): Promise<SubmitBugReportResult> {
  const { title, description } = formatTrelloPayload(report);

  let res: Response;
  try {
    res = await fetch('/api/bug-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, description }),
    });
  } catch (err) {
    throw new BugReportSubmitError(
      `network error: ${(err as Error).message}`,
      0,
    );
  }

  // Parse defensively — the Worker always returns JSON, but a proxy /
  // 404 page in the middle could return HTML.
  let payload: Record<string, unknown> = {};
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    // fall through; we'll surface a generic message below
  }

  if (!res.ok) {
    const errMsg =
      typeof payload.error === 'string'
        ? payload.error
        : `request failed with status ${res.status}`;
    const detail =
      typeof payload.detail === 'string' ? payload.detail : undefined;
    throw new BugReportSubmitError(errMsg, res.status, detail);
  }

  return {
    url: typeof payload.url === 'string' ? payload.url : null,
    shortLink:
      typeof payload.shortLink === 'string' ? payload.shortLink : null,
  };
}

// Exported so tests (and the modal preview, if we ever add one) can
// inspect the exact markdown that ends up in the Trello card.
export function formatTrelloPayload(report: BugReport): {
  title: string;
  description: string;
} {
  const title = deriveTitle(report);
  const description = buildDescription(report);
  return { title, description };
}

function deriveTitle(report: BugReport): string {
  const note = report.userNote.trim();
  if (note) {
    // Take the first line of the note, trimmed to a reasonable headline.
    const firstLine = note.split(/\r?\n/)[0]?.trim() ?? '';
    if (firstLine) return truncate(firstLine, 100);
  }
  // Fall back to a structured title so the Trello board isn't full of
  // "Bug report" duplicates.
  const v = report.validation;
  if (!v.ok && v.errors.length > 0) {
    return truncate(
      `Bug: ${v.errors[0].tag} — ${v.errors[0].message}`,
      100,
    );
  }
  return `Bug report · ${report.turn === 'w' ? 'white' : 'black'} to move · ${report.capturedAt.slice(0, 10)}`;
}

function buildDescription(report: BugReport): string {
  const lines: string[] = [];

  if (report.userNote.trim()) {
    lines.push('## What happened');
    lines.push(report.userNote.trim());
    lines.push('');
  }

  lines.push('## Quick facts');
  lines.push(`- **Captured:** ${report.capturedAt}`);
  lines.push(`- **URL:** ${report.url ?? 'n/a'}`);
  if (report.viewport) {
    lines.push(`- **Viewport:** ${report.viewport.w} × ${report.viewport.h}`);
  }
  lines.push(`- **Turn:** ${report.turn === 'w' ? 'white' : 'black'} (move ${report.fullMoveNumber})`);
  lines.push(`- **FEN:** \`${report.fen}\``);
  lines.push(
    `- **Hands:** white = [${report.hands.white.join(', ') || '—'}], black = [${report.hands.black.join(', ') || '—'}]`,
  );
  lines.push('');

  // Validation summary. The whole point of the report is the snapshot,
  // so call out any failed invariants up top — they're the lead.
  const v = report.validation;
  if (v.errors.length || v.warnings.length) {
    lines.push('## Validation');
    for (const issue of v.errors) {
      lines.push(`- ❌ **${issue.tag}** — ${issue.message}${issue.square ? ` (@ ${issue.square})` : ''}`);
    }
    for (const issue of v.warnings) {
      lines.push(`- ⚠️ **${issue.tag}** — ${issue.message}${issue.square ? ` (@ ${issue.square})` : ''}`);
    }
    lines.push('');
  } else {
    lines.push('## Validation');
    lines.push('- ✅ state passes all invariant checks');
    lines.push('');
  }

  if (report.recentEvents.length > 0) {
    lines.push('## Recent events');
    lines.push('```');
    for (const ev of report.recentEvents.slice(-15)) {
      lines.push(`[${ev.turn}] ${ev.type}: ${ev.summary}`);
    }
    lines.push('```');
    lines.push('');
  }

  // The full JSON snapshot, fenced so Trello renders it monospace and
  // we can paste it straight back into the dev console / a debugger.
  lines.push('## Full snapshot');
  lines.push('```json');
  lines.push(JSON.stringify(report, null, 2));
  lines.push('```');

  return lines.join('\n');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
