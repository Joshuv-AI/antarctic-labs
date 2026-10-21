// Kokoro TTS worker (2026-10-21) — runs the Kokoro-82M neural voice entirely
// on-device. Loaded lazily the first time the reader taps Listen, so the
// page carries none of this weight up front. The model (q8, ~90 MB) is
// fetched once from the Hugging Face CDN and cached by transformers.js in
// Cache Storage; later sessions reuse it.
//
// Protocol:
//   in:  { type: "init" }
//        { type: "synth", id, text }
//   out: { type: "progress", loaded, total }   (aggregate model download)
//        { type: "ready" }
//        { type: "load-error", error }
//        { type: "audio", id, wav }            (WAV ArrayBuffer, transferred)
//        { type: "synth-error", id, error }
import { KokoroTTS } from "kokoro-js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const VOICE = "af_heart"; // Kokoro's flagship voice — warm, natural female.

let ttsPromise = null;

function loadModel() {
  if (!ttsPromise) {
    const fileTotals = new Map();
    ttsPromise = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (p) => {
        if (p && p.status === "progress" && p.file) {
          fileTotals.set(p.file, { loaded: p.loaded || 0, total: p.total || 0 });
          let loaded = 0;
          let total = 0;
          for (const f of fileTotals.values()) {
            loaded += f.loaded;
            total += f.total;
          }
          if (total > 0) self.postMessage({ type: "progress", loaded, total });
        }
      },
    });
  }
  return ttsPromise;
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  if (msg.type === "init") {
    try {
      await loadModel();
      self.postMessage({ type: "ready" });
    } catch (err) {
      ttsPromise = null; // allow a later retry
      self.postMessage({
        type: "load-error",
        error: String((err && err.message) || err),
      });
    }
    return;
  }
  if (msg.type === "synth") {
    try {
      const tts = await loadModel();
      const audio = await tts.generate(msg.text, { voice: VOICE, speed: 1 });
      let wav = null;
      if (audio && typeof audio.toWav === "function") {
        wav = audio.toWav();
      } else if (audio && typeof audio.toBlob === "function") {
        const blob = audio.toBlob();
        wav = await blob.arrayBuffer();
      }
      if (!wav) throw new Error("synthesis returned no audio");
      const buf = wav instanceof ArrayBuffer ? wav : wav.buffer || wav;
      self.postMessage({ type: "audio", id: msg.id, wav: buf }, [buf]);
    } catch (err) {
      self.postMessage({
        type: "synth-error",
        id: msg.id,
        error: String((err && err.message) || err),
      });
    }
  }
};
