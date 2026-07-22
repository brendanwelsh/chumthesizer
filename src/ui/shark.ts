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
  const pos = { x: W * 0.5, y: H * 0.5 };   // the NOSE (place() hangs the body behind it)
  const target = { x: pos.x, y: pos.y };
  let vx = -0.6;           // springy velocity — THIS is the original flowy swim
  let vy = 0;
  let heading = 0;         // DISPLAYED heading (frame convention: 0 = swimming −x, 90 = +y);
                           // eased toward the swim direction so the sprite can't snap-spin
  let bw = 0, bh = 0;      // smoothed sprite box — each rotation frame is a different-sized ASCII
                           // block, and raw per-frame reads made the nose offset (and the shark) jump
  let swim = 0;
  let tick = 0;
  let dart = 0;
  let bite = 0;            // frames of chomping left after the nose reaches the target
  let mouseCooldown = 0;   // post-bite: ignore the cursor briefly (swim off, circle back — sharks strafe)
  let frenzyUntil = 0;
  let nibbleIdx = 0;       // which finger the shark is currently visiting
  const mouse = { x: pos.x, y: pos.y, fresh: false, t: 0 };

  const now = (): number => performance.now();
  const frameFor = (h: number): string => {
    const idx = Math.round((((h % 360) + 360) % 360) / STEP) % ANGLES.length;
    const arr = FRAMES[String(ANGLES[idx])];
    return arr[swim % arr.length];
  };
  const place = (): void => {
    // the chase point is the NOSE, not the middle of the body: slide the sprite back along its
    // heading so the mouth is what actually arrives at (and bites) the target. The offset uses
    // SMOOTHED box dims — raw ones change with every rotation frame and made the sprite jitter.
    const w = shark.offsetWidth, h = shark.offsetHeight;
    bw += (w - bw) * (bw ? 0.12 : 1);
    bh += (h - bh) * (bh ? 0.12 : 1);
    const hr = (heading * Math.PI) / 180;
    const ux = -Math.cos(hr), uy = Math.sin(hr);                    // unit vector it's swimming toward
    const nose = (Math.abs(ux) * bw + Math.abs(uy) * bh) * 0.42;    // ~half body-length along that direction
    shark.style.left = pos.x - w / 2 - ux * nose + "px";
    shark.style.top = pos.y - h / 2 - uy * nose + "px";
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
    if (mouseCooldown > 0) mouseCooldown--;
    const following = !hasFingers && mouse.fresh && now() - mouse.t < 2600 && mouseCooldown === 0;
    const chasing = hasFingers || following;

    if (dart > 0) dart--;
    if (hasFingers) {
      // visit ONE finger at a time: swim all the way to it, bite, then move to the next
      if (nibbleIdx >= fl.length) nibbleIdx = 0;
      const f = fl[nibbleIdx];
      target.x = f.x * W; target.y = f.y * H;
    } else if (following) { target.x = mouse.x; target.y = mouse.y; }
    else {
      const tx = target.x - pos.x;
      const ty = target.y - pos.y;
      if (Math.sqrt(tx * tx + ty * ty) < 60) wander();
    }

    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dist = Math.hypot(dx, dy) || 1;

    // CONTACT = BITE. pos is the nose, so this fires when the mouth actually reaches the prey:
    // chomp for a few frames, then carry through — next finger, or (for the cursor) swim off
    // and circle back instead of thrashing in place on the pointer.
    if (chasing && bite === 0 && dist < 28) {
      bite = 14;
      if (hasFingers) nibbleIdx = (nibbleIdx + 1) % fl.length;
      else { mouseCooldown = 120; wander(); }
    }
    if (bite > 0) bite--;

    // MOTION — the original springy swim: velocity eases toward the prey with inertia, so the
    // path stays flowy and it naturally glides into the target (pull shrinks with distance).
    const ease = frenzied ? 0.06 : dart > 0 ? 0.05 : hasFingers ? 0.05 : following ? 0.035 : 0.012;
    const pull = dist * ease;
    const inertia = frenzied ? 0.82 : 0.9;
    vx = vx * inertia + (dx / dist) * pull * (1 - inertia);
    vy = vy * inertia + (dy / dist) * pull * (1 - inertia);
    const cap = frenzied ? 7 : dart > 0 ? 3.2 : chasing ? 2.6 : 1.4;
    const sp = Math.sqrt(vx * vx + vy * vy);
    if (sp > cap) { vx = (vx / sp) * cap; vy = (vy / sp) * cap; }

    pos.x += vx;
    pos.y += vy;
    // keep the shark inside the board
    if (pos.x < 0) { pos.x = 0; vx = Math.abs(vx); }
    else if (pos.x > W) { pos.x = W; vx = -Math.abs(vx); }
    if (pos.y < 0) { pos.y = 0; vy = Math.abs(vy); }
    else if (pos.y > H) { pos.y = H; vy = -Math.abs(vy); }

    // the DISPLAYED heading chases the swim direction at a bounded rate — the body carves
    // through its rotation frames instead of snapping around (the glitchy spin), while the
    // motion above keeps the original feel. Ignore near-zero drift so it can't wobble.
    if (sp > 0.3) {
      let want = (Math.atan2(vy, -vx) * 180) / Math.PI;
      if (want < 0) want += 360;
      const diff = ((want - heading + 540) % 360) - 180;
      const maxTurn = frenzied ? 7 : 3.4;   // deg per frame
      heading = (heading + Math.max(-maxTurn, Math.min(maxTurn, diff)) + 360) % 360;
    }

    tick++;
    if (tick % (bite > 0 ? 1 : frenzied ? 2 : 4) === 0) swim++;   // the jaws work fast mid-bite
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
