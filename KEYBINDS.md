# chumthesizer — keyboard map

> **Authoritative reference.** This file is the single source of truth for every key binding.
> Whenever a binding changes in `src/main.ts`, update this file in the same change.
> In‑app, press **/** for the live legend (`src/ui/legend.ts`), which mirrors this.

Bindings are ignored while typing in a text field/dropdown.

## Instruments
| Key | Action |
| --- | --- |
| `F1`–`F9` | Jump to instrument 1–9: Synth · Keys · Organ · Pad · Bells · Pluck · FM · Bass · Guitar |
| `Tab` / `Shift`+`Tab` | Cycle all 15 — the rest (**Strings · Brass · Arp · Drums · Tombola · Sample**) are reached this way or by clicking the tab |

## Loops (the tape, 8 tracks)
| Key | Action |
| --- | --- |
| `1`–`8` | Record → play → mute that loop (the tape highlights the **active instrument's** loops; pressing a slot never switches instruments) |
| `Shift`+`1`–`8` | Clear that loop |
| `` ` `` (backtick) | Record into the next empty loop (the transport's **Rec → n** shows where it lands) |
| `Shift`+`` ` `` | **Beat → Loop** — bake the drum step‑grid into the next empty loop slot |
| `Delete` | Clear the last recorded loop |
| `'` (apostrophe) | Clone the focused loop into the next empty slot |

## Transport
| Key | Action |
| --- | --- |
| `Space` / `Enter` | Play / stop the groove + loops |
| `Backspace` | Panic — all notes off |
| `X` | Dice — re‑roll sound + groove |

## Play (notes)
| Key | Action |
| --- | --- |
| `A S D F G H J K L ;` | Play scale degrees 1–10 on the active instrument — **hold several at once for a chord** |
| `Q W E R T Y U I O P` | The **same notes one octave up** (tracker‑style two‑row keyboard) |
| `↑` / `↓` | Keyboard dynamics — louder/brighter / softer/darker (the keys' substitute for the pad's vertical axis; the on‑pad tick shows the level) |
| `[` / `]` | Octave − / + |
| `,` / `.` | Scale − / + |
| `-` / `=` | Key (root) − / + |

> **The keyboard plays each instrument's real surface.** Every key asks the active instrument where
> that note lives: on **Keys/Organ/Pluck** it lands on an exact key column, on **Bass/Guitar** it picks
> the string *and* fret, on **Drums** `A S D F…` are the pads (finger drumming), on a sliced **Sample**
> the keys are the slices, and on **Tombola** each key drops a ball at its own spot.

> **Vertical = dynamics.** On the pad, a mouse/touch has no Force‑Touch pressure, so **vertical position is the dynamics axis**: drag toward the top for loud/bright, the bottom for soft/dark (shown as a faint guide for melodic instruments).

## Chords & sustain (no trackpad needed)
A mouse is one pointer, but you can still play more than one note:
| Control | Action |
| --- | --- |
| hold `A … ;` / `Q … P` | Hold several note keys at once — the keyboard is **polyphonic** (real chords) |
| **CHORD** button | Chord mode — **one note / click plays a full scale triad** (also the panel's "Chord" checkbox) |
| **LATCH** button | Notes **sustain** so a single mouse can stack a chord one note at a time; toggle LATCH off (or `Backspace`) to release |
| **GUIDE** button / `0` | Find‑chords guide — draws the nearest triad from each note (this is a *guide*, not chord mode) |

## Knob (dial)
| Key | Action |
| --- | --- |
| `Z` / `C` | Filter sweep − / + |
| hold `V` / `B` / `N` / `M` (**one or more**) + turn knob | Reverb · Brightness · Noise · Mod (fm). Hold several at once to shape them together. Reshapes the note you're holding, live. |

## Views, modes & guides
| Key | Action |
| --- | --- |
| `9` | Grid view — watch all instruments play at once (also the grid button) |
| `0` | Find‑chords guide (melodic instruments) — also the **CHORDS** button |
| `F10` | PLAY ↔ NAV mode — NAV frees the cursor so the trackpad works as a normal mouse (also the **PLAY/NAV** button) |
| `/` | Toggle the keyboard legend |
| `Esc` | Close any overlay (grid / legend / settings) |
| `F12` | Debug overlay (live contacts) |

## Whimsy
| Key | Action |
| --- | --- |
| `\` (hold) | Tape‑stop — grind to a halt, release to spin back up |
| type `jaws` | Shark feeding frenzy |
| click the logo ×5 | The shark breaks loose and swims the whole app |

## Devices (hardware, mirror these)
- **Ulanzi D100H dial** — **turn** = the current knob mode (Filter → Bright → Reverb → Mod → Noise) ·
  **press** = cycle the knob mode · 7 keys = sound presets. A key **lights while it's held** (and stays
  lit); hold one for that sound, hold several at once to **blend** them into a new in‑between voice.
  Presses are recorded into the loop and replayed as a coloured flash. Hold `V/B/N/M` to override the
  knob onto those params.

## Drums panel
- **Beat → Loop** (`Shift`+`` ` ``) — bake the current step pattern into the next empty loop slot, so the
  beat becomes a real loop layer you can mute / clone / stack like any other. The step grid itself only
  sounds while **Drums** is the active instrument (it's the beat *designer*, not a global track).
- **Stream Deck Pedal** (loop station) — **Rec** = record this layer / stop (auto‑advances to the next
  empty loop, so it doubles as "next") · **Play** = play/stop all · **Undo** = clear the last layer.
  (Tape‑stop moved to the keyboard `\` to keep the pedal's play/stop reliable.)
