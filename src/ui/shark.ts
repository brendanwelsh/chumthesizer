/** A faint ASCII shark that cruises *inside a play surface* and chases the fingers/cursor over it
 *  (playful fun). Art + swim logic adapted from the user's tilde.town ~chumthewaters page
 *  (public/shark-frames.js → window.SHARK_DATA). One instance per tank, so the hero board AND every
 *  mini board in the grid view can each have their own. Returns a handle for the Jaws easter egg,
 *  relayout, and pause (the grid minis sleep while the grid is closed). 🦈 */

interface SharkData {
  box: { w: number; h: number };
  angles: number[];
  frames: Record<string, string[]>;
}
declare global {
  interface Window {
    SHARK_DATA?: SharkData;
  }
}

export interface SharkHandle {
  /** Make the shark go wild for a bit (used by the Jaws easter egg). */
  frenzy(ms?: number): void;
  /** Recompute the swim bounds (call after the tank changes size — e.g. the grid opening). */
  relayout(): void;
  /** Stop/resume the swim loop (the grid minis pause while the grid is hidden). */
  setPaused(b: boolean): void;
}

export interface SharkOpts {
  shark: HTMLElement;                              // the <pre> that holds the ASCII frame
  tank: HTMLElement;                               // the surface it swims inside
  fingers?: () => { x: number; y: number }[];      // contacts to chase, normalized 0..1 within the tank
  followCursor?: boolean;                          // also chase the mouse when idle (hero board: yes; minis: no)
  paused?: boolean;                                // start asleep (grid minis do, until the grid opens)
}

