// src/worker/index.ts
//
// Cloudflare Worker entry. Two jobs:
//
//   1. Serve the SPA. For any request that isn't one of our API routes,
//      fall through to `env.ASSETS.fetch(request)` so the static Vite
//      build in ./dist is served exactly like before. SPA fallback to
//      /index.html is handled by `assets.not_found_handling` in
//      wrangler.jsonc, NOT here.
//
//   2. Receive bug reports from the in-app modal at `POST /api/bug-report`
//      and forward them to Trello as a new card on a configured list.
//
// Why a Worker at all? The Trello API requires a key + token; those
// MUST NOT ship in the client bundle. Routing the request through the
// Worker lets us hold the secrets server-side and apply a per-IP rate
// limit so the public endpoint can't be turned into a free Trello
// paste-bin.
//
// Secrets (set via `wrangler secret put …`):
//   - TRELLO_API_KEY     personal key from https://trello.com/app-key
//   - TRELLO_API_TOKEN   token authorised against that key
//   - TRELLO_LIST_ID     ID of the list new cards land in (e.g. "Bug Reports")
//
// Bindings (declared in wrangler.jsonc):
//   - ASSETS             the static-asset binding (always present)
//   - BUG_REPORT_LIMIT   optional rate-limit binding (5 / IP / hour)

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  TRELLO_API_KEY?: string;
  TRELLO_API_TOKEN?: string;
  TRELLO_LIST_ID?: string;
  BUG_REPORT_LIMIT?: {
    limit: (opts: { key: string }) => Promise<{ success: boolean }>;
  };
}

// Hard cap on description payload size so a malicious client can't blast
// us (or Trello) with multi-MB cards. Trello's own limit is 16 KiB for
// the description; we round down and leave headroom for the markdown
// scaffolding we wrap around the JSON.
const MAX_DESC_BYTES = 14_000;
const MAX_TITLE_LEN = 120;

interface BugReportRequestBody {
  title?: unknown;
  description?: unknown;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/bug-report') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'method not allowed' }, 405);
      }
      return handleBugReport(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleBugReport(request: Request, env: Env): Promise<Response> {
  if (!env.TRELLO_API_KEY || !env.TRELLO_API_TOKEN || !env.TRELLO_LIST_ID) {
    // Surface a clear, actionable error so a misconfigured deploy doesn't
    // look like a silent 500 to whoever's filing the bug.
    return jsonResponse(
      {
        error:
          'Trello integration not configured. Set TRELLO_API_KEY, TRELLO_API_TOKEN, and TRELLO_LIST_ID via `wrangler secret put`.',
      },
      503,
    );
  }

  // Per-IP rate limit. The Cloudflare rate-limit binding is best-effort
  // and only available on paid plans, so we treat it as optional: if the
  // binding isn't there, we just let the request through. (The body-size
  // cap below still bounds blast radius.)
  if (env.BUG_REPORT_LIMIT) {
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const { success } = await env.BUG_REPORT_LIMIT.limit({ key: ip });
    if (!success) {
      return jsonResponse(
        { error: 'rate limit exceeded — please wait a minute and try again' },
        429,
      );
    }
  }

  let body: BugReportRequestBody;
  try {
    body = (await request.json()) as BugReportRequestBody;
  } catch {
    return jsonResponse({ error: 'invalid json body' }, 400);
  }

  const titleRaw = typeof body.title === 'string' ? body.title.trim() : '';
  const descRaw = typeof body.description === 'string' ? body.description : '';
  if (!titleRaw || !descRaw) {
    return jsonResponse(
      { error: '`title` and `description` are required strings' },
      400,
    );
  }

  // Clamp lengths. Title is short by Trello convention; description is
  // truncated with a clear marker so the user can see we cut it off.
  const title = titleRaw.slice(0, MAX_TITLE_LEN);
  const description = clampDesc(descRaw, MAX_DESC_BYTES);

  // Send the card payload in the REQUEST BODY, not the query string.
  // The description can be ~14 KB once it includes the full BugReport
  // JSON snapshot, and Trello's CDN bounces requests with URLs that
  // long with a 414 before they ever hit the app. Auth + idList stay
  // in query params (small, and easy to tell apart from card content
  // when reading Worker logs); everything else goes in the body as
  // application/x-www-form-urlencoded.
  const trelloUrl = new URL('https://api.trello.com/1/cards');
  trelloUrl.searchParams.set('idList', env.TRELLO_LIST_ID);
  trelloUrl.searchParams.set('key', env.TRELLO_API_KEY);
  trelloUrl.searchParams.set('token', env.TRELLO_API_TOKEN);

  const formBody = new URLSearchParams();
  formBody.set('name', title);
  formBody.set('desc', description);
  formBody.set('pos', 'top');

  let trelloRes: Response;
  try {
    trelloRes = await fetch(trelloUrl.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });
  } catch (err) {
    return jsonResponse(
      { error: `network error contacting Trello: ${(err as Error).message}` },
      502,
    );
  }

  if (!trelloRes.ok) {
    const text = await trelloRes.text().catch(() => '');
    return jsonResponse(
      {
        error: `Trello rejected the request (${trelloRes.status})`,
        detail: text.slice(0, 500),
      },
      502,
    );
  }

  const card = (await trelloRes.json()) as {
    id?: string;
    shortLink?: string;
    shortUrl?: string;
    url?: string;
  };

  return jsonResponse(
    {
      ok: true,
      id: card.id ?? null,
      shortLink: card.shortLink ?? null,
      url: card.shortUrl ?? card.url ?? null,
    },
    200,
  );
}

function clampDesc(s: string, maxBytes: number): string {
  // TextEncoder gives us the actual UTF-8 byte length Trello will count.
  const enc = new TextEncoder();
  if (enc.encode(s).byteLength <= maxBytes) return s;
  // Binary search the codepoint cutoff so we don't slice mid-character.
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (enc.encode(s.slice(0, mid)).byteLength <= maxBytes - 32) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, lo) + '\n\n…[truncated]';
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(),
    },
  });
}

function corsHeaders(): Record<string, string> {
  // Same-origin in production, but `pnpm dev` runs on :5173 and the
  // Worker on :8787, so we leave CORS permissive for the bug-report
  // endpoint. It's a single POST with no auth cookies, so this is safe.
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
}
