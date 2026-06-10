import type { params } from "../state";

/** The 7 surface sounds — one per dial key. Voiced toward the owner's north star (Purity Ring):
 *  glassy pitched plucks, lush reverb-drenched pads, crystalline FM bells, deep round sub, a warm
 *  Rhodes, a bright beam lead, and one weird one. Cleaner than before (resonance kept low so notes
 *  stay punchy, not squelchy), and deliberately far apart so the dial keys actually transform the
 *  sound. Each is a partial of the live `params`, applied wholesale when you pick it; recorded loop
 *  layers keep the sound they were played with, and can be re-edited per layer in the Sound panel. */
export const SOUNDS: Record<string, Partial<typeof params>> = {
  // HALO — lush, wide, slowly-blooming dream pad. Octave-stacked super-saw, drenched in reverb +
  // delay, soft chord bloom. The Purity Ring wash.
  Halo: {
    morph: 0.42, attack: 0.55, release: 2.6, brightness: 0.5, reverb: 0.92, delay: 0.42,
    subLevel: 0.35, filterEnv: 0.08, filterDecay: 0.9, glide: false, chord: true, octave: 0,
    detune: 20, interval: 12, subOctave: 1, subWave: "triangle", fm: 0, fmRatio: 2,
    noise: 0.04, vibratoDepth: 0.5, resonance: 2,
  },

  // GLASS — clean, glassy, punchy pluck. Tight tuning, a whisper of high-ratio FM for a bell-like
  // ping, short with a little reverb shimmer. The clean electric start you wanted; the default sound.
  Glass: {
    morph: 0.3, attack: 0.003, release: 0.34, brightness: 0.72, reverb: 0.3, delay: 0.16,
    subLevel: 0.3, filterEnv: 0.42, filterDecay: 0.1, glide: false, chord: false, octave: 0,
    detune: 2, interval: 0, subOctave: 1, subWave: "triangle", fm: 0.05, fmRatio: 4,
    noise: 0, vibratoDepth: 0.2, resonance: 2,
  },

  // SUB — deep, round, clean 808 sub. Dropped an octave, pure sine sub two octaves down, dark, dry,
  // barely any grit. Booms without crunch.
  Sub: {
    morph: 0.4, attack: 0.006, release: 0.45, brightness: 0.3, reverb: 0.06, delay: 0.04,
    subLevel: 1.0, filterEnv: 0.35, filterDecay: 0.14, glide: false, chord: false, octave: -1,
    detune: 0, interval: 0, subOctave: 2, subWave: "sine", fm: 0.05, fmRatio: 1,
    noise: 0, vibratoDepth: 0, resonance: 2,
  },

  // CRYSTAL — glassy, metallic, inharmonic FM bells. Sine carriers FM'd at a non-integer ratio,
  // up an octave, long shimmering reverb tail. Sparkly and cold.
  Crystal: {
    morph: 0.0, attack: 0.002, release: 2.6, brightness: 0.85, reverb: 0.82, delay: 0.45,
    subLevel: 0.12, filterEnv: 0.35, filterDecay: 0.7, glide: false, chord: false, octave: 1,
    detune: 0, interval: 0, subOctave: 1, subWave: "sine", fm: 0.42, fmRatio: 3.5,
    noise: 0.03, vibratoDepth: 0.3, resonance: 2,
  },

  // RHODES — warm electric piano. Triangle body with a touch of FM bark on attack, medium release,
  // gentle detune, light room reverb. Round and soulful.
  Rhodes: {
    morph: 0.28, attack: 0.006, release: 0.85, brightness: 0.5, reverb: 0.42, delay: 0.16,
    subLevel: 0.4, filterEnv: 0.4, filterDecay: 0.24, glide: false, chord: false, octave: 0,
    detune: 4, interval: 0, subOctave: 1, subWave: "triangle", fm: 0.12, fmRatio: 2,
    noise: 0, vibratoDepth: 0.4, resonance: 2,
  },

  // BEAM — bright, airy lead. A fifth stacked on top for a power-lead, moderate detune, slappy
  // delay. Cuts through without the harsh squelch.
  Beam: {
    morph: 0.68, attack: 0.008, release: 0.55, brightness: 0.74, reverb: 0.32, delay: 0.42,
    subLevel: 0.3, filterEnv: 0.4, filterDecay: 0.2, glide: false, chord: false, octave: 0,
    detune: 12, interval: 7, subOctave: 1, subWave: "sawtooth", fm: 0, fmRatio: 2,
    noise: 0, vibratoDepth: 0.8, resonance: 3,
  },

  // MANGLE — chaotic, unstable, gliding. Extreme detune + dissonant interval, clangy FM, noise grit,
  // long smeared tail. The weird one — for when you want to get funky.
  Mangle: {
    morph: 0.9, attack: 0.004, release: 0.9, brightness: 0.7, reverb: 0.6, delay: 0.6,
    subLevel: 0.5, filterEnv: 0.8, filterDecay: 0.16, glide: true, chord: false, octave: 0,
    detune: 28, interval: 6, subOctave: 1, subWave: "square", fm: 0.5, fmRatio: 5.13,
    noise: 0.12, vibratoDepth: 1.6, resonance: 5,
  },
};
