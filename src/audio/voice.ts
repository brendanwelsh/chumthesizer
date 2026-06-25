import { params } from "../state";
import { makeMorphWave } from "./wavetable";

/** One playing note: 2 detuned oscillators (+ an optional interval stack) and a
 *  sub, optionally FM-modulated and dusted with a noise/air layer, run through a
 *  lowpass filter, an amp envelope, and a stereo panner. Pressure drives both
 *  loudness and brightness, so pressing harder makes the note swell and open up.
 *  A shared vibrato LFO is wired (scaled per-preset) into the oscillator detune
 *  for a little life. Timbre params are snapshotted at note-on so each layer keeps
 *  the character it was played with. */
export class Voice {
  private ctx: AudioContext;
  private osc1: OscillatorNode;
  private osc2: OscillatorNode;
  private sub: OscillatorNode;
  private fmOsc!: OscillatorNode;     // always present (depth can be 0) so FM can be dialed in mid-note
  private fmDepth!: GainNode;
  private noiseSrc!: AudioBufferSourceNode;
  private noiseGain!: GainNode;
  private subGain!: GainNode;
  private filter: BiquadFilterNode;
  private amp: GainNode;
  private panner: StereoPannerNode;
  private vibScale: GainNode;
  private hz: number;                 // current base frequency (for live FM-depth recompute)
  private released = false;

  // live expression state, folded together into filter cutoff
  private p = 0;
  private y = 0.5;
  private bright = params.brightness;

  constructor(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    pressure: number,
    y: number,
    pan: number,
    vibrato: AudioNode,
  ) {
    this.ctx = ctx;
    this.hz = freq;
    const t = ctx.currentTime;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.Q.value = params.resonance;

    this.amp = ctx.createGain();
    this.amp.gain.value = 0;

    this.panner = ctx.createStereoPanner();
    this.panner.pan.value = clampPan(pan);

    const mix = ctx.createGain();
    mix.gain.value = 0.5;

    this.osc1 = ctx.createOscillator();
    this.osc2 = ctx.createOscillator();
    this.sub = ctx.createOscillator();
    const wave = makeMorphWave(ctx, params.morph);
    this.osc1.setPeriodicWave(wave);
    this.osc2.setPeriodicWave(wave);
    this.sub.type = params.subWave;

    // second osc can sit on a fixed interval above the root (unison..octave)
    const intervalRatio = Math.pow(2, params.interval / 12);
    this.osc1.frequency.value = freq;
    this.osc2.frequency.value = freq * intervalRatio;
    const subDiv = Math.pow(2, Math.max(0, params.subOctave));
    this.sub.frequency.value = freq / subDiv;

    const det = params.detune;
    this.osc1.detune.value = -det;
    this.osc2.detune.value = +det;

    // shared vibrato adds to each oscillator's detune, scaled per preset
    this.vibScale = ctx.createGain();
    this.vibScale.gain.value = params.vibratoDepth;
    vibrato.connect(this.vibScale);
    this.vibScale.connect(this.osc1.detune);
    this.vibScale.connect(this.osc2.detune);

    // FM: a modulator oscillator drives the carriers' frequency for bell / clang / growl timbres.
    // ALWAYS wired (depth can be 0) so you can dial FM in/out while a note is held.
    this.fmOsc = ctx.createOscillator();
    this.fmOsc.type = "sine";
    this.fmOsc.frequency.value = freq * params.fmRatio;
    this.fmDepth = ctx.createGain();
    this.fmDepth.gain.value = params.fm * freq * 4;
    this.fmOsc.connect(this.fmDepth);
    this.fmDepth.connect(this.osc1.frequency);
    this.fmDepth.connect(this.osc2.frequency);

    this.subGain = ctx.createGain();
    this.subGain.gain.value = params.subLevel;

    this.osc1.connect(mix);
    this.osc2.connect(mix);
    this.sub.connect(this.subGain).connect(mix);

    // noise/air layer — always wired (gain can be 0) so it can be added/removed mid-note.
    this.noiseSrc = ctx.createBufferSource();
    this.noiseSrc.buffer = noiseBuffer(ctx);
    this.noiseSrc.loop = true;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = params.noise * 0.35;
    this.noiseSrc.connect(this.noiseGain).connect(mix);

    mix.connect(this.filter).connect(this.amp).connect(this.panner).connect(dest);

    this.osc1.start(t);
    this.osc2.start(t);
    this.sub.start(t);
    this.fmOsc.start(t);
    this.noiseSrc.start(t);

    this.y = y;
    this.setPressure(pressure, true);
  }

  private targetAmp(): number {
    // wide dynamic range with a LOW floor so a light/low touch is genuinely soft, and a gentler
    // overall scale so the (now denser) voices don't blast. p is driven by vertical position.
    return (0.04 + this.p * 0.96) * 0.24;
  }

