# ulanzi-synth

> **Stretch goal / R&D.** Apple Magic Trackpad 2 + Ulanzi dial = a tactile music instrument / player. Multitouch surface for expression, dial + buttons for control.

## What it is (the dream)
A unique tactile music controller: the Magic Trackpad 2's multitouch + force surface becomes an expressive playing surface (X / Y / pressure → notes, pitch, filter, etc.), and the Ulanzi dial + buttons handle transport, volume, and patch/scene selection. Part instrument, part music player. Likely needs its own standalone software (not just a Ulanzi Deck plugin) because it reads raw trackpad input and emits MIDI/audio.

## Status
Idea / planning only — see [DESIGN.md](DESIGN.md). This is the fun stretch goal: explore feasibility before committing to a build.

## Where it might live
- Repo: `ulanzi-synth` (private)
- Runs on: TBD — Magic Trackpad raw multitouch is far easier on macOS (welsh-macmini) than Windows; the dial is fine on either. See DESIGN.md tradeoffs.
