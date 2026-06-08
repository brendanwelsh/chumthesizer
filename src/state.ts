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
  /** name of the active synth preset */
  presetName: string;
};

export const params: Params = {
  morph: 0.66, // sawtooth-ish
  scaleIndex: 0,
  root: 0, // C
  octave: 0,
  masterVolume: 0.8,
  brightness: 0.5,
  reverb: 0.35,
  delay: 0.25,
  glide: false,
  spread: 15,
  attack: 0.01,
  release: 0.35,
  subLevel: 0.35,
  filterEnv: 0.0,
  filterDecay: 0.2,
  presetName: "Pluck",
};
