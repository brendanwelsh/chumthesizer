import type { DrumKit } from "./drums";

/** 8-track × 16-step drum sequencer with a lookahead clock (the classic Web
 *  Audio scheduling pattern) so hits land tight regardless of frame rate.
 *  Comes up with a groove already in it so hitting play is instantly fun. */
export class Sequencer {
  readonly tracks = 8;
  readonly steps = 16;
  length = 16;           // how many of the 16 steps actually play / loop (selectable: 4 / 8 / 16)
  pattern: boolean[][];
  bpm = 112;
  swing = 0.14;
  playing = false;
  recording = false;
  metronome = false;                              // a click track on the quarter notes
  /** Whether the step pattern SOUNDS. The drum grid is the Drums instrument's design surface — it
   *  only audibly plays while you're on Drums building a beat. To make a beat part of the song you
   *  record/capture it into a loop layer, so pressing Play never auto-blasts a global drum track. */
  audible = false;
  clickFn: ((time: number, accent: boolean) => void) | null = null;

  private current = 0;
  private nextStepTime = 0;
  private playStart = 0;
  private timer: number | null = null;
  private queue: Array<{ step: number; time: number }> = [];

  constructor(private ctx: AudioContext, private kit: DrumKit) {
    // start EMPTY — no mystery auto-beat. Drums are added by recording/capturing them as a loop layer.
    this.pattern = Array.from({ length: this.tracks }, () => new Array(this.steps).fill(false));
  }

  /** A starter beat for the Drums design grid (Dice / a "load groove" action) — never auto-played. */
  loadDefaultGroove(): void {
    const on = (track: number, steps: number[]) => steps.forEach((s) => (this.pattern[track][s] = true));
    on(0, [0, 8, 10]); // kick
    on(1, [4, 12]); // snare
    on(2, [0, 2, 4, 6, 8, 10, 12, 14]); // closed hat
  }

  toggleStep(track: number, step: number): void {
    this.pattern[track][step] = !this.pattern[track][step];
  }

  clear(): void {
    for (const row of this.pattern) row.fill(false);
  }

  /** Replace the pattern from a list of fired steps per track. */
  setPattern(hits: number[][]): void {
    this.clear();
    for (let tr = 0; tr < this.tracks && tr < hits.length; tr++) {
      for (const step of hits[tr]) {
        if (step >= 0 && step < this.steps) this.pattern[tr][step] = true;
      }
    }
  }

  /** Serialize / restore for persistence. */
  snapshot(): boolean[][] {
    return this.pattern.map((row) => row.slice());
  }
  restore(rows: boolean[][]): void {
    if (!Array.isArray(rows) || rows.length !== this.tracks) return;
    for (let tr = 0; tr < this.tracks; tr++) {
      if (!Array.isArray(rows[tr]) || rows[tr].length !== this.steps) return;
    }
    this.pattern = rows.map((row) => row.slice());
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.current = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.playStart = this.nextStepTime;
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  stop(): void {
    this.playing = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.queue = [];
  }

  toggle(): void {
    this.playing ? this.stop() : this.start();
  }

  private secondsPerStep(): number {
    return 60 / this.bpm / 4;
  }

  private tick(): void {
    const horizon = this.ctx.currentTime + 0.12;
    while (this.nextStepTime < horizon) {
      this.scheduleStep(this.current, this.nextStepTime);
      const spb = this.secondsPerStep();
      this.nextStepTime += spb;
      this.current = (this.current + 1) % this.length;   // loop over the selected length (4 / 8 / 16)
    }
  }

  private scheduleStep(step: number, time: number): void {
    if (this.metronome && this.clickFn && step % 4 === 0) this.clickFn(time, step === 0);   // quarter-note click
    const swung = step % 2 === 1 ? time + this.secondsPerStep() * this.swing : time;
    // only SOUND the step pattern while you're designing it on the Drums instrument; otherwise the
    // grid is silent and the beat lives in a recorded loop layer (no global auto-drums under Play).
    if (this.audible) {
      for (let tr = 0; tr < this.tracks; tr++) {
        if (this.pattern[tr][step]) this.kit.trigger(tr, swung);
      }
    }
    this.queue.push({ step, time: swung });   // always queue for the visual playhead (beat dots / screen)
  }

  /** The step currently sounding, for the UI playhead. -1 when stopped. */
  visualStep(): number {
    if (!this.playing) return -1;
    const now = this.ctx.currentTime;
    while (this.queue.length > 1 && this.queue[1].time <= now) this.queue.shift();
    return this.queue[0] && this.queue[0].time <= now ? this.queue[0].step : -1;
  }

  /** Live finger-drumming: always sound the hit; if recording, quantize it to the nearest
   *  step (within the selected length) and write it in — so finger-drumming BUILDS the beat. */
  hit(track: number, accent = true): void {
    this.kit.trigger(track, this.ctx.currentTime, accent);
    if (this.playing && this.recording) {
      const elapsed = (this.ctx.currentTime - this.playStart) / this.secondsPerStep();
      const step = ((Math.round(elapsed) % this.length) + this.length) % this.length;
      this.pattern[track][step] = true;
    }
  }
}
