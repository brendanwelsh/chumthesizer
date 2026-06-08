# magic-trackpad-ulanzi-synth

> Apple Magic Trackpad 2 (multitouch + pressure) as an expressive synth & groovebox, with an Ulanzi dial for live control. Multitouch surface for playing, 8 synth presets, beat pads + step sequencer with starter grooves, dial = live DJ filter. Your setup is saved between sessions.

## What it is (the dream)
A unique tactile music controller: the Magic Trackpad 2's multitouch + force surface becomes an expressive playing surface (X / Y / pressure → notes, pitch, filter, etc.), and the Ulanzi dial + buttons handle transport, volume, and patch/scene selection. Part instrument, part music player. Likely needs its own standalone software (not just a Ulanzi Deck plugin) because it reads raw trackpad input and emits MIDI/audio.

## Status
**Playable first build.** A web synth you can play right now with mouse / keyboard / touch,
that lights up with real multitouch + pressure when a Magic Trackpad 2 is plugged in, plus the
Ulanzi dial for control. See [BUILD.md](BUILD.md) to run it and [DESIGN.md](DESIGN.md) for the why.

## Run it
```bash
npm install
npm run dev     # open http://127.0.0.1:5173 in Chrome/Edge, click to start, play
npm run app     # or launch the Electron desktop app (best for the trackpad)
```
Full controls, hardware setup, and architecture: [BUILD.md](BUILD.md).

## Play
- **Surface** (mouse / touch / pen / Magic Trackpad): left↔right = pitch (snapped to a scale), press = louder + brighter. Real multitouch + pressure on the trackpad.
- **Keyboard:** `A`–`;` / `Q`–`P` = notes · `1`–`8` = drum pads · `Enter` = play/stop beat · `Space` = panic.
- **Beat:** 8 synth-drum pads + a 16-step sequencer (comes with a groove). Hit play and jam.
- **Ulanzi dial:** rotate = live DJ filter sweep · press = play/stop · its buttons = drum pads.

## How it's built
- **Web app (TypeScript + Web Audio + WebHID) → shipped as an Electron app.** One codebase:
  raw-HID input, an in-app synth, and the mapping all run the same in browser and Electron.
- **Windows first** (welsh-gamingpc); **macOS later is nearly free** — same code, with a
  Mac-only easy path in reserve. Build Windows, don't scope Mac yet, don't architect it out.
- **The one hard problem is pressure.** No Windows driver exposes the trackpad's Force Touch
  pressure — but the force is in the device's raw HID frames; we bypass the drivers and decode
  it ourselves (byte 7 of each finger struct). That raw-pressure read is the core R&D
  challenge — see [DESIGN.md](DESIGN.md). First spike:
  [`spikes/trackpad_pressure_spike.py`](spikes/trackpad_pressure_spike.py).
- Repo: `magic-trackpad-ulanzi-synth` (private)
