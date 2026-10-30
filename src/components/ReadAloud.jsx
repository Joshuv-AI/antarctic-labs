// ---------------------------------------------------------------------------
// ReadAloud — "Listen" feature for the ReaderAssist orb.
//
// Reads the entry text aloud from the reader's current scroll position using
// the free built-in Web Speech API (no servers, no keys, no cost). Includes:
//  - a persistent bottom player bar (play/pause, ±10s, speed step button, stop)
//  - karaoke-style word-follow highlighting (overlay, no DOM mutation) with
//    a subtle bouncy-ball dot over the active word
//  - gentle auto-scroll to keep the spoken word in view
//  - a natural female voice when one is available (Samantha on iOS, etc.)
//
// How it works:
//  - The text is split into words once ({w, s, e}). Words are grouped into
//    utterance chunks (~180 words, broken at sentence ends) because browsers
//    mishandle very long utterances.
//  - speechSynthesis boundary events (charIndex) drive the highlight. iOS
//    Safari often never fires boundary events, so if none arrive within a
//    few seconds we fall back to timer-estimated word timing (150 WPM).
//  - Pause = cancel + remember word index (pause()/resume() is unreliable
//    cross-browser, especially on iOS). Play resumes from the saved word.
// ---------------------------------------------------------------------------
import { useState, useEffect, useRef, useCallback } from "react";

// --- Listen icon (same 26px stroke style as the other orb menu icons) -------
export const ListenIcon = (
  <svg
    viewBox="0 0 24 24"
    width="26"
    height="26"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M11 5 6.5 9H3.5v6h3L11 19z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.2 6a9 9 0 0 1 0 12" />
  </svg>
);

// Player bar icons (22px).
const PlayGlyph = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);
const PauseGlyph = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
    <rect x="6.5" y="5" width="4" height="14" rx="1" />
    <rect x="13.5" y="5" width="4" height="14" rx="1" />
  </svg>
);
const RewindGlyph = (
  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" aria-hidden="true">
    <path d="M5.7 7.9 A8.3 8.3 0 1 0 14.8 4.0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <path d="M10.6 1.3 L3.8 4.6 L10.1 7.9 Z" fill="currentColor" transform="rotate(-12 7.2 4.6)" />
    <text x="12" y="15.6" textAnchor="middle" fontSize="8.8" fontWeight="700" fill="currentColor" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif">10</text>
  </svg>
);
const ForwardGlyph = (
  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" aria-hidden="true">
    <path d="M18.3 7.9 A8.3 8.3 0 1 1 9.2 4.0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <path d="M13.4 1.3 L20.2 4.6 L13.9 7.9 Z" fill="currentColor" transform="rotate(12 16.8 4.6)" />
    <text x="12" y="15.6" textAnchor="middle" fontSize="8.8" fontWeight="700" fill="currentColor" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif">10</text>
  </svg>
);
const StopGlyph = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

// --- Voice picking ----------------------------------------------------------
// Prefer known natural female voices, then any English voice, then default.
// Samantha (iOS/macOS) and Google US English (Chrome) are the standouts.
const FEMALE_PATTERNS = [
  /samantha/i,
  /victoria/i,
  /karen/i,
  /moira/i,
  /tessa/i,
  /fiona/i,
  /google us english/i,
  /zira/i,
  /susan/i,
  /linda/i,
  /female/i,
];
function pickVoice() {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return null;
    const voices = synth.getVoices();
    if (!voices || !voices.length) return null;
    const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang || ""));
    const pool = en.length ? en : voices;
    for (const pat of FEMALE_PATTERNS) {
      const hit = pool.find((v) => pat.test(v.name || ""));
      if (hit) return hit;
    }
    const us = pool.find((v) => /^en[-_]us/i.test(v.lang || ""));
    return us || pool[0] || null;
  } catch {
    return null;
  }
}

// --- Text prep ---------------------------------------------------------------
const WORD_RE = /\S+/g;
const SENT_END_RE = /[.!?…:;]\s*$/;

// Split text into words: [{w, s, e}] with global char offsets.
function splitWords(text) {
  const words = [];
  WORD_RE.lastIndex = 0;
  let m;
  while ((m = WORD_RE.exec(text)) !== null) {
    words.push({ w: m[0], s: m.index, e: m.index + m[0].length });
  }
  return words;
}

// Group word indexes into utterance chunks (~180 words, break at sentences).
function chunkWords(words, per = 180) {
  const chunks = [];
  let start = 0;
  while (start < words.length) {
    let end = Math.min(start + per, words.length);
    // Prefer to end on a sentence boundary within the last 40 words.
    if (end < words.length) {
      for (let i = end; i > Math.max(start + per - 40, start); i--) {
        if (SENT_END_RE.test(words[i - 1].w)) {
          end = i;
          break;
        }
      }
    }
    chunks.push({ from: start, to: end });
    start = end;
  }
  return chunks;
}

const WPM = 150; // baseline words-per-minute at 1x for the timer fallback

