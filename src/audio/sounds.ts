import type { params } from "../state";

/** The sound library. The FIRST 7 are the dial's quick-access keys; the rest are extra profiles you
 *  browse from the Sound panel. Voiced toward Purity Ring — but deliberately WARMER and softer than
 *  before (lower brightness + resonance, gentler detune/FM) so nothing is harsh. Each is a partial of
 *  the live `params`, applied wholesale; held notes reshape live (engine.updateLiveTimbre), recorded
 *  loop layers keep their sound, and any of it can be re-sculpted in the Sound panel. */
export const SOUNDS: Record<string, Partial<typeof params>> = {
  // ── the 7 dial keys ────────────────────────────────────────────────────────
  // HALO — lush, wide, slow dream pad. Soft bloom, warm reverb wash.
  Halo: {
    morph: 0.4, attack: 0.55, release: 2.6, brightness: 0.46, reverb: 0.9, delay: 0.4,
    subLevel: 0.34, filterEnv: 0.08, filterDecay: 0.9, glide: false, chord: true, octave: 0,
    detune: 14, interval: 12, subOctave: 1, subWave: "triangle", fm: 0, fmRatio: 2,
    noise: 0.03, vibratoDepth: 0.5, resonance: 1.6,
  },
  // GLASS — clean, round pluck (the default). Soft top, gentle bell ping, short.
  Glass: {
    morph: 0.26, attack: 0.004, release: 0.4, brightness: 0.58, reverb: 0.3, delay: 0.14,
    subLevel: 0.32, filterEnv: 0.34, filterDecay: 0.12, glide: false, chord: false, octave: 0,
    detune: 2, interval: 0, subOctave: 1, subWave: "triangle", fm: 0.04, fmRatio: 4,
    noise: 0, vibratoDepth: 0.2, resonance: 1.6,
  },
  // SUB — deep, round, clean 808 sub. Dark + dry, no grit.
  Sub: {
    morph: 0.36, attack: 0.006, release: 0.5, brightness: 0.28, reverb: 0.06, delay: 0.04,
    subLevel: 1.0, filterEnv: 0.3, filterDecay: 0.16, glide: false, chord: false, octave: -1,
    detune: 0, interval: 0, subOctave: 2, subWave: "sine", fm: 0.03, fmRatio: 1,
    noise: 0, vibratoDepth: 0, resonance: 1.6,
  },
  // CRYSTAL — glassy FM bells, softened (less bright, gentler FM). Shimmering, not piercing.
  Crystal: {
    morph: 0.05, attack: 0.003, release: 2.4, brightness: 0.66, reverb: 0.78, delay: 0.4,
    subLevel: 0.14, filterEnv: 0.3, filterDecay: 0.7, glide: false, chord: false, octave: 1,
    detune: 0, interval: 0, subOctave: 1, subWave: "sine", fm: 0.28, fmRatio: 3.5,
    noise: 0.02, vibratoDepth: 0.3, resonance: 1.6,
  },
  // RHODES — warm electric piano. Round body, soft bark, soulful.
  Rhodes: {
    morph: 0.24, attack: 0.006, release: 0.9, brightness: 0.46, reverb: 0.4, delay: 0.14,
    subLevel: 0.42, filterEnv: 0.34, filterDecay: 0.26, glide: false, chord: false, octave: 0,
    detune: 4, interval: 0, subOctave: 1, subWave: "triangle", fm: 0.1, fmRatio: 2,
    noise: 0, vibratoDepth: 0.4, resonance: 1.6,
  },
  // BEAM — airy lead, softened. A fifth on top, mellow top end, slappy delay.
  Beam: {
    morph: 0.54, attack: 0.01, release: 0.6, brightness: 0.6, reverb: 0.34, delay: 0.4,
    subLevel: 0.3, filterEnv: 0.34, filterDecay: 0.22, glide: false, chord: false, octave: 0,
    detune: 9, interval: 7, subOctave: 1, subWave: "triangle", fm: 0, fmRatio: 2,
    noise: 0, vibratoDepth: 0.7, resonance: 1.8,
  },
  // MANGLE — the weird one, tamed. Detuned + clangy but no longer screechy.
  Mangle: {
    morph: 0.72, attack: 0.006, release: 0.9, brightness: 0.56, reverb: 0.55, delay: 0.55,
    subLevel: 0.46, filterEnv: 0.5, filterDecay: 0.18, glide: true, chord: false, octave: 0,
    detune: 16, interval: 6, subOctave: 1, subWave: "triangle", fm: 0.3, fmRatio: 3,
    noise: 0.06, vibratoDepth: 1.0, resonance: 2.4,
  },

  // ── extra profiles (browse from the Sound panel) ───────────────────────────
  // VELVET — soft warm pad, no reverb wash, just round.
  Velvet: {
    morph: 0.32, attack: 0.35, release: 1.8, brightness: 0.42, reverb: 0.5, delay: 0.2,
    subLevel: 0.5, filterEnv: 0.08, filterDecay: 0.8, glide: false, chord: false, octave: 0,
    detune: 8, interval: 0, subOctave: 1, subWave: "triangle", fm: 0, fmRatio: 2,
    noise: 0.02, vibratoDepth: 0.4, resonance: 1.4,
  },
  // WURLI — warm reedy electric piano, a hair brighter than Rhodes.
  Wurli: {
    morph: 0.34, attack: 0.005, release: 0.7, brightness: 0.52, reverb: 0.32, delay: 0.12,
    subLevel: 0.34, filterEnv: 0.4, filterDecay: 0.2, glide: false, chord: false, octave: 0,
    detune: 5, interval: 0, subOctave: 1, subWave: "triangle", fm: 0.16, fmRatio: 2,
    noise: 0, vibratoDepth: 0.5, resonance: 1.6,
  },
  // CHOIR — breathy soft pad with air.
  Choir: {
    morph: 0.22, attack: 0.4, release: 2.0, brightness: 0.5, reverb: 0.7, delay: 0.3,
    subLevel: 0.3, filterEnv: 0.06, filterDecay: 0.9, glide: false, chord: true, octave: 0,
    detune: 10, interval: 0, subOctave: 1, subWave: "triangle", fm: 0, fmRatio: 2,
    noise: 0.12, vibratoDepth: 0.6, resonance: 1.4,
  },
  // MARIMBA — soft mallet, short + woody.
  Marimba: {
    morph: 0.12, attack: 0.002, release: 0.5, brightness: 0.56, reverb: 0.28, delay: 0.08,
    subLevel: 0.28, filterEnv: 0.5, filterDecay: 0.1, glide: false, chord: false, octave: 0,
    detune: 1, interval: 0, subOctave: 1, subWave: "sine", fm: 0.18, fmRatio: 5,
    noise: 0, vibratoDepth: 0.1, resonance: 1.6,
  },
  // POLY — gentle analog poly stab, soft and round.
  Poly: {
    morph: 0.46, attack: 0.02, release: 0.7, brightness: 0.55, reverb: 0.36, delay: 0.16,
    subLevel: 0.36, filterEnv: 0.3, filterDecay: 0.22, glide: false, chord: true, octave: 0,
    detune: 7, interval: 0, subOctave: 1, subWave: "triangle", fm: 0, fmRatio: 2,
    noise: 0, vibratoDepth: 0.3, resonance: 1.8,
  },
  // FLUTE — soft breathy sine lead.
  Flute: {
    morph: 0.05, attack: 0.06, release: 0.5, brightness: 0.5, reverb: 0.4, delay: 0.2,
    subLevel: 0.2, filterEnv: 0.1, filterDecay: 0.3, glide: true, chord: false, octave: 0,
    detune: 1, interval: 0, subOctave: 1, subWave: "sine", fm: 0, fmRatio: 2,
    noise: 0.16, vibratoDepth: 0.9, resonance: 1.4,
  },
  // ── wilder, more exploratory voices (very distinct from the above) ─────────
  // GROWL — gnarly low FM bass/lead, made for the knob's Mod + Filter modes.
  Growl: {
    morph: 0.7, attack: 0.004, release: 0.4, brightness: 0.5, reverb: 0.18, delay: 0.12,
    subLevel: 0.6, filterEnv: 0.5, filterDecay: 0.2, glide: false, chord: false, octave: -1,
    detune: 6, interval: 0, subOctave: 1, subWave: "square", fm: 0.5, fmRatio: 1.5,
    noise: 0.05, vibratoDepth: 0.3, resonance: 4,
  },
  // 8-BIT — square chiptune lead, pure and dry.
  "8-bit": {
    morph: 1.0, attack: 0.001, release: 0.18, brightness: 0.7, reverb: 0.08, delay: 0.1,
    subLevel: 0.15, filterEnv: 0.2, filterDecay: 0.06, glide: false, chord: false, octave: 0,
    detune: 0, interval: 7, subOctave: 1, subWave: "square", fm: 0, fmRatio: 2,
    noise: 0, vibratoDepth: 0.3, resonance: 1.2,
  },
  // VOICES — airy noisy choir-ish texture, evolving.
  Voices: {
    morph: 0.2, attack: 0.5, release: 2.4, brightness: 0.46, reverb: 0.82, delay: 0.4,
    subLevel: 0.25, filterEnv: 0.05, filterDecay: 1.0, glide: false, chord: true, octave: 0,
    detune: 18, interval: 0, subOctave: 1, subWave: "triangle", fm: 0.08, fmRatio: 1.5,
    noise: 0.22, vibratoDepth: 0.7, resonance: 1.4,
  },
  // BRASS — warm Beirut-style horn section: soft swell, ensemble detune, a little vibrato.
  Brass: {
    morph: 0.52, attack: 0.06, release: 0.45, brightness: 0.56, reverb: 0.34, delay: 0.16,
    subLevel: 0.2, filterEnv: 0.25, filterDecay: 0.2, glide: false, chord: true, octave: 0,
    detune: 8, interval: 0, subOctave: 1, subWave: "triangle", fm: 0.06, fmRatio: 1,
    noise: 0.02, vibratoDepth: 0.55, resonance: 1.7,
  },
  // GAMELAN — bright inharmonic metallic mallet (high FM ratio, short).
  Gamelan: {
    morph: 0.0, attack: 0.001, release: 0.9, brightness: 0.78, reverb: 0.5, delay: 0.2,
    subLevel: 0.1, filterEnv: 0.4, filterDecay: 0.2, glide: false, chord: false, octave: 1,
    detune: 0, interval: 0, subOctave: 1, subWave: "sine", fm: 0.45, fmRatio: 6.7,
    noise: 0, vibratoDepth: 0.2, resonance: 1.6,
  },
};

/** the 7 quick-access sounds bound to the dial keys (the rest are browsed from the panel). */
export const DIAL_SOUNDS = Object.keys(SOUNDS).slice(0, 7);
