/** Master transport for the deck: Run (groove + loops), Rec (arm the next loop layer),
 *  and Tempo. SVG glyphs, no emoji. Motion thesis: Run snaps white when live; Rec glows
 *  red the instant it's armed. */
export interface TransportUI {
  setRunning(b: boolean): void;
  setRec(b: boolean): void;
  syncTempo(bpm: number): void;
}

const PLAY = '<svg class="gly" viewBox="0 0 12 12"><path d="M2 1.5l8 4.5-8 4.5z" fill="currentColor"/></svg>';
const STOP = '<svg class="gly" viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor"/></svg>';
const REC = '<svg class="gly" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.2" fill="currentColor"/></svg>';

export function initTransport(
  root: HTMLElement,
  o: { running: boolean; bpm: number; onRun: () => void; onRec: () => void; onTempo: (bpm: number) => void },
): TransportUI {
  root.innerHTML = "";

  const run = document.createElement("button");
  run.className = "tbtn run";
  const setRunGlyph = (b: boolean) => { run.innerHTML = `${b ? STOP : PLAY}<span>${b ? "Stop" : "Play"}</span><kbd class="tkey">Spc</kbd>`; run.classList.toggle("on", b); };
  setRunGlyph(o.running);
  run.title = "Play / stop the groove + loops (Space / Enter)";
  run.onclick = o.onRun;

  const rec = document.createElement("button");
  rec.className = "tbtn rec";
  rec.innerHTML = `${REC}<span>Rec</span><kbd class="tkey">\`</kbd>`;
  rec.title = "Record the next loop layer (\`) — or tap a loop slot / press 1–8";
  rec.onclick = o.onRec;

  const tempo = document.createElement("label");
  tempo.className = "tempo";
  const slider = document.createElement("input");
  slider.type = "range"; slider.min = "60"; slider.max = "180"; slider.step = "1"; slider.value = String(o.bpm);
  const bpm = document.createElement("span");
  bpm.className = "bpm";
  bpm.textContent = String(Math.round(o.bpm));
  slider.oninput = () => { const v = Number(slider.value); bpm.textContent = String(v); o.onTempo(v); };
  tempo.append(document.createTextNode("BPM"), slider, bpm);

  root.append(run, rec, tempo);

  return {
    setRunning(b) { setRunGlyph(b); },
    setRec(b) { rec.classList.toggle("on", b); },
    syncTempo(v) { slider.value = String(Math.round(v)); bpm.textContent = String(Math.round(v)); },
  };
}
