# Design — magic-trackpad-ulanzi-synth (R&D)

## The dream
A one-of-a-kind tactile instrument: Magic Trackpad 2 as an expressive multitouch +
pressure surface, Ulanzi dial + buttons as the control surface. Play it, shape the
sound, use it as a music player. Unique and fun first; practical second.

---

## ⚑ Platform decision — WINDOWS first, cross-platform by design

**Decided by the owner: Windows is the target** (welsh-gamingpc) — that's where it'll
actually get used. macOS is **not scoped now**, but the architecture below keeps it
*nearly free* later, so we don't paint ourselves into a corner.

The one hard problem is **pressure**, and it's the whole R&D challenge:

- **No Windows driver gives you Force Touch pressure.** imbushuo `mac-precision-touchpad`,
  Magic Utilities, Boot Camp all present the trackpad as a normal Precision Touchpad:
  multi-finger X/Y yes, continuous force **no** (just a click button).
- **But the force is on the wire.** The trackpad's *raw* multitouch frames carry per-finger
  pressure; the drivers discard it. Linux's `hid-magicmouse` decodes it as **byte 7 of each
  finger's 9-byte struct**. So we bypass the drivers, read the raw HID reports, and decode
  pressure ourselves. ← feasible; recipe in §1, spike written.

**Tradeoff accepted:** while our app owns the trackpad in raw mode it isn't a normal mouse.
Fine — it's a dedicated instrument surface.

## Architecture — web app → Electron (this is the shape of the whole thing)

**Build it as a web app, ship it as Electron.** This satisfies "web-based with an eventual
Electron app" *and* "Windows + Mac, Windows first" with a single codebase.

```
            ┌─────────────────────────── shared TypeScript ───────────────────────────┐
  trackpad ─┤  raw HID read → decode finger structs (x,y,PRESSURE)                      │
   (USB)    │            │                                                              │
  Ulanzi  ──┤  raw HID read → dial rotate / press                                       │
   dial     │            ▼                                                              │
            │   mapping layer  ──►  MPE/voice model  ──►  Web Audio synth  ──► speakers │
            │   (X→pitch, pressure→velocity/aftertouch, Y→timbre, dial→cutoff/vol)      │
            │                                   └─ (optional) WebMIDI ──► external synth │
            └──────────────────────────────────────────────────────────────────────────┘
```

- **Input:** **WebHID** (`navigator.hid`) in the browser opens the device, sends the enable
  feature report, and reads raw frames — the *same* enable+decode as the spike, just in JS.
  Works for the dial for sure; works for the trackpad *if* the browser can claim the
  interface.
- **The Electron reason:** on Windows the OS driver may hold the trackpad exclusively, and a
  browser has no escape hatch. **Electron's main process runs Node**, so it reads raw HID via
  **`node-hid`** (more capable than WebHID, not subject to the browser's protected-usage
  blocklist) and can fall back to a **libusb (`usb` npm) + Zadig/WinUSB** raw read if the
  device is truly locked. The renderer stays a normal web app; the main process just
  liberates the trackpad data and forwards frames in. **So: prototype in-browser, but
  Electron is what guarantees raw access.**
- **Sound:** **Web Audio API** — build the synth in-page (oscillators, filters, ADSR,
  effects, polyphony). No external softsynth or loopMIDI needed for a self-contained app.
  WebMIDI stays available as an *option* to also drive Surge XT / a DAW.
- **Cross-platform for free:** Web Audio + node-hid both run identically on Windows and
  macOS. UI, synth, MPE mapping, and the finger-struct decode are 100% shared. Build
  Windows-first; macOS later is mostly "it already works" (with OpenMultitouchSupport as a
  Mac-only easy path if ever needed). **Don't scope macOS now — just don't architect it out,
  which this doesn't.**

**Yes, this can be genuinely cool software, and the dial is the *easy* part** — it's a plain
HID device with an already-reverse-engineered protocol; dial → live synth-param modulation is
standard and feels great. The risk is concentrated entirely in §1 (raw trackpad pressure);
everything else is well-trodden.

## What got built (v0.1) — a Pocket-Operator-style groovebox

