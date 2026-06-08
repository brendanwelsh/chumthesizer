import { params } from "../state";
import { makeMorphWave } from "./wavetable";

/** One playing note: 2 detuned oscillators + a sub, through a lowpass filter,
 *  an amp envelope, and a stereo panner. Pressure drives both loudness and
 *  brightness, so pressing harder makes the note swell and open up. A shared
 *  vibrato LFO is wired into the oscillator detune for a little life. */
export class Voice {
  private ctx: AudioContext;
  private osc1: OscillatorNode;
  private osc2: OscillatorNode;
  private sub: OscillatorNode;
  private filter: BiquadFilterNode;
  private amp: GainNode;
  private panner: StereoPannerNode;
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
    const t = ctx.currentTime;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.Q.value = 7;

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
    this.sub.type = "sine";
    this.osc1.frequency.value = freq;
    this.osc2.frequency.value = freq;
    this.sub.frequency.value = freq / 2;
    this.osc1.detune.value = -7;
    this.osc2.detune.value = +7;

    // shared vibrato adds to each oscillator's detune
    vibrato.connect(this.osc1.detune);
    vibrato.connect(this.osc2.detune);

    const subGain = ctx.createGain();
    subGain.gain.value = params.subLevel;

    this.osc1.connect(mix);
    this.osc2.connect(mix);
    this.sub.connect(subGain).connect(mix);
    mix.connect(this.filter).connect(this.amp).connect(this.panner).connect(dest);

    this.osc1.start(t);
    this.osc2.start(t);
    this.sub.start(t);

    this.y = y;
    this.setPressure(pressure, true);
  }

  private targetAmp(): number {
    return (0.12 + this.p * 0.88) * 0.32;
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

  setFreq(freq: number): void {
    if (this.released) return;
    const t = this.ctx.currentTime;
    this.osc1.frequency.setTargetAtTime(freq, t, 0.04);
    this.osc2.frequency.setTargetAtTime(freq, t, 0.04);
    this.sub.frequency.setTargetAtTime(freq / 2, t, 0.04);
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
  }
}

function clampPan(p: number): number {
  return p < -1 ? -1 : p > 1 ? 1 : p;
}
