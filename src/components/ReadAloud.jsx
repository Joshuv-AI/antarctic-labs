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
// useReadAloudLegacy — the Web Speech engine, and since 2026-11-10 THE
// Listen engine (see the dispatcher below). The device voice needs no
// download, no model and no network, so the first tap on Listen speaks.
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
      if (E.voice) {
        try {
          utter.voice = E.voice;
        } catch {
          /* a voice the utterance rejects must never cost the reader
             playback — fall back to the default voice */
        }
      }
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
        E2.errStreak = 0;
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
        E2.errStreak = 0;
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
        if (statusRef.current !== "playing") return;
        // A chunk that fails to speak is skipped, never surfaced: the
        // reader sees no error, playback just moves on. Only a run of
        // consecutive failures (a fundamentally broken synth) stops.
        E2.errStreak = (E2.errStreak || 0) + 1;
        if (E2.errStreak >= 3 || E2.chunkIdx + 1 >= E2.chunks.length) {
          setStatusBoth("idle");
          if (onWord) onWord(null);
          return;
        }
        const nextWi = E2.chunks[E2.chunkIdx].to;
        E2.lastWi = nextWi;
        setWordIdx(nextWi);
        speakChunk(E2.chunkIdx + 1);
      };
      synth.speak(utter);

      // One watchdog interval per utterance:
      //  - iOS Safari often never fires boundary events: until one
      //    arrives, advance the highlight on a timer (150 WPM).
      //  - Chrome stalls long utterances (~15 s, remote voices): a
      //    periodic resume() keeps the speech going.
      //  - If the browser silently dropped the utterance (nothing
      //    speaking, nothing pending, no events), restart this chunk
      //    once — silently, never with an error.
      clearTimer();
      E.chunkT0 = Date.now();
      E.lastResume = Date.now();
      E.dropped = false;
      E.timer = setInterval(() => {
        const E2 = eng.current;
        if (!E2 || E2.utter !== utter || statusRef.current !== "playing") return;
        const now = Date.now();
        if (!E2.boundarySeen) {
          const elapsed = now - E2.chunkT0;
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
        }
        if (now - E2.lastResume >= 10000) {
          E2.lastResume = now;
          try {
            synth.resume();
          } catch {
            /* noop */
          }
        }
        if (
          !E2.dropped &&
          now - E2.chunkT0 > 4000 &&
          !synth.speaking &&
          !synth.pending
        ) {
          E2.dropped = true;
          speakChunk(E2.chunkIdx);
        }
      }, 120);
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
// useReadAloud — the Listen dispatcher (2026-11-10): the device voice
// (Web Speech) is THE engine. It is built into the browser and OS, so the
// first tap on Listen speaks immediately — no model download, no
// "preparing voice" step, nothing to fail. The Kokoro on-device model
// was retired from the playback path: its one-time ~90 MB download was
// the step that kept failing for readers (Joshua, 2026-11-04), and Listen
// must simply work on the first press, with no download UI and no error
// text ever shown. (The Kokoro engine itself was deleted 2026-11-12,
// audit F12: retired code whose worker + ONNX WASM kept shipping in
// every dist — ~23.8 MB no code path could ever fetch.) Failures
// inside the device-voice engine are recovered silently (skip the
// chunk, restart a dropped utterance) — the reader never sees an
// error message.
// ---------------------------------------------------------------------------
export function useReadAloud(args) {
  const legacy = useReadAloudLegacy(args);
  return {
    ...legacy,
    voiceState: "ready",
    voiceProgress: 100,
    kokoroError: null,
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

