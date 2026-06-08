/** Eight synthesized drum voices, 808/Pocket-Operator flavored — no samples.
 *  Each trigger schedules a short throwaway graph at an exact AudioContext time
 *  so the sequencer can place hits tightly. */

export const DRUM_NAMES = ["Kick", "Snare", "Hat", "OpenHat", "Clap", "Tom", "Rim", "Cowbell"];

export class DrumKit {
  private noise: AudioBuffer;

  constructor(private ctx: AudioContext, private dest: AudioNode) {
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  trigger(index: number, time: number, accent = false): void {
    const g = accent ? 1.3 : 1;
    switch (index) {
      case 0: this.kick(time, g); break;
      case 1: this.snare(time, g); break;
      case 2: this.hat(time, 0.045, 0.5 * g); break;
      case 3: this.hat(time, 0.32, 0.45 * g); break;
      case 4: this.clap(time, g); break;
      case 5: this.tom(time, g); break;
      case 6: this.rim(time, g); break;
      case 7: this.cowbell(time, g); break;
    }
  }

  private env(time: number, peak: number, decay: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    g.connect(this.dest);
    return g;
  }

  private noiseSource(): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    return s;
  }

  private kick(time: number, g: number): void {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.11);
    const amp = this.env(time, 0.9 * g, 0.42);
    osc.connect(amp);
    osc.start(time);
    osc.stop(time + 0.45);
  }

  private snare(time: number, g: number): void {
    const n = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1400;
    const namp = this.env(time, 0.6 * g, 0.18);
    n.connect(hp).connect(namp);
    n.start(time);
    n.stop(time + 0.2);

    const tone = this.ctx.createOscillator();
    tone.type = "triangle";
    tone.frequency.value = 185;
    const tamp = this.env(time, 0.4 * g, 0.12);
    tone.connect(tamp);
    tone.start(time);
    tone.stop(time + 0.13);
  }

  private hat(time: number, decay: number, peak: number): void {
    const n = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7200;
    const amp = this.env(time, peak, decay);
    n.connect(hp).connect(amp);
    n.start(time);
    n.stop(time + decay + 0.02);
  }

  private clap(time: number, g: number): void {
    const hp = this.ctx.createBiquadFilter();
    hp.type = "bandpass";
    hp.frequency.value = 1200;
    hp.Q.value = 1.2;
    hp.connect(this.dest);
    for (const off of [0, 0.012, 0.024, 0.04]) {
      const n = this.noiseSource();
      const amp = this.ctx.createGain();
      const t = time + off;
      amp.gain.setValueAtTime(0.5 * g, t);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      n.connect(amp).connect(hp);
      n.start(t);
      n.stop(t + 0.1);
    }
  }

  private tom(time: number, g: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(90, time + 0.18);
    const amp = this.env(time, 0.7 * g, 0.3);
    osc.connect(amp);
    osc.start(time);
    osc.stop(time + 0.33);
  }

  private rim(time: number, g: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 1700;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1700;
    bp.Q.value = 6;
    const amp = this.env(time, 0.5 * g, 0.04);
    osc.connect(bp).connect(amp);
    osc.start(time);
    osc.stop(time + 0.05);
  }

  private cowbell(time: number, g: number): void {
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 620;
    bp.Q.value = 3;
    const amp = this.env(time, 0.4 * g, 0.22);
    bp.connect(amp);
    for (const f of [540, 800]) {
      const osc = this.ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = f;
      osc.connect(bp);
      osc.start(time);
      osc.stop(time + 0.25);
    }
  }
}