It grew past "synth surface" into a little jam machine:
- **Melodic surface** — multitouch/pressure (or mouse/keyboard/pen) → polyphonic Web Audio
  voices; X = pitch (scale-quantized), pressure = loudness + brightness, notes pan by position.
- **Drum machine + 16-step sequencer** — 8 synthesized drum voices and a swung lookahead clock
  that boots with a groove; finger-drum the pads, punch-in record, edit the grid.
- **The Ulanzi dial plays the sound, not just settings** — rotate = a live DJ filter sweep
  across the whole mix (lowpass↔highpass), press = play/stop, its buttons = drum pads.

Run/controls in `BUILD.md`. The rest of this doc is the feasibility reasoning behind it.

---

## 1. Pressure on Windows — the recipe (the hard part, solved)

The trackpad already sends everything we need; we ask for it and decode it.

**Device:** Magic Trackpad 2, Apple VID `0x05AC`. Lightning model PID `0x0265`; the 2024
**USB-C** model has a different PID — confirm yours by enumeration. **Use a wired USB cable**
— Bluetooth raw access is unreliable.

**Step 1 — enter raw multitouch mode** via a HID *feature* report:
- USB: report ID `0x02`, payload `0x01` → bytes `{0x02, 0x01}`
- (BT, if ever needed: `{0xF1, 0x02, 0x01}`)

**Step 2 — read raw input reports.** USB touch frames arrive under report ID `0x02`; per-finger
9-byte structs **start at offset 12** (`finger_i = data[12 + i*9 ...]`).

**Step 3 — decode each 9-byte finger struct** (`t` = the 9 bytes), per Linux
`drivers/hid/hid-magicmouse.c`:
```
id          = t[8] & 0x0F
x           = (int32(t[1]<<27 | t[0]<<19)) >> 19          # arithmetic shift, signed
y           = -((int32(t[3]<<30 | t[2]<<22 | t[1]<<14)) >> 19)
touch_major = t[4]
touch_minor = t[5]
size        = t[6]
pressure    = t[7]      # <-- the force value. THIS is what we came for.
orientation = (t[8] >> 5) - 4
down        = (t[3] & 0xC0) == 0x80
```
This decode is **identical** in Python (spike), `node-hid` (Electron main), and WebHID
(browser) — it's just byte math. That's the reusable core asset.

**Grabbing raw reports — easy path first, bulletproof fallback:**
- **A. HID read, no driver swap (WebHID / node-hid / hidapi).** Open the vendor multitouch
  collection, `sendFeatureReport([0x02,0x01])`, read & decode. Works *if* nothing holds the
  interface exclusively. **The spike tries this.**
