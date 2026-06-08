/** Continuous waveform morph (Termendous's nicest idea): one knob slides the
 *  timbre sine → triangle → sawtooth → square by interpolating the harmonic
 *  spectra and baking a PeriodicWave. Waves are cached per context + quantized
 *  morph so rapid notes don't thrash the allocator. */

const N = 32; // harmonics

// imag (sine-phase) coefficients for each anchor waveform
function spectrum(kind: number): Float32Array {
  const a = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) {
    let v = 0;
    if (kind === 0) {
      v = n === 1 ? 1 : 0; // sine
    } else if (kind === 1) {
      if (n % 2 === 1) { const k = (n - 1) / 2; v = (1 / (n * n)) * (k % 2 === 0 ? 1 : -1); } // triangle
    } else if (kind === 2) {
      v = 1 / n; // sawtooth
    } else {
      if (n % 2 === 1) v = 1 / n; // square
    }
    a[n] = v;
  }
  return a;
}

const ANCHORS = [spectrum(0), spectrum(1), spectrum(2), spectrum(3)];
const cache = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();

export function makeMorphWave(ctx: BaseAudioContext, morph: number): PeriodicWave {
  const m = morph < 0 ? 0 : morph > 1 ? 1 : morph;
  const q = Math.round(m * 40);

  let ctxCache = cache.get(ctx);
  if (!ctxCache) { ctxCache = new Map(); cache.set(ctx, ctxCache); }
  const hit = ctxCache.get(q);
  if (hit) return hit;

  const seg = (q / 40) * 3;
  const i = Math.min(2, Math.floor(seg));
  const frac = seg - i;
  const lo = ANCHORS[i];
  const hi = ANCHORS[i + 1];

  const imag = new Float32Array(N + 1);
  const real = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) imag[n] = lo[n] * (1 - frac) + hi[n] * frac;

  const wave = ctx.createPeriodicWave(real, imag);
  ctxCache.set(q, wave);
  return wave;
}
