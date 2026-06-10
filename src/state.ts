/** Live, shared synth parameters. UI controls and the Ulanzi dial both mutate
 *  this; the audio engine reads it. One source of truth. */
export interface Params {
  /** 0..1 timbre morph: sine → triangle → sawtooth → square */
  morph: number;
  scaleIndex: number;
  /** root pitch class, 0 = C .. 11 = B */
  root: number;
  /** octave shift in octaves */
  octave: number;
  /** 0..1 */
  masterVolume: number;
  /** 0..1 — global filter brightness (the dial's main job) */
  brightness: number;
  /** 0..1 reverb wet */
  reverb: number;
  /** 0..1 stereo delay wet */
  delay: number;
  /** if true, sliding left/right bends pitch continuously (theremin-ish);
   *  if false, the note locks when you touch down (more musical) */
  glide: boolean;
  /** one finger plays a full chord instead of a single note */
  chord: boolean;
  /** how many scale degrees span the full width of the pad */
  spread: number;
  /** seconds */
  attack: number;
  release: number;
  /** 0..1 weight of the sub oscillator (body / bass) */
  subLevel: number;
  /** 0..1 extra filter brightness at note onset (pluck snap) */
  filterEnv: number;
  /** seconds for that snap to fall back */
  filterDecay: number;

  // ── expressive timbre params (added for the "vibe" palette) ──
  /** oscillator spread in cents — small = thin/clean, large = fat/super-saw.
   *  Default 7 reproduces the original detune. */
  detune: number;
  /** second-oscillator pitch offset in semitones (0 = unison, 7 = fifth,
   *  12 = octave). Stacks an interval on top of every note. Default 0. */
  interval: number;
  /** sub-oscillator octaves below the note. Default 1. */
  subOctave: number;
  /** sub waveform: "sine" = clean weight, "square" = reedy/hollow body,
   *  "triangle" = soft body. Default "sine". */
  subWave: OscillatorType;
  /** 0..1 FM amount — a modulator oscillator bends the carrier pitch for
   *  metallic / clangy / growly tones. Default 0 (off). */
  fm: number;
  /** FM modulator frequency ratio vs the note. Default 2. */
  fmRatio: number;
  /** 0..1 white-noise "air" layer mixed in (breath, hiss, percussive top).
   *  Default 0 (off). */
  noise: number;
  /** 0..1 scaler on the shared vibrato LFO depth. 1 = original depth,
   *  0 = dead-steady pitch. Default 1. */
  vibratoDepth: number;
  /** lowpass resonance / emphasis. Default 7 (original Q). */
  resonance: number;

  /** name of the active synth preset */
  presetName: string;
};

export const params: Params = {
  morph: 0.34, // triangle→saw: clean with a little body, not buzzy
  scaleIndex: 0,
  root: 0, // C
  octave: 0,
  masterVolume: 0.8,
  brightness: 0.66,
  reverb: 0.22,
  delay: 0.12,
  glide: false,
  chord: false,
  spread: 15,
  attack: 0.004,   // punchy start
  release: 0.28,
  subLevel: 0.3,
  filterEnv: 0.34,
  filterDecay: 0.11,
  detune: 2,       // tight, not chorusy/crunchy
  interval: 0,
  subOctave: 1,
  subWave: "triangle",
  fm: 0,
  fmRatio: 2,
  noise: 0,
  vibratoDepth: 0.35,
  resonance: 2,    // clean, no squelch
  presetName: "Glass",
};
