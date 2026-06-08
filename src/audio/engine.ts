import { Voice } from "./voice";
import { params } from "../state";
import { SCALES, degreeToMidi, midiToFreq, xToDegree } from "./scales";

/** Builds the master audio graph and owns all playing voices. Inputs talk to
 *  it in surface terms (x/y/pressure) or musical terms (scale degree); the
 *  engine handles scale-quantization, voice allocation, the FX bus, and a live
 *  DJ-style performance filter (driven by the Ulanzi dial). Drums tap straight
 *  into the master so the dial filter sweeps the whole groove. */
export class Engine {
  readonly ctx: AudioContext;
  private dry: GainNode;
  private master: GainNode;
  private perfHP: BiquadFilterNode;
  private perfLP: BiquadFilterNode;
  private analyser: AnalyserNode;
  private reverbWet: GainNode;
  private delayWet: GainNode;
  private vibrato: GainNode;
  private voices = new Map<string, Voice>();

  constructor() {
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;

    this.dry = ctx.createGain();
    this.master = ctx.createGain();
    this.master.gain.value = params.masterVolume;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;

    // performance "DJ" filter — highpass then lowpass, swept by the dial
    this.perfHP = ctx.createBiquadFilter();
    this.perfHP.type = "highpass";
    this.perfHP.frequency.value = 20;
    this.perfHP.Q.value = 0.9;
    this.perfLP = ctx.createBiquadFilter();
    this.perfLP.type = "lowpass";
    this.perfLP.frequency.value = 20000;
    this.perfLP.Q.value = 0.9;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    // main path: voices -> dry -> compressor -> master
    this.dry.connect(comp).connect(this.master);

    // reverb send (generated impulse)
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx);
    this.reverbWet = ctx.createGain();
    this.reverbWet.gain.value = params.reverb;
    this.dry.connect(convolver).connect(this.reverbWet).connect(this.master);

    // delay send (feedback, lowpassed for an analog-ish tail)
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.28;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const fbLp = ctx.createBiquadFilter();
    fbLp.type = "lowpass";
    fbLp.frequency.value = 2600;
    this.delayWet = ctx.createGain();
    this.delayWet.gain.value = params.delay;
    this.dry.connect(delay);
    delay.connect(fbLp).connect(fb).connect(delay);
    delay.connect(this.delayWet).connect(this.master);

    // brickwall limiter so stacking drums + chords never clips harshly
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;

    // master -> DJ filter -> limiter -> analyser -> out
    this.master.connect(this.perfHP).connect(this.perfLP).connect(limiter).connect(this.analyser).connect(ctx.destination);

    // shared vibrato LFO -> detune (cents)
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 5.4;
    this.vibrato = ctx.createGain();
    this.vibrato.gain.value = 4.5;
    lfo.connect(this.vibrato);
    lfo.start();
  }

  get analyserNode(): AnalyserNode {
    return this.analyser;
  }

  /** Where drum voices connect (post-synth, pre-DJ-filter). */
  get drumBus(): AudioNode {
    return this.master;
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  private baseMidi(): number {
    return 48 + params.octave * 12 + params.root;
  }

  private freqFromX(x: number): number {
    const degree = xToDegree(x, params.spread);
    return midiToFreq(degreeToMidi(SCALES[params.scaleIndex], this.baseMidi(), degree));
  }

  private freqFromDegree(degree: number): number {
    return midiToFreq(degreeToMidi(SCALES[params.scaleIndex], this.baseMidi(), degree));
  }

  /** MIDI note numbers for the same mapping, for the optional MIDI-out path. */
  noteForX(x: number): number {
    return degreeToMidi(SCALES[params.scaleIndex], this.baseMidi(), xToDegree(x, params.spread));
  }
  noteForDegree(degree: number): number {
    return degreeToMidi(SCALES[params.scaleIndex], this.baseMidi(), degree);
  }

  private newVoice(freq: number, y: number, pressure: number, pan: number): Voice {
    return new Voice(this.ctx, this.dry, freq, pressure, y, pan, this.vibrato);
  }

  playXY(id: string, x: number, y: number, pressure: number): void {
    void this.resume();
    this.voices.get(id)?.release();
    this.voices.set(id, this.newVoice(this.freqFromX(x), y, pressure, panFromX(x)));
  }

  updateXY(id: string, x: number, y: number, pressure: number): void {
    const v = this.voices.get(id);
    if (!v) return;
    v.setPressure(pressure);
    v.setY(y);
    v.setPan(panFromX(x));
    if (params.glide) v.setFreq(this.freqFromX(x));
  }

  /** For the computer keyboard, which plays exact scale degrees. */
  playDegree(id: string, degree: number, pressure: number): void {
    void this.resume();
    this.voices.get(id)?.release();
    const pan = panFromX(degree / Math.max(1, params.spread));
    this.voices.set(id, this.newVoice(this.freqFromDegree(degree), 0.5, pressure, pan));
  }

  release(id: string): void {
    this.voices.get(id)?.release();
    this.voices.delete(id);
  }

  releaseAll(): void {
    for (const v of this.voices.values()) v.release();
    this.voices.clear();
  }

  setBrightness(b: number): void {
    params.brightness = b;
    for (const v of this.voices.values()) v.setBrightness(b);
  }

  /** Dial-driven DJ filter. amount -1 = muffled lowpass, 0 = open, +1 = thin highpass. */
  setPerformanceFilter(amount: number): void {
    const a = Math.max(-1, Math.min(1, amount));
    const t = this.ctx.currentTime;
    if (a < 0) {
      const lp = 120 * Math.pow(20000 / 120, 1 + a); // a:-1->120Hz, 0->20kHz
      this.perfLP.frequency.setTargetAtTime(lp, t, 0.02);
      this.perfHP.frequency.setTargetAtTime(20, t, 0.02);
      this.perfLP.Q.setTargetAtTime(0.9 - a * 5, t, 0.02);
    } else {
      const hp = 20 * Math.pow(3500 / 20, a); // a:0->20Hz, 1->3500Hz
      this.perfHP.frequency.setTargetAtTime(hp, t, 0.02);
      this.perfLP.frequency.setTargetAtTime(20000, t, 0.02);
      this.perfHP.Q.setTargetAtTime(0.9 + a * 5, t, 0.02);
    }
  }

  /** Push the current params object into the live graph. */
  applyParams(): void {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(params.masterVolume, t, 0.02);
    this.reverbWet.gain.setTargetAtTime(params.reverb, t, 0.05);
    this.delayWet.gain.setTargetAtTime(params.delay, t, 0.05);
  }
}

function panFromX(x: number): number {
  return Math.max(-1, Math.min(1, (x - 0.5) * 1.5));
}

function makeImpulse(ctx: BaseAudioContext, seconds = 2.6, decay = 3): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}
