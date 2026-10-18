// ReaderAssist — AssistiveTouch-style floating assistant for the Tower of
// Babel full-text reader.
//
// FOUNDATION (expandable): a draggable, edge-snapping floating orb that opens
// a feature menu. Features register in FEATURES below; today there are four —
// "Search", a Ctrl+F-style find-in-page bar, "Contents", an Apple
// Books-style table of contents, "Share", an Apple share-sheet style
// panel with "Share from the Top" / "Share from Current Place" intents plus
// an optional Apple Books-style passage highlight, and "Listen", a read-aloud
// mode with a persistent bottom player bar and karaoke word-follow. Adding a
// feature later = one registry entry + one panel component (or, like Listen,
// a mode with its own overlay).
//
// The menu fans out D-pad style around the orb: up / inward-side / down /
// inward-down diagonal. Slot order follows FEATURES order.
//
// Share links: bare entry URL = from the top; ?at=<char offset> jumps the
// receiver to the sharer's scroll position; &hl=<start>-<end> additionally
// highlights the passage in Apple Books yellow (rendered by the reader in
// pages.jsx). Shared via the OS share sheet (navigator.share), falling back
// to clipboard + toast.
//
// Motion internals (2026-10-14 rewrite — feel only, zero visual/behavior change):
// - Pointer Events + setPointerCapture; 8px tap-vs-drag threshold.
// - Drag position flows: pointermove -> coalesced latest event -> target ref ->
//   ONE rAF applies translate3d. No setState in the move path, no layout reads
//   (grab origin comes from our own tracked position, never getBoundingClientRect).
// - The orb's rendered transform is ref-driven (transformRef): React's style
//   prop always mirrors the last applied value, so re-renders can never fight
//   the imperative motion (no desync jumps, no (0,0) stranding).
// - Edge snap is an rAF ease-out-cubic tween (300ms); the CSS class's transform
//   transition is neutralized inline for the tween's duration, then restored.
// - Scroll drift fix: iOS Safari fires window resize when the toolbar
//   collapses/expands on scroll. Small height-only changes pin the orb's pixel
//   position (recomputing topFrac from it); only rotations / large resizes
//   re-derive position from the stored relative position.
// - Idle fade to 40% opacity after ~2.5s (mirrors AssistiveTouch "Idle Opacity"),
//   full opacity on any interaction; prefers-reduced-motion respected (tweens
//   become instant).
// - iOS Safari: touch-action:none + -webkit-user-select/callout none on the
//   orb, pointercancel handled, act on pointerup (not click).
// - Find bar mirrors the OS find pattern: input + "N of M" counter + up/down
//   arrows + close; Enter=next, Shift+Enter=prev (wrap-around), Esc=close and
//   focus returns to the orb; all matches yellow, current match orange;
//   auto-scroll keeps the current match centered; debounced ~250ms.
// - Highlighting uses the CSS Custom Highlight API (zero DOM mutation, no
//   layout thrash on multi-MB docs); fallback marks the current match only.
//   Match offsets are computed on the raw text and mapped to rendered chunks
//   via the chunkStarts offset table, so search works across not-yet-rendered
//   chunks (navigation forces the chunk to render first).
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { extractContents } from "../lib/contents.js";
import { useReadAloud, ReadAloudBar, ListenIcon } from "./ReadAloud.jsx";

export const SUPPORTS_HIGHLIGHTS =
  typeof CSS !== "undefined" &&
  !!CSS.highlights &&
  typeof Highlight !== "undefined" &&
  typeof Range !== "undefined";

const ORB = 56; // px diameter
const MARGIN = 12; // px edge margin
const DRAG_TAP_PX = 8; // movement threshold separating tap from drag
const IDLE_MS = 2500; // idle fade delay
const DEBOUNCE_MS = 250;
const MAX_OFFSETS = 20000; // stored offsets cap; the true total is always counted
const MAX_RANGES = 1000; // cap on highlight ranges
const STORE_KEY = "tob-reader-orb-v1";
const SNAP_MS = 320; // edge-snap tween duration (matches the old CSS timing)
const TOOLBAR_WOBBLE_PX = 120; // height-only resizes below this pin the orb (iOS toolbar)

function loadPos() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (
        p &&
        (p.side === "left" || p.side === "right") &&
        typeof p.topFrac === "number" &&
        p.topFrac >= 0 &&
        p.topFrac <= 1
      ) {
        return p;
      }
    }
  } catch {
    /* private mode / unavailable — fall through to default */
  }
  return { side: "right", topFrac: 0.72 };
}

function savePos(p) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    /* non-fatal */
  }
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// Settled (edge-snapped) geometry from the persisted {side, topFrac} model.
const edgeX = (side, w) =>
  side === "left" ? MARGIN : Math.max(0, w - MARGIN - ORB);
const edgeY = (topFrac, h) =>
  Math.round(
    MARGIN + clamp(topFrac, 0, 1) * Math.max(0, h - ORB - MARGIN * 2)
  );

const MagnifierIcon = (
  <svg
    viewBox="0 0 24 24"
    width="26"
    height="26"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <line x1="16.4" y1="16.4" x2="20.6" y2="20.6" />
  </svg>
);

// Apple Books contents glyph: three horizontal bars with dots at the left
// (SF Symbols list.bullet), same stroke style as the other menu icons.
const ContentsIcon = (
  <svg
    viewBox="0 0 24 24"
    width="26"
    height="26"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="5" cy="6" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="5" cy="18" r="1.3" fill="currentColor" stroke="none" />
    <line x1="10" y1="6" x2="20" y2="6" />
    <line x1="10" y1="12" x2="20" y2="12" />
    <line x1="10" y1="18" x2="20" y2="18" />
  </svg>
);

// Classic AssistiveTouch glyph: white ring + center dot on the dark button.
// (iMore: "a dark square with a white circle"; cultofmac: "semi-transparent
// rounded rectangle with a white circle in the middle".)
const AssistiveGlyph = (
  <svg
    viewBox="0 0 24 24"
    width="26"
    height="26"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="2.4" fill="currentColor" />
  </svg>
);

// Apple share glyph (SF Symbols square.and.arrow.up), same stroke style as
// the other menu icons.
const ShareIcon = (
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
    <path d="M8 12.5V19a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 16 19v-6.5" />
    <line x1="12" y1="14.5" x2="12" y2="4" />
    <polyline points="8.2 7.8 12 4 15.8 7.8" />
  </svg>
);

// Apple Books highlighter glyph: a slanted marker pen with its band, same
// stroke style as the other menu icons. Used for the optional highlight
// toggle in the share panel.
const HighlighterIcon = (
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
    <path d="M14.7 4.1l5.2 5.2-8.6 8.6-5.9 1.7 1.7-5.9z" />
    <line x1="11.9" y1="12.9" x2="15.1" y2="16.1" />
  </svg>
);

// Share row glyphs (smaller, 22px): arrow rising to the top edge, and a
// crosshair marking the current place.
const FromTopIcon = (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="5" y1="5" x2="19" y2="5" />
    <line x1="12" y1="20" x2="12" y2="9" />
    <polyline points="8.5 12.5 12 9 15.5 12.5" />
  </svg>
);
const CurrentPlaceIcon = (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="6.5" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <line x1="12" y1="2.5" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="21.5" />
    <line x1="2.5" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="21.5" y2="12" />
  </svg>
);

