/** One distinct color per loop slot, so you can SEE which layer is replaying — the slot tile
 *  glows in its color, and the notes it plays back show in that same color on the trackpad. */
export const LOOP_COLORS = [
  "#19e3ff", // cyan
  "#ff2e88", // magenta
  "#7cffb2", // green
  "#f0a23c", // orange
  "#b06cff", // purple
  "#ffd23c", // yellow
  "#ff6b6b", // coral
  "#5ad1c8", // teal
];

export function loopColor(i: number): string {
  return LOOP_COLORS[((i % LOOP_COLORS.length) + LOOP_COLORS.length) % LOOP_COLORS.length];
}

/** "#rrggbb" -> "r,g,b" for building rgba() strings in canvas. */
export function loopRgb(i: number): string {
  const h = loopColor(i).replace("#", "");
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
