# Design — ulanzi-synth (R&D)

## The dream
A one-of-a-kind tactile instrument: Magic Trackpad 2 as an expressive multitouch + pressure surface, Ulanzi dial + buttons as the control surface. Play it, shape the sound, and use it as a music player. Unique and fun first; practical second.

## Inputs
- **Magic Trackpad 2**: multiple simultaneous contacts, X/Y position, and force (pressure). Native to macOS; raw multitouch access is the crux of the project.
- **Ulanzi dial + buttons**: rotary (volume / filter / scrub), buttons (transport, patch select, octave).

## Mapping ideas
- Trackpad X → pitch / note, Y → filter or modulation, force → velocity / volume / aftertouch.
- Multi-finger → chords or layered voices.
- Dial → master volume / cutoff / tempo; buttons → play/pause/next (player mode) or octave/patch (instrument mode).
- Two modes: **instrument** (live playing) and **player** (browse / scrub / control playback).

## Platform tradeoff (decide first)
- **macOS (welsh-macmini)**: Magic Trackpad raw multitouch via the private MultitouchSupport framework or an open-source wrapper. Easiest path to force + multi-contact. Emit MIDI (IAC / CoreMIDI) to any synth, or synth in-app.
- **Windows (welsh-gamingpc)**: Magic Trackpad multitouch is painful (limited driver support). Probably not worth it for the trackpad half.
- Likely answer: trackpad/synth half on Mac; the dial is portable to either.

## Architecture options
- Bridge app reads trackpad contacts + dial → emits **MIDI** to a DAW / softsynth (decouples input from sound — cheapest to prototype).
- Or a self-contained app with an embedded synth engine (more work, more cohesive).
- Stack candidates: Swift (Mac-native, best trackpad access), Node/Electron, or Python.

## Open questions for the session
- Which raw-multitouch path on macOS is current / maintained in 2026? License?
- MIDI-out to an existing synth vs build a tiny synth? Start with MIDI-out.
- How does the Ulanzi dial expose input to a non-Ulanzi-Deck app? (Read it as HID, or run a tiny Ulanzi Deck plugin that forwards dial events over a local socket.)
- Minimum fun prototype: trackpad X/Y/force → MIDI notes into a softsynth, dial → volume. How fast can we reach that?

## Roadmap (exploratory)
1. Feasibility spike: read Magic Trackpad contacts + force on macOS, print them.
2. Feasibility spike: get Ulanzi dial events into the same app.
3. Map trackpad → MIDI notes; play through a softsynth.
4. Add dial/buttons control; define instrument vs player modes.
5. Decide whether to embed a synth or stay MIDI-out.

## References
- Apple MultitouchSupport (private) / open-source multitouch wrappers
- CoreMIDI / IAC bus (macOS)
- UlanziDeckPlugin-SDK (for forwarding dial events if needed)
