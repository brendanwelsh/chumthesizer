import { params } from "../state";
import { SCALES, degreeToMidi, midiToFreq, xToDegree } from "./scales";

/** Microphone SAMPLER — record a short clip from the mic, then play it back PITCHED
 *  across the scale so your voice / a beatbox / a found sound becomes a playable
 *  instrument (OP-1 / SP-404 style).
 *
 *  It reuses the exact x → scale-degree → frequency mapping the synth Engine uses,
 *  so the recorded buffer plays from the trackpad just like a synth vibe: x picks the
 *  pitch (playbackRate = freq / baseFreq), pressure drives loudness. Polyphonic — one
 *  AudioBufferSourceNode per note. It plays into the same destination node the synth
 *  voices use, so the DJ filter + FX bus still apply.
 *
 *  Recording uses a MediaStreamSource → ScriptProcessor capture (works without
 *  HTTPS/codec quirks), then trims leading silence and gently normalizes the buffer. */

const MAX_SECONDS = 4;
const TRIM_THRESHOLD = 0.015; // RMS-ish level below which leading audio is "silence"
const TARGET_PEAK = 0.85; // gentle normalize ceiling

interface PlayingNote {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export class Sampler {
  private ctx: AudioContext;
  private dest: AudioNode;
  private buffer: AudioBuffer | null = null;
  /** base frequency the recorded sample is treated as (un-pitched reference) */
  private baseFreq = 220;
  private notes = new Map<string, PlayingNote>();

  // ── recording state ──
  private _recording = false;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private recordedFrames = 0;
  private recRate = 44100;
  private stopTimer: number | null = null;

  /** UI level callback (RMS 0..1) while recording, for the mic meter. */
  onLevel: ((rms: number) => void) | null = null;
  /** fired once a recording finishes decoding into a playable buffer. */
  onLoaded: (() => void) | null = null;

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.dest = dest;
  }

  get isRecording(): boolean {
    return this._recording;
  }

  hasSample(): boolean {
    return this.buffer !== null;
  }

  get loaded(): boolean {
    return this.buffer !== null;
  }

  /** Start capturing from the mic. Returns once the stream is live (or throws). */
  async record(): Promise<void> {
    if (this._recording) return;
    await this.ctx.resume().catch(() => {});

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.stream = stream;
    this._recording = true;
    this.chunks = [];
    this.recordedFrames = 0;
    this.recRate = this.ctx.sampleRate;

    const source = this.ctx.createMediaStreamSource(stream);
    const processor = this.ctx.createScriptProcessor(4096, 1, 1);
    const maxFrames = Math.floor(MAX_SECONDS * this.recRate);

    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      if (!this._recording) return;
      const input = e.inputBuffer.getChannelData(0);

      // RMS for the live meter
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length);
      this.onLevel?.(Math.min(1, rms * 4)); // scale up — speech RMS is low

