import type { SurfaceSink, StatusCb } from "../types";

/** Magic Trackpad multi-finger input via the C# Raw-Input helper (trackpad-bridge/).
 *  The helper streams the current finger contacts here over a localhost WebSocket; we
 *  feed them into the SAME SurfaceSink the mouse/pad use — so each finger plays a voice,
 *  shows as a dot, and records into loops. No Force-Touch pressure on Windows, so finger
 *  Y drives dynamics instead.
 *
 *  Robustness: the helper's per-contact IDs can flicker (causing duplicate/stuck notes),
 *  so we DON'T trust them — we match each incoming finger to the nearest existing voice by
 *  position, and expire voices that haven't been seen for a short grace period. That makes
 *  one finger = one stable voice, and guarantees nothing sticks on.
 *
 *  Run the helper:  npm run trackpad   (or it's auto-started by the Electron app) */

const DEFAULT_PORT = 48808;
const RETRY_MIN = 1000;
const RETRY_MAX = 5000;
const MATCH_DIST = 0.09; // normalized distance to consider it the same finger
const GRACE_MS = 70; // release a voice this long after its finger was last seen. Short, so a fast
                     // lift+retap reads as a NEW hit (you can machine-gun the kick) while still riding
                     // out a 1–2 frame helper drop. The EDGE filter handles ghosts, not this.
const START_FRAMES = 2; // a new contact must persist this many frames before it plays — low enough
                        // that quick taps still register, high enough to drop 1-frame ghosts

interface ContactsMsg {
  type: "contacts";
  // "s" (normalized contact size/pressure 0..1) is present ONLY when the trackpad actually
  // reports area (Tip-Pressure/Width/Height); most Magic Trackpads omit it → we fall back to Y.
  points: { id: number; x: number; y: number; s?: number }[];
}

interface Voice {
  id: string;
  x: number;
  y: number;
  seen: number;
}

// a touch we've seen but not yet promoted to a playing voice (debounce vs. 1-frame ghosts)
interface Pending {
  x: number;
  y: number;
  hits: number;
}

export interface TrackpadBridge {
  reconnect(): void;
  close(): void;
  /** Send a command to the helper (e.g. the gesture lock toggle). */
  send(obj: unknown): void;
}

