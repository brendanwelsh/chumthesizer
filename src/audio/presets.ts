import { params } from "../state";

export interface Preset {
  name: string;
  /** 0..1 timbre morph: sine → triangle → sawtooth → square */
  morph: number;
  attack: number;
  release: number;
  brightness: number;
  reverb: number;
  delay: number;
  subLevel: number;
  filterEnv: number;
  filterDecay: number;
  octave?: number;
  glide?: boolean;
}

export const PRESETS: Preset[] = [
  { name: "Pluck",     morph: 0.66, attack: 0.005, release: 0.28, brightness: 0.55, reverb: 0.25, delay: 0.20, subLevel: 0.30, filterEnv: 0.8, filterDecay: 0.18 },
  { name: "Warm Pad",  morph: 0.60, attack: 0.5,   release: 1.4,  brightness: 0.32, reverb: 0.6,  delay: 0.30, subLevel: 0.40, filterEnv: 0.0, filterDecay: 0.3 },
  { name: "Sub Bass",  morph: 0.30, attack: 0.005, release: 0.22, brightness: 0.18, reverb: 0.1,  delay: 0.05, subLevel: 0.9,  filterEnv: 0.3, filterDecay: 0.12, octave: -1 },
  { name: "Bells",     morph: 0.0,  attack: 0.005, release: 1.6,  brightness: 0.8,  reverb: 0.6,  delay: 0.35, subLevel: 0.15, filterEnv: 0.6, filterDecay: 0.5 },
  { name: "Lead",      morph: 1.0,  attack: 0.01,  release: 0.4,  brightness: 0.6,  reverb: 0.2,  delay: 0.35, subLevel: 0.30, filterEnv: 0.4, filterDecay: 0.25 },
  { name: "E-Piano",   morph: 0.34, attack: 0.01,  release: 0.6,  brightness: 0.5,  reverb: 0.4,  delay: 0.15, subLevel: 0.40, filterEnv: 0.5, filterDecay: 0.3 },
  { name: "Stab",      morph: 0.72, attack: 0.005, release: 0.18, brightness: 0.7,  reverb: 0.15, delay: 0.10, subLevel: 0.30, filterEnv: 0.9, filterDecay: 0.1 },
  { name: "Dream Glide", morph: 0.62, attack: 0.2, release: 1.0,  brightness: 0.45, reverb: 0.7,  delay: 0.40, subLevel: 0.35, filterEnv: 0.2, filterDecay: 0.4, glide: true },
  { name: "Vapor",     morph: 0.12, attack: 0.4,   release: 1.6,  brightness: 0.40, reverb: 0.75, delay: 0.45, subLevel: 0.30, filterEnv: 0.1, filterDecay: 0.5 },
  { name: "Laser",     morph: 1.0,  attack: 0.002, release: 0.5,  brightness: 0.85, reverb: 0.30, delay: 0.50, subLevel: 0.20, filterEnv: 0.95, filterDecay: 0.12 },
  { name: "Growl",     morph: 0.70, attack: 0.005, release: 0.3,  brightness: 0.30, reverb: 0.15, delay: 0.10, subLevel: 0.80, filterEnv: 0.6, filterDecay: 0.18, octave: -1 },
];

/** Mutates params to match a preset. Caller then pushes to the engine + UI. */
export function applyPreset(p: Preset): void {
  params.morph = p.morph;
  params.attack = p.attack;
  params.release = p.release;
  params.brightness = p.brightness;
  params.reverb = p.reverb;
  params.delay = p.delay;
  params.subLevel = p.subLevel;
  params.filterEnv = p.filterEnv;
  params.filterDecay = p.filterDecay;
  params.glide = p.glide ?? false;
  if (p.octave !== undefined) params.octave = p.octave;
  params.presetName = p.name;
}
