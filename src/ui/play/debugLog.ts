// src/ui/play/debugLog.ts
//
// A bounded session log that captures everything we'd want to see in a bug
// report — bot decisions and their timing, card applications, errors caught
// by the controller, plus optional validation findings per-turn.
//
// Stored as a ring buffer (most-recent N) so memory doesn't grow unbounded
// during long games. Default capacity is 500 entries which is plenty for a
// human-paced session.

import type { DebugLogEntry } from '../../game/debug.ts';

export class DebugLog {
  private buf: DebugLogEntry[] = [];
  private start = performance.now();
  private capacity: number;

  constructor(capacity = 500) {
    this.capacity = capacity;
  }

  push(kind: DebugLogEntry['kind'], tag: string, message: string, data?: unknown): void {
    const entry: DebugLogEntry = {
      ms: Math.round(performance.now() - this.start),
      t: new Date().toISOString(),
      kind, tag, message,
    };
    if (data !== undefined) entry.data = sanitize(data);
    this.buf.push(entry);
    if (this.buf.length > this.capacity) {
      this.buf.splice(0, this.buf.length - this.capacity);
    }
    if (kind === 'error' || kind === 'warn') {
      const fn = kind === 'error' ? console.error : console.warn;
      fn(`[sc:${tag}] ${message}`, data ?? '');
    }
  }

  info(tag: string, message: string, data?: unknown): void  { this.push('info', tag, message, data); }
  warn(tag: string, message: string, data?: unknown): void  { this.push('warn', tag, message, data); }
  error(tag: string, message: string, data?: unknown): void { this.push('error', tag, message, data); }

  getEntries(): DebugLogEntry[] {
    return this.buf.slice();
  }

  clear(): void {
    this.buf.length = 0;
    this.start = performance.now();
  }
}

/** Strip non-serializable values (functions, Maps, Sets, DOM nodes) so the
 * log can be safely JSON.stringified for the bug report. Maps and Sets get
 * converted to plain objects / arrays. */
function sanitize(value: unknown, seen = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return value;
  if (t === 'function') return `[fn ${(value as Function).name || 'anonymous'}]`;
  if (t !== 'object') return String(value);

  if (seen.has(value as object)) return '[circular]';
  seen.add(value as object);

  if (value instanceof Map) {
    return Object.fromEntries(
      [...value].map(([k, v]) => [String(k), sanitize(v, seen)]),
    );
  }
  if (value instanceof Set) {
    return [...value].map((v) => sanitize(v, seen));
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v, seen));
  }
  // Skip DOM nodes / Element / Window.
  if ((value as { nodeType?: number }).nodeType !== undefined) return '[dom node]';

  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as object)) {
    try {
      out[k] = sanitize((value as Record<string, unknown>)[k], seen);
    } catch {
      out[k] = '[unserializable]';
    }
  }
  return out;
}
