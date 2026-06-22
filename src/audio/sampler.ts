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

const MAX_SECONDS = 16;        // generous headroom for longer phrases / loops
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
  private revBuffer: AudioBuffer | null = null;   // cached reverse of `buffer`
  /** base frequency the recorded sample is treated as (un-pitched reference) */
  private baseFreq = 220;
  private notes = new Map<string, PlayingNote>();

  // ── OP-1-style sample shaping ──
  trimStart = 0;        // 0..1 of the buffer
  trimEnd = 1;          // 0..1 of the buffer
  reversed = false;     // play it backwards
  loopOn = false;       // hold = sustain by looping the trimmed region
  slices = 0;           // 0 = pitched play; >0 = chop the trimmed region into N pads across the surface

  // ── recording state ──
  private _recording = false;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private recordedFrames = 0;
  private recRate = 44100;
  private stopTimer: number | null = null;

  /** chosen mic input device (null = system default). Set from Settings. */
  inputDeviceId: string | null = null;

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
    const audio: MediaTrackConstraints | boolean = this.inputDeviceId ? { deviceId: { exact: this.inputDeviceId } } : true;
    const stream = await navigator.mediaDevices.getUserMedia({ audio });
    this.beginCapture(stream);
  }

  /** Sample DESKTOP / system audio — grab whatever's playing (Spotify, a tab…) via the Electron
   *  loopback handler, keep only the audio, and record it like the mic. */
  async recordDesktop(): Promise<void> {
    if (this._recording) return;
    await this.ctx.resume().catch(() => {});
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    display.getVideoTracks().forEach((t) => t.stop());   // we only want the audio
    const audioTracks = display.getAudioTracks();
    if (!audioTracks.length) { display.getTracks().forEach((t) => t.stop()); throw new Error("no system audio"); }
    this.beginCapture(new MediaStream(audioTracks));
  }

  /** Wire a live audio stream into the capture pipeline (shared by mic + desktop). */
  private beginCapture(stream: MediaStream): void {
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
    if (baked) this.adopt(baked);
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

  /** Adopt a baked buffer (from the mic or a decoded file), reset shaping, notify the UI. */
  private adopt(buf: AudioBuffer): void {
    this.buffer = buf;
    this.revBuffer = null;
    this.trimStart = 0;
    this.trimEnd = 1;
    this.reversed = false;
    this.loopOn = false;
    this.onLoaded?.();
  }

  /** Load an audio FILE (mp3/wav/…) as the sample — decoded + mono-mixed. */
  async loadFile(file: File): Promise<void> {
    await this.ctx.resume().catch(() => {});
    const data = await file.arrayBuffer();
    const decoded = await this.ctx.decodeAudioData(data.slice(0));
    // mono-mix (average channels) into a fresh buffer at the sample's own rate
    const len = decoded.length;
    const mono = this.ctx.createBuffer(1, len, decoded.sampleRate);
    const out = mono.getChannelData(0);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const d = decoded.getChannelData(ch);
      for (let i = 0; i < len; i++) out[i] += d[i] / decoded.numberOfChannels;
    }
    this.adopt(mono);
  }

  setTrim(start: number, end: number): void {
    this.trimStart = Math.max(0, Math.min(0.98, Math.min(start, end)));
    this.trimEnd = Math.min(1, Math.max(this.trimStart + 0.02, end));
  }
  setReverse(on: boolean): void { this.reversed = on; }
  setLoop(on: boolean): void { this.loopOn = on; }
  clearSample(): void { this.releaseAll(); this.buffer = null; this.revBuffer = null; }

  /** Down-sampled peak envelope (0..1) for drawing the waveform. */
  peaks(n = 220): Float32Array {
    const out = new Float32Array(n);
    if (!this.buffer) return out;
    const data = this.buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / n));
    for (let i = 0; i < n; i++) {
      let peak = 0;
      const s = i * step;
      for (let j = 0; j < step && s + j < data.length; j++) { const a = Math.abs(data[s + j]); if (a > peak) peak = a; }
      out[i] = peak;
    }
    return out;
  }

  /** the buffer to actually play (reversed cache built on demand). */
  private playBuffer(): AudioBuffer | null {
    if (!this.buffer) return null;
    if (!this.reversed) return this.buffer;
    if (!this.revBuffer || this.revBuffer.length !== this.buffer.length) {
      const src = this.buffer.getChannelData(0);
      const n = src.length;
      const rb = this.ctx.createBuffer(1, n, this.buffer.sampleRate);
      const d = rb.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = src[n - 1 - i];
      this.revBuffer = rb;
    }
    return this.revBuffer;
  }

  // ── playback (same x→degree→freq mapping as the synth Engine) ──

  private baseMidi(): number {
    return 48 + params.octave * 12 + params.root;
  }

  private freqForX(x: number): number {
    const degree = xToDegree(x, params.spread);
    return midiToFreq(degreeToMidi(SCALES[params.scaleIndex], this.baseMidi(), degree));
  }

  /** Start a sample voice for `id`, pitched by x, loudness by pressure — over the trimmed region,
   *  reversed and/or looping per the current shaping. */
  play(id: string, x: number, _y: number, pressure: number): void {
    const buf = this.playBuffer();
    if (!buf) return;
    void this.ctx.resume();
    this.release(id);

    // trim region as fractions; reversing mirrors the region within the (already reversed) buffer
    let s = this.trimStart, e = this.trimEnd;
    if (this.reversed) { s = 1 - this.trimEnd; e = 1 - this.trimStart; }
    const dur = buf.duration;
    const offset = s * dur;
    const region = Math.max(0.02, (e - s) * dur);

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = this.freqForX(x) / this.baseFreq;
    if (this.loopOn) { src.loop = true; src.loopStart = offset; src.loopEnd = e * dur; }

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
    src.start(0, offset, this.loopOn ? undefined : region);
    this.notes.set(id, note);
  }

  /** Chop mode: play the `idx`-th equal slice of the trimmed region at natural pitch (MPC-style). */
  playSlice(id: string, idx: number, pressure: number): void {
    const buf = this.playBuffer();
    if (!buf || this.slices <= 0) return;
    void this.ctx.resume();
    this.release(id);
    const n = this.slices;
    const i = Math.max(0, Math.min(n - 1, idx));
    let s = this.trimStart, e = this.trimEnd;
    if (this.reversed) { s = 1 - this.trimEnd; e = 1 - this.trimStart; }
    const dur = buf.duration;
    const sliceLen = ((e - s) / n) * dur;
    const offset = (s + ((this.reversed ? n - 1 - i : i) / n) * (e - s)) * dur;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(this.levelFor(pressure), this.ctx.currentTime, 0.005);
    src.connect(gain).connect(this.dest);
    const note: PlayingNote = { src, gain };
    src.onended = () => { try { gain.disconnect(); } catch { /* ignore */ } if (this.notes.get(id) === note) this.notes.delete(id); };
    src.start(0, offset, Math.max(0.03, sliceLen));
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