export function initTrackpadBridge(sink: SurfaceSink, status: StatusCb, opts: { port?: number; enabled?: () => boolean } = {}): TrackpadBridge {
  const url = `ws://127.0.0.1:${opts.port ?? DEFAULT_PORT}`;
  let ws: WebSocket | null = null;
  let retry = RETRY_MIN;
  let timer: number | undefined;
  let stopped = false;
  let voices: Voice[] = [];
  let pending: Pending[] = [];
  let vseq = 0;

  // No real Force-Touch pressure on Windows, so vertical position is the dynamics axis: low on
  // the pad = soft (0.08), high = loud (~1.0), curved so the lower half stays genuinely quiet.
  const pressureFor = (y: number) => 0.08 + Math.pow(clamp01(1 - y), 1.5) * 0.9;

  // If the helper sends a real contact "size" (bigger/flatter finger = louder/brighter), use it
  // as the dominant pressure, lightly blended with the Y-position curve so you can still trim
  // dynamics by where you press. If "s" is absent, this is identical to pressureFor(y) — the
  // existing behavior is untouched on hardware that reports no area.
  const S_WEIGHT = 0.8; // how much real area drives dynamics vs. the Y fallback when present
  const dynamicsFor = (y: number, s?: number): number => {
    const base = pressureFor(y);
    if (s === undefined) return base;
    const fromSize = 0.08 + clamp01(s) * 0.92; // map 0..1 size onto the same 0.08..1.0 range
    return clamp01(fromSize * S_WEIGHT + base * (1 - S_WEIGHT));
  };
  const endAll = () => { for (const v of voices) sink.end(v.id); voices = []; pending = []; };
  const clearTimer = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } };
  const scheduleRetry = () => {
    if (stopped) return;
    clearTimer();
    timer = window.setTimeout(connect, retry);
    retry = Math.min(retry * 1.6, RETRY_MAX);
  };

  function handle(msg: ContactsMsg): void {
    const now = performance.now();
    // when play is disabled (e.g. "mouse mode" so the trackpad navigates the UI), drop any
    // held voices and ignore contacts entirely — no notes from finger movement.
    if (opts.enabled && !opts.enabled()) {
      if (voices.length || pending.length) endAll();
      status({ connected: true, label: "Trackpad ✓ (mouse mode)" });
      return;
    }
    const used = new Set<Voice>();
    const usedPending = new Set<Pending>();
    for (const p of msg.points) {
      const x = clamp01(p.x);
      const y = clamp01(p.y);
      const s = p.s; // real contact size (undefined → Y-position dynamics, unchanged)
      // The Apple PTP helper emits GHOST contacts pinned to the EXTREME rim (one coord ~0 or ~1)
      // alongside the real finger — e.g. (1.0, 0.10), (0.03, 1.0), (0.43, 1.0). Those all sit at
      // ~0.0/~1.0 on one axis, so a tight rim filter kills them while letting you play almost all
      // the way to the edges (was 0.045 — that ate a wide, usable border).
      const EDGE = 0.02;
      if (x < EDGE || x > 1 - EDGE || y < EDGE || y > 1 - EDGE) continue;

      // 1) does it continue an already-playing voice? (nearest unused within threshold)
      let best: Voice | null = null;
      let bestD = MATCH_DIST;
      for (const v of voices) {
        if (used.has(v)) continue;
        const d = Math.hypot(v.x - x, v.y - y);
        if (d < bestD) { bestD = d; best = v; }
      }
      if (best) {
        best.x = x; best.y = y; best.seen = now;
        used.add(best);
        sink.move({ id: best.id, x, y, pressure: dynamicsFor(y, s) });
        continue;
      }

      // 2) does it continue a pending (not-yet-promoted) contact? promote on the 2nd frame
      let pend: Pending | null = null;
      let pendD = MATCH_DIST;
      for (const q of pending) {
        if (usedPending.has(q)) continue;
        const d = Math.hypot(q.x - x, q.y - y);
        if (d < pendD) { pendD = d; pend = q; }
      }
      if (pend) {
        pend.x = x; pend.y = y; pend.hits++;
        usedPending.add(pend);
        if (pend.hits >= START_FRAMES) {
          const v: Voice = { id: `tp:${vseq++}`, x, y, seen: now };
          voices.push(v);
          used.add(v);
          pending = pending.filter((q) => q !== pend);
          sink.start({ id: v.id, x, y, pressure: dynamicsFor(y, s) });
        }
        continue;
      }

      // 3) brand-new contact — stage it; it only plays if it's still here next frame
      const np: Pending = { x, y, hits: 1 };
      pending.push(np);
      usedPending.add(np);
    }
    // a pending contact that vanished after one frame was a ghost — forget it
    pending = pending.filter((q) => usedPending.has(q));
    expire(now);
    const n = voices.length;
    status({ connected: true, label: `Trackpad ✓ · ${n} finger${n === 1 ? "" : "s"}` });
  }

  function expire(now: number): void {
    voices = voices.filter((v) => {
      if (now - v.seen < GRACE_MS) return true;
      sink.end(v.id);
      return false;
    });
  }

  // expire even if the helper stops sending entirely (belt + suspenders against stuck notes)
  const sweep = window.setInterval(() => { if (voices.length) expire(performance.now()); }, 60);

  function connect(): void {
    if (stopped) return;
    clearTimer();
    if (ws) { try { ws.onclose = null; ws.close(); } catch { /* ignore */ } ws = null; }
    status({ connected: false, label: "trackpad: connecting…" });
    try { ws = new WebSocket(url); } catch { scheduleRetry(); return; }

    ws.onopen = () => { retry = RETRY_MIN; status({ connected: true, label: "Trackpad ✓ (ready)" }); };
    ws.onmessage = (ev) => {
      let msg: ContactsMsg;
      try { msg = JSON.parse(ev.data as string); } catch { return; }
      if (msg && msg.type === "contacts" && Array.isArray(msg.points)) handle(msg);
    };
    ws.onclose = () => {
      ws = null;
      endAll();
      status({ connected: false, label: "trackpad helper not running — open the app or npm run trackpad" });
      scheduleRetry();
    };
    ws.onerror = () => { /* onclose handles the retry */ };
  }

  connect();

  return {
    reconnect() { retry = RETRY_MIN; connect(); },
    send(obj: unknown) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify(obj)); } catch { /* ignore */ }
      }
    },
    close() {
      stopped = true;
      clearTimer();
      clearInterval(sweep);
      endAll();
      if (ws) { try { ws.onclose = null; ws.close(); } catch { /* ignore */ } ws = null; }
      status({ connected: false, label: "Trackpad" });
    },
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
