/** Named 16-step drum patterns. Track order matches DRUM_NAMES:
 *  0 Kick · 1 Snare · 2 Hat · 3 OpenHat · 4 Clap · 5 Tom · 6 Rim · 7 Cowbell.
 *  Each entry lists the steps that fire for that track. */
export interface DrumPattern {
  name: string;
  hits: number[][];
}

export const PATTERNS: DrumPattern[] = [
  { name: "Boom Bap", hits: [[0, 8, 10], [4, 12], [0, 2, 4, 6, 8, 10, 12, 14], [], [], [], [], []] },
  { name: "Four Floor", hits: [[0, 4, 8, 12], [], [], [2, 6, 10, 14], [4, 12], [], [], []] },
  { name: "Trap", hits: [[0, 7, 10], [4, 12], [0, 2, 3, 4, 6, 8, 10, 11, 12, 14], [], [], [], [], []] },
  { name: "Breakbeat", hits: [[0, 10], [4, 12], [0, 2, 4, 6, 8, 10, 12, 14], [], [], [6], [2, 14], []] },
  { name: "House", hits: [[0, 4, 8, 12], [], [], [2, 6, 10, 14], [4, 12], [], [], []] },
  { name: "Empty", hits: [[], [], [], [], [], [], [], []] },
];
