export interface Scale {
  name: string;
  /** semitone offsets within one octave */
  steps: number[];
}

// Pentatonics first: they sound good no matter what you play. That's the
// "fun-first" default — you basically can't hit a wrong note.
export const SCALES: Scale[] = [
  { name: "Major Pentatonic", steps: [0, 2, 4, 7, 9] },
  { name: "Minor Pentatonic", steps: [0, 3, 5, 7, 10] },
  { name: "Lo-Fi Minor", steps: [0, 2, 3, 5, 7, 8, 10] }, // natural minor
  { name: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
  { name: "Lydian Dream", steps: [0, 2, 4, 6, 7, 9, 11] },
  { name: "Major", steps: [0, 2, 4, 5, 7, 9, 11] },
  { name: "Blues", steps: [0, 3, 5, 6, 7, 10] },
  { name: "Japanese (Hirajoshi)", steps: [0, 2, 3, 7, 8] },
  { name: "Whole Tone", steps: [0, 2, 4, 6, 8, 10] },
  { name: "Chromatic", steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
];

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Map a scale degree (can exceed an octave, or be negative) to a midi note. */
export function degreeToMidi(scale: Scale, baseMidi: number, degree: number): number {
  const n = scale.steps.length;
  const octave = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return baseMidi + octave * 12 + scale.steps[idx];
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Continuous x in 0..1 → an integer scale degree across `range` degrees. */
export function xToDegree(x: number, range: number): number {
  return Math.max(0, Math.min(range - 1, Math.floor(x * range)));
}