export function initShark(opts: SharkOpts): SharkHandle {
  const { shark, tank } = opts;
  const fingers = opts.fingers ?? (() => []);
  const followCursor = opts.followCursor ?? false;
  const data = window.SHARK_DATA;
  const noop: SharkHandle = { frenzy() {}, relayout() {}, setPaused() {} };
  if (!data || !shark || !tank) return noop;

  const ANGLES = data.angles;
  const FRAMES = data.frames;
  const STEP = 360 / ANGLES.length;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const dims = () => ({ w: tank.clientWidth || 1, h: tank.clientHeight || 1 });
  let W = dims().w;
  let H = dims().h;
  const pos = { x: W * 0.5, y: H * 0.5 };
  const target = { x: pos.x, y: pos.y };
  let vx = -0.6;
  let vy = 0;
  let heading = 180;
  let swim = 0;
  let tick = 0;
  let dart = 0;
  let frenzyUntil = 0;
  let nibbleIdx = 0;   // which finger the shark is currently visiting
  const mouse = { x: pos.x, y: pos.y, fresh: false, t: 0 };

  const now = (): number => performance.now();
  const frameFor = (h: number): string => {
    const idx = Math.round((((h % 360) + 360) % 360) / STEP) % ANGLES.length;
    const arr = FRAMES[String(ANGLES[idx])];
    return arr[swim % arr.length];
  };
  const place = (): void => {
    shark.style.left = pos.x - shark.offsetWidth / 2 + "px";
    shark.style.top = pos.y - shark.offsetHeight / 2 + "px";
  };

  window.addEventListener("resize", () => { const d = dims(); W = d.w; H = d.h; });

  const relayout = (): void => { const d = dims(); W = d.w; H = d.h; };

  if (reduce) {
    shark.textContent = FRAMES[String(ANGLES[Math.floor(ANGLES.length / 2)])][0];
    place();
    return { frenzy() {}, relayout, setPaused() {} };
  }

  shark.textContent = frameFor(heading);

  const wander = (): void => {
    const m = Math.min(60, W * 0.15);
    target.x = m + Math.random() * Math.max(1, W - 2 * m);
    target.y = m + Math.random() * Math.max(1, H - 2 * m);
  };
  wander();

  // map a window pointer to tank-local coords; ignore it when it's off the surface
  const localPointer = (e: PointerEvent | MouseEvent): { x: number; y: number } | null => {
    const r = tank.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x < 0 || y < 0 || x > r.width || y > r.height) return null;
    return { x, y };
  };

  if (followCursor) {
    document.addEventListener("pointermove", (e) => {
      const p = localPointer(e);
      if (!p) return;
      mouse.x = p.x; mouse.y = p.y; mouse.fresh = true; mouse.t = now();
    }, { passive: true });
    document.addEventListener("click", (e) => {
      const p = localPointer(e);
      if (!p) return;
      target.x = p.x; target.y = p.y; dart = 40;
    });
  }

  const step = (): void => {
    const frenzied = now() < frenzyUntil;
    const fl = fingers();
    const hasFingers = fl.length > 0;                 // chase the FINGERS first (swim between them)
    const following = !hasFingers && mouse.fresh && now() - mouse.t < 2600;
    const chasing = hasFingers || following;

    if (dart > 0) dart--;
    else if (hasFingers) {
      // visit ONE finger at a time: swim all the way to it, nibble, then move to the next
      if (nibbleIdx >= fl.length) nibbleIdx = 0;
      const f = fl[nibbleIdx];
      target.x = f.x * W; target.y = f.y * H;
      if (Math.hypot(target.x - pos.x, target.y - pos.y) < 26) nibbleIdx = (nibbleIdx + 1) % fl.length;
    }
    else if (following) { target.x = mouse.x; target.y = mouse.y; }
    else {
      const tx = target.x - pos.x;
      const ty = target.y - pos.y;
      if (Math.sqrt(tx * tx + ty * ty) < 60) wander();
    }

    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ease = frenzied ? 0.06 : dart > 0 ? 0.05 : hasFingers ? 0.05 : following ? 0.03 : 0.012;
    const standoff = following && dart <= 0 && !frenzied ? 55 : 0; // hover near the cursor (but dive between fingers)
    const pull = Math.max(dist - standoff, 0) * ease;
    const inertia = frenzied ? 0.82 : 0.9;

    vx = vx * inertia + (dx / dist) * pull * (1 - inertia);
    vy = vy * inertia + (dy / dist) * pull * (1 - inertia);

    const cap = frenzied ? 7 : dart > 0 ? 3.2 : chasing ? 2.6 : 1.4;
    let sp = Math.sqrt(vx * vx + vy * vy);
    if (sp > cap) { vx = (vx / sp) * cap; vy = (vy / sp) * cap; sp = cap; }

    pos.x += vx;
    pos.y += vy;
    // keep the shark inside the board
    if (pos.x < 0) { pos.x = 0; vx = Math.abs(vx); }
    else if (pos.x > W) { pos.x = W; vx = -Math.abs(vx); }
    if (pos.y < 0) { pos.y = 0; vy = Math.abs(vy); }
    else if (pos.y > H) { pos.y = H; vy = -Math.abs(vy); }

    if (sp > 0.08) {
      heading = (Math.atan2(vy, -vx) * 180) / Math.PI;
      if (heading < 0) heading += 360;
    }

    tick++;
    if (tick % (frenzied ? 2 : 4) === 0) swim++;
    shark.textContent = frameFor(heading);
    place();
  };

  // the swim loop — pausable so the 14 grid minis can sleep while the grid is closed
  let paused = opts.paused ?? false;
  const loop = (): void => {
    if (paused) return;
    step();
    requestAnimationFrame(loop);
  };

  place();
  if (!paused) requestAnimationFrame(loop);

  return {
    frenzy(ms = 9000): void {
      frenzyUntil = now() + ms;
      tank.classList.add("frenzy");
      window.setTimeout(() => tank.classList.remove("frenzy"), ms);
    },
    relayout,
    setPaused(b: boolean): void {
      if (b === paused) return;
      paused = b;
      if (!b) requestAnimationFrame(loop);   // wake up
    },
  };
}