// --- Feature registry: one entry per assistive feature. The orb menu renders
// these; selecting one opens its panel. --------------------------------------
const FEATURES = [
  { id: "search", label: "Search", icon: MagnifierIcon },
  { id: "contents", label: "Contents", icon: ContentsIcon },
  { id: "share", label: "Share", icon: ShareIcon },
  { id: "listen", label: "Listen", icon: ListenIcon },
];

// ---------------------------------------------------------------------------
// Ctrl+F-style find panel
// ---------------------------------------------------------------------------
function FindPanel({
  text,
  chunkStarts,
  shownChunks,
  ensureChunk,
  chunkElsRef,
  onActiveMark,
  anchorStyle,
  onClose,
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState(null); // null = nothing searched yet
  const [total, setTotal] = useState(0); // exact total across the whole open text
  const [capped, setCapped] = useState(false);
  const [active, setActive] = useState(-1);
  const [navTick, setNavTick] = useState(0);
  const inputRef = useRef(null);
  // Memoize the normalized search haystack (2026-10-18): was re-created
  // (two full-string copies) on every debounced keystroke.
  const hay = useMemo(() => text.normalize("NFC").toLowerCase(), [text]);
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );
  const qlen = query.length;

  // Reset when a different text loads (reader stays mounted across entries).
  useEffect(() => {
    setQuery("");
    setMatches(null);
    setTotal(0);
    setActive(-1);
    setCapped(false);
  }, [text]);

  useEffect(() => {
    if (inputRef.current) {
      // preventScroll: iOS Safari's auto-zoom on input focus is part of its
      // "scroll the field into view" routine — opting out stops the zoom
      // even though the input is already 16px (which alone should suffice).
      try {
        inputRef.current.focus({ preventScroll: true });
      } catch {
        inputRef.current.focus();
      }
    }
  }, []);

  // Debounced search over the raw text string of the OPEN entry only.
  // The true total is always counted exactly; only the stored offsets are
  // capped (navigation covers the first MAX_OFFSETS).
  useEffect(() => {
    if (!query) {
      setMatches(null);
      setTotal(0);
      setActive(-1);
      setCapped(false);
      return;
    }
    const t = window.setTimeout(() => {
      const needle = query.normalize("NFC").toLowerCase();
      const out = [];
      let count = 0;
      let i = hay.indexOf(needle);
      while (i !== -1) {
        if (out.length < MAX_OFFSETS) out.push(i);
        count++;
        i = hay.indexOf(needle, i + needle.length);
      }
      setCapped(count > out.length);
      setMatches(out);
      setTotal(count);
      setActive(-1);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query, text]);

  const chunkIndexOf = useCallback(
    (off) => {
      let lo = 0;
      let hi = chunkStarts.length - 1;
      let ans = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (chunkStarts[mid] <= off) {
          ans = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return ans;
    },
    [chunkStarts]
  );

  // Highlight: CSS Custom Highlight API when available (no DOM mutation);
  // otherwise mark the current match only via the reader's <mark> fallback.
  useEffect(() => {
    if (!SUPPORTS_HIGHLIGHTS) {
      if (active >= 0 && matches && matches.length > 0) {
        const off = matches[active];
        const ci = chunkIndexOf(off);
        const s = off - chunkStarts[ci];
        onActiveMark({ chunkIndex: ci, start: s, end: s + qlen });
      } else {
        onActiveMark(null);
      }
      return () => onActiveMark(null);
    }
    onActiveMark(null);
    if (!matches || matches.length === 0 || qlen === 0) {
      CSS.highlights.delete("ra-all");
      CSS.highlights.delete("ra-cur");
      return;
    }
    const hlAll = new Highlight();
    const hlCur = new Highlight();
    const paintAll = qlen >= 2; // 1-char queries: count only, skip highlight-all
    let n = 0;
    for (let k = 0; k < matches.length && n < MAX_RANGES; k++) {
      if (!paintAll && k !== active) continue;
      const off = matches[k];
      const ci = chunkIndexOf(off);
      if (ci >= shownChunks) continue; // chunk not rendered yet — skip for now
      const el = chunkElsRef.current[ci];
      const tn = el && el.firstChild;
      if (!tn || tn.nodeType !== 3) continue;
      try {
        const s = off - chunkStarts[ci];
        const e = Math.min(s + qlen, tn.length);
        if (e <= s) continue;
        const r = new Range();
        r.setStart(tn, s);
        r.setEnd(tn, e);
        (k === active ? hlCur : hlAll).add(r);
        n++;
      } catch {
        /* stale node — skip */
      }
    }
    CSS.highlights.set("ra-all", hlAll);
    CSS.highlights.set("ra-cur", hlCur);
    return () => {
      CSS.highlights.delete("ra-all");
      CSS.highlights.delete("ra-cur");
    };
  }, [
    matches,
    active,
    shownChunks,
    qlen,
    chunkIndexOf,
    chunkStarts,
    chunkElsRef,
    onActiveMark,
  ]);

  // Scroll the active match into view (forcing its chunk to render first).
  useEffect(() => {
    if (active < 0 || !matches || matches.length === 0) return;
    const off = matches[active];
    const ci = chunkIndexOf(off);
    if (ci >= shownChunks) {
      ensureChunk(ci);
      return; // effect re-runs once the chunk renders
    }
    const el = chunkElsRef.current[ci];
    if (!el) return;
    requestAnimationFrame(() => {
      let top = null;
      const tn = el.firstChild;
      if (SUPPORTS_HIGHLIGHTS && tn && tn.nodeType === 3) {
        try {
          const s = off - chunkStarts[ci];
          const r = new Range();
          r.setStart(tn, s);
          r.setEnd(tn, Math.min(s + qlen, tn.length));
          const rect = r.getBoundingClientRect();
          top = rect.top + window.scrollY - window.innerHeight * 0.42;
        } catch {
          top = null;
        }
      }
      if (top === null || Number.isNaN(top)) {
        const rect = el.getBoundingClientRect();
        top = rect.top + window.scrollY - window.innerHeight * 0.42;
      }
      window.scrollTo({
        top: Math.max(0, top),
        behavior: reduced ? "auto" : "smooth",
      });
    });
  }, [
    active,
    navTick,
    shownChunks,
    matches,
    chunkIndexOf,
    chunkStarts,
    chunkElsRef,
    ensureChunk,
    qlen,
    reduced,
  ]);

  const goTo = (dir) => {
    if (!matches || matches.length === 0) return;
    setActive((a) =>
      a < 0
        ? dir > 0
          ? 0
          : matches.length - 1
        : (a + dir + matches.length) % matches.length
    );
    setNavTick((t) => t + 1);
  };

  const countText = !query
    ? ""
    : total === 0
      ? "0 of 0"
      : active >= 0
        ? `${active + 1} of ${total.toLocaleString()}`
        : total.toLocaleString();

  return (
    <div
      className="ra-find"
      style={anchorStyle}
      role="search"
      aria-label="Search in this text"
    >
      <input
        ref={inputRef}
        className="ra-find-input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search this text"
        aria-label="Search this text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            goTo(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <span
        className="ra-find-count"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {countText}
      </span>
      <button
        type="button"
        className="ra-find-btn"
        aria-label="Previous match"
        disabled={total === 0}
        onClick={() => goTo(-1)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 14 12 8 18 14" />
        </svg>
      </button>
      <button
        type="button"
        className="ra-find-btn"
        aria-label="Next match"
        disabled={total === 0}
        onClick={() => goTo(1)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 10 12 16 18 10" />
        </svg>
      </button>
      <button
        type="button"
        className="ra-find-btn"
        aria-label="Close search"
        onClick={onClose}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Apple Books-style table of contents panel
//
// Header: the text title (bold) + an X close button. Rows: section label on
// the left, position ("12%") on the right, hairline separators. The section
// containing the current scroll position gets the gray pill highlight.
// Tapping a row smooth-scrolls the section start near the top of the viewport
// and closes the panel. Esc closes. Sections come from the extractContents
// module (imported above); the panel is never empty and never crashes.
// ---------------------------------------------------------------------------
function ContentsPanel({
  text,
  title,
  chunkStarts,
  shownChunks,
  ensureChunk,
  chunkElsRef,
  anchorStyle,
  onClose,
}) {
  const [jump, setJump] = useState(null); // {offset} — pending tap-to-jump
  const [current, setCurrent] = useState(0); // index of the section in view
  const panelRef = useRef(null);
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  // Sections are deterministic per text; if extraction ever throws on a
  // pathological text, the panel falls back to a single title section:
  // never empty, never crashes.
  const sections = useMemo(() => {
    try {
      const s = extractContents(text, title);
      if (Array.isArray(s) && s.length > 0) return s;
    } catch {
      /* pathological text — fall through to the guaranteed section */
    }
    return [{ label: title || "Contents", offset: 0, percent: 0 }];
  }, [text, title]);

  // Reset when a different text loads (reader stays mounted across entries).
  useEffect(() => {
    setJump(null);
    setCurrent(0);
  }, [text]);

  useEffect(() => {
    if (panelRef.current) {
      try {
        panelRef.current.focus({ preventScroll: true });
      } catch {
        panelRef.current.focus();
      }
    }
  }, []);

  const chunkIndexOf = useCallback(
    (off) => {
      let lo = 0;
      let hi = chunkStarts.length - 1;
      let ans = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (chunkStarts[mid] <= off) {
          ans = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return ans;
    },
    [chunkStarts]
  );

  // Tap-to-jump: map the section offset to its chunk, force the chunk to
  // render if needed (effect re-runs once it does — same retry pattern as
  // FindPanel's active-match effect), then scroll the exact section start to
  // ~12% viewport headroom and close the panel.
  useEffect(() => {
    if (!jump) return;
    const off = jump.offset;
    const ci = chunkIndexOf(off);
    if (ci >= shownChunks) {
      ensureChunk(ci);
      return; // effect re-runs once the chunk renders
    }
    const el = chunkElsRef.current[ci];
    if (!el) return;
    const headroom = window.innerHeight * 0.12;
    requestAnimationFrame(() => {
      let top = null;
      const tn = el.firstChild;
      if (tn && tn.nodeType === 3) {
        try {
          const s = Math.min(Math.max(0, off - chunkStarts[ci]), tn.length);
          const r = new Range();
          r.setStart(tn, s);
          r.setEnd(tn, s);
          top = r.getBoundingClientRect().top + window.scrollY - headroom;
        } catch {
          top = null;
        }
      }
      if (top === null || Number.isNaN(top)) {
        top = el.getBoundingClientRect().top + window.scrollY - headroom;
      }
      window.scrollTo({
        top: Math.max(0, top),
        behavior: reduced ? "auto" : "smooth",
      });
    });
    setJump(null);
    onClose();
  }, [
    jump,
    shownChunks,
    chunkIndexOf,
    chunkStarts,
    chunkElsRef,
    ensureChunk,
    reduced,
    onClose,
  ]);

  // Current-section tracking: passive scroll listener, rAF-throttled. Chunk
  // boundary tops are cached (invalidated when shownChunks changes); the probe
  // point (scrollY + ~12% viewport headroom) is binary-searched to its chunk,
  // the offset within the chunk is estimated by pixel fraction, and the
  // section is the last one starting at or before that estimate. Within ~300
  // chars of a section boundary the estimate is refined with one exact Range
  // rect — accurate highlight without layout thrash.
  useEffect(() => {
    if (sections.length === 0) return;
    let raf = 0;
    let topsCache = null;
    const HEADROOM_FRAC = 0.12;
    const REFINE_CHARS = 300;

    const boundaryTop = (secIdx) => {
      const off = sections[secIdx].offset;
      const ci = chunkIndexOf(off);
      if (ci >= shownChunks) return null;
      const el = chunkElsRef.current[ci];
      const tn = el && el.firstChild;
      if (!tn || tn.nodeType !== 3) return null;
      try {
        const s = Math.min(Math.max(0, off - chunkStarts[ci]), tn.length);
        const r = new Range();
        r.setStart(tn, s);
        r.setEnd(tn, s);
        return r.getBoundingClientRect().top + window.scrollY;
      } catch {
        return null;
      }
    };

    const compute = () => {
      raf = 0;
      if (!topsCache || topsCache.shownChunks !== shownChunks) {
        const els = chunkElsRef.current;
        const rows = [];
        for (let i = 0; i < shownChunks; i++) {
          const el = els[i];
          if (!el) continue;
          rows.push({
            ci: i,
            top: el.getBoundingClientRect().top + window.scrollY,
          });
        }
        if (rows.length === 0) return;
        topsCache = { shownChunks, rows };
      }
      const { rows } = topsCache;
      const probe = window.scrollY + window.innerHeight * HEADROOM_FRAC;
      // Chunk containing the probe (rows are ordered by chunk index).
      let lo = 0;
      let hi = rows.length - 1;
      let ri = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (rows[mid].top <= probe) {
          ri = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      const ci = rows[ri].ci;
      const top = rows[ri].top;
      const bottom =
        ri + 1 < rows.length
          ? rows[ri + 1].top
          : document.documentElement.scrollHeight;
      const chunkEnd =
        chunkStarts[ci + 1] !== undefined ? chunkStarts[ci + 1] : text.length;
      const chunkLen = Math.max(1, chunkEnd - chunkStarts[ci]);
      const frac = clamp((probe - top) / Math.max(1, bottom - top), 0, 1);
      const estOff = chunkStarts[ci] + frac * chunkLen;
      // Last section with offset <= estimate.
      let slo = 0;
      let shi = sections.length - 1;
      let si = 0;
      while (slo <= shi) {
        const mid = (slo + shi) >> 1;
        if (sections[mid].offset <= estOff) {
          si = mid;
          slo = mid + 1;
        } else {
          shi = mid - 1;
        }
      }
      // Refine near a boundary with one exact Range rect.
      if (
        si + 1 < sections.length &&
        sections[si + 1].offset - estOff < REFINE_CHARS
      ) {
        const bTop = boundaryTop(si + 1);
        if (bTop !== null && bTop <= probe) si = si + 1;
      } else if (si > 0 && estOff - sections[si].offset < REFINE_CHARS) {
        const bTop = boundaryTop(si);
        if (bTop !== null && bTop > probe) si = si - 1;
      }
      setCurrent((prev) => (prev === si ? prev : si));
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    compute();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [sections, shownChunks, chunkStarts, chunkIndexOf, chunkElsRef, text]);

  // Same orb-anchored left/width as the find panel, but pull the top up when
  // the tall panel would otherwise run past the viewport bottom (max-height
  // is min(70vh, 480px) — see .ra-contents in styles.css).
  const style = useMemo(() => {
    const vh = window.innerHeight;
    const maxH = Math.min(vh * 0.7, 480);
    const top = Math.min(anchorStyle.top, Math.max(12, vh - maxH - 12));
    return { ...anchorStyle, top: Math.round(Math.max(12, top)) };
  }, [anchorStyle]);

  return (
    <div
      ref={panelRef}
      className="ra-contents"
      style={style}
      role="dialog"
      aria-label={title ? `Contents of ${title}` : "Contents"}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="ra-contents-header">
        <h2 className="ra-contents-title">{title}</h2>
        <button
          type="button"
          className="ra-contents-close"
          aria-label="Close contents"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>
      <ul className="ra-contents-list">
        {sections.map((s, i) => {
          const pct =
            typeof s.percent === "number" && Number.isFinite(s.percent)
              ? s.percent
              : text.length > 0
                ? (s.offset / text.length) * 100
                : 0;
          return (
            <li key={i}>
              <button
                type="button"
                className={
                  "ra-contents-row" + (i === current ? " is-active" : "")
                }
                aria-current={i === current ? "true" : undefined}
                onClick={() => setJump({ offset: s.offset })}
              >
                <span className="ra-contents-label">{s.label}</span>
                <span className="ra-contents-pos">{Math.round(pct)}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Share panel — Apple share-sheet style.
//
// Two intents: "Share from the Top" shares the bare entry URL; "Share from
// Current Place" appends ?at=<char offset> captured from the sharer's scroll
// position (probe at ~12% viewport headroom, mapped to a global offset via
// the rendered chunk tops — the same technique ContentsPanel uses for
// current-section tracking), so the receiver lands exactly where the sharer
// was reading.
//
// Optional highlight (Apple Books-style marker toggle): when ON, the
// sharer's live text selection inside the reader is captured and embedded as
// &hl=<start>-<end>; the receiver scrolls there and sees the passage
// highlighted in Apple Books yellow. No selection = position-only share plus
// a hint toast. Sharing goes through the OS share sheet (navigator.share)
// with a minimal message; where the API is unavailable the link is copied
// to the clipboard with a toast instead.
// ---------------------------------------------------------------------------
const MAX_HL_CHARS = 20000; // cap so a huge selection can't bloat the URL

// Global char offset of a (node, offset) selection point inside the reader.
// Shared by the share panel and the highlight-capture pill.
const pointGlobal = (node, off, chunkElsRef, chunkStarts) => {
  const host = node.nodeType === 1 ? node : node.parentElement;
  const chunkEl = host && host.closest(".tower-reader-chunk");
  if (!chunkEl) return null;
  const ci = chunkElsRef.current.indexOf(chunkEl);
  if (ci < 0 || ci >= chunkStarts.length) return null;
  try {
    const r = document.createRange();
    r.setStart(chunkEl, 0);
    r.setEnd(node, off);
    return chunkStarts[ci] + r.toString().length;
  } catch {
    return null;
  }
};

// The user's current text selection as global {start, end}, or null when
// there is no usable selection inside the reader text.
const selectionOffsets = (chunkElsRef, chunkStarts, text) => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const reader = document.querySelector(".tower-reader-text");
  const range = sel.getRangeAt(0);
  if (!reader || !reader.contains(range.commonAncestorContainer))
    return null;
  const a = pointGlobal(range.startContainer, range.startOffset, chunkElsRef, chunkStarts);
  const b = pointGlobal(range.endContainer, range.endOffset, chunkElsRef, chunkStarts);
  if (a === null || b === null || b <= a) return null;
  const start = clamp(a, 0, text.length);
  const end = Math.min(clamp(b, 0, text.length), start + MAX_HL_CHARS);
  return { start, end };
};

// ---------------------------------------------------------------------------
// Highlight-capture pill — minimal dark frosted pill (same language as the
// find UI). Opens when the user taps "Highlight a passage" in the share
// panel: the panel gets out of the way so text can be selected freely,
// especially on mobile. The live selection is tracked via selectionchange
// (robust on mobile, where tapping Done can collapse the selection); Done
// saves the last captured passage and returns to the share panel.
// ---------------------------------------------------------------------------
function HighlightPill({
  text,
  chunkStarts,
  chunkElsRef,
  anchorStyle,
  savedCount,
  onAdd,
  onDone,
  onCancel,
}) {
  const [pending, setPending] = useState(null); // {start,end} | null
  const [hint, setHint] = useState(false);
  const hintTimer = useRef(0);

  useEffect(() => {
    const update = () => {
      setPending(selectionOffsets(chunkElsRef, chunkStarts, text));
    };
    update();
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [chunkElsRef, chunkStarts, text]);

  useEffect(() => () => window.clearTimeout(hintTimer.current), []);

  // Suppress the iOS native selection callout (Copy/Lookup/Share) while
  // capturing — it pops up over our pill and blocks it. -webkit-touch-callout
  // disables the menu without affecting text selection itself.
  useEffect(() => {
    document.body.classList.add("ra-hl-capturing");
    return () => document.body.classList.remove("ra-hl-capturing");
  }, []);

  const chars = pending ? pending.end - pending.start : 0;

  const add = () => {
    if (!pending) {
      setHint(true);
      window.clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setHint(false), 2200);
      return;
    }
    onAdd(pending);
    // Clear the selection so the next passage starts fresh.
    try {
      window.getSelection()?.removeAllRanges();
    } catch {}
    setPending(null);
  };

  const done = () => {
    // If there's a pending selection, add it first, then finish.
    if (pending) onAdd(pending);
    onDone();
  };

  return (
    <div
      className="ra-hlmode"
      style={anchorStyle}
      role="dialog"
      aria-label="Highlight a passage"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <span className="ra-hlmode-label" aria-live="polite">
        {pending ? (
          <>
            <span className="ra-hlmode-check" aria-hidden="true">✓</span>
            {chars.toLocaleString()} chars selected
          </>
        ) : (
          "Select a passage"
        )}
        {savedCount > 0 && (
          <span className="ra-hlmode-saved" aria-label={`${savedCount} passages saved`}>
            {savedCount} saved
          </span>
        )}
      </span>
      <button type="button" className="ra-hlmode-btn" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className="ra-hlmode-btn"
        onClick={add}
        disabled={!pending}
      >
        Add
      </button>
      <button
        type="button"
        className="ra-hlmode-btn ra-hlmode-done"
        onClick={done}
        disabled={savedCount === 0 && !pending}
      >
        Done
      </button>
      {hint && (
        <div className="ra-toast" role="status" aria-live="polite">
          Select some text first, then tap Add.
        </div>
      )}
    </div>
  );
}

function SharePanel({
  text,
  title,
  chunkStarts,
  shownChunks,
  chunkElsRef,
  anchorStyle,
  savedHls,
  onHighlightStart,
  onClearHl,
  onClose,
}) {
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(0);
  const panelRef = useRef(null);

  useEffect(() => {
    if (panelRef.current) {
      try {
        panelRef.current.focus({ preventScroll: true });
      } catch {
        panelRef.current.focus();
      }
    }
  }, []);

  useEffect(
    () => () => window.clearTimeout(toastTimer.current),
    []
  );

  const flash = (msg) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  };

  // Global char offset at the read probe (~12% viewport headroom). Rendered
  // chunks are always contiguous from 0, so pixel tops binary-search cleanly.
  const probeOffset = useCallback(() => {
    const probe = window.scrollY + window.innerHeight * 0.12;
    const els = chunkElsRef.current;
    let ci = 0;
    let top = 0;
    let nextTop = Infinity;
    for (let i = 0; i < shownChunks; i++) {
      const el = els[i];
      if (!el) continue;
      const t = el.getBoundingClientRect().top + window.scrollY;
      if (t <= probe) {
        ci = i;
        top = t;
      } else {
        nextTop = t;
        break;
      }
    }
    if (nextTop === Infinity)
      nextTop = document.documentElement.scrollHeight;
    const chunkEnd =
      chunkStarts[ci + 1] !== undefined ? chunkStarts[ci + 1] : text.length;
    const frac = clamp(
      (probe - top) / Math.max(1, nextTop - top),
      0,
      1
    );
    return Math.round(
      chunkStarts[ci] + frac * Math.max(0, chunkEnd - chunkStarts[ci])
    );
  }, [chunkStarts, shownChunks, chunkElsRef, text]);

  // The sharer's current position as a percentage, computed once while the
  // panel is open (shown under "Share from Current Place").
  const [pct] = useState(() =>
    Math.round((probeOffset() / Math.max(1, text.length)) * 100)
  );

  const entryUrl = () =>
    window.location.origin + window.location.pathname;

  const doShare = async ({ url, message }) => {
    const data = { title: title || "Tower of Babel", text: message, url };
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      onClose();
      try {
        await navigator.share(data);
      } catch {
        /* dismissed — silent */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${message}\n${url}`);
      flash("Link copied — paste it anywhere.");
    } catch {
      flash("Copy didn't work — long-press the address bar to copy the link.");
    }
  };

  const shareFromTop = () => {
    doShare({
      url: entryUrl(),
      message: `"${title}" — read the full text free in the Tower of Babel`,
    });
  };

  const shareFromCurrent = () => {
    const at = clamp(probeOffset(), 0, Math.max(0, text.length - 1));
    // The highlights were captured beforehand via the highlight-capture pill
    // (savedHls) — no live selection needed at share time. Multiple ranges
    // are comma-separated: &hl=s1-e1,s2-e2
    const hlParam =
      savedHls && savedHls.length > 0
        ? `&hl=${savedHls.map((h) => `${h.start}-${h.end}`).join(",")}`
        : "";
    doShare({
      url: `${entryUrl()}?at=${at}${hlParam}`,
      message: `"${title}" — jumping you right to where I was, in the Tower of Babel`,
    });
    onClearHl();
  };

  return (
    <div
      ref={panelRef}
      className="ra-share"
      style={anchorStyle}
      role="dialog"
      aria-label={title ? `Share ${title}` : "Share this text"}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="ra-share-header">
        <h2 className="ra-share-title">Share</h2>
        <button
          type="button"
          className="ra-share-close"
          aria-label="Close share"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>
      <button type="button" className="ra-share-row" onClick={shareFromTop}>
        <span className="ra-share-row-icon" aria-hidden="true">
          {FromTopIcon}
        </span>
        <span className="ra-share-row-text">
          <span className="ra-share-row-title">Share from the Top</span>
          <span className="ra-share-row-sub">Start at the beginning</span>
        </span>
      </button>
      <button type="button" className="ra-share-row" onClick={shareFromCurrent}>
        <span className="ra-share-row-icon" aria-hidden="true">
          {CurrentPlaceIcon}
        </span>
        <span className="ra-share-row-text">
          <span className="ra-share-row-title">Share from Current Place</span>
          <span className="ra-share-row-sub">
            You&rsquo;re at {pct}% — jumps right here
          </span>
        </span>
      </button>
      <div className="ra-share-row ra-share-hl">
        <button
          type="button"
          className="ra-share-hl-main"
          aria-label={
            savedHls && savedHls.length > 0
              ? "Add more highlighted passages"
              : "Highlight a passage when sharing from your current place"
          }
          onClick={onHighlightStart}
        >
          <span className="ra-share-row-icon" aria-hidden="true">
            {HighlighterIcon}
          </span>
          <span className="ra-share-row-text">
            <span className="ra-share-row-title">
              {savedHls && savedHls.length > 0
                ? `${savedHls.length} passage${savedHls.length > 1 ? "s" : ""} highlighted ✓`
                : "Highlight a passage"}
            </span>
            <span className="ra-share-row-sub">
              {savedHls && savedHls.length > 0
                ? "Tap to add more"
                : "Optional — select text, then share"}
            </span>
          </span>
        </button>
        {savedHls && savedHls.length > 0 && (
          <button
            type="button"
            className="ra-share-hl-clear"
            aria-label="Remove the highlighted passage"
            onClick={onClearHl}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        )}
      </div>
      {toast && (
        <div className="ra-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The orb + menu + panel shell
// ---------------------------------------------------------------------------
export default function ReaderAssist({
  text,
  title,
  chunkStarts,
  shownChunks,
  ensureChunk,
  chunkElsRef,
  onActiveMark,
}) {
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 390,
    h: typeof window !== "undefined" ? window.innerHeight : 844,
  }));
  const [pos, setPos] = useState(loadPos); // {side, topFrac} — settled/persisted model
  const [dragging, setDragging] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [idle, setIdle] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState(null); // null | feature id
  // Highlight-for-share: savedHl is the captured {start,end} passage (lives
  // here so it survives the share panel unmounting during capture);
  // hlMode shows the minimal capture pill instead of any panel.
  // savedHls is an array of {start,end} — multiple highlights per share.
  const [savedHls, setSavedHls] = useState([]);
  const [hlMode, setHlMode] = useState(false);
  const orbRef = useRef(null);

  // --- Read-aloud word-follow highlighting ---------------------------------
  // Two fixed-position overlays (no text DOM mutation): a soft highlight
  // pill over the spoken word + a small "bouncy ball" dot that hops above it.
  // Positioned from the word's bounding rect each time the engine reports a
  // new word (global char offsets -> chunk -> text node -> Range).
  const speakHlRef = useRef(null);
  const speakBallRef = useRef(null);
  // Manual-scroll detection during Listen (2026-10-18): if the user scrolls
  // while audio plays, auto-scroll yields for 2.5s so it never fights them.
  const userScrolledAt = useRef(0);
  const autoScrolling = useRef(false);
  const speakBallTick = useRef(0);

  const clearSpeakHl = useCallback(() => {
    if (speakHlRef.current) speakHlRef.current.style.opacity = "0";
    if (speakBallRef.current) speakBallRef.current.style.opacity = "0";
  }, []);

  const showSpeakWord = useCallback(
    (gStart, gEnd) => {
      if (gStart == null || gEnd == null) {
        clearSpeakHl();
        return;
      }
      // Chunk containing gStart (chunkStarts is sorted).
      let ci = 0;
      for (let i = 0; i < chunkStarts.length; i++) {
        if (chunkStarts[i] <= gStart) ci = i;
        else break;
      }
      const chunkEl = chunkElsRef.current && chunkElsRef.current[ci];
      if (!chunkEl) {
        clearSpeakHl();
        return;
      }
      const local = gStart - chunkStarts[ci];
      const localEnd = gEnd - chunkStarts[ci];
      // Walk text nodes to the one containing `local`.
      const walker = document.createTreeWalker(chunkEl, NodeFilter.SHOW_TEXT);
      let node = null;
      let acc = 0;
      let n;
      while ((n = walker.nextNode())) {
        const len = n.textContent.length;
        if (acc + len > local) {
          node = n;
          break;
        }
        acc += len;
      }
      if (!node) {
        clearSpeakHl();
        return;
      }
      let range;
      try {
        range = document.createRange();
        const sOff = Math.max(0, Math.min(local - acc, node.textContent.length));
        const eOff = Math.max(
          sOff,
          Math.min(localEnd - acc, node.textContent.length)
        );
        range.setStart(node, sOff);
        range.setEnd(node, eOff);
      } catch {
        clearSpeakHl();
        return;
      }
      const rect = range.getBoundingClientRect();
      if (!rect || rect.width === 0) {
        clearSpeakHl();
        return;
      }
      // Highlight pill over the word.
      const hl = speakHlRef.current;
      if (hl) {
        hl.style.opacity = "1";
        hl.style.transform = `translate(${rect.left - 3}px, ${rect.top - 2}px)`;
        hl.style.width = `${rect.width + 6}px`;
        hl.style.height = `${rect.height + 4}px`;
      }
      // Bouncy ball: hop above the word, re-trigger the bounce each word.
      const ball = speakBallRef.current;
      if (ball) {
        const bx = rect.left + rect.width / 2 - 5;
        const by = rect.top - 16;
        ball.style.opacity = "1";
        ball.style.transform = `translate(${bx}px, ${by}px)`;
        // Restart the hop animation.
        ball.classList.remove("ra-speak-hop");
        void ball.offsetWidth;
        ball.classList.add("ra-speak-hop");
      }
      // Gentle auto-scroll: keep the spoken word in the middle band.
      // Yields to manual scrolling — if the user scrolled in the last 2.5s,
      // skip auto-scroll so it never fights their finger (2026-10-18).
      const vh = window.innerHeight;
      if (rect.top < vh * 0.22 || rect.bottom > vh * 0.78) {
        if (Date.now() - userScrolledAt.current > 2500) {
          try {
            const y = window.scrollY + rect.top - vh * 0.42;
            autoScrolling.current = true;
            window.scrollTo({ top: y, behavior: "smooth" });
            setTimeout(() => { autoScrolling.current = false; }, 600);
          } catch {
            /* noop */
          }
        }
      }
    },
    [chunkStarts, chunkElsRef, clearSpeakHl]
  );

  const handleSpeakWord = useCallback(
    (gStart, gEnd) => {
      showSpeakWord(gStart, gEnd);
    },
    [showSpeakWord]
  );

  // Current reading position as a global char offset (probe at ~12% viewport
  // headroom — the same "where I was reading" the share feature uses).
  const speakStartOffset = useCallback(() => {
    if (!text) return 0;
    // Use the browser's hit-testing to find the exact text under the
    // viewport's reading position (2026-10-18): far more reliable than
    // interpolating within chunk heights, which jumped to random spots.
    const x = window.innerWidth / 2;
    const y = window.innerHeight * 0.35;
    let range = null;
    try {
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(x, y);
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        if (pos && pos.offsetNode) {
          range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
        }
      }
    } catch {
      range = null;
    }
    if (range) {
      // Walk up to find which chunk element contains this point.
      const els = chunkElsRef.current;
      let node = range.startContainer;
      // If it's a text node, get its parent element.
      let el = node.nodeType === 3 ? node.parentElement : node;
      // Walk up to find the chunk <p>.
      while (el && els) {
        const ci = els.indexOf(el);
        if (ci >= 0 && ci < shownChunks) {
          // Found the chunk. Compute offset within the chunk's text.
          const chunkEl = els[ci];
          const preRange = document.createRange();
          preRange.selectNodeContents(chunkEl);
          preRange.setEnd(range.startContainer, range.startOffset);
          const localOff = preRange.toString().length;
          return Math.min(
            text.length,
            Math.max(0, chunkStarts[ci] + localOff)
          );
        }
        el = el.parentElement;
      }
      // Point didn't hit a chunk (e.g., header area) — fall through to
      // the chunk-scan fallback below.
    }
    // Fallback: scan chunks for the one containing the probe (old logic,
    // kept for browsers without caret hit-testing).
    const probe = window.scrollY + window.innerHeight * 0.35;
    const els = chunkElsRef.current;
    let ci = 0;
    let top = 0;
    let nextTop = Infinity;
    let firstTop = Infinity;
    for (let i = 0; i < shownChunks; i++) {
      const el = els[i];
      if (!el) continue;
      const t = el.getBoundingClientRect().top + window.scrollY;
      if (t < firstTop) firstTop = t;
      if (t <= probe) {
        ci = i;
        top = t;
      } else {
        nextTop = t;
        break;
      }
    }
    // If the probe is above the first chunk (user hasn't scrolled to text
    // yet), start from the beginning — don't interpolate from page top.
    if (probe < firstTop) return 0;
    if (nextTop === Infinity)
      nextTop = document.documentElement.scrollHeight;
    const chunkEnd =
      chunkStarts[ci + 1] !== undefined ? chunkStarts[ci + 1] : text.length;
    const frac = Math.max(
      0,
      Math.min(1, (probe - top) / Math.max(1, nextTop - top))
    );
    return Math.round(
      chunkStarts[ci] + frac * Math.max(0, chunkEnd - chunkStarts[ci])
    );
  }, [chunkStarts, shownChunks, chunkElsRef, text]);

  const readAloud = useReadAloud({
    text,
    getStartOffset: speakStartOffset,
    chunkElsRef,
    chunkStarts,
    onWord: handleSpeakWord,
  });
  const listening = readAloud.status !== "idle";

  // Track manual scrolls during Listen (2026-10-18): distinguishes the user's
  // finger from our own auto-scroll so showSpeakWord can yield.
  useEffect(() => {
    if (!listening) return;
    const onScroll = () => {
      if (!autoScrolling.current) userScrolledAt.current = Date.now();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [listening]);

  // Hide the Listen icon when speech synthesis is unavailable.
  const visibleFeatures = useMemo(
    () =>
      readAloud.supported
        ? FEATURES
        : FEATURES.filter((f) => f.id !== "listen"),
    [readAloud.supported]
  );

  // New text (entry navigation): the saved passage and capture mode belong
  // to the previous entry — reset cleanly.
  useEffect(() => {
    setSavedHls([]);
    setHlMode(false);
  }, [text]);

  // --- Motion internals: refs only. Nothing here re-renders. ---
  const vpRef = useRef(viewport); // cached viewport for clamp math (move path)
  const posRef = useRef(pos); // mirror of the settled {side, topFrac} model
  const nowRef = useRef({
    x: edgeX(pos.side, viewport.w),
    y: edgeY(pos.topFrac, viewport.h),
  }); // last applied orb top-left, px
  const transformRef = useRef(
    `translate3d(${nowRef.current.x}px, ${nowRef.current.y}px, 0)`
  ); // exact string rendered — always mirrors the DOM, so React never fights it
  const dragRef = useRef(null); // active gesture {id,sx,sy,ox,oy,moved}
  const dragTarget = useRef(null); // latest desired position during drag
  const dragRaf = useRef(0); // pending drag frame id
  const tweenRef = useRef(null); // active snap tween {raf}
  const idleTimer = useRef(0);
  const reducedRef = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // Single writer for the orb's position: DOM transform + both refs stay in
  // sync, so a later React re-render writes the identical string (a no-op).
  const applyPos = (x, y) => {
    const t = `translate3d(${x}px, ${y}px, 0)`;
    transformRef.current = t;
    nowRef.current = { x, y };
    const el = orbRef.current;
    if (el) el.style.transform = t;
  };

  const cancelTween = () => {
    const tw = tweenRef.current;
    if (tw) {
      cancelAnimationFrame(tw.raf);
      tweenRef.current = null;
    }
    // Restore the class-driven transition (it was neutralized for the tween).
    const el = orbRef.current;
    if (el) el.style.transition = "";
    setSnapping(false);
  };

  // rAF edge-snap tween (ease-out cubic). One mechanism owns the motion: the
  // .is-snapping class keeps its visual side effects (flat material, no blur)
  // but its transform transition is neutralized inline for the duration.
  const runTween = (toX, toY, onDone) => {
    cancelTween();
    const from = nowRef.current;
    const dx = toX - from.x;
    const dy = toY - from.y;
    if (reducedRef.current || Math.hypot(dx, dy) < 1) {
      applyPos(toX, toY);
      onDone();
      return;
    }
    setSnapping(true);
    const el = orbRef.current;
    if (el) el.style.transition = "opacity 0.35s ease";
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / SNAP_MS);
      const ez = 1 - Math.pow(1 - k, 3); // easeOutCubic
      applyPos(from.x + dx * ez, from.y + dy * ez);
      if (k < 1) {
        tweenRef.current.raf = requestAnimationFrame(step);
      } else {
        tweenRef.current = null;
        if (el) el.style.transition = "";
        setSnapping(false);
        onDone();
      }
    };
    tweenRef.current = { raf: requestAnimationFrame(step) };
  };

  // --- Viewport: cached for the move path; toolbar wobble pinned. ---
  useEffect(() => {
    const onViewport = (w, h) => {
      const prev = vpRef.current;
      if (w === prev.w && h === prev.h) return;
      vpRef.current = { w, h };
      setViewport({ w, h }); // menu/panel anchors re-derive from state
      if (dragRef.current) return; // mid-drag: keep the gesture, clamp to new bounds
      cancelTween();
      const p = posRef.current;
      const cur = nowRef.current;
      const aspectFlipped = (prev.w > prev.h) !== (w > h);
      if (aspectFlipped || Math.abs(w - prev.w) > TOOLBAR_WOBBLE_PX) {
        // Genuine rotation / large resize: keep the stored relative position.
        const nx = edgeX(p.side, w);
        const ny = edgeY(p.topFrac, h);
        applyPos(nx, ny);
      } else {
        // Toolbar show/hide (iOS scroll) or keyboard wobble: pin the orb where
        // it is — this is the scroll-drift fix. topFrac is recomputed from the
        // pinned pixel position so the persisted model stays truthful.
        const side = cur.x + ORB / 2 < w / 2 ? "left" : "right";
        const nx = edgeX(side, w);
        const ny = clamp(cur.y, 0, Math.max(0, h - ORB));
        const topFrac = clamp(
          (ny - MARGIN) / Math.max(1, h - ORB - MARGIN * 2),
          0,
          1
        );
        applyPos(nx, ny);
        const next = { side, topFrac };
        posRef.current = next;
        setPos(next);
        savePos(next);
      }
    };
    const onR = () => onViewport(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", onR);
    window.addEventListener("orientationchange", onR);
    return () => {
      window.removeEventListener("resize", onR);
      window.removeEventListener("orientationchange", onR);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Idle fade ------------------------------------------------------------
  const poke = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  useEffect(() => {
    if (menuOpen || panel || hlMode) {
      window.clearTimeout(idleTimer.current);
      setIdle(false);
    } else {
      poke();
    }
    return () => window.clearTimeout(idleTimer.current);
  }, [menuOpen, panel, hlMode, poke]);

  // --- Pointer gesture ------------------------------------------------------
  // Single rAF consumes the latest pointer position; at most one frame is ever
  // pending, so a burst of pointermoves collapses into one transform write.
  const ensureDragRaf = () => {
    if (dragRaf.current) return;
    dragRaf.current = requestAnimationFrame(() => {
      dragRaf.current = 0;
      const t = dragTarget.current;
      if (t) applyPos(t.x, t.y);
    });
  };

  const onPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (dragRef.current) return; // second finger while dragging: ignore (bug fix)
    poke();
    // Grab from our own tracked position (mid-tween grabs included): the
    // rendered style prop already mirrors it, so no jump and no layout read.
    const cur = nowRef.current;
    cancelTween();
    try {
      orbRef.current.setPointerCapture(e.pointerId);
    } catch {
      /* not critical */
    }
    dragRef.current = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      ox: cur.x,
      oy: cur.y,
      moved: false,
    };
    dragTarget.current = { x: cur.x, y: cur.y };
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.id) return;
    // Coalesce: act on the latest event in the frame's batch only.
    const native = e.nativeEvent || e;
    const evts =
      typeof native.getCoalescedEvents === "function"
        ? native.getCoalescedEvents()
        : null;
    const last = evts && evts.length ? evts[evts.length - 1] : e;
    const dx = last.clientX - d.sx;
    const dy = last.clientY - d.sy;
    if (!d.moved) {
      if (Math.hypot(dx, dy) <= DRAG_TAP_PX) return;
      d.moved = true;
      setDragging(true);
    }
    const vp = vpRef.current;
    const nx = clamp(d.ox + dx, 0, Math.max(0, vp.w - ORB));
    const ny = clamp(d.oy + dy, 0, Math.max(0, vp.h - ORB));
    // No sub-pixel gate: on 3x screens a 0.5px threshold is 1.5 device px of
    // stick-then-jump on slow drags. rAF coalescing already bounds us to one
    // DOM write per frame; fractional translate3d is free on the compositor.
    dragTarget.current = { x: nx, y: ny };
    ensureDragRaf();
  };

  const finishPointer = (e, cancelled) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.id) return;
    dragRef.current = null;
    // Flush the very latest target before snapping so release is exact —
    // a pointermove may have landed after the last rAF fired.
    const pending = dragTarget.current;
    dragTarget.current = null;
    if (dragRaf.current) {
      cancelAnimationFrame(dragRaf.current);
      dragRaf.current = 0;
    }
    if (d.moved && !cancelled && pending) applyPos(pending.x, pending.y);
    setDragging(false);
    const vp = vpRef.current;
    if (d.moved && !cancelled) {
      // Land on the latest applied position, then snap to the nearest edge,
      // preserving the along-edge position. State updates only AFTER the
      // tween completes, so React's style prop (mirroring transformRef) never
      // fights the animation mid-flight.
      const cur = nowRef.current;
      const side = cur.x + ORB / 2 < vp.w / 2 ? "left" : "right";
      const tx = edgeX(side, vp.w);
      const ty = edgeY(
        clamp((cur.y - MARGIN) / Math.max(1, vp.h - ORB - MARGIN * 2), 0, 1),
        vp.h
      );
      const topFrac = clamp(
        (ty - MARGIN) / Math.max(1, vp.h - ORB - MARGIN * 2),
        0,
        1
      );
      const next = { side, topFrac };
      runTween(tx, ty, () => {
        posRef.current = next;
        setPos(next);
        savePos(next);
      });
    } else if (cancelled) {
      // Cancelled mid-drag: glide back to the grab origin (== settled pos).
      runTween(Math.round(d.ox), Math.round(d.oy), () => {});
    } else {
      // Tap: the DOM transform is exactly what React rendered — untouched.
      if (hlMode) {
        // Tapping the orb during highlight capture cancels capture mode.
        setHlMode(false);
      } else if (panel) {
        setPanel(null);
      } else {
        setMenuOpen((v) => !v);
      }
    }
    poke();
  };

  const onLostPointerCapture = (e) => {
    const d = dragRef.current;
    if (d && e.pointerId === d.id) finishPointer(e, true);
  };

  // Tap-outside + Escape dismiss the menu (AssistiveTouch behavior).
  useEffect(() => {
    if (!menuOpen) return;
    const onDocDown = (e) => {
      if (e.target.closest && e.target.closest(".ra-menu-item, #ra-orb")) return;
      setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Full teardown: frames, tweens, timers, listeners.
  useEffect(() => {
    return () => {
      if (dragRaf.current) cancelAnimationFrame(dragRaf.current);
      const tw = tweenRef.current;
      if (tw) cancelAnimationFrame(tw.raf);
      window.clearTimeout(idleTimer.current);
    };
  }, []);

  const orbX = edgeX(pos.side, viewport.w);
  const orbY = edgeY(pos.topFrac, viewport.h);
  const cx = orbX + ORB / 2;
  const cy = orbY + ORB / 2;

  // Fan-out menu: feature icons orbit the orb D-pad style — up, inward-side,
  // down, in FEATURES order. When the orb is parked too close to the top or
  // bottom edge for a straight slot, that icon swings to an inward diagonal
  // so it never clamps onto the orb. Every icon stays inside the viewport.
  const fanItems = useMemo(() => {
    const R = 26; // fan item radius (52px circle)
    const d = ORB / 2 + 16 + R; // center distance from the orb center
    const inward = cx > viewport.w / 2 ? -1 : 1; // away from the snapped edge
    const minC = R + 10;
    const maxX = Math.max(minC, viewport.w - R - 10);
    const maxY = Math.max(minC, viewport.h - R - 10);
    const slots = [
      { dx: 0, dy: -1 }, // up
      { dx: inward, dy: 0 }, // inward side
      { dx: 0, dy: 1 }, // down
      // 4th: inward-down diagonal (2026-10-18). D-pad style — sits 45° between
      // the inward and down slots, clear of both. Inward (away from the snapped
      // edge) always has room, so it never clamps onto the orb.
      { dx: inward * 0.72, dy: 0.72 },
    ];
    return visibleFeatures.map((f, i) => {
      const s = slots[i % slots.length];
      let x = cx + s.dx * d;
      let y = cy + s.dy * d;
      if (s.dy !== 0) {
        const clampedY = clamp(y, minC, maxY);
        if (Math.abs(clampedY - cy) < d * 0.7) {
          // Orb hugging the top/bottom edge: swing to the inward diagonal.
          x = cx + inward * d * 0.72;
          y = cy + s.dy * d * 0.72;
        } else {
          y = clampedY;
        }
      }
      x = clamp(x, minC, maxX);
      y = clamp(y, minC, maxY);
      return {
        ...f,
        left: Math.round(x - R),
        top: Math.round(y - R),
        delay: i * 45,
      };
    });
  }, [cx, cy, viewport, visibleFeatures]);

  const panelStyle = useMemo(() => {
    const pw = Math.min(372, viewport.w - 24);
    const ph = 64;
    let left = cx > viewport.w / 2 ? cx - ORB / 2 - 12 - pw : cx + ORB / 2 + 12;
    left = clamp(left, 12, Math.max(12, viewport.w - pw - 12));
    const top = clamp(cy - ph / 2, 76, Math.max(76, viewport.h - ph - 12));
    return { left: Math.round(left), top: Math.round(top), width: pw };
  }, [cx, cy, viewport]);

  const orbClass =
    "ra-orb" +
    (dragging ? " is-dragging" : "") +
    (snapping ? " is-snapping" : "") +
    (idle && !menuOpen && !panel && !hlMode ? " is-idle" : "");

  return createPortal(
    <div className="ra-root" aria-hidden={false}>
      <div
        ref={orbRef}
        id="ra-orb"
        className={orbClass}
        style={{ transform: transformRef.current }}
        role="button"
        tabIndex={0}
        aria-label="Reading tools"
        aria-expanded={menuOpen}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finishPointer(e, false)}
        onPointerCancel={(e) => finishPointer(e, true)}
        onLostPointerCapture={onLostPointerCapture}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (hlMode) setHlMode(false);
            else if (panel) setPanel(null);
            else setMenuOpen((v) => !v);
          }
        }}
      >
        {AssistiveGlyph}
      </div>

      {menuOpen && (
        <div className="ra-fan" role="menu" aria-label="Reading tools">
          {fanItems.map((f) => (
            <button
              key={f.id}
              type="button"
              className="ra-menu-item"
              role="menuitem"
              aria-label={`${f.label} this text`}
              style={{
                left: f.left,
                top: f.top,
                animationDelay: `${f.delay}ms`,
              }}
              onClick={() => {
                setMenuOpen(false);
                poke();
                if (f.id === "listen") {
                  // Listen is a mode, not a panel: start reading aloud from
                  // the current scroll position. The player bar appears at
                  // the bottom; tapping Listen while active is a no-op.
                  // (The icon is hidden when speech synthesis is unsupported.)
                  if (!listening) readAloud.startFromCurrent();
                } else {
                  setPanel(f.id);
                }
              }}
            >
              {f.icon}
            </button>
          ))}
        </div>
      )}

      {panel === "search" && (
        <FindPanel
          text={text}
          chunkStarts={chunkStarts}
          shownChunks={shownChunks}
          ensureChunk={ensureChunk}
          chunkElsRef={chunkElsRef}
          onActiveMark={onActiveMark}
          anchorStyle={panelStyle}
          onClose={() => {
            setPanel(null);
            poke();
            if (orbRef.current) orbRef.current.focus();
          }}
        />
      )}

      {panel === "contents" && (
        <ContentsPanel
          text={text}
          title={title}
          chunkStarts={chunkStarts}
          shownChunks={shownChunks}
          ensureChunk={ensureChunk}
          chunkElsRef={chunkElsRef}
          anchorStyle={panelStyle}
          onClose={() => {
            setPanel(null);
            poke();
            if (orbRef.current) orbRef.current.focus();
          }}
        />
      )}

      {panel === "share" && (
        <SharePanel
          text={text}
          title={title}
          chunkStarts={chunkStarts}
          shownChunks={shownChunks}
          chunkElsRef={chunkElsRef}
          anchorStyle={panelStyle}
          savedHls={savedHls}
          onHighlightStart={() => {
            // Don't clear savedHls — the user can keep adding to the list
            // across multiple capture sessions.
            setPanel(null);
            setHlMode(true);
            poke();
          }}
          onClearHl={() => setSavedHls([])}
          onClose={() => {
            setPanel(null);
            poke();
            if (orbRef.current) orbRef.current.focus();
          }}
        />
      )}

      {hlMode && (
        <HighlightPill
          text={text}
          chunkStarts={chunkStarts}
          chunkElsRef={chunkElsRef}
          anchorStyle={panelStyle}
          savedCount={savedHls.length}
          onAdd={(hl) => {
            setSavedHls((prev) => [...prev, hl]);
            poke();
          }}
          onDone={() => {
            setHlMode(false);
            setPanel("share");
            poke();
          }}
          onCancel={() => {
            setHlMode(false);
            poke();
            if (orbRef.current) orbRef.current.focus();
          }}
        />
      )}

      {/* Read-aloud word-follow overlays (fixed, pointer-transparent). */}
      <div
        ref={speakHlRef}
        className="ra-speak-hl"
        aria-hidden="true"
        style={{ opacity: 0 }}
      />
      <div
        ref={speakBallRef}
        className="ra-speak-ball"
        aria-hidden="true"
        style={{ opacity: 0 }}
      />

      {/* Read-aloud player bar (persistent while listening). */}
      {listening && (
        <ReadAloudBar
          status={readAloud.status}
          rate={readAloud.rate}
          wordIdx={readAloud.wordIdx}
          wordCount={readAloud.wordCount}
          onToggle={readAloud.toggle}
          onStop={() => {
            readAloud.stop();
            clearSpeakHl();
            poke();
          }}
          onSkip={readAloud.skip}
          onRate={readAloud.setRate}
        />
      )}
    </div>,
    document.body
  );
}
