/** Record the OUTPUT to a video clip: the trackpad canvas (the fingerprints + shark) + the live
 *  audio, muxed into a .webm you can save alongside the project. Toggle on/off. */
export interface VideoRecorder {
  toggle(): void;
  isRecording(): boolean;
}

export function initVideoRecorder(canvas: HTMLCanvasElement, audioStream: MediaStream, onState: (rec: boolean) => void): VideoRecorder {
  let rec: MediaRecorder | null = null;
  let chunks: Blob[] = [];

  const start = (): void => {
    if (rec) return;
    try {
      const canvasStream = canvas.captureStream(30);
      const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioStream.getAudioTracks()]);
      const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
        .find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) || "video/webm";
      rec = new MediaRecorder(combined, { mimeType: mime });
      chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "chumthesizer-clip.webm"; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        rec = null; onState(false);
      };
      rec.start();
      onState(true);
    } catch { rec = null; onState(false); }
  };
  const stop = (): void => { if (rec && rec.state !== "inactive") rec.stop(); };

  return {
    toggle() { if (rec) stop(); else start(); },
    isRecording() { return rec !== null; },
  };
}