      // copy this block (the event buffer is reused, so we must snapshot)
      const room = maxFrames - this.recordedFrames;
      if (room <= 0) {
        this.stop();
        return;
      }
      const take = Math.min(room, input.length);
      this.chunks.push(input.slice(0, take));
      this.recordedFrames += take;
      if (this.recordedFrames >= maxFrames) this.stop();
    };

    this.source = source;
    this.processor = processor;
    // ScriptProcessor only ticks when connected into the graph; route to a muted sink
    // so we capture without monitoring the mic back through the speakers (no feedback).
    const silent = this.ctx.createGain();
    silent.gain.value = 0;
    source.connect(processor);
    processor.connect(silent).connect(this.ctx.destination);

    // hard cap in case onaudioprocess stalls
    this.stopTimer = window.setTimeout(() => this.stop(), (MAX_SECONDS + 0.3) * 1000);
  }

  /** Stop recording and bake the captured audio into a playable, trimmed, normalized buffer. */
  stop(): void {
    if (!this._recording) return;
    this._recording = false;

    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    if (this.processor) this.processor.onaudioprocess = null;
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.processor = null;
    this.source = null;
    this.stream = null;
    this.onLevel?.(0);

    const baked = this.bake();
    if (baked) {
      this.buffer = baked;
      this.onLoaded?.();
    }
  }

  /** Flatten captured chunks → trim leading silence → gently normalize → AudioBuffer. */
  private bake(): AudioBuffer | null {
    if (this.recordedFrames < 256) return null; // nothing usable

    const flat = new Float32Array(this.recordedFrames);
    let o = 0;
    for (const c of this.chunks) {
      flat.set(c, o);
      o += c.length;
    }
    this.chunks = [];

    // trim leading silence (windowed RMS)
    const win = 256;
    let start = 0;
    for (let i = 0; i + win <= flat.length; i += win) {
      let s = 0;
      for (let j = 0; j < win; j++) s += flat[i + j] * flat[i + j];
      if (Math.sqrt(s / win) > TRIM_THRESHOLD) {
        start = i;
        break;
      }
    }
    const trimmed = start > 0 ? flat.subarray(start) : flat;
    if (trimmed.length < 256) return null;

    // gentle normalize toward a target peak (never amplifies pure silence wildly)
    let peak = 0;
    for (let i = 0; i < trimmed.length; i++) {
      const a = Math.abs(trimmed[i]);
      if (a > peak) peak = a;
    }
    const gain = peak > 0.0001 ? Math.min(8, TARGET_PEAK / peak) : 1;

    const buf = this.ctx.createBuffer(1, trimmed.length, this.recRate);
    const out = buf.getChannelData(0);
    for (let i = 0; i < trimmed.length; i++) out[i] = trimmed[i] * gain;
    return buf;
  }

  // ── playback (same x→degree→freq mapping as the synth Engine) ──

  private baseMidi(): number {
    return 48 + params.octave * 12 + params.root;
  }

  private freqForX(x: number): number {
    const degree = xToDegree(x, params.spread);
    return midiToFreq(degreeToMidi(SCALES[params.scaleIndex], this.baseMidi(), degree));
  }

  /** Start a sample voice for `id`, pitched by x, loudness by pressure. */
  play(id: string, x: number, _y: number, pressure: number): void {
    if (!this.buffer) return;
    void this.ctx.resume();
    this.release(id);

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.freqForX(x) / this.baseFreq;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(this.levelFor(pressure), this.ctx.currentTime, 0.008);

    src.connect(gain).connect(this.dest);
    const note: PlayingNote = { src, gain };
    src.onended = () => {
      try {
        gain.disconnect();
      } catch {
        /* ignore */
      }
      if (this.notes.get(id) === note) this.notes.delete(id);
    };
    src.start();
    this.notes.set(id, note);
  }

  /** Re-pitch + re-level a held sample voice as the finger slides. */
  update(id: string, x: number, _y: number, pressure: number): void {
    const note = this.notes.get(id);
    if (!note) return;
    const t = this.ctx.currentTime;
    note.src.playbackRate.setTargetAtTime(this.freqForX(x) / this.baseFreq, t, 0.02);
    note.gain.gain.setTargetAtTime(this.levelFor(pressure), t, 0.02);
  }

  /** Fade + stop a sample voice. */
  release(id: string): void {
    const note = this.notes.get(id);
    if (!note) return;
    this.notes.delete(id);
    const t = this.ctx.currentTime;
    note.gain.gain.cancelScheduledValues(t);
    note.gain.gain.setTargetAtTime(0.0001, t, 0.06);
    try {
      note.src.stop(t + 0.25);
    } catch {
      /* already stopped */
    }
  }

  releaseAll(): void {
    for (const id of [...this.notes.keys()]) this.release(id);
  }

  private levelFor(pressure: number): number {
    return 0.18 + Math.min(1, Math.max(0, pressure)) * 0.7;
  }
}
