# CHUM-1

> A tactile, OP-1-inspired groovebox you play with three real devices. A complete redesign
> and rebrand (forked from Chumthesizer) — not just a new look, a new instrument.

The one **Apple Magic Trackpad 2** becomes a **multi-instrument surface** — Synth, Keys, or
Drums, switched live. An **Ulanzi D100H** dial warps the sound + swaps presets on its 7 keys.
An **Elgato Stream Deck Pedal** drives the loop tape hands-free. A **robust looper** records,
overdubs, mutes, stacks, and plays layers at ½×/1×/2× — all on one drift-free clock. A reactive
OP-1-style screen tells you what's going on. And yes, the shark still cruises the trackpad.

## Run
```
npm install
npm run dev     # Vite dev server → http://127.0.0.1:5175 in Chrome/Edge
npm run app     # build the trackpad helper + plugin, build, launch the Electron app (best)
npm run build   # production build → dist/
npm run typecheck
```
Three real devices are optional — it's fully playable right now with **mouse / keyboard**:

## Play (keyboard)
- **A S D F G H J K L ;** + **Q W E R T Y U I O P** — play the active instrument
- **1–6** — record / play / mute that loop slot (the loop tape)
- **R** — arm record into the next empty loop · **Enter** — Play / Stop the groove + loops
- **Tab / Shift-Tab** — next / previous instrument · **Space** — panic (all notes off)
- **[ ]** — octave down / up · type **jaws** for a surprise

## The three devices
- **Trackpad** — the instrument. Pick Synth / Keys / Drums / Sample above it. Each finger plays;
  what you play records into the armed loop. (No system-mouse while you play — the C# helper
  suppresses the cursor while fingers are down; wired USB.)
- **Dial (Ulanzi D100H)** — turn = FX macro (filter scream → clean → bright); press = Play/Stop;
  the 7 keys = the 7 sounds (Pretty/Pluck/Bass/Bells/Keys/Lead/Wild). If the keys land on the
  wrong sound, **Settings → Dial keys → Calibrate** and press them in the on-screen order (~10s).
- **Pedal (Elgato Stream Deck Pedal)** — Left = Record next loop · Middle = Play/Stop · Right = Undo.

## What's new vs. Chumthesizer (v1)
- **Multi-instrument trackpad** (Synth ribbon · Keys board · Drums grid · mic Sample) — all loopable.
- **Robust looper**: record/overdub/play/mute/clear, **stacking**, **per-loop ½×/1×/2× speed**,
  global pause — one shared clock, drift-free (`src/loop/looper.ts`).
- **Functional dial + pedal** (loop-centric), and a **dial key calibration** that fixes mapping.
- **OP-1 / Apple UI**: reactive screen, instrument switch, the loop tape, a Sound/Drums/Mix panel,
  a settings sheet for device connections — minimalist, no emojis, one red (record), no overlap
  at any window size.

## Layout
- `src/instruments/` — `instrument.ts` (contract), `synth.ts` · `keys.ts` · `drumpad.ts` ·
  `sampler-inst.ts`, `rack.ts` (active instrument + replay routing)
- `src/loop/looper.ts` — the robust multitrack looper
- `src/audio/` — reused engine/voice/drums/sequencer/sounds/scales/sampler/midi (the proven guts)
- `src/input/` — `*-bridge.ts` device WebSocket clients, `dial-map.ts` (canonical key map + learn)
- `src/ui/` — `screen` · `instswitch` · `overlay` · `loopdeck` · `transport` · `panel` ·
  `settings` · `dial` · `pedalview` · `visualizer` · `shark`
- `src/main.ts` — wires inputs → rack → looper → engine + the UI

Hardware setup notes (trackpad helper, the dial/pedal plugins) carry over from the fork —
see `DESIGN.md` / `BUILD.md`. Settings persist to `localStorage` (`chum-1.v1`).
