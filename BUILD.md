# magic-trackpad-synth — build & play

A tactile web synth. Play it with your **mouse, computer keyboard, or a touchscreen
right now** — and when you plug in an **Apple Magic Trackpad 2** it lights up with real
**multitouch + pressure**, with the **Ulanzi dial** for live control. Web Audio makes the
sound in-app; ships as a web app and as an Electron desktop app. Windows-first, Mac-ready.

## Run it (60 seconds)

```bash
npm install
npm run dev
```
Open the printed URL (**http://127.0.0.1:5173**) in **Chrome or Edge** (needed for WebHID).
Click once to start audio, then play. Drag on the pad; bash on your keyboard.

Desktop app instead of a browser tab:
```bash
npm run app        # builds, then opens the Electron window
```
Electron is the better home for the trackpad — it launches with the Chromium HID blocklist
disabled, so it can claim the trackpad's multitouch collection that a stock browser may refuse.

## Play

It's a groovebox: a melodic surface on top, a drum machine + step sequencer underneath.

- **Surface (mouse / touch / pen):** left↔right = pitch (snapped to the scale), up/down =
  brighter/darker, press = louder. Touchscreen & pen give real multitouch + pressure; mouse
  plays one note at a time. Notes pan left↔right by position.
- **Beat:** 8 synth-drum pads (Kick, Snare, Hat, OpenHat, Clap, Tom, Rim, Cowbell) and a
  16-step sequencer that boots with a groove. **▶ Play** to start, **● Rec** then hit pads to
  punch them in live, click grid cells to edit, tempo slider to taste.
- **Keyboard:** `A S D F G H J K L ;` and `Q W E R T Y U I O P` = two rows of scale notes
  (hold for chords). `1`–`8` = drum pads. `Enter` = play/stop the beat. `[` `]` octave,
  `,` `.` root, `` ` `` glide, **`Space` = panic** (all synth notes off).
- **Controls bar:** scale, root, octave, waveform, volume, brightness, reverb, delay, glide.

## Connect the hardware

**Magic Trackpad 2 (multitouch + pressure):**
1. Plug it in with a **USB cable** (wired — Bluetooth raw access is unreliable).
2. Click the **Trackpad** chip, pick the Apple device in the prompt.
3. Press and slide with multiple fingers. Pressure swells and opens each note.

If the browser refuses to open it, run the **Electron app** (`npm run app`) — it disables the
HID blocklist. If it *still* can't claim the device, the Windows HID stack is holding it; see
`DESIGN.md` §1 for the Zadig/WinUSB fallback. To sanity-check raw pressure independently, run
the Python spike: `pip install -r spikes/requirements.txt && python spikes/trackpad_pressure_spike.py`.

**Ulanzi dial (Stream Controller D200):** click the **Dial** chip and pick it.
- **Rotate** → live DJ filter sweep (left = muffled lowpass, right = thin highpass) over the
  whole mix — great for builds and drops.
- **Press dial** → play/stop the beat. **Dial's buttons** → drum pads.

## How it's built

```
src/
  types.ts           shared Contact / Dial / status types
  state.ts           live synth params (one source of truth)
  audio/
    scales.ts        scales, degree→midi→freq, quantization
    voice.ts         one note: 2 detuned oscs + sub → filter → ADSR → pan (+ vibrato)
    drums.ts         8 synthesized drum voices (kick/snare/hat/clap/tom/rim/cowbell)
    sequencer.ts     16-step drum sequencer with a lookahead clock
    engine.ts        master graph: compressor, reverb, delay, DJ filter, analyser, voices
  input/
    pad.ts           pointer events (mouse/touch/pen) → sink
    keyboard.ts      computer keyboard → scale degrees + drum pads + transport
    trackpad.ts      WebHID Magic Trackpad 2 raw read + pressure decode
    dial.ts          WebHID Ulanzi D200 dial (DJ filter / transport) + buttons (pads)
  ui/
    visualizer.ts    canvas: live waveform + pressure-reactive contact blobs
    controls.ts      the synth control bar
    beat.ts          the groovebox panel: transport, drum pads, step grid
  main.ts            wires inputs → engine → visuals
electron/main.cjs    desktop shell (disables HID blocklist, grants HID permission)
spikes/              Python raw-pressure proof (standalone)
```
Full rationale, the platform decision, and the pressure decode are in **`DESIGN.md`**.

## Scripts
- `npm run dev` — Vite dev server (browser)
- `npm run app` — build + launch Electron
- `npm run build` — production build to `dist/`
- `npm run typecheck` — `tsc --noEmit`

## Known rough edges (first build)
- **Trackpad calibration:** the X/Y orientation and pressure scaling use the Linux-driver
  ranges; once on real hardware they may need a tweak. The constants live at the top of
  `src/input/trackpad.ts` (`X_MIN/X_MAX/Y_MIN/Y_MAX`, `pressure = t7 / 160`, and `TOUCH_OFFSET`).
- **Trackpad report offset:** `TOUCH_OFFSET = 11` (12 in the full report minus WebHID's stripped
  report-id byte). If frames don't decode, that's the first dial to turn.
- **Dial** protocol is implemented from the Companion D200 spec but untested here — if a turn
  does nothing, check the browser console for the raw report and adjust `dial.ts`.
- No packaged installer yet — run from source. Packaging (electron-builder) is a later step.

## Next
Tune mapping feel · presets · a "player" mode (scrub/transport) · optional WebMIDI out to Surge
XT/Vital · node-hid fallback in Electron's main process for bulletproof raw access · macOS pass.