// ---------------------------------------------------------------------------
// useReadAloudLegacy — the original Web Speech engine. Kept as the automatic
// fallback: if the Kokoro model can't load (offline first run, very old
// browser, synthesis failures), the dispatcher hands control to this engine
// and listening continues with the system voice.
// ---------------------------------------------------------------------------
function useReadAloudLegacy({ text, getStartOffset, chunkElsRef, chunkStarts, onWord }) {
  const [status, setStatus] = useState("idle"); // idle | playing | paused
  if (typeof window !== "undefined" && status !== "idle") {
  }
  const [rate, setRateState] = useState(1);
  const [wordIdx, setWordIdx] = useState(0);
  const [wordCount, setWordCount] = useState(0);

  // All mutable engine state lives in refs (no re-renders in the hot path).
  const eng = useRef(null);
  const statusRef = useRef("idle");
  const rateRef = useRef(1);
  const setStatusBoth = (s) => {
    statusRef.current = s;
    setStatus(s);
  };

  // Highlight overlay helpers are passed in via onWord(globalStart, globalEnd,
  // wordIndex). The hook owns timing; the component owns the DOM overlay.

  const clearTimer = () => {
    if (eng.current && eng.current.timer) {
      clearInterval(eng.current.timer);
      eng.current.timer = 0;
    }
  };

  const speakChunk = useCallback(
    (chunkIdx) => {
      const E = eng.current;
      if (!E) return;
      const synth = window.speechSynthesis;
      if (!synth) return;
      const ch = E.chunks[chunkIdx];
      if (!ch) {
        // Reached the end.
        setStatusBoth("idle");
        setWordIdx(E.words.length);
        if (onWord) onWord(null);
        return;
      }
      E.chunkIdx = chunkIdx;
      const slice = E.words.slice(ch.from, ch.to);
      const chunkText = text.slice(E.words[ch.from].s, E.words[ch.to - 1].e);
      const utter = new SpeechSynthesisUtterance(chunkText);
      if (E.voice) utter.voice = E.voice;
      utter.rate = rateRef.current;
      utter.pitch = 1;
      E.chunkChar0 = E.words[ch.from].s;
      E.boundarySeen = false;
      E.utter = utter;

      utter.onboundary = (ev) => {
        if (!ev || ev.name !== "word" || typeof ev.charIndex !== "number") return;
        const E2 = eng.current;
        if (!E2 || E2.utter !== utter) return;
        E2.boundarySeen = true;
        // charIndex is relative to this utterance's text.
        const gChar = E2.chunkChar0 + ev.charIndex;
        // Words advance monotonically: scan forward from the last word.
        let wi = E2.lastWi;
        while (wi + 1 < E2.words.length && E2.words[wi + 1].s <= gChar) wi++;
        while (wi > 0 && E2.words[wi].s > gChar) wi--;
        E2.lastWi = wi;
        setWordIdx(wi);
        if (onWord) onWord(E2.words[wi].s, E2.words[wi].e, wi);
      };
      utter.onend = () => {
        const E2 = eng.current;
        if (!E2 || E2.utter !== utter) return;
        if (statusRef.current !== "playing") return;
        const nextWi = E2.chunks[E2.chunkIdx].to;
        E2.lastWi = nextWi;
        setWordIdx(nextWi);
        speakChunk(E2.chunkIdx + 1);
      };
      utter.onerror = (ev) => {
        const E2 = eng.current;
        if (!E2 || E2.utter !== utter) return;
        // "interrupted" / "canceled" are our own doing (pause/seek/stop).
        if (ev && (ev.error === "interrupted" || ev.error === "canceled")) return;
        setStatusBoth("idle");
        if (onWord) onWord(null);
      };
      synth.speak(utter);

      // iOS Safari often never fires boundary events: if none arrive soon,
      // fall back to timer-estimated word advancement for this utterance.
      clearTimer();
      E.timer = setInterval(() => {
        const E2 = eng.current;
        if (!E2 || E2.utter !== utter || statusRef.current !== "playing") return;
        if (E2.boundarySeen) {
          clearTimer();
          return;
        }
        const elapsed = Date.now() - E2.chunkT0;
        const wordsIn = Math.floor(
          (elapsed / 60000) * WPM * rateRef.current
        );
        const wi = Math.min(
          E2.chunks[E2.chunkIdx].from + wordsIn,
          E2.chunks[E2.chunkIdx].to - 1
        );
        if (wi !== E2.lastWi) {
          E2.lastWi = wi;
          setWordIdx(wi);
          if (onWord) onWord(E2.words[wi].s, E2.words[wi].e, wi);
        }
      }, 120);
      E.chunkT0 = Date.now();
    },
    [text, onWord]
  );

  // Start (or restart) reading at a word index.
  const playFrom = useCallback(
    (wi) => {
      const synth = window.speechSynthesis;
      if (!synth || !text) return false;
      let E = eng.current;
      if (!E || E.text !== text) {
        const words = splitWords(text);
        E = eng.current = {
          text,
          words,
          chunks: chunkWords(words),
          voice: pickVoice(),
          chunkIdx: 0,
          lastWi: 0,
          chunkChar0: 0,
          chunkT0: 0,
          utter: null,
          timer: 0,
          boundarySeen: false,
        };
        setWordCount(words.length);
      }
      // Clamp + find the chunk containing wi.
      wi = Math.max(0, Math.min(wi, E.words.length - 1));
      let ci = E.chunks.findIndex((c) => wi >= c.from && wi < c.to);
      if (ci < 0) ci = E.chunks.length - 1;
      // If wi isn't the chunk start, trim the chunk so we begin at wi.
      if (E.chunks[ci].from !== wi) {
        E.chunks[ci] = { from: wi, to: E.chunks[ci].to };
      }
      E.lastWi = wi;
      setWordIdx(wi);
      try {
        synth.cancel();
      } catch {
        /* noop */
      }
      clearTimer();
      setStatusBoth("playing");
      // Defer speak by a tick: iOS Safari sometimes drops speak() called
      // synchronously inside cancel().
      setTimeout(() => {
        if (statusRef.current === "playing" && eng.current === E) speakChunk(ci);
      }, 30);
      return true;
    },
    [text, speakChunk]
  );

  const startFromCurrent = useCallback(() => {
    const synth = window.speechSynthesis;
    if (!synth) {
      return "unsupported";
    }
    if (!text) return "empty";
    const off = Math.max(0, getStartOffset ? getStartOffset() : 0);
    const E = eng.current;
    const words = E && E.text === text ? E.words : splitWords(text);
    // First word at or after the offset.
    let wi = words.findIndex((w) => w.e > off);
    if (wi < 0) wi = 0;
    playFrom(wi);
    return "ok";
  }, [text, getStartOffset, playFrom]);

  const toggle = useCallback(() => {
    if (statusRef.current === "playing") {
      // Pause = cancel + hold position (pause()/resume() is flaky on iOS).
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* noop */
      }
      clearTimer();
      setStatusBoth("paused");
      if (onWord) onWord(null, null, eng.current ? eng.current.lastWi : 0, true);
    } else if (statusRef.current === "paused") {
      playFrom(eng.current ? eng.current.lastWi : 0);
    }
  }, [playFrom, onWord]);

  const stop = useCallback(() => {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* noop */
    }
    clearTimer();
    eng.current = null;
    setStatusBoth("idle");
    setWordIdx(0);
    if (onWord) onWord(null);
  }, [onWord]);

  const skip = useCallback(
    (seconds) => {
      const E = eng.current;
      if (!E || statusRef.current === "idle") return;
      const wordsDelta = Math.round(((WPM * rateRef.current) / 60) * seconds);
      const wi = Math.max(
        0,
        Math.min(E.words.length - 1, E.lastWi + wordsDelta)
      );
      if (statusRef.current === "paused") {
        E.lastWi = wi;
        setWordIdx(wi);
        if (onWord) onWord(E.words[wi].s, E.words[wi].e, wi);
      } else {
        playFrom(wi);
      }
    },
    [playFrom, onWord]
  );

  const setRate = useCallback(
    (r) => {
      r = Math.max(0.5, Math.min(2, r));
      rateRef.current = r;
      setRateState(r);
      // Rate applies per-utterance: restart the current chunk at the new
      // rate so the change is immediate.
      const E = eng.current;
      if (E && statusRef.current === "playing") {
        playFrom(E.lastWi);
      }
    },
    [playFrom]
  );

  // Voices load async — refresh the pick once they arrive.
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const refresh = () => {
      if (eng.current) eng.current.voice = pickVoice();
      else pickVoice();
    };
    try {
      synth.getVoices();
    } catch {
      /* noop */
    }
    if (typeof synth.onvoiceschanged !== "undefined") {
      synth.onvoiceschanged = refresh;
    }
    return () => {
      try {
        synth.cancel();
      } catch {
        /* noop */
      }
      // Don't clobber a handler someone else installed (2026-10-18).
      if (synth.onvoiceschanged === refresh) synth.onvoiceschanged = null;
      stop();
      clearTimer();
    };
  }, []);

  // New text: stop everything (the words/chunks belong to the old entry).
  useEffect(() => {
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return {
    status,
    statusRef,
    rate,
    wordIdx,
    wordCount,
    startFromCurrent,
    toggle,
    stop,
    skip,
    setRate,
    supported:
      typeof window !== "undefined" && !!window.speechSynthesis,
  };
}

// ---------------------------------------------------------------------------
// Kokoro engine (2026-10-21) — the primary Listen voice.
//
// Kokoro-82M (open source, Apache-2.0) synthesizes speech on-device in a
// Web Worker (src/lib/kokoro-worker.js), lazily loaded on the first Listen
// tap: a one-time ~90 MB model download, cached by the browser afterwards.
// Sentences are synthesized a few ahead of playback and played through a
// single <audio> element, which makes pause a true pause, ±10s a true
// seek, and the speed control the element's playbackRate (instant, no
// re-synthesis). Word tracking is per-sentence: the spoken word is the
// char-weighted estimate inside the current sentence's audio.
//
// Any fatal failure (no Worker/WASM, model download error, repeated
// synthesis errors) calls onFatalError and the dispatcher swaps in the
// legacy Web Speech engine, so Listen never just dies.
// ---------------------------------------------------------------------------

// Group words into synthesis sentences: end at sentence punctuation, break
// over-long sentences at clause punctuation (~200 chars per Kokoro call).
const CLAUSE_END_RE = /[,;:]\s*$/;
function splitSentences(words, text) {
  const out = [];
  let start = 0;
  let chars = 0;
  const push = (end) => {
    const s = {
      from: start,
      to: end,
      text: text.slice(words[start].s, words[end - 1].e),
      cum: [],
    };
    const total = Math.max(1, s.text.length);
    for (let i = start; i < end; i++) {
      s.cum.push((words[i].s - words[start].s) / total);
    }
    out.push(s);
    start = end;
    chars = 0;
  };
  for (let i = 0; i < words.length; i++) {
    chars += words[i].w.length + 1;
    const last = i === words.length - 1;
    if (last) {
      push(i + 1);
    } else if (SENT_END_RE.test(words[i].w) && chars >= 40) {
      push(i + 1);
    } else if (
      chars >= 200 &&
      (SENT_END_RE.test(words[i].w) || CLAUSE_END_RE.test(words[i].w))
    ) {
      push(i + 1);
    } else if (chars >= 240) {
      // Kokoro truncates past ~512 phonemes (~240 chars) — never feed it
      // a longer unit, even mid-clause.
      push(i + 1);
    }
  }
  return out;
}

// The word being spoken at fraction f of a sentence's audio (char-weighted).
function wordAtFrac(sentence, words, f) {
  const cum = sentence.cum;
  let lo = 0;
  let hi = cum.length - 1;
  let hit = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= f) {
      hit = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return sentence.from + hit;
}

const KOKORO_POSSIBLE =
  typeof window !== "undefined" &&
  typeof Worker !== "undefined" &&
  typeof WebAssembly !== "undefined";

// Every device loads the q8 model (model_quantized.onnx, ~92 MB). The
// q4 file in this model repo is NOT smaller — it is ~305 MB — so the
// old mobile-q4 switch tripled the phone download and the load died
// on iOS (memory/quota) every time. Verified against the Hugging Face
// file listing 2026-10-30.

// A 0.25s silent WAV — played (and instantly paused) inside the Listen tap
// so iOS/Chrome unlock the audio element for later programmatic playback.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

function useReadAloudKokoro({
  text,
  getStartOffset,
  onWord,
  onFatalError,
}) {
  const [status, setStatus] = useState("idle");
  const [rate, setRateState] = useState(1);
  const [wordIdx, setWordIdx] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [voiceState, setVoiceState] = useState("idle"); // idle|loading|ready
  const [voiceProgress, setVoiceProgress] = useState(0);

  const statusRef = useRef("idle");
  const rateRef = useRef(1);
  const eng = useRef(null);
  // The worker's message handlers are registered once and would otherwise
  // capture the text of the render that created them; always read latest.
  const textRef = useRef(text);
  textRef.current = text;
  const setStatusBoth = (s) => {
    statusRef.current = s;
    setStatus(s);
  };

  const getEng = () => {
    if (!eng.current) {
      eng.current = {
        worker: null,
        workerState: "none", // none | loading | ready | error
        progressDismissed: false,
        pendingStartWi: null,
        words: null,
        sentences: null,
        text: null,
        audio: null,
        cache: new Map(), // sentenceIdx -> { url, dur }
        pending: new Map(), // synthId -> sentenceIdx
        seq: 0,
        cur: -1,
        loadedIdx: -1,
        wantPlay: false,
        waitingFor: -1,
        waitingSeek: null, // { atSec } | { atWord }
        charRate: 13.5, // measured chars/sec of finished sentences
        fails: 0,
        lastWi: 0,
        raf: 0,
      };
    }
    return eng.current;
  };

  // --- audio element -------------------------------------------------------
  const ensureAudio = useCallback(() => {
    const E = getEng();
    if (E.audio) return E.audio;
    const a = new Audio();
    a.preload = "auto";
    a.setAttribute("playsinline", "");
    a.playbackRate = rateRef.current;
    a.addEventListener("ended", () => {
      const E2 = getEng();
      if (!E2.wantPlay) return;
      const next = E2.cur + 1;
      if (E2.sentences && next < E2.sentences.length) {
        playSentence(next, null);
      } else {
        E2.wantPlay = false;
        setStatusBoth("idle");
        setWordIdx(E2.words ? E2.words.length : 0);
        if (onWord) onWord(null);
      }
    });
    a.addEventListener("error", () => {
      // A blob that fails to decode: skip forward rather than stall.
      const E2 = getEng();
      if (E2.wantPlay && E2.sentences && E2.cur + 1 < E2.sentences.length) {
        playSentence(E2.cur + 1, null);
      }
    });
    E.audio = a;
    try {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: document.title || "Tower of Babel",
          artist: "Antarctic Labs — Tower of Babel",
        });
      }
    } catch {
      /* media session is a bonus, never a blocker */
    }
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onWord]);

  // --- worker --------------------------------------------------------------
  const requestSynth = useCallback((idx) => {
    const E = getEng();
    if (!E.worker || E.workerState !== "ready") return;
    if (idx < 0 || !E.sentences || idx >= E.sentences.length) return;
    if (E.cache.has(idx)) return;
    for (const v of E.pending.values()) if (v === idx) return;
    const id = ++E.seq;
    E.pending.set(id, idx);
    E.worker.postMessage({
      type: "synth",
      id,
      text: E.sentences[idx].text,
    });
  }, []);

  const handleAudioReady = useCallback(
    (idx, url, dur) => {
      const E = getEng();
      E.cache.set(idx, { url, dur });
      const s = E.sentences && E.sentences[idx];
      if (s && dur > 0) {
        // Rolling chars/sec calibration for duration estimates.
        const cps = s.text.length / dur;
        if (cps > 4 && cps < 40) E.charRate = E.charRate * 0.6 + cps * 0.4;
      }
      // Evict far-behind sentences to bound memory (each WAV ~50 KB/s).
      for (const k of [...E.cache.keys()]) {
        if (k < E.cur - 2 || k > E.cur + 4) {
          const c = E.cache.get(k);
          if (c && c.url) URL.revokeObjectURL(c.url);
          E.cache.delete(k);
        }
      }
      if (E.waitingFor === idx) {
        const seek = E.waitingSeek;
        E.waitingFor = -1;
        E.waitingSeek = null;
        playSentence(idx, seek);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const ensureWorker = useCallback(() => {
    const E = getEng();
    if (E.worker) return E.worker;
    if (!E.persistAsked) {
      E.persistAsked = true;
      // Keep the downloaded voice across visits: ask the browser for
      // persistent storage, and drop the old ~305 MB q4 model file if
      // an earlier version managed to cache it.
      try {
        if (navigator.storage && navigator.storage.persist)
          navigator.storage.persist();
        if (typeof caches !== "undefined")
          caches
            .open("transformers-cache")
            .then((c) =>
              c.delete(
                "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_q4.onnx"
              )
            )
            .catch(() => {});
      } catch {
        /* best effort only */
      }
    }
    let w;
    try {
      w = new Worker(new URL("../lib/kokoro-worker.js", import.meta.url), {
        type: "module",
      });
    } catch {
      if (onFatalError) onFatalError("worker-create");
      return null;
    }
    E.worker = w;
    E.workerState = "loading";
    w.onmessage = (ev) => {
      const msg = ev.data || {};
      const E2 = getEng();
      if (msg.type === "progress") {
        if (msg.total > 0) {
          setVoiceProgress(
            Math.min(99, Math.round((msg.loaded / msg.total) * 100))
          );
        }
      } else if (msg.type === "ready") {
        E2.workerState = "ready";
        setVoiceProgress(100);
        setVoiceState("ready");
        if (E2.pendingStartWi !== null) {
          const wi = E2.pendingStartWi;
          E2.pendingStartWi = null;
          beginAt(wi);
        }
      } else if (msg.type === "load-error") {
        console.warn("[kokoro] model load failed:", msg.error);
        E2.loadAttempts = (E2.loadAttempts || 0) + 1;
        if (E2.loadAttempts < 2) {
          // One clean retry with a fresh worker: a transient fetch
          // failure (or a poisoned runtime state) must not silently cost
          // the reader the real voice.
          try {
            E2.worker.terminate();
          } catch {
            /* noop */
          }
          E2.worker = null;
          E2.workerState = "none";
          ensureWorker();
        } else {
          E2.workerState = "error";
          setVoiceState("idle");
          if (onFatalError)
            onFatalError("load: " + String(msg.error || "unknown").slice(0, 110));
        }
      } else if (msg.type === "audio") {
        const idx = E2.pending.get(msg.id);
        E2.pending.delete(msg.id);
        if (idx === undefined) return;
        // The session may have been stopped while this was synthesizing.
        if (!E2.sentences || idx >= E2.sentences.length) return;
        const blob = new Blob([msg.wav], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        // Probe the duration off-DOM, then hand it to the player.
        const probe = new Audio();
        probe.preload = "metadata";
        probe.onloadedmetadata = () => {
          handleAudioReady(idx, url, probe.duration || 0);
          probe.src = "";
        };
        probe.onerror = () => handleAudioReady(idx, url, 0);
        probe.src = url;
        E2.fails = 0;
      } else if (msg.type === "synth-error") {
        const idx = E2.pending.get(msg.id);
        E2.pending.delete(msg.id);
        E2.fails += 1;
        if (E2.fails >= 3) {
          if (onFatalError)
            onFatalError("synth: " + String(msg.error || "unknown").slice(0, 100));
          return;
        }
        if (idx !== undefined && E2.waitingFor === idx) {
          // Skip the broken sentence rather than stalling playback.
          E2.waitingFor = -1;
          playSentence(idx + 1, null);
        }
      }
    };
    w.onerror = (ev) => {
      console.warn("[kokoro] worker error:", ev && ev.message);
      const E2 = getEng();
      if (E2.workerState === "loading") {
        E2.loadAttempts = (E2.loadAttempts || 0) + 1;
        if (E2.loadAttempts < 2) {
          try {
            E2.worker.terminate();
          } catch {
            /* noop */
          }
          E2.worker = null;
          E2.workerState = "none";
          ensureWorker();
          return;
        }
      }
      E2.workerState = "error";
      setVoiceState("idle");
      if (onFatalError)
        onFatalError("worker: " + String((ev && ev.message) || "error").slice(0, 110));
    };
    w.postMessage({
      type: "init",
      dtype: "q8",
      // The retry keeps the cache ON: transformers.js tolerates a
      // failed cache write (it warns and continues in-memory), while a
      // cache-free retry both re-downloads everything AND leaves
      // nothing cached for the next visit.
      noCache: false,
    });
    return w;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFatalError]);

  // --- playback ------------------------------------------------------------
  const estDur = useCallback((idx) => {
    const E = getEng();
    const c = E.cache.get(idx);
    if (c && c.dur > 0) return c.dur;
    const s = E.sentences && E.sentences[idx];
    return s ? Math.max(0.4, s.text.length / E.charRate) : 1;
  }, []);

  const trackTick = useCallback(() => {
    const E = getEng();
    const a = E.audio;
    if (!a || !E.sentences || E.cur < 0) return;
    if (!a.paused && a.duration > 0 && a.currentTime >= 0) {
      const s = E.sentences[E.cur];
      const f = Math.min(1, a.currentTime / a.duration);
      const wi = wordAtFrac(s, E.words, f);
      if (wi !== E.lastWi) {
        E.lastWi = wi;
        setWordIdx(wi);
        if (onWord) onWord(E.words[wi].s, E.words[wi].e, wi);
      }
    }
    if (statusRef.current === "playing") {
      E.raf = requestAnimationFrame(trackTick);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onWord]);

  const startTracking = useCallback(() => {
    const E = getEng();
    cancelAnimationFrame(E.raf);
    E.raf = requestAnimationFrame(trackTick);
  }, [trackTick]);

  function playSentence(idx, seek) {
    const E = getEng();
    if (!E.sentences || idx < 0 || idx >= E.sentences.length) {
      E.wantPlay = false;
      setStatusBoth("idle");
      if (onWord) onWord(null);
      return;
    }
    E.cur = idx;
    const s = E.sentences[idx];
    // Position the highlight at the sentence (or seek) start immediately.
    let wi = s.from;
    if (seek && typeof seek.atSec === "number") {
      wi = wordAtFrac(s, E.words, Math.min(1, seek.atSec / estDur(idx)));
    } else if (seek && typeof seek.atWord === "number") {
      wi = Math.max(s.from, Math.min(seek.atWord, s.to - 1));
    }
    E.lastWi = wi;
    setWordIdx(wi);
    if (onWord) onWord(E.words[wi].s, E.words[wi].e, wi);
    requestSynth(idx);
    requestSynth(idx + 1);
    requestSynth(idx + 2);
    const cached = E.cache.get(idx);
    const a = ensureAudio();
    if (!cached) {
      E.waitingFor = idx;
      E.waitingSeek = seek;
      return;
    }
    E.waitingFor = -1;
    if (E.loadedIdx !== idx) {
      a.src = cached.url;
      E.loadedIdx = idx;
    }
    const applySeekAndPlay = () => {
      try {
        if (seek && typeof seek.atSec === "number") {
          a.currentTime = Math.min(seek.atSec, Math.max(0, (a.duration || 0) - 0.05));
        } else if (seek && typeof seek.atWord === "number") {
          const f = s.cum[seek.atWord - s.from] || 0;
          a.currentTime = f * (a.duration || 0);
        } else if (E.loadedIdx === idx && a.currentTime > 0 && !seek) {
          // Re-entering the same sentence without a seek: leave position.
        }
      } catch {
        /* seek is best-effort */
      }
      a.playbackRate = rateRef.current;
      if (E.wantPlay) {
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
      }
      startTracking();
    };
    if (a.readyState >= 1) applySeekAndPlay();
    else a.addEventListener("loadedmetadata", applySeekAndPlay, { once: true });
  }

  function beginAt(wi) {
    const E = getEng();
    const t = textRef.current;
    if (!t) return;
    if (!E.sentences || E.text !== t) {
      const words = splitWords(t);
      E.words = words;
      E.sentences = splitSentences(words, t);
      E.text = t;
      E.cache.clear();
      E.loadedIdx = -1;
      setWordCount(words.length);
    }
    wi = Math.max(0, Math.min(wi, E.words.length - 1));
    let si = E.sentences.findIndex((s) => wi >= s.from && wi < s.to);
    if (si < 0) si = E.sentences.length - 1;
    E.wantPlay = true;
    setStatusBoth("playing");
    playSentence(si, wi > E.sentences[si].from ? { atWord: wi } : null);
  }

  // --- public controls -----------------------------------------------------
  const startFromCurrent = useCallback(() => {
    if (!KOKORO_POSSIBLE) {
      if (onFatalError) onFatalError("unsupported-env");
      return "unsupported";
    }
    if (!text) return "empty";
    // Unlock the audio element inside the tap gesture.
    const a = ensureAudio();
    try {
      a.src = SILENT_WAV;
      const p = a.play();
      if (p && p.then) {
        p.then(() => {
          try {
            a.pause();
          } catch {
            /* noop */
          }
        }).catch(() => {});
      }
    } catch {
      /* unlocking is best-effort */
    }
    const off = Math.max(0, getStartOffset ? getStartOffset() : 0);
    const words = splitWords(text);
    let wi = words.findIndex((w) => w.e > off);
    if (wi < 0) wi = 0;
    const E = getEng();
    if (E.workerState === "ready") {
      beginAt(wi);
    } else {
      E.pendingStartWi = wi;
      E.progressDismissed = false;
      setVoiceProgress(0);
      setVoiceState("loading");
      ensureWorker();
    }
    return "ok";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, getStartOffset, ensureWorker, ensureAudio, onFatalError]);

  const toggle = useCallback(() => {
    const E = getEng();
    if (statusRef.current === "playing") {
      E.wantPlay = false;
      cancelAnimationFrame(E.raf);
      if (E.audio) {
        try {
          E.audio.pause();
        } catch {
          /* noop */
        }
      }
      setStatusBoth("paused");
      if (onWord) onWord(null, null, E.lastWi, true);
    } else if (statusRef.current === "paused") {
      E.wantPlay = true;
      setStatusBoth("playing");
      if (E.waitingFor >= 0) {
        // Still synthesizing the current sentence; playback starts on
        // arrival (playSentence checks wantPlay).
      } else if (E.audio && E.loadedIdx === E.cur) {
        const p = E.audio.play();
        if (p && p.catch) p.catch(() => {});
      } else if (E.cur >= 0) {
        playSentence(E.cur, null);
      }
      startTracking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onWord, startTracking]);

  const stop = useCallback(() => {
    const E = getEng();
    E.wantPlay = false;
    E.pendingStartWi = null;
    E.waitingFor = -1;
    cancelAnimationFrame(E.raf);
    if (E.audio) {
      try {
        E.audio.pause();
        E.audio.removeAttribute("src");
        E.audio.load();
      } catch {
        /* noop */
      }
    }
    for (const c of E.cache.values()) {
      if (c.url) URL.revokeObjectURL(c.url);
    }
    E.cache.clear();
    E.pending.clear();
    E.loadedIdx = -1;
    E.cur = -1;
    if (E.workerState === "loading") setVoiceState("idle");
    setStatusBoth("idle");
    setWordIdx(0);
    if (onWord) onWord(null);
  }, [onWord]);

  const skip = useCallback(
    (seconds) => {
      const E = getEng();
      if (!E.sentences || statusRef.current === "idle") return;
      // Build the position on the sentence timeline.
      let pos = 0;
      for (let i = 0; i < E.cur; i++) pos += estDur(i);
      const a = E.audio;
      if (a && E.loadedIdx === E.cur && a.duration > 0) {
        pos += a.currentTime || 0;
      } else if (E.waitingSeek && typeof E.waitingSeek.atSec === "number") {
        pos += E.waitingSeek.atSec;
      }
      let total = 0;
      for (let i = 0; i < E.sentences.length; i++) total += estDur(i);
      const target = Math.max(0, Math.min(total - 0.1, pos + seconds));
      let acc = 0;
      let j = 0;
      while (j < E.sentences.length - 1 && acc + estDur(j) <= target) {
        acc += estDur(j);
        j++;
      }
      const intra = target - acc;
      if (statusRef.current === "paused") {
        E.cur = j;
        E.wantPlay = false;
        playSentence(j, { atSec: intra });
        // playSentence starts audio only if wantPlay; re-pause instantly.
        if (E.audio) {
          try {
            E.audio.pause();
          } catch {
            /* noop */
          }
        }
      } else {
        E.wantPlay = true;
        playSentence(j, { atSec: intra });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [estDur]
  );

  const setRate = useCallback((r) => {
    r = Math.max(0.5, Math.min(2, r));
    rateRef.current = r;
    setRateState(r);
    const E = getEng();
    if (E.audio) E.audio.playbackRate = r;
  }, []);

  // New text: stop everything (sentences belong to the old entry).
  useEffect(() => {
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Unmount: stop and release the worker.
  useEffect(() => {
    return () => {
      const E = eng.current;
      if (E) {
        cancelAnimationFrame(E.raf);
        if (E.audio) {
          try {
            E.audio.pause();
          } catch {
            /* noop */
          }
        }
        if (E.worker) {
          try {
            E.worker.terminate();
          } catch {
            /* noop */
          }
        }
      }
    };
  }, []);

  return {
    status,
    statusRef,
    rate,
    wordIdx,
    wordCount,
    startFromCurrent,
    toggle,
    stop,
    skip,
    setRate,
    supported: KOKORO_POSSIBLE,
    voiceState,
    voiceProgress,
  };
}

// ---------------------------------------------------------------------------
// useReadAloud — dispatcher: Kokoro first, legacy Web Speech on any fatal
// failure. If a Listen tap was in flight when Kokoro failed, the legacy
// engine starts automatically so the tap still results in speech.
// ---------------------------------------------------------------------------
export function useReadAloud(args) {
  const [mode, setMode] = useState(KOKORO_POSSIBLE ? "kokoro" : "legacy");
  const [kokoroError, setKokoroError] = useState(null);
  const autoStartRef = useRef(false);
  const onFatalError = useCallback((reason) => {
    // Keep the failure reason: the player bar shows it when the device
    // voice takes over, so a fallback is never silent or mysterious.
    if (reason) setKokoroError(String(reason).slice(0, 150));
    setMode((m) => (m === "kokoro" ? "legacy" : m));
  }, []);
  const kokoro = useReadAloudKokoro({ ...args, onFatalError });
  const legacy = useReadAloudLegacy(args);

  const startFromCurrent = useCallback(() => {
    autoStartRef.current = true;
    const active = mode === "kokoro" ? kokoro : legacy;
    return active.startFromCurrent();
  }, [mode, kokoro, legacy]);

  useEffect(() => {
    if (mode === "legacy" && autoStartRef.current) {
      autoStartRef.current = false;
      legacy.startFromCurrent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  if (mode === "legacy") {
    return {
      ...legacy,
      startFromCurrent,
      voiceState: "fallback",
      voiceProgress: 100,
      kokoroError,
    };
  }
  return {
    ...kokoro,
    startFromCurrent,
    supported: kokoro.supported || legacy.supported,
    kokoroError,
  };
}

// ---------------------------------------------------------------------------
// ReadAloudBar — the persistent bottom player overlay.
// ---------------------------------------------------------------------------
// Speed control (2026-10-20): a tap-to-cycle step button instead of the old
// slider (which read as a volume control). Finer steps (2026-10-20, Joshua):
// an extra stop between every standard rate — eighth increments all the
// way, all exact binary fractions so labels stay honest.
const RATE_STEPS = [
  0.75, 0.875, 1, 1.125, 1.25, 1.375, 1.5, 1.625, 1.75, 1.875, 2,
];
const rateLabel = (r) => `${parseFloat(r.toFixed(3))}×`;
const RateGlyph = (
  <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true">
    <path d="M12 4.5 17.5 11h-11z" />
    <path d="M12 19.5 6.5 13h11z" />
  </svg>
);

export function ReadAloudBar({
  status,
  rate,
  wordIdx,
  wordCount,
  onToggle,
  onStop,
  onSkip,
  onRate,
  notice,
}) {
  const playing = status === "playing";
  const pct =
    wordCount > 0 ? Math.round((wordIdx / wordCount) * 100) : 0;
  return (
    <div
      className="ra-listen-bar"
      role="region"
      aria-label="Read aloud controls"
    >
      <div
        className="ra-listen-progress"
        aria-hidden="true"
      >
        <div
          className="ra-listen-progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      {notice ? (
        <div className="ra-listen-notice" role="note">
          {notice}
        </div>
      ) : null}
      <div className="ra-listen-row">
        <div className="ra-listen-zone ra-listen-zone-left">
          <button
            type="button"
            className="ra-listen-ratebtn"
            onClick={() => {
              const next =
                RATE_STEPS.find((s) => s > rate + 0.001) ?? RATE_STEPS[0];
              onRate(next);
            }}
            aria-label={`Reading speed ${rateLabel(rate)}. Activate to change speed.`}
          >
            {RateGlyph}
            <span>{rateLabel(rate)}</span>
          </button>
        </div>
        <div className="ra-listen-zone ra-listen-zone-center">
          <button
            type="button"
            className="ra-listen-btn ra-listen-skipbtn"
            onClick={() => onSkip(-10)}
            aria-label="Back 10 seconds"
          >
            {RewindGlyph}
          </button>
          <button
            type="button"
            className="ra-listen-btn ra-listen-play"
            onClick={onToggle}
            aria-label={playing ? "Pause reading" : "Resume reading"}
          >
            {playing ? PauseGlyph : PlayGlyph}
          </button>
          <button
            type="button"
            className="ra-listen-btn ra-listen-skipbtn"
            onClick={() => onSkip(10)}
            aria-label="Forward 10 seconds"
          >
            {ForwardGlyph}
          </button>
        </div>
        <div className="ra-listen-zone ra-listen-zone-right">
          <button
            type="button"
            className="ra-listen-btn ra-listen-stop"
            onClick={onStop}
            aria-label="Stop reading"
          >
            {StopGlyph}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReadAloudLoadingBar — shown once, while the Kokoro voice model downloads
// (a one-time fetch, cached afterwards). Reuses the player bar shell so it
// lands in exactly the place the controls are about to appear. No progress
// bar or percentage (2026-10-21): the download callbacks report per-file
// figures that jump forwards and backwards as files start, restart, and
// complete — a bar built on them lies. A plain spinner + label instead.
// ---------------------------------------------------------------------------
export function ReadAloudLoadingBar({ onCancel }) {
  return (
    <div
      className="ra-listen-bar ra-listen-loading"
      role="status"
      aria-label="Preparing voice"
    >
      <div className="ra-listen-loading-row">
        <span className="ra-listen-spinner" aria-hidden="true" />
        <span className="ra-listen-loading-text">Preparing voice…</span>
        <button
          type="button"
          className="ra-listen-btn ra-listen-stop"
          onClick={onCancel}
          aria-label="Cancel voice download"
        >
          {StopGlyph}
        </button>
      </div>
    </div>
  );
}
