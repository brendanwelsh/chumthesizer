import type { DeviceStatus } from "../types";
import type { DialMap } from "../input/dial-map";
import type { Sampler } from "../audio/sampler";
import type { MidiOut } from "../audio/midi";

/** The Settings sheet — everything that isn't playing: live device connections + statuses,
 *  the dial key calibration ("learn"), the mic sampler, MIDI out, and a reset. Opened from
 *  the gear. This is where the device-status chips used to live in the top bar. */
export interface SettingsUI {
  setStatus(dev: "trackpad" | "dial" | "pedal", s: DeviceStatus): void;
}

type Dev = "trackpad" | "dial" | "pedal";

export function initSettings(
  root: HTMLElement,
  o: {
    reconnect: (dev: Dev) => void;
    dialMap: DialMap;
    onLearnDial: () => void;
    sampler: Sampler;
    midi: MidiOut;
  },
): SettingsUI {
  root.innerHTML = "";
  const dots: Record<Dev, HTMLElement> = {} as Record<Dev, HTMLElement>;
  const stats: Record<Dev, HTMLElement> = {} as Record<Dev, HTMLElement>;

  const group = (title: string): HTMLElement => {
    const g = document.createElement("div"); g.className = "sgroup";
    const h = document.createElement("div"); h.className = "sgroup-h"; h.textContent = title;
    g.append(h); root.append(g); return g;
  };

  // ── DEVICES ──
  const dg = group("Devices");
  const names: Record<Dev, string> = { trackpad: "Magic Trackpad", dial: "Ulanzi Dial", pedal: "Stream Deck Pedal" };
  (["trackpad", "dial", "pedal"] as Dev[]).forEach((dev) => {
    const row = document.createElement("div"); row.className = "srow";
    const left = document.createElement("div"); left.className = "sname";
    const dot = document.createElement("span"); dot.className = "sdot";
    const name = document.createElement("span"); name.textContent = names[dev];
    left.append(dot, name);
    const right = document.createElement("div"); right.style.display = "flex"; right.style.alignItems = "center"; right.style.gap = "10px";
    const st = document.createElement("span"); st.className = "sstatus"; st.textContent = "not connected";
    const btn = document.createElement("button"); btn.className = "sbtn"; btn.textContent = "Reconnect";
    btn.onclick = () => o.reconnect(dev);
    if (dev === "dial") {
      const cal = document.createElement("button"); cal.className = "sbtn"; cal.textContent = "Calibrate";
      cal.title = "Press the 7 dial keys in the on-screen order to map them";
      cal.onclick = () => o.onLearnDial();
      right.append(st, cal, btn);
    } else {
      right.append(st, btn);
    }
    row.append(left, right); dg.append(row);
    dots[dev] = dot; stats[dev] = st;
  });

  // ── DIAL KEYS (calibration) ──
  const cg = group("Dial keys");
  const crow = document.createElement("div"); crow.className = "srow";
  const cleft = document.createElement("div"); cleft.className = "sname"; cleft.style.flexDirection = "column"; cleft.style.alignItems = "flex-start"; cleft.style.gap = "2px";
  const ctitle = document.createElement("span"); ctitle.textContent = "Key mapping";
  const cstat = document.createElement("span"); cstat.className = "sstatus";
  cleft.append(ctitle, cstat);
  const cbtns = document.createElement("div"); cbtns.style.display = "flex"; cbtns.style.gap = "8px";
  const learn = document.createElement("button"); learn.className = "sbtn"; learn.textContent = "Calibrate";
  learn.title = "Press the 7 dial keys in the on-screen order to map them";
  learn.onclick = () => o.onLearnDial();
  const reset = document.createElement("button"); reset.className = "sbtn danger"; reset.textContent = "Reset";
  reset.onclick = () => o.dialMap.reset();
  cbtns.append(learn, reset);
  crow.append(cleft, cbtns); cg.append(crow);

  // ── MIC SAMPLER ──
  const mg = group("Mic sampler");
  const mrow = document.createElement("div"); mrow.className = "srow";
  const mleft = document.createElement("div"); mleft.className = "sname";
  const mdot = document.createElement("span"); mdot.className = "sdot";
  const mname = document.createElement("span"); mname.textContent = "Recorded clip";
  mleft.append(mdot, mname);
  const mright = document.createElement("div"); mright.style.display = "flex"; mright.style.alignItems = "center"; mright.style.gap = "10px";
  const mstat = document.createElement("span"); mstat.className = "sstatus";
  const mbtn = document.createElement("button"); mbtn.className = "sbtn"; mbtn.textContent = "Record";
  mbtn.onclick = () => { if (o.sampler.isRecording) o.sampler.stop(); else void o.sampler.record().catch(() => {}); };
  mright.append(mstat, mbtn);
  mrow.append(mleft, mright); mg.append(mrow);

  // mic INPUT device picker (up to 16s clips). Labels appear after the first mic permission.
  const inRow = document.createElement("div"); inRow.className = "srow";
  const inLeft = document.createElement("div"); inLeft.className = "sname"; inLeft.append(Object.assign(document.createElement("span"), { textContent: "Input" }));
  const inSel = document.createElement("select"); inSel.className = "ctl"; inSel.style.maxWidth = "230px";
  inSel.onchange = () => { o.sampler.inputDeviceId = inSel.value || null; };
  const fillInputs = async (): Promise<void> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === "audioinput");
      const cur = inSel.value;
      inSel.innerHTML = "";
      inSel.append(new Option("System default", ""));
      mics.forEach((d, i) => inSel.append(new Option(d.label || `Microphone ${i + 1}`, d.deviceId)));
      inSel.value = o.sampler.inputDeviceId ?? cur ?? "";
    } catch { /* ignore */ }
  };
  void fillInputs();
  try { navigator.mediaDevices.addEventListener("devicechange", () => void fillInputs()); } catch { /* ignore */ }
  inRow.append(inLeft, inSel); mg.append(inRow);

  // ── MIDI OUT ──
  const midig = group("MIDI out");
  const midirow = document.createElement("div"); midirow.className = "srow";
  const mileft = document.createElement("div"); mileft.className = "sname";
  const michk = document.createElement("input"); michk.type = "checkbox";
  const milabel = document.createElement("span"); milabel.textContent = "Send MIDI";
  mileft.append(michk, milabel);
  const misel = document.createElement("select"); misel.className = "ctl"; misel.disabled = true; misel.style.maxWidth = "180px";
  misel.append(new Option("— enable to choose —", ""));   // clearer than an empty dropdown arrow
  midirow.append(mileft, misel); midig.append(midirow);
  const populate = (outs: MIDIOutput[]) => { misel.innerHTML = ""; for (const out of outs) misel.append(new Option(out.name || out.id, out.id)); if (o.midi.currentId) misel.value = o.midi.currentId; };
  michk.onchange = async () => {
    if (michk.checked) {
      try {
        const outs = await o.midi.init();
        if (!outs.length) { michk.checked = false; milabel.textContent = "Send MIDI (none found)"; return; }
        populate(outs); misel.disabled = false; o.midi.enabled = true; milabel.textContent = "Send MIDI";
      } catch { michk.checked = false; milabel.textContent = "Send MIDI (unavailable)"; }
    } else { o.midi.enabled = false; o.midi.allOff(); misel.disabled = true; }
  };
  misel.onchange = () => o.midi.select(misel.value);

  // ── live polling for mic + calibration state ──
  const poll = (): void => {
    // mic
    const loaded = o.sampler.hasSample();
    mdot.className = "sdot" + (loaded ? " on" : "");
    mbtn.textContent = o.sampler.isRecording ? "Stop" : loaded ? "Re-record" : "Record";
    mstat.textContent = o.sampler.isRecording ? "recording…" : loaded ? "ready — pick Sample" : "none yet";
    // calibration
    if (o.dialMap.learning) cstat.textContent = `press key ${o.dialMap.learnSlot + 1} of ${o.dialMap.total}…`;
    else cstat.textContent = o.dialMap.isCalibrated() ? "calibrated" : "default (press Calibrate)";
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);

  return {
    setStatus(dev, s) {
      dots[dev].className = "sdot" + (s.connected ? " on" : "");
      stats[dev].textContent = s.connected ? "connected" : "not connected";
      stats[dev].title = s.label;
    },
  };
}