- **B. WinUSB via Zadig (Electron/native only).** If A can't see raw frames, use
  [Zadig](https://zadig.akeo.ie) to bind **WinUSB** to the trackpad interface and read raw
  transfers via libusb (`usb` npm in Electron, or `pyusb`), same decode. Takes the device
  over completely; removes all doubt. *Not reachable from a plain browser* — another reason
  Electron is the real target.

**Spike (written — run it):** [`spikes/trackpad_pressure_spike.py`](spikes/trackpad_pressure_spike.py)
finds the trackpad, enables multitouch mode, decodes and prints per-finger `x / y / size /
PRESSURE`. `pip install -r spikes/requirements.txt`, plug the trackpad in by USB, run it.
**If PRESSURE climbs as you press, the project is unblocked.** Untested on hardware here — run
it and report. (Python is just the fastest possible proof; the calls map 1:1 to node-hid /
WebHID.)

*Reference:* Linux
[`hid-magicmouse.c`](https://github.com/torvalds/linux/blob/master/drivers/hid/hid-magicmouse.c)
— authoritative MT2 frame format.

### Multitouch on Windows without sacrificing the cursor — the driver path (researched 2026-06-08)

Reading the **raw** trackpad over HID is OS-blocked on Windows (proven here: WebHID *and* node-hid both
get **zero frames** and can't even send the multitouch-enable feature report — the Precision-Touchpad
driver holds the device exclusively). So raw **pressure** needs WinUSB/Zadig, which claims the interface
and would cost the cursor (and a spare mouse). But for **multi-finger position** — the bigger half of
"expressive surface" — there's a clean, already-solved, cursor-preserving path that needs no Zadig:

1. **Install a Precision-Touchpad driver for the MT2.** The community drivers read the device's raw
   multitouch and present it to Windows as a real precision touchpad (multi-finger + gestures), keeping
   the cursor working. Use the **Microsoft-signed** build:
   [vitoplantamura/MagicTrackpad2ForWindows](https://github.com/vitoplantamura/MagicTrackpad2ForWindows)
   (`v2.0`, `MT2FW11-20260223-MSSigned.zip`) — a signed build of
   [imbushuo/mac-precision-touchpad](https://github.com/imbushuo/mac-precision-touchpad). **Install:**
   unzip, open the AMD64 folder, right-click the `.inf` → **Install**. **First uninstall** any
   conflicting trackpad software (Magic Utilities, Trackpad++, old Apple/imbushuo). **Revert** any time
   via Device Manager → the trackpad → *Uninstall device / roll back driver* (or DriverStore Explorer).
   Note: our unit is the **Lightning USB** MT2 (`05ac:0265`) — confirm the driver binds it (Device
   Manager shows "Apple … Precision Touchpad"); the base imbushuo build supports `0265`.
2. **Read the finger contacts via the Windows Raw Input API.** A precision touchpad streams per-contact
   X / Y / contact-id / tip-switch as HID reports an app can read with `RegisterRawInputDevices` +
   `WM_INPUT` (reference: [emoacht/RawInput.Touchpad](https://github.com/emoacht/RawInput.Touchpad)). In
   our app this lives in Electron's **main process** (a small N-API/native reader) and forwards contacts
   to the renderer — the same shape as the dial bridge.

**What this gives us — and what it doesn't:**
- ✅ Multiple fingers with position — the expressive multitouch surface, **cursor intact, no Zadig, no
  second mouse.**
- ❌ **No Force-Touch pressure.** PTP reports carry no per-contact pressure; the Apple drivers read the
  pressure byte internally and *throw it away*. Real pressure still requires claiming the raw device
  (WinUSB → loses the cursor) — deferred, and effectively a macOS-only luxury for now.
- **Pressure substitute on Windows:** map each finger's **Y position or contact size → loudness/
  brightness** (the on-screen pad already maps Y→dynamics for the mouse), so the surface still feels
  expressive per finger.

**Status:** the driver is a one-time user install (one admin click). The Raw Input reader (step 2) is the
build task on our side. `src/input/trackpad.ts` (raw-HID/WebHID decode) stays for macOS/Linux and the
eventual WinUSB pressure path; it can't work on Windows for the reason above.

*Sources:* [imbushuo/mac-precision-touchpad](https://github.com/imbushuo/mac-precision-touchpad) ·
[vitoplantamura/MagicTrackpad2ForWindows](https://github.com/vitoplantamura/MagicTrackpad2ForWindows) ·
[emoacht/RawInput.Touchpad](https://github.com/emoacht/RawInput.Touchpad) ·
[Apple multi-touch HID protocol](https://developer.apple.com/forums/thread/69863).

## 2. The Ulanzi dial — RESOLVED: the real unit is a D100H, and the plugin bridge is the path

> ⚠️ The original guess below (Stream Controller **D200**, `2207:0019`, direct USB HID) was **wrong
> for our hardware**. The actual device is a **Ulanzi D100H**, which behaves completely differently.
> The full reverse-engineering lives in the sibling repo `../ulanzi-d100h-homebrew/`. What follows is
> the decision and the evidence; `src/input/dial.ts` is kept but is **D200-only**, and the live path
> is the **UlanziDeck plugin bridge** in `ulanzi-plugin/` + `src/input/dial-bridge.ts`.

### What the D100H actually is
- Enumerates as **`KEHWIN / Dial_Lite`, VID `0xfff1` / PID `0x0082`** (the BLE-chipset identity) —
  *not* Ulanzi's `0x2207`. So the old `requestDevice` filter never surfaces it.
- **Bluetooth-only** (USB-C is charge-only). It's a BLE HID peripheral; the OS surfaces it through
  the normal HID stack. Verified present here as `BTHLE\…` "Ulanzi Dial".
- **No vendor framing.** It emits standard **Consumer Control** reports `[0x02, lo, hi]`: dial =
  Vol Up/Down/Mute, top 3 keys = Prev/Play/Next — all readable. The `0x7c 0x7c` D200 parser never
  fires on it.
- The **4 side keys send Ctrl+C/V/Z/Y on the Keyboard collection, which Windows blocks apps from
  reading.** So raw HID gives **dial + 3 keys only**, *and* it moves real system volume / skips your
  media as a side effect (those are genuine system keys; suppressing them needs an OS-level hook the
  web/Electron sandbox can't install).

### Q1 — can the device be unlocked / reprogrammed to emit our own codes standalone? **No.**
We need all 7 keys, so the first question was whether the 4 side keys can be remapped at the device
level (firmware option, HID feature/output report, or the vendor interfaces `0xfff1` / `0xfffd`).
Evidence, layered strongest-first:

1. **Tested in the homebrew repo:** remap the dial in Ulanzi Studio (e.g. to `F13`–`F17`), fully quit
   Studio, turn the dial → it goes **straight back to volume**. Custom layouts **do not persist to the
   device**; there is no "Save to device" and no user-writable offline profile (only a factory
   `dial.bin`). Studio works purely in **online mode** — it receives the BLE-HID input and dispatches
   the action *in software*. So there is no persistent binding to replay.
2. **First-hand HID probe (this machine, live device, `node-hid`):** enumerated all **5** collections
   (Keyboard, Consumer, Mouse, vendor `0xfff1`, vendor `0xfffd`) and read **no feature reports** off
   any of them (`getFeatureReport(0..8)` came back empty everywhere, including both vendor interfaces).
   The vendor interfaces only ever emitted the periodic heartbeat the homebrew repo documented — no
   per-key channel, no writable surface.
3. **A true wire-level sniff of "what Studio sends when you bind" isn't even applicable** (there's no
   device write to capture — see #1) **and isn't feasible here anyway**: the link is BLE, so USBPcap
   can't see it; capturing it would need BLE-sniffer hardware (e.g. an nRF52840). Not worth it given #1
   already disproves the premise.

**Conclusion:** the D100H can't be turned into a standalone custom controller. The realistic
equivalent of "overwrite its map the way the Ulanzi app does" is to **consume the device while a host
of ours runs** — exactly what Studio does. Of the candidate hosting paths:

- **(a) UlanziDeck plugin bridge — CHOSEN.** A Node plugin binds an **Encoder** action to the dial and
  a **Keypad** action to **all 7 keys**, and forwards `onDialRotate` / `onDialDown` / `onRun` to the
  synth over a localhost WebSocket. Gives **all 7 keys + a clean dial with zero system side effects**.
  Requires Ulanzi Studio running. This is the homebrew-verified clean path and is what we built.
- (b) Studio "Hotkey" remap of the 4 side keys to obscure chords + a local key listener — messier,
  brittle, still needs Studio. Rejected.
- (c) Raw HID only (dial + 3 keys, with volume/media side effects) — a no-Studio fallback that
  **cannot meet the 7-key requirement**, so it's documented, not built. (`src/input/dial.ts` is the
  D200 raw-HID code; it doesn't work on the D100H at all.)

### What we built (path a)
```
Ulanzi D100H ──BLE──► Ulanzi Studio ──► UlanziDeck plugin (ulanzi-plugin/, Node + ws)
                                              │  WebSocketServer on ws://127.0.0.1:48907
                                              ▼
                          src/input/dial-bridge.ts (WebSocket client)
                                              │  drives the existing DialHandlers
                                              ▼
                          engine.setPerformanceFilter / seq.toggle / beat.hit   (unchanged)
```
- **`ulanzi-plugin/com.ulanzi.trackpadsynth.ulanziPlugin/`** — the plugin. `plugin/app.js` connects to
  Studio and runs a localhost WS server; `manifest.json` declares the Encoder + Keypad actions; the
  SDK (`ulanzi-api/`, `libs/`) and `ws` are vendored so it runs under Studio's bundled Node 20. Built
  from the same template as the author's working `ulanzi-camera-switcher` plugin.
- **`src/input/dial-bridge.ts`** — connects to the socket, auto-reconnects, and maps
  `{rotate|press|button}` → `onRotate / onPress / onButton`. `main.ts` now wires the bridge instead of
  the D200 WebHID code; the dial mapping object is untouched.
- **Pad mapping:** the Drum Pad action defaults to **Auto** (pads handed out in first-seen order → 7
  distinct pads with no config); a Property Inspector can pin Pad 1–8 per key.
- **Verified end-to-end without the hardware:** `npm run test:bridge` stands up a fake Studio, launches
  the real `plugin/app.js`, feeds it real-shaped `dialrotate` / `dialdown` / `run` frames, and asserts
  the synth client receives the correct protocol (both rotate dirs, press, stable key→pad indices).
  **Passes.** Plugin-SDK gotcha avoided: we key off the action **`uuid`** (and `onRun`), never the
  per-instance `actionid`.

### Requires-Studio caveat
Because nothing persists to the device, the dial + 7 keys only work **while Ulanzi Studio is running**
with the plugin installed (`npm run install:plugin`, then restart Studio, then bind the actions). With
Studio closed the device reverts to a plain volume/media remote. That's an inherent D100H limitation,
not a project one. (The Magic Trackpad path is independent of this and unaffected.)

---

### Historical note — the original D200 plan (kept for reference / if a D200 ever shows up)

> First: **identify the exact device + USB VID/PID** (Device Manager → Details → Hardware IDs,
> or enumerate via HID). "Ulanzi dial" most likely = the **Stream Controller D200/D200X**
> (`2207:0019`). Confirm before committing.

Both paths work; **prefer A**, and it uses the *same* HID layer as the trackpad.

- **A. Read the device directly over USB HID (recommended).** No Ulanzi software. Proven by the
  [Companion D200 surface](https://jcalado.com/posts/ulanzi-d200-companion/)
  ([`companion-surface-d200`](https://github.com/jcalado/companion-surface-d200)): device
  `2207:0019`, 1024-byte HID packets framed `0x7c 0x7c [cmd:u16][length:u32][data…]`. Read via
  WebHID / node-hid. (Quirk: composite device may need a USB 2.0 hub to bind.)
- **B. UlanziDeck forwarder plugin (fallback).** The official
  [`UlanziDeckPlugin-SDK`](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK) is a
  WebSocket SDK (Node.js v20 / HTML). A ~50-line plugin subscribes to `onDialRotate` /
  `onDialRotateLeft|Right` / `onDialDown` / `onDialUp` and forwards over a local socket to our
  app. Zero reverse engineering, but needs UlanziStudio running. *(This is essentially path (a)
  above — which, for the D100H, turned out to be the only viable route, not a fallback.)*

## 3. Sound — Web Audio in-app (primary), MIDI optional

**Generate the sound in the app with the Web Audio API.** A polyphonic synth — oscillators →
filter → ADSR → effects → output — is a few hundred lines and runs the same on Windows and Mac,
in-browser and in Electron. No external softsynth, no loopMIDI for the self-contained build.

- **Model it as MPE-style voices:** each finger = an independent voice with its own pitch
  (continuous X), **loudness/timbre from our decoded pressure** (the payoff), and a Y→filter
  mod. Web Audio handles polyphony natively.
- **Make it musical:** quantize X→pitch to a scale (not theremin-mush); pressure→amp+filter so
  pressing *swells* the note.
- **Optional external route:** **WebMIDI** can send the same MPE to **Surge XT** / **Vital** /
  a DAW if you want their engines — but it's optional, not required.

**Embedded vs MIDI is now a non-question:** Web Audio *is* the embedded synth, and it's free.

---

## Minimum fun prototype (the target)

**A web app (run in browser, then Electron) that turns the trackpad into a playable, pressure-
sensitive MPE synth, with the dial shaping the sound.**

1. Raw-HID read trackpad contacts → decode `x, y, pressure` per finger (§1).
2. Map each contact → a **Web Audio voice**:
   - **X → pitch**, scale-quantized (musical).
   - **pressure → amplitude + filter** (pressing swells/opens the note). ← the payoff
   - **Y → filter cutoff / mod** (CC74-style).
3. **Web Audio** plays it — sound straight out of the app.
4. **Dial → master cutoff or volume**; **dial press → cycle scale/octave**.

Lay fingers down, press and slide to play expressive chords; twist the dial to shape it.
"Player" mode (browse/scrub/transport) comes after it feels good.

## Roadmap (small spikes, bias to cheap)

| # | Spike | ~Effort | Done when |
|---|-------|---------|-----------|
| 0 | **PRESSURE PROOF (the gate).** Run `spikes/trackpad_pressure_spike.py`, trackpad wired. If HID can't see raw frames, do the Zadig/WinUSB fallback. | ½–1 day | `PRESSURE` climbs as you press |
| 0.5 | **Can the *browser* claim it?** Tiny WebHID page: open device, send `{0x02,0x01}`, log frames. Tells us web-only vs needs-Electron for the trackpad. | ½ day | Browser logs frames (or proves we need Electron) |
| 1 | **Dial events** via WebHID/node-hid (path A); fallback forwarder (B). Log rotate + press. | ½ day | Dial turns log live |
| 2 | **Make noise**: minimal Web Audio synth — one voice from a keypress/dial. | ½ day | A note sounds in the app |
| 3 | **First playable**: contacts → Web Audio voices, scale-quantized; pressure→amp/filter. | 1–2 days | Trackpad plays expressive chords |
| 4 | **Control surface**: dial → cutoff/volume; button → scale/octave/patch. | ½ day | Dial audibly shapes the sound |
| 5 | **Wrap in Electron** with node-hid in main (guarantees raw access; same UI). | 1 day | Standalone Windows app, no browser |
| 6+ | Polish synth/mapping, player mode, then **flip on macOS** (mostly free). | — | It's fun on both |

## Stack (chosen)
- **Language: TypeScript.** One codebase for browser + Electron + (later) macOS.
- **Input:** **WebHID** in-browser; **`node-hid`** in Electron's main process for robust raw
  access; **libusb (`usb` npm) + Zadig/WinUSB** as the last-resort fallback. Same enable+decode
  everywhere.
- **Sound:** **Web Audio API** (in-app synth). **WebMIDI** optional → Surge XT / Vital / DAW.
- **Shell:** browser for spikes/prototype → **Electron** for the shippable Windows app, then
  macOS.
- **Fastest proof only:** the Python `hidapi` spike (no toolchain) just to gate §1; the real
  build is TS/web/Electron.

## Open questions / to confirm
- **Spike-0 gate:** can we read raw multitouch at all (path A), or need Zadig/WinUSB (B)?
  Trackpad model/PID (Lightning `0x0265` vs USB-C)?
- **Spike-0.5:** can the *browser's* WebHID claim the trackpad, or is Electron required for it?
- Exact Ulanzi model + VID/PID; direct-HID (A) vs forwarder (B).
- Mapping taste: scale, X→pitch continuous-glide vs stepped, how many voices before mush.

## References
- Linux `hid-magicmouse.c` (raw MT2 frames + pressure decode + enable bytes) — https://github.com/torvalds/linux/blob/master/drivers/hid/hid-magicmouse.c
- Apple multi-touch HID protocol notes — https://developer.apple.com/forums/thread/69863
- WebHID API (raw HID in the browser) — https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API
- node-hid (raw HID in Node/Electron) — https://github.com/node-hid/node-hid
- `usb` npm (libusb, for the WinUSB fallback) — https://github.com/node-usb/node-usb
- Web Audio API (in-app synth) — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- imbushuo mac-precision-touchpad (PTP driver — discards pressure) — https://github.com/imbushuo/mac-precision-touchpad
- Zadig (WinUSB binding, fallback) — https://zadig.akeo.ie
- UlanziDeckPlugin-SDK (dial forwarder path B) — https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK
- Companion D200 surface (direct-HID dial, protocol) — https://jcalado.com/posts/ulanzi-d200-companion/ · https://github.com/jcalado/companion-surface-d200
- Surge XT (optional external MPE synth) — https://surge-synthesizer.github.io/
- OpenMultitouchSupport (Mac-only easy path, kept in reserve) — https://github.com/Kyome22/OpenMultitouchSupport
