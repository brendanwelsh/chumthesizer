import type { Sequencer } from "../audio/sequencer";
import { DRUM_NAMES } from "../audio/drums";
import { PATTERNS } from "../audio/patterns";

/** The groovebox panel: transport, 8 finger-drum pads, and an 8×16 step grid
 *  with a live playhead. Returns `hit(i)` so the keyboard and Ulanzi buttons
 *  can fire the same pads. */
export function initBeat(root: HTMLElement, seq: Sequencer): { hit: (i: number) => void } {
  root.innerHTML = "";

  // ── transport ──
  const bar = el("div", "transport");
  const play = button(seq.playing ? "■ Stop" : "▶ Play", "play");
  const rec = button("● Rec", "rec");
  const clear = button("Clear", "clear");
  const tempoWrap = el("label", "tempo");
  tempoWrap.append(text("Tempo "));
  const tempo = document.createElement("input");
  tempo.type = "range"; tempo.min = "70"; tempo.max = "170"; tempo.step = "1";
  tempo.value = String(seq.bpm);
  const bpmLabel = el("span", "bpm");
  bpmLabel.textContent = `${seq.bpm}`;
  tempo.oninput = () => { seq.bpm = Number(tempo.value); bpmLabel.textContent = tempo.value; };
  tempoWrap.append(tempo, bpmLabel);

  const pattern = document.createElement("select");
  pattern.className = "pattern-sel";
  PATTERNS.forEach((p, i) => pattern.append(new Option(p.name, String(i))));
  pattern.onchange = () => seq.setPattern(PATTERNS[Number(pattern.value)].hits);

  play.onclick = () => { seq.toggle(); play.textContent = seq.playing ? "■ Stop" : "▶ Play"; play.classList.toggle("on", seq.playing); };
  rec.onclick = () => { seq.recording = !seq.recording; rec.classList.toggle("on", seq.recording); };
  clear.onclick = () => seq.clear();
  bar.append(play, rec, clear, pattern, tempoWrap);

  // ── pads ──
  const pads = el("div", "pads");
  const padEls: HTMLButtonElement[] = [];
  for (let i = 0; i < seq.tracks; i++) {
    const p = button(DRUM_NAMES[i], "pad");
    p.onclick = () => hit(i);
    padEls.push(p);
    pads.append(p);
  }

  // ── step grid ──
  const grid = el("div", "grid");
  const cells: HTMLDivElement[][] = [];
  for (let tr = 0; tr < seq.tracks; tr++) {
    const row = el("div", "row");
    const label = el("span", "rowlabel");
    label.textContent = DRUM_NAMES[tr];
    row.append(label);
    cells[tr] = [];
    for (let st = 0; st < seq.steps; st++) {
      const c = el("div", "cell") as HTMLDivElement;
      if (st % 4 === 0) c.classList.add("beat-start");
      c.onclick = () => { seq.toggleStep(tr, st); c.classList.toggle("on", seq.pattern[tr][st]); };
      cells[tr][st] = c;
      row.append(c);
    }
    grid.append(row);
  }

  root.append(bar, pads, grid);

  function hit(i: number): void {
    seq.hit(i);
    const p = padEls[i];
    p.classList.add("flash");
    setTimeout(() => p.classList.remove("flash"), 90);
  }

  // keep grid in sync with the pattern + draw the playhead
  let last = -1;
  const draw = () => {
    for (let tr = 0; tr < seq.tracks; tr++) {
      for (let st = 0; st < seq.steps; st++) {
        cells[tr][st].classList.toggle("on", seq.pattern[tr][st]);
      }
    }
    const step = seq.visualStep();
    if (step !== last) {
      for (let tr = 0; tr < seq.tracks; tr++) {
        if (last >= 0) cells[tr][last].classList.remove("head");
        if (step >= 0) cells[tr][step].classList.add("head");
      }
      last = step;
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  return { hit };
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
function button(label: string, cls: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = cls;
  b.textContent = label;
  return b;
}
function text(s: string): Text {
  return document.createTextNode(s);
}
