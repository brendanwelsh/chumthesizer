# Trackpad Synth Bridge — UlanziDeck plugin

> Makes the **Ulanzi D100H** dial + **all 7 keys** play the Magic Trackpad + Ulanzi Synth, with no
> system volume/media side effects. The synth can't read the device cleanly itself (see why below),
> so this plugin consumes it inside Ulanzi Studio and forwards events to the synth over a localhost
> WebSocket.

## Why a plugin (and not raw HID)
The D100H is **Bluetooth-only**, can't store a custom layout, and standalone it only emits fixed
system codes. Worse, its **4 side keys ride the Keyboard HID collection that Windows blocks apps from
reading** — so raw HID gets you the dial + 3 media keys *at most*, and hijacks real system
volume/media while doing it. Reverse-engineering (`../../ulanzi-d100h-homebrew/`) confirmed there is
**no way to reprogram the device**: Ulanzi Studio remaps live in software, nothing persists to the
hardware. The only clean path to all 7 keys is to consume the device *while Studio runs* — this
plugin. Full rationale: [`../DESIGN.md`](../DESIGN.md).

## What it does
- **Filter & Transport** (Encoder → the dial): rotate = live DJ filter sweep, press = play/stop.
- **Drum Pad** (Keypad → the keys): each press hits a drum pad. Drop it on **all 7 keys**.

Events are broadcast as JSON over `ws://127.0.0.1:48907`:
```
{ "type": "rotate", "dir": -1 | 1 }                  dial rotate
{ "type": "press" }                                  dial push
{ "type": "button", "index": <0-based pad>, "pressed": true }   key → pad hit
```
The synth client (`../src/input/dial-bridge.ts`) connects to that socket and drives the existing
`DialHandlers`, so nothing in the synth's engine/mapping had to change.

## Pad mapping
The Drum Pad action defaults to **Auto**: pads are handed out in first-seen order, so dropping it on
all 7 keys gives 7 distinct pads with zero setup. Pin a specific pad per key in its Property Inspector
if you want a fixed layout.

## Install
```powershell
npm run setup:plugin     # installs the plugin's only dep (ws); needed once after clone
npm run install:plugin   # copies it into %APPDATA%\Ulanzi\UlanziDeck\Plugins\
# then fully quit + reopen Ulanzi Studio
```
In Studio: add **Filter & Transport** to the dial and **Drum Pad** to all 7 keys. Launch the synth
(`npm run dev` / `npm run app`) — the Dial chip lights up automatically once both are running.
Share with others: `npm run pack:plugin` zips it (with `ws`) into `dist-plugin/`.

## Test it without the hardware
```powershell
npm run test:bridge      # fake Studio → real plugin → synth client; asserts the protocol
```

## Layout
```
com.ulanzi.trackpadsynth.ulanziPlugin/
├── manifest.json              # Encoder (dial) + Keypad (keys) actions
├── plugin/app.js              # Node main service: Studio client + localhost WS server
├── property-inspector/pad/    # Drum Pad config UI (Auto / Pad 1..8)
├── ulanzi-api/                # vendored common-node SDK
├── libs/                      # vendored common-html SDK (Property Inspector)
├── resources/                 # icons
└── node_modules/ws/           # gitignored — run `npm run setup:plugin` to materialize
```
