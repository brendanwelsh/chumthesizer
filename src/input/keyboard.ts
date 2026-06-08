import type { Engine } from "../audio/engine";
import { params } from "../state";

// Two rows of keys → contiguous scale degrees. With a pentatonic default you
// basically can't play a wrong note.
const KEYS: Record<string, number> = {
  KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyG: 4, KeyH: 5, KeyJ: 6, KeyK: 7, KeyL: 8, Semicolon: 9,
  KeyQ: 10, KeyW: 11, KeyE: 12, KeyR: 13, KeyT: 14, KeyY: 15, KeyU: 16, KeyI: 17, KeyO: 18, KeyP: 19,
};
const MAX_DEGREE = 19;

export interface KeyboardOpts {
  engine: Engine;
  visualOn: (id: string, x: number, pressure: number) => void;
  visualOff: (id: string) => void;
  refresh: () => void;
  /** number row 1–8 → drum pads */
  onPad: (i: number) => void;
  /** Enter → play/stop the beat */
  onTransport: () => void;
  /** -/= → previous/next synth preset */
  onPreset: (dir: number) => void;
  /** note events (for optional MIDI out) */
  onNoteOn: (id: string, note: number, pressure: number) => void;
  onNoteOff: (id: string) => void;
  /** Space → all notes off */
  onPanic: () => void;
}

export function initKeyboard(o: KeyboardOpts): void {
  const held = new Set<string>();

  window.addEventListener("keydown", (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey) return;

    const degree = KEYS[e.code];
    if (degree !== undefined) {
      e.preventDefault();
      if (held.has(e.code)) return;
      held.add(e.code);
      const id = `kbd:${e.code}`;
      o.engine.playDegree(id, degree, 0.72);
      o.visualOn(id, degree / MAX_DEGREE, 0.72);
      o.onNoteOn(id, o.engine.noteForDegree(degree), 0.72);
      return;
    }

    if (e.code.startsWith("Digit")) {
      const n = e.code === "Digit0" ? 9 : Number(e.code.slice(5)) - 1;
      if (n >= 0 && n < 8) { e.preventDefault(); o.onPad(n); }
      return;
    }

    switch (e.code) {
      case "Enter": e.preventDefault(); o.onTransport(); break;
      case "BracketLeft": params.octave = Math.max(-3, params.octave - 1); o.refresh(); break;
      case "BracketRight": params.octave = Math.min(3, params.octave + 1); o.refresh(); break;
      case "Comma": params.root = (params.root + 11) % 12; o.refresh(); break;
      case "Period": params.root = (params.root + 1) % 12; o.refresh(); break;
      case "Backquote": params.glide = !params.glide; o.refresh(); break;
      case "Minus": o.onPreset(-1); break;
      case "Equal": o.onPreset(1); break;
      case "Space": e.preventDefault(); o.onPanic(); held.clear(); break;
    }
  });

  window.addEventListener("keyup", (e) => {
    const degree = KEYS[e.code];
    if (degree === undefined) return;
    held.delete(e.code);
    const id = `kbd:${e.code}`;
    o.engine.release(id);
    o.visualOff(id);
    o.onNoteOff(id);
  });
}
