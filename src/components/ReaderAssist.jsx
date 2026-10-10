// ReaderAssist — AssistiveTouch-style floating assistant for the Tower of
// Babel full-text reader.
//
// FOUNDATION (expandable): a draggable, edge-snapping floating orb that opens
// a feature menu. Features register in FEATURES below; today there is exactly
// one — "Search", a Ctrl+F-style find-in-page bar. Adding a feature later =
// one registry entry + one panel component.
//
// Research-derived build decisions (see research 2026-10-09):
// - 56px circle, position:fixed, mounted via portal as a direct body child
//   (any transformed/filtered ancestor would break fixed anchoring).
// - Pointer Events + setPointerCapture; 8px tap-vs-drag threshold; drag moves
//   via translate3d only (GPU, no layout); snap to nearest edge on release,
//   position persisted as {side, topFrac} in localStorage.
// - Idle fade to 40% opacity after ~2.5s (mirrors AssistiveTouch "Idle Opacity"),
//   full opacity on any interaction; prefers-reduced-motion respected.
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

// --- Feature registry: one entry per assistive feature. The orb menu renders
// these; selecting one opens its panel. --------------------------------------
const FEATURES = [{ id: "search", label: "Search", icon: MagnifierIcon }];

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
    if (inputRef.current) inputRef.current.focus();
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
      const hay = text.normalize("NFC").toLowerCase();
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
// The orb + menu + panel shell
// ---------------------------------------------------------------------------
export default function ReaderAssist({
  text,
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
  const [pos, setPos] = useState(loadPos); // {side, topFrac}
  const [dragging, setDragging] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [idle, setIdle] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState(null); // null | feature id
  const orbRef = useRef(null);
  const dragRef = useRef(null);
  const idleTimer = useRef(0);

  useEffect(() => {
    const onR = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onR);
    window.addEventListener("orientationchange", onR);
    return () => {
      window.removeEventListener("resize", onR);
      window.removeEventListener("orientationchange", onR);
    };
  }, []);

  const poke = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  useEffect(() => {
    if (menuOpen || panel) {
      window.clearTimeout(idleTimer.current);
      setIdle(false);
    } else {
      poke();
    }
    return () => window.clearTimeout(idleTimer.current);
  }, [menuOpen, panel, poke]);

  const orbX = pos.side === "left" ? MARGIN : viewport.w - MARGIN - ORB;
  const orbY = Math.round(
    MARGIN + pos.topFrac * Math.max(0, viewport.h - ORB - MARGIN * 2)
  );

  const onPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    poke();
    setSnapping(false);
    try {
      orbRef.current.setPointerCapture(e.pointerId);
    } catch {
      /* not critical */
    }
    // Grab from the current on-screen position (mid-snap grabs included),
    // so the orb never jumps when caught mid-flight.
    const rect = orbRef.current.getBoundingClientRect();
    const ox = Math.round(rect.left);
    const oy = Math.round(rect.top);
    dragRef.current = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      ox,
      oy,
      nx: ox,
      ny: oy,
      moved: false,
    };
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > DRAG_TAP_PX) {
      d.moved = true;
      setDragging(true);
    }
    if (d.moved) {
      poke();
      d.nx = clamp(d.ox + dx, 0, Math.max(0, viewport.w - ORB));
      d.ny = clamp(d.oy + dy, 0, Math.max(0, viewport.h - ORB));
      orbRef.current.style.transform = `translate3d(${d.nx}px, ${d.ny}px, 0)`;
    }
  };

  const finishPointer = (e, cancelled) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.id) return;
    dragRef.current = null;
    setDragging(false);
    const el = orbRef.current;
    if (d.moved && !cancelled) {
      // Snap to the nearest edge, preserving the along-edge position.
      // NOTE: never blank el.style.transform here — React's style prop still
      // holds the pre-drag value, so clearing it would strand the orb at
      // (0,0) with React unaware. Instead drive the snap imperatively (the
      // re-render below carries identical values, so it stays in sync).
      const side = d.nx + ORB / 2 < viewport.w / 2 ? "left" : "right";
      const topFrac = clamp(
        (d.ny - MARGIN) / Math.max(1, viewport.h - ORB - MARGIN * 2),
        0,
        1
      );
      const next = { side, topFrac };
      const tx = side === "left" ? MARGIN : Math.max(0, viewport.w - MARGIN - ORB);
      const ty = Math.round(
        MARGIN + topFrac * Math.max(0, viewport.h - ORB - MARGIN * 2)
      );
      if (el) {
        el.classList.add("is-snapping");
        void el.offsetWidth; // let the transition register before the move
        el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      }
      setSnapping(true);
      setPos(next);
      savePos(next);
      window.setTimeout(() => setSnapping(false), 380);
    } else if (!cancelled) {
      // Tap: no drag occurred, so the DOM transform is exactly what React
      // rendered — leave it untouched and just toggle the menu/panel.
      if (panel) {
        setPanel(null);
      } else {
        setMenuOpen((v) => !v);
      }
    } else if (el) {
      // Cancelled mid-drag: snap back to the pre-drag position explicitly,
      // since React's prop never changed and won't restore the DOM value.
      el.style.transform = `translate3d(${d.ox}px, ${d.oy}px, 0)`;
    }
    poke();
  };

  // Tap-outside + Escape dismiss the menu (AssistiveTouch behavior).
  useEffect(() => {
    if (!menuOpen) return;
    const onDocDown = (e) => {
      if (e.target.closest && e.target.closest(".ra-menu, #ra-orb")) return;
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

  const cx = orbX + ORB / 2;
  const cy = orbY + ORB / 2;

  const menuStyle = useMemo(() => {
    const mw = 76;
    const mh = 76;
    const left =
      cx > viewport.w / 2 ? cx - ORB / 2 - 12 - mw : cx + ORB / 2 + 12;
    const top = clamp(cy - mh / 2, 12, Math.max(12, viewport.h - mh - 12));
    return { left: Math.round(clamp(left, 12, Math.max(12, viewport.w - mw - 12))), top: Math.round(top) };
  }, [cx, cy, viewport]);

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
    (idle && !menuOpen && !panel ? " is-idle" : "");

  return createPortal(
    <div className="ra-root" aria-hidden={false}>
      <div
        ref={orbRef}
        id="ra-orb"
        className={orbClass}
        style={{ transform: `translate3d(${orbX}px, ${orbY}px, 0)` }}
        role="button"
        tabIndex={0}
        aria-label="Reading tools"
        aria-expanded={menuOpen}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finishPointer(e, false)}
        onPointerCancel={(e) => finishPointer(e, true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (panel) setPanel(null);
            else setMenuOpen((v) => !v);
          }
        }}
      >
        {AssistiveGlyph}
      </div>

      {menuOpen && (
        <div className="ra-menu" style={menuStyle} role="menu" aria-label="Reading tools">
          {FEATURES.map((f) => (
            <button
              key={f.id}
              type="button"
              className="ra-menu-item"
              role="menuitem"
              aria-label={`${f.label} this text`}
              onClick={() => {
                setMenuOpen(false);
                setPanel(f.id);
                poke();
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
    </div>,
    document.body
  );
}