  private targetCutoff(): number {
    const v = Math.max(0, Math.min(1.8, 0.15 + this.p * 0.7 + (1 - this.y) * 0.35 + this.bright * 0.7));
    return Math.min(12000, 130 * Math.pow(2, v * 5));
  }

  setPressure(p: number, initial = false): void {
    if (this.released) return;
    this.p = p;
    const t = this.ctx.currentTime;
    const cut = this.targetCutoff();
    if (initial) {
      this.amp.gain.cancelScheduledValues(t);
      this.amp.gain.setValueAtTime(0, t);
      this.amp.gain.linearRampToValueAtTime(this.targetAmp(), t + params.attack);
      // filter snap: open bright at onset, fall back to the pressure target
      const peak = Math.min(14000, cut * (1 + params.filterEnv * 3));
      this.filter.frequency.cancelScheduledValues(t);
      this.filter.frequency.setValueAtTime(peak, t);
      this.filter.frequency.exponentialRampToValueAtTime(Math.max(60, cut), t + Math.max(0.02, params.filterDecay));
    } else {
      this.amp.gain.setTargetAtTime(this.targetAmp(), t, 0.03);
      this.filter.frequency.setTargetAtTime(cut, t, 0.02);
    }
  }

  setY(y: number): void {
    if (this.released) return;
    this.y = y;
    this.filter.frequency.setTargetAtTime(this.targetCutoff(), this.ctx.currentTime, 0.02);
  }

  setBrightness(b: number): void {
    this.bright = b;
    if (this.released) return;
    this.filter.frequency.setTargetAtTime(this.targetCutoff(), this.ctx.currentTime, 0.05);
  }

  setPan(pan: number): void {
    if (this.released) return;
    this.panner.pan.setTargetAtTime(clampPan(pan), this.ctx.currentTime, 0.05);
  }

  /** Current base frequency (Hz) — read-only, for self-tests/automation. */
  get frequency(): number { return this.hz; }

  setFreq(freq: number, tc = 0.04): void {
    if (this.released) return;
    this.hz = freq;
    const t = this.ctx.currentTime;
    const intervalRatio = Math.pow(2, params.interval / 12);
    this.osc1.frequency.setTargetAtTime(freq, t, tc);
    this.osc2.frequency.setTargetAtTime(freq * intervalRatio, t, tc);
    const subDiv = Math.pow(2, Math.max(0, params.subOctave));
    this.sub.frequency.setTargetAtTime(freq / subDiv, t, tc);
    this.fmOsc.frequency.setTargetAtTime(freq * params.fmRatio, t, tc);
  }

  /** Re-read the live timbre params and morph THIS held note toward them — so turning the knob /
   *  picking a sound / moving a slider reshapes the note you're currently holding, in real time. */
  applyLive(): void {
    if (this.released) return;
    const t = this.ctx.currentTime;
    const wave = makeMorphWave(this.ctx, params.morph);
    this.osc1.setPeriodicWave(wave);
    this.osc2.setPeriodicWave(wave);
    this.sub.type = params.subWave;
    this.osc1.detune.setTargetAtTime(-params.detune, t, 0.04);
    this.osc2.detune.setTargetAtTime(+params.detune, t, 0.04);
    this.osc2.frequency.setTargetAtTime(this.hz * Math.pow(2, params.interval / 12), t, 0.04);
    this.sub.frequency.setTargetAtTime(this.hz / Math.pow(2, Math.max(0, params.subOctave)), t, 0.04);
    this.subGain.gain.setTargetAtTime(params.subLevel, t, 0.04);
    this.fmDepth.gain.setTargetAtTime(params.fm * this.hz * 4, t, 0.04);
    this.fmOsc.frequency.setTargetAtTime(this.hz * params.fmRatio, t, 0.04);
    this.noiseGain.gain.setTargetAtTime(params.noise * 0.35, t, 0.04);
    this.vibScale.gain.setTargetAtTime(params.vibratoDepth, t, 0.04);
    this.filter.Q.setTargetAtTime(params.resonance, t, 0.04);
    this.filter.frequency.setTargetAtTime(this.targetCutoff(), t, 0.05);
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    const t = this.ctx.currentTime;
    this.amp.gain.cancelScheduledValues(t);
    this.amp.gain.setValueAtTime(this.amp.gain.value, t);
    this.amp.gain.linearRampToValueAtTime(0, t + params.release);
    const stopAt = t + params.release + 0.05;
    this.osc1.stop(stopAt);
    this.osc2.stop(stopAt);
    this.sub.stop(stopAt);
    this.fmOsc.stop(stopAt);
    this.noiseSrc.stop(stopAt);
  }
}

function clampPan(p: number): number {
  return p < -1 ? -1 : p > 1 ? 1 : p;
}

// one short looping white-noise buffer per context, shared across voices
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const hit = noiseCache.get(ctx);
  if (hit) return hit;
  const len = Math.floor(ctx.sampleRate * 1.0);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseCache.set(ctx, buf);
  return buf;
}
