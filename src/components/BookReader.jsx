// BookReader — the book-view reader (INVENTORY 101/102, DESIGN.md).
//
// The entry text typeset as a book: two-page spread by default, one-page
// and thumbnail modes on a single cycling View button, a floating left
// Dock (its own additions only — back, entry info, theme, view — over a
// dash-column scrubber), and every reader tool re-homed against
// CHARACTER OFFSETS — pages are a computed view over the unchanged text
// (src/lib/book-paginate.js), so share links, highlights, Listen, Find
// and Contents keep meaning exactly what they meant in the scroll
// reader. The tools themselves (Search, Contents, Share, Highlight,
// Listen) live solely in the ReaderAssist orb (INVENTORY 112/118),
// driving the book through the bookNav bridge below.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChunkedReflower,
  BookPaginator,
  paragraphIndexAt,
  blockClass,
} from "../lib/book-paginate.js";
import { extractContents } from "../lib/contents.js";
import ReaderAssist, { SUPPORTS_HIGHLIGHTS } from "./ReaderAssist.jsx";

// --- Highlight persistence (same key + shape as ReaderAssist's, so a ---
// --- reader's saved passages round-trip across both views unchanged) ---
const HL_STORE_PREFIX = "tob-reader-hls-v1:";
const MAX_HL_RANGES = 300;
function loadHls() {
  try {
    const raw = window.localStorage.getItem(HL_STORE_PREFIX + window.location.pathname);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (h) =>
          h &&
          Number.isFinite(h.start) &&
          Number.isFinite(h.end) &&
          h.end > h.start
      )
      .slice(0, MAX_HL_RANGES);
  } catch {
    return [];
  }
}
function saveHls(list) {
  try {
    const key = HL_STORE_PREFIX + window.location.pathname;
    if (!list || list.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_HL_RANGES)));
  } catch {
    /* private mode / quota — highlights live for the session */
  }
}
const POS_PREFIX = "tob-reader-pos-v1:";
function loadPos() {
  try {
    const n = parseInt(
      window.localStorage.getItem(POS_PREFIX + window.location.pathname) || "",
      10
    );
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
function savePos(off) {
  try {
    const key = POS_PREFIX + window.location.pathname;
    if (off > 0) window.localStorage.setItem(key, String(off));
    else window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const THEME_NAMES = { transparent: "Glass paper", light: "Paper", dark: "Night paper" };
const THEME_ORDER = ["transparent", "light", "dark"];
const MODE_NAMES = { two: "Two-page", one: "One-page", thumbs: "Thumbnails" };

// Page geometry from the stage size (DESIGN §4.2).
function computeLayout(stageW, stageH, mode) {
  const phone = stageW < 640;
  // Phone reserves a left gutter for the collapsed strip (§7.8) so the
  // spread never slides under it; the spread also takes a matching
  // marginLeft at render.
  const availW = Math.max(200, stageW - (phone ? 52 : 24));
  const availH = Math.max(240, stageH - (phone ? 10 : 26));
  let pageW;
  let pageH;
  if (mode === "two" && phone) {
    // Narrow-screen spread (INVENTORY 113): at the desktop leaf aspect
    // (1.45) a phone spread's leaves come out short and poster-like —
    // ~8 lines in a full-height stage, the rest empty surround. Give
    // the phone leaf a taller, paperback-like aspect (capped by the
    // stage height) so a chosen spread reads as book pages. Phone
    // ONE-page geometry (Joshua-verified as the reference) and the
    // desktop spread are untouched by this branch.
    pageW = availW / 2;
    pageH = Math.min(availH, pageW * 1.78);
  } else if (mode === "two") {
    pageH = Math.min(availH, (availW / 2) * 1.45);
    pageW = pageH / 1.45;
    if (pageW * 2 > availW) {
      pageW = availW / 2;
      pageH = pageW * 1.45;
    }
  } else if (phone) {
    pageW = Math.min(availW, stageW - 44);
    pageH = Math.min(availH, pageW * 1.72);
  } else {
    pageH = availH;
    pageW = pageH / 1.45;
    if (pageW > availW) {
      pageW = availW;
      pageH = pageW * 1.45;
    }
  }
  pageW = Math.floor(pageW);
  pageH = Math.floor(pageH);
  const phoneTwo = phone && mode === "two";
  const fontPx = phone ? (mode === "two" ? 15 : 18) : 19;
  const lhMult = phone ? 1.64 : 1.66;
  // Slimmer margins in the phone spread only: every point of column
  // width is lines on the page at this size (INVENTORY 113).
  const padTop = Math.round(pageW * (phoneTwo ? 0.075 : 0.1));
  const padBottom = Math.round(pageW * (phoneTwo ? 0.065 : 0.09));
  const padOuter = Math.round(pageW * (phoneTwo ? 0.07 : 0.09));
  const padInner = Math.round(pageW * (phoneTwo ? 0.085 : 0.11));
  return {
    phone,
    pageW,
    pageH,
    fontPx,
    lhMult,
    lineHeightPx: fontPx * lhMult,
    padTop,
    padBottom,
    padOuter,
    padInner,
    contentW: Math.max(80, pageW - padOuter - padInner),
    contentH: Math.max(80, pageH - padTop - padBottom),
  };
}

// The blocks of one page: paragraph slices intersecting [s, e), each
// carrying its absolute source start (data-start) — every offset
// computation in this view anchors to blocks, never to raw text sums,
// because the separator characters between paragraphs are not rendered.
function pageBlocks(paragraphs, display, s, e) {
  const out = [];
  if (!paragraphs.length) return out;
  let pi = paragraphIndexAt(paragraphs, s);
  let prevKind = null;
  if (pi > 0 && s === paragraphs[pi].start) prevKind = paragraphs[pi - 1].kind;
  else if (pi > 0 && s > paragraphs[pi].start) prevKind = null;
  for (; pi < paragraphs.length && paragraphs[pi].start < e; pi++) {
    const p = paragraphs[pi];
    const from = Math.max(0, s - p.start);
    const to = Math.min(p.end, e);
    if (to > p.start + from) {
      out.push({
        key: pi,
        cls: blockClass(p, from > 0, prevKind === "heading"),
        start: p.start + from,
        text: display.slice(p.start + from, to),
      });
    }
    prevKind = p.kind;
  }
  return out;
}

// DOM point for an absolute offset inside a page text element, anchored
// to the block that contains it. Null when the offset isn't on the page.
function domPoint(pageEl, absOffset) {
  const blocks = pageEl.children;
  let fallback = null;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const bs = Number(b.dataset.start);
    if (!Number.isFinite(bs)) continue;
    const be = bs + b.textContent.length;
    if (absOffset >= bs && absOffset <= be) {
      return { node: b.firstChild, offset: absOffset - bs };
    }
    if (be >= absOffset && !fallback) {
      // Offset sits in a separator gap before this block: clamp to the
      // block's first character.
      fallback = { node: b.firstChild, offset: 0 };
    }
  }
  return fallback;
}

function rangeOnPage(pageEl, s, e) {
  const a = domPoint(pageEl, s);
  const b = domPoint(pageEl, e);
  if (!a || !b || !a.node || !b.node) return null;
  try {
    const r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    return r.collapsed ? null : r;
  } catch {
    return null;
  }
}

// Small line icons (the site's glyph style, drawn fresh for the Dock).
const I = {
  exit: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 5 8 12 15 19" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  contents: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <line x1="8.5" y1="6" x2="20" y2="6" />
      <line x1="8.5" y1="12" x2="20" y2="12" />
      <line x1="8.5" y1="18" x2="20" y2="18" />
      <circle cx="4.5" cy="6" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  ),
  find: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="15.5" y1="15.5" x2="21" y2="21" />
    </svg>
  ),
  highlight: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11.5 16.5 4a2.1 2.1 0 0 1 3 3L12 14.5 8.5 15.5z" />
      <path d="M4 20h16" />
    </svg>
  ),
  share: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V4" />
      <polyline points="7 8 12 3.5 17 8" />
      <path d="M5 13v6.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V13" />
    </svg>
  ),
  theme: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" />
    </svg>
  ),
  viewTwo: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5.5C10 3.8 7 3.5 4 3.5v14c3 0 6 .3 8 2 2-1.7 5-2 8-2v-14c-3 0-6 .3-8 2z" />
      <line x1="12" y1="5.5" x2="12" y2="19.5" />
    </svg>
  ),
  viewOne: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="3.5" width="12" height="17" rx="1" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </svg>
  ),
  viewThumbs: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </svg>
  ),
  expand: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="5" y1="7" x2="19" y2="7" />
      <line x1="5" y1="12" x2="19" y2="12" />
      <line x1="5" y1="17" x2="19" y2="17" />
    </svg>
  ),
  prevPage: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="14.5 5 7.5 12 14.5 19" />
    </svg>
  ),
  nextPage: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9.5 5 16.5 12 9.5 19" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  ),
};

export default function BookReader({
  text,
  textDone,
  title,
  shareLanding,
  theme,
  onCycleTheme,
  onInfo,
  // INVENTORY 119: the entry-info pop-up's open state, forwarded to
  // the orb so it can disappear while the pop-up is up.
  popupOpen = false,
  onExit,
  onProgress,
  onBookVisible,
  stats,
  bootGone,
}) {
  const stageRef = useRef(null);
  const [stageSize, setStageSize] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1200,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  }));
  // First-open default per device (INVENTORY 113, Joshua 2026-11-18 —
  // reversing DESIGN §12.3a's spread-on-phone default): a phone opens
  // in ONE-page view, a desktop in the TWO-page spread. This is only
  // the initial state — a mode the reader picks with the View button
  // is theirs and is never overridden.
  const [mode, setMode] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? "one" : "two"
  ); // two | one | thumbs
  const readModeRef = useRef(mode); // mode to return to from thumbnails
  const [anchor, setAnchor] = useState(0);
  const anchorRef = useRef(0);
  const [table, setTable] = useState({ starts: [0], exact: false });
  const tableRef = useRef(table);
  const [toast, setToast] = useState(null);
  const [dockIdle, setDockIdle] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [turnAnim, setTurnAnim] = useState(null); // {dir, spreadIdx}
  const [savedHls, setSavedHls] = useState(loadHls);
  const [shareHls, setShareHls] = useState([]);
  const [hlMode, setHlMode] = useState(false);
  const [pendingSel, setPendingSel] = useState(null); // {start,end,rect}
  const [curHlIdx, setCurHlIdx] = useState(0);
  // Page flip (INVENTORY 114): an adjacent-spread turn in flight —
  // {dir, from, to, frac, phase} where frac is the leaf's rotation
  // progress (0 = leaf flat on the right, 1 = flat on the left) and
  // phase runs "anim" (mounted at the start frac) -> "go" (transition
  // to the end frac) for timed turns, or "drag"/"settle" for gestures.
  const [flip, setFlip] = useState(null);
  const flipTimerRef = useRef(0);
  const dragRef2 = useRef(null); // active page-drag gesture
  const dragTurnAtRef = useRef(0); // last drag-resolved turn (click guard)
  // Listen page-flow (INVENTORY 116): the page the narration is on —
  // set by the bookNav follow bridge, cleared when playback stops.
  const [readingPage, setReadingPage] = useState(-1);
  const readingPageRef = useRef(-1);
  const [fontEpoch, setFontEpoch] = useState(0);
  const [scrubPreview, setScrubPreview] = useState(null); // slice idx | null

  const paginatorRef = useRef(null);
  const reflowRef = useRef({ display: "", paragraphs: [] });
  // Progressive reflow (§6.1): the first chunk lands synchronously so
  // first paint never waits on a monster text; later chunks extend the
  // display in idle slices and the paginator extends with them.
  const [reflowState, setReflowState] = useState({
    display: "",
    paragraphs: [],
    done: false,
  });
  reflowRef.current = {
    display: reflowState.display,
    paragraphs: reflowState.paragraphs,
  };
  const reflowerRef = useRef(null);
  const typesetterRef = useRef(null);
  const paginatorLayoutRef = useRef("");
  const pageElsRef = useRef({});
  const manualTurnRef = useRef(0);
  const landingDoneRef = useRef(false);
  const bookVisibleFiredRef = useRef(false);
  const dockBtnRefs = useRef({});
  const idleTimerRef = useRef(0);
  const toastTimerRef = useRef(0);
  const turnTimerRef = useRef(0);
  const lastWheelRef = useRef(0);

  const layout = useMemo(
    () => computeLayout(stageSize.w, stageSize.h, mode === "one" ? "one" : "two"),
    [stageSize, mode]
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const layoutKey = `${layout.contentW}x${layout.contentH}x${layout.fontPx}x${fontEpoch}`;
  const sections = useMemo(
    () => (text ? extractContents(text, title) : [{ label: title || "Beginning", offset: 0, percent: 0 }]),
    [text, title]
  );
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  const sectionStarts = useMemo(
    () => new Set(sections.map((s) => s.offset)),
    [sections]
  );

  const sectionAt = useCallback(
    (off) => {
      const secs = sectionsRef.current;
      let ans = secs[0];
      for (let i = 0; i < secs.length; i++) {
        if (secs[i].offset <= off) ans = secs[i];
        else break;
      }
      return ans;
    },
    []
  );

  // -- Stage size ------------------------------------------------------------
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setStageSize((prev) =>
          Math.abs(prev.w - r.width) > 2 || Math.abs(prev.h - r.height) > 2
            ? { w: r.width, h: r.height }
            : prev
        );
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // -- Full-screen lock (INVENTORY 127/128, mobile book view) ---------------
  // The book is a paginated surface: the document itself must never
  // scroll up/down behind it, and the view must open fully zoomed out
  // and stay there — Joshua had to pinch out manually on his phone.
  // While the book view is mounted: the document scroll is locked
  // (html/body overflow hidden via .bv-scroll-lock) and iOS gesture
  // zoom over the reader is suppressed. Both release on unmount (the
  // scroll reader keeps its normal page scroll). The reader root is
  // sized to the viewport (with the top-dock clearance of line 126),
  // so at scale 1 everything on the page is exactly fitted.
  useEffect(() => {
    const rootEl = document.documentElement;
    const bodyEl = document.body;
    // overflow:hidden alone still leaves the document scrollable to
    // any sub-pixel overflow (measured: 1px). The hard lock pins the
    // body with position:fixed at the current scroll offset, so the
    // document has no scroll range at all; the offset is restored on
    // unmount.
    const lockedY = window.scrollY || 0;
    bodyEl.style.top = lockedY ? `-${lockedY}px` : "";
    rootEl.classList.add("bv-scroll-lock");
    bodyEl.classList.add("bv-scroll-lock");
    const preventGesture = (e) => {
      e.preventDefault();
    };
    document.addEventListener("gesturestart", preventGesture);
    document.addEventListener("gesturechange", preventGesture);
    return () => {
      rootEl.classList.remove("bv-scroll-lock");
      bodyEl.classList.remove("bv-scroll-lock");
      bodyEl.style.top = "";
      if (lockedY) window.scrollTo(0, lockedY);
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
    };
  }, []);

  // -- Font: preload EB Garamond on reader routes only; exactly one --------
  // -- repagination when it settles (§6.4) -----------------------------------
  useEffect(() => {
    let live = true;
    for (const f of ["ebgaramond-regular", "ebgaramond-italic"]) {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "font";
      link.type = "font/woff2";
      link.crossOrigin = "anonymous";
      link.href = `/fonts/${f}.woff2`;
      link.dataset.bvFont = "1";
      document.head.appendChild(link);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!live) return;
        let loaded = false;
        try {
          loaded = document.fonts.check('19px "EB Garamond"');
        } catch {
          loaded = false;
        }
        if (loaded) setFontEpoch(1);
      });
    }
    return () => {
      live = false;
      document
        .querySelectorAll("link[data-bv-font]")
        .forEach((l) => l.remove());
    };
  }, []);

  // -- Progressive reflow driver ----------------------------------------------
  // First chunk is synchronous (first paint); the rest arrive in idle
  // slices. Chunk boundaries sit on blank lines, so the prefix display
  // is always a true prefix of the full display (§6.1).
  useEffect(() => {
    if (!text) {
      reflowerRef.current = null;
      setReflowState({ display: "", paragraphs: [], done: false });
      return undefined;
    }
    const rf = new ChunkedReflower(text, sectionStarts, 150000);
    reflowerRef.current = rf;
    rf.step();
    setReflowState({
      display: rf.display,
      paragraphs: rf.paragraphs,
      done: rf.done,
    });
    if (rf.done) return undefined;
    let stopped = false;
    let timer = 0;
    const tick = () => {
      if (stopped) return;
      rf.step();
      setReflowState({
        display: rf.display,
        paragraphs: rf.paragraphs,
        done: rf.done,
      });
      if (!rf.done) timer = window.setTimeout(tick, 40);
    };
    timer = window.setTimeout(tick, 40);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [text, sectionStarts]);

  // -- Paginator lifecycle ------------------------------------------------------
  // Created per layout; text/reflow growth EXTENDS the live paginator
  // (BookPaginator.update) instead of rebuilding it, so the measured
  // table and the reader's place survive streaming and chunked reflow.
  // The anchor offset is the reader's place; pagination re-derives
  // around it (§5.3) and never moves the passage.
  useEffect(() => {
    if (!text) {
      if (typesetterRef.current) {
        typesetterRef.current.remove();
        typesetterRef.current = null;
      }
      paginatorRef.current = null;
      paginatorLayoutRef.current = "";
      setTable({ starts: [0], exact: false });
      return undefined;
    }
    if (reflowState.paragraphs.length === 0) return undefined;
    let pg = paginatorRef.current;
    if (!pg || paginatorLayoutRef.current !== layoutKey) {
      if (typesetterRef.current) typesetterRef.current.remove();
      const ts = document.createElement("div");
      ts.className = "bv-text bv-typesetter";
      ts.style.width = `${layout.contentW}px`;
      ts.style.fontSize = `${layout.fontPx}px`;
      ts.style.lineHeight = String(layout.lhMult);
      ts.setAttribute("aria-hidden", "true");
      document.body.appendChild(ts);
      typesetterRef.current = ts;
      pg = new BookPaginator({
        display: reflowState.display,
        paragraphs: reflowState.paragraphs,
        typesetter: ts,
        contentH: layout.contentH,
        lineHeightPx: layout.lineHeightPx,
        complete: textDone && reflowState.done,
      });
      paginatorRef.current = pg;
      paginatorLayoutRef.current = layoutKey;
      // Initial place: share landing > restored position > top.
      let startAt = anchorRef.current;
      let restoredPos = 0;
      if (!landingDoneRef.current && shareLanding) startAt = shareLanding.at;
      else if (startAt === 0) {
        // Creation-branch only, and only while the anchor is untouched:
        // a layout recreation mid-read has anchor > 0 and skips this;
        // a reader who returned to page 1 deleted the key (savePos(0)).
        restoredPos = loadPos();
        if (restoredPos > 0) startAt = restoredPos;
      }
      if (startAt > 0)
        pg.startWindow(Math.min(startAt, Math.max(0, text.length - 1)));
      pg.paginateStep(24);
      if (pg.win) pg.paginateWindowStep(24);
      if (restoredPos > 0) {
        // Windowing alone doesn't move the reader — set the anchor.
        anchorRef.current = restoredPos;
        setAnchor(restoredPos);
      }
      posReadyRef.current = true;
    } else {
      const before = pg.starts.length;
      pg.update(
        reflowState.display,
        reflowState.paragraphs,
        textDone && reflowState.done
      );
      if (pg.starts.length < before && anchorRef.current > 0) {
        // Input swap reset the table (non-extension): re-window
        // around the reader's place so their passage stays put.
        pg.startWindow(
          Math.min(anchorRef.current, Math.max(0, text.length - 1))
        );
        pg.paginateStep(24);
        if (pg.win) pg.paginateWindowStep(24);
      }
    }
    setTable(pg.pageTable());
    // Idle-sliced background pagination (§6.1): fill forward until the
    // whole text is covered; never on the turn path.
    let stopped = false;
    let timer = 0;
    const pump = () => {
      if (stopped) return;
      const p = paginatorRef.current;
      if (!p) return;
      let added = 0;
      if (!p.done) added += p.paginateStep(8);
      if (p.win && !p.win.done) added += p.paginateWindowStep(8);
      if (added > 0) setTable(p.pageTable());
      if (!p.done || (p.win && !p.win.done)) {
        timer = window.setTimeout(pump, 60);
      }
    };
    timer = window.setTimeout(pump, 60);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, layoutKey, reflowState, textDone]);

  // Typesetter cleanup on unmount.
  useEffect(
    () => () => {
      if (typesetterRef.current) {
        typesetterRef.current.remove();
        typesetterRef.current = null;
      }
      paginatorRef.current = null;
    },
    []
  );

  useEffect(() => {
    tableRef.current = table;
  }, [table]);

  // Fire "book visible" once the first spread has real pages.
  useEffect(() => {
    if (bookVisibleFiredRef.current) return;
    if (text && table.starts.length >= 1) {
      bookVisibleFiredRef.current = true;
      if (onBookVisible) onBookVisible();
    }
  }, [text, table, onBookVisible]);

  // -- Position: persist + progress milestones -------------------------------
  // Saves are gated on posReadyRef: on mount this effect would
  // otherwise run with anchor=0 and DELETE the saved position before
  // the paginator's creation branch gets to restore it.
  const posReadyRef = useRef(false);
  useEffect(() => {
    anchorRef.current = anchor;
    if (!posReadyRef.current) return;
    savePos(anchor);
    if (text && text.length > 0 && onProgress) {
      onProgress(anchor / text.length);
    }
  }, [anchor, text, onProgress]);

  // -- Turning -----------------------------------------------------------------
  const stepPages = mode === "one" ? 1 : 2;
  const spreadStartIdx = useCallback(
    (idx) => (mode === "one" ? idx : idx - (idx % 2)),
    [mode]
  );

  const currentIdx = BookPaginator.pageOf(table.starts, anchor);
  const currentSpreadIdx = spreadStartIdx(currentIdx);

  const reducedMotion = useCallback(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const goToIdx = useCallback(
    (idx, { instant = false, manual = true, pairMode = null } = {}) => {
      // Fresh table from the paginator when there is one: tableRef
      // trails a render behind, and a caller that just opened a
      // window segment (turnToOffset) indexes into the NEW table.
      const starts = paginatorRef.current
        ? paginatorRef.current.pageTable().starts
        : tableRef.current.starts;
      if (starts.length === 0) return;
      const clamped = clamp(idx, 0, starts.length - 1);
      const target =
        pairMode === "one"
          ? clamped
          : pairMode === "two"
            ? clamped - (clamped % 2)
            : spreadStartIdx(clamped);
      const targetOffset = starts[target];
      if (targetOffset === anchorRef.current) return;
      if (manual) manualTurnRef.current = Date.now();
      if (instant || reducedMotion()) {
        window.clearTimeout(flipTimerRef.current);
        setFlip(null);
        setAnchor(targetOffset);
        return;
      }
      const from = currentSpreadIdxRef.current;
      const step = modeRef.current === "one" ? 1 : 2;
      setAnchor(targetOffset);
      if (Math.abs(target - from) === step) {
        // Adjacent spread: a real page flip (INVENTORY 114) — the
        // outgoing leaf rotates around the spine over the incoming
        // spread, which is already committed beneath it. The "anim"
        // phase mounts the leaf at its start rotation; the effect
        // below transitions it to the end rotation next frame.
        window.clearTimeout(turnTimerRef.current);
        setTurnAnim(null);
        setFlip({
          dir: target > from ? 1 : -1,
          from,
          to: target,
          frac: target > from ? 0 : 1,
          phase: "anim",
        });
        window.clearTimeout(flipTimerRef.current);
        flipTimerRef.current = window.setTimeout(() => setFlip(null), 520);
        return;
      }
      // Far jump: slide+settle, as before — long jumps are never forced
      // through a flip (INVENTORY 114d). The track commits the anchor
      // immediately; the animation is transform-only, 210ms.
      window.clearTimeout(flipTimerRef.current);
      setFlip(null);
      setTurnAnim({ dir: target > from ? 1 : -1, spreadIdx: target });
      window.clearTimeout(turnTimerRef.current);
      turnTimerRef.current = window.setTimeout(() => setTurnAnim(null), 240);
    },
    [spreadStartIdx, reducedMotion]
  );
  const currentSpreadIdxRef = useRef(0);
  currentSpreadIdxRef.current = currentSpreadIdx;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const turnToOffset = useCallback(
    (off, opts) => {
      const pg = paginatorRef.current;
      // Window FIRST, index second: computing the page index from the
      // table as it was before the window opened lands the reader on
      // the frontier page instead of the target (the share-landing
      // defect). The window makes the target's page real; only then
      // does pageOf mean anything for it.
      if (pg && off > pg.primaryCover) {
        if (!pg.win || off < pg.win.base || off > pg.winReach) {
          pg.startWindow(off);
        }
        // Step the (possibly pre-existing) window forward until it
        // covers the target — a window opened early against a
        // partial reflow sits at the old prefix end and heals here.
        let guard = 0;
        while (pg.win && !pg.win.done && off > pg.winReach && guard++ < 60) {
          if (pg.paginateWindowStep(40) === 0) break;
        }
        setTable(pg.pageTable());
      }
      const t = pg ? pg.pageTable() : tableRef.current;
      const idx = BookPaginator.pageOf(t.starts, off);
      goToIdx(idx, opts);
    },
    [goToIdx]
  );

  const turnBy = useCallback(
    (dir) => {
      goToIdx(currentSpreadIdxRef.current + dir * stepPages);
    },
    [goToIdx, stepPages]
  );

  // Advance a timed flip: the leaf mounts at its start rotation
  // (phase "anim"); on the next frame it transitions to the end
  // rotation (phase "go"). The clear timer in goToIdx retires it.
  useEffect(() => {
    if (!flip || flip.phase !== "anim") return undefined;
    const raf = requestAnimationFrame(() => {
      setFlip((f) =>
        f && f.phase === "anim"
          ? { ...f, frac: f.dir > 0 ? 1 : 0, phase: "go" }
          : f
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [flip]);

  // A new text starts with no narration page (INVENTORY 116).
  useEffect(() => {
    readingPageRef.current = -1;
    setReadingPage(-1);
  }, [text]);

  // Share landing (§5.5): once the complete text is in AND its reflow
  // has finished (so the paginator can window to any offset in it),
  // open at the target's page and paint the shared ranges. Firing at
  // textDone alone raced the chunked reflow on long texts and clamped
  // the landing to whatever prefix existed then.
  useEffect(() => {
    if (!text || !textDone || !reflowState.done || !shareLanding || landingDoneRef.current) return;
    landingDoneRef.current = true;
    const at = clamp(shareLanding.at, 0, Math.max(0, text.length - 1));
    if (shareLanding.hls && shareLanding.hls.length > 0) {
      setShareHls(
        shareLanding.hls.map((h) => ({
          start: Math.min(h.start, Math.max(0, text.length - 1)),
          end: Math.min(h.end, text.length),
        }))
      );
    }
    turnToOffset(at, { instant: true, manual: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, textDone, reflowState.done, shareLanding]);

  // -- Painting: highlights, shared ranges, find matches ----------------------
  const paintAll = useCallback(() => {
    if (!SUPPORTS_HIGHLIGHTS) return;
    const paint = (name, ranges) => {
      if (!ranges || ranges.length === 0) {
        CSS.highlights.delete(name);
        return;
      }
      const hl = new Highlight();
      for (const [idx, el] of Object.entries(pageElsRef.current)) {
        if (!el) continue;
        const pageStart = Number(el.dataset.start);
        const pageEnd =
          tableRef.current.starts[Number(idx) + 1] !== undefined
            ? tableRef.current.starts[Number(idx) + 1]
            : text
              ? text.length
              : pageStart;
        for (const r of ranges) {
          if (r.end <= pageStart || r.start >= pageEnd) continue;
          const range = rangeOnPage(
            el,
            Math.max(r.start, pageStart),
            Math.min(r.end, pageEnd)
          );
          if (range) hl.add(range);
        }
      }
      if (hl.size > 0) CSS.highlights.set(name, hl);
      else CSS.highlights.delete(name);
    };
    paint("ra-mine", savedHls);
    paint("ra-shared", shareHls);
    paint(
      "ra-mine-cur",
      savedHls.length > 0 && curHlIdx < savedHls.length
        ? [savedHls[curHlIdx]]
        : []
    );
    // Find-match painting ("ra-all" / "ra-cur") is owned by the orb's
    // Find, which paints through bookNav.rangeFor (INVENTORY 118).
  }, [savedHls, shareHls, curHlIdx, text]);

  // Synchronous paint (the scroll reader paints in-effect too): an
  // rAF indirection here kept cancelling under render load, which
  // made highlights blink out between frames while pagination ran.
  useEffect(() => {
    paintAll();
  }, [paintAll, anchor, table, mode, turnAnim]);

  useEffect(
    () => () => {
      if (!SUPPORTS_HIGHLIGHTS) return;
      for (const n of ["ra-mine", "ra-shared", "ra-mine-cur", "ra-all", "ra-cur"]) {
        CSS.highlights.delete(n);
      }
    },
    []
  );

  // Persist highlight mutations (same contract as the scroll reader).
  useEffect(() => {
    saveHls(savedHls);
  }, [savedHls]);

  // -- Reader bridge (ReaderAssist bookNav) -----------------------------------
  // Listen's page-follow lives here, and since INVENTORY 112 the orb's
  // full tool set drives the book through the same bridge: jumps go
  // through turnToOffset, ranges come from the block-anchored page
  // machinery, and highlights are owned by THIS component's state (the
  // orb reads/mutates them through hls* — one set, one owner).
  const turnToOffsetRef = useRef(turnToOffset);
  turnToOffsetRef.current = turnToOffset;
  const savedHlsRef = useRef(savedHls);
  savedHlsRef.current = savedHls;
  const bookNavRef = useRef(null);
  if (!bookNavRef.current) {
    bookNavRef.current = {
      manualTurnRef,
      getStartOffset: () => anchorRef.current,
      goToOffset: (off) => {
        turnToOffsetRef.current(off, { manual: false });
      },
      rangeFor: (s, e) => {
        const starts = tableRef.current.starts;
        const idx = BookPaginator.pageOf(starts, s);
        const el = pageElsRef.current[idx];
        if (!el) return null;
        const pageEnd = starts[idx + 1] !== undefined ? starts[idx + 1] : e;
        return rangeOnPage(el, s, Math.min(e, pageEnd));
      },
      hlsList: () => savedHlsRef.current,
      hlsAdd: (hl) =>
        setSavedHls((prev) =>
          [...prev, { start: hl.start, end: hl.end }].slice(0, MAX_HL_RANGES)
        ),
      hlsRemove: (idx) =>
        setSavedHls((prev) => prev.filter((_, i) => i !== idx)),
      hlsClear: () => setSavedHls([]),
      hlsFocus: (idx) => {
        const h = savedHlsRef.current[idx];
        if (!h) return;
        setCurHlIdx(idx);
        turnToOffsetRef.current(h.start, { manual: false });
      },
      startHlCapture: () => {
        setHlMode(true);
      },
      speakState: (st) => {
        if (st === "idle") {
          readingPageRef.current = -1;
          setReadingPage(-1);
        }
      },
      wordRect: (gStart, gEnd) => {
        const starts = tableRef.current.starts;
        const idx = BookPaginator.pageOf(starts, gStart);
        const el = pageElsRef.current[idx];
        if (!el) return null;
        const pageEnd = starts[idx + 1] !== undefined ? starts[idx + 1] : gEnd;
        const range = rangeOnPage(el, gStart, Math.min(gEnd, pageEnd));
        if (!range) return null;
        const rects = range.getClientRects();
        if (!rects.length) return null;
        const cs = window.getComputedStyle(el);
        const lh = parseFloat(cs.lineHeight) || 30;
        for (let i = rects.length - 1; i >= 0; i--) {
          const r = rects[i];
          if (r.width > 0 && r.height > 0 && r.height <= lh * 1.6) return r;
        }
        return null;
      },
      followWord: (gStart) => {
        const starts = tableRef.current.starts;
        const idx = BookPaginator.pageOf(starts, gStart);
        // The narration's page (INVENTORY 116): tracked on every word
        // so the active leaf is visually evident as the spoken word
        // crosses the seam inside a spread, not only when it turns.
        if (readingPageRef.current !== idx) {
          readingPageRef.current = idx;
          setReadingPage(idx);
        }
        const spread = spreadStartIdxRef.current(idx);
        if (spread !== currentSpreadIdxRef.current) {
          goToIdxRef.current(idx, { manual: false });
        }
      },
    };
  }
  const spreadStartIdxRef = useRef(spreadStartIdx);
  spreadStartIdxRef.current = spreadStartIdx;
  const goToIdxRef = useRef(goToIdx);
  goToIdxRef.current = goToIdx;

  // -- Dock behavior -------------------------------------------------------------
  const pokeDock = useCallback(() => {
    setDockIdle(false);
    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => setDockIdle(true), 2500);
  }, []);
  useEffect(() => {
    if (phoneOpen) {
      window.clearTimeout(idleTimerRef.current);
      setDockIdle(false);
    } else {
      pokeDock();
    }
    return () => window.clearTimeout(idleTimerRef.current);
  }, [phoneOpen, pokeDock]);

  // Desktop magnification: transform-only, cosine falloff (§7.1).
  // The pop amplitude was dialed back (INVENTORY 122, Joshua
  // 2026-11-18: "a little too much") — 0.45 -> 0.28 at the peak.
  const magnify = useCallback((e) => {
    const zone = e.currentTarget;
    const buttons = zone.querySelectorAll(".bv-dock-btn");
    const y = e.clientY;
    buttons.forEach((btn) => {
      const r = btn.getBoundingClientRect();
      const d = Math.abs(y - (r.top + r.height / 2));
      const range = 132;
      const k = d >= range ? 0 : Math.cos((d / range) * (Math.PI / 2));
      const scale = 1 + 0.28 * k * k;
      btn.style.transform = `scale(${scale.toFixed(3)})`;
      btn.classList.toggle("is-hot", d < 30);
    });
  }, []);
  const demagnify = useCallback((e) => {
    e.currentTarget
      .querySelectorAll(".bv-dock-btn")
      .forEach((btn) => {
        btn.style.transform = "";
        btn.classList.remove("is-hot");
      });
  }, []);

  const cycleView = useCallback(() => {
    // A true rotation (two -> one -> thumbs -> two): every mode must
    // stay reachable from every other. Returning from thumbnails via
    // a thumbnail tap still lands on the pre-thumbnails mode
    // (readModeRef, used by ThumbsGrid's onJump) — but the button
    // itself can no longer strand a one-page-default phone out of
    // the spread (INVENTORY 113).
    setMode((m) => {
      if (m === "two") return "one";
      if (m === "one") return "thumbs";
      return "two";
    });
    pokeDock();
  }, [pokeDock]);
  useEffect(() => {
    if (mode === "two" || mode === "one") readModeRef.current = mode;
  }, [mode]);

  const cycleThemeDock = useCallback(() => {
    const next =
      THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    onCycleTheme();
    setToast(THEME_NAMES[next]);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1600);
    pokeDock();
  }, [theme, onCycleTheme, pokeDock]);

  // -- Keyboard ------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      if (mode === "thumbs") return;
      const t = e.target;
      const tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (t && t.isContentEditable) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        turnBy(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        turnBy(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turnBy, mode]);

  // -- Page taps (Joshua's rule, 2026-11-20): a tap on the page NEVER --
  // -- turns the page — not the edges, not the center. Tap-to-turn is --
  // -- the bottom arrows only; swipe/drag turns (below) are unchanged. -
  const onStageClick = (e) => {
    if (mode === "thumbs") return;
    // A drag turn (or a fan dismissal) just resolved on this same
    // gesture — the trailing click is part of that gesture, not a tap.
    if (Date.now() - dragTurnAtRef.current < 400) return;
    if (
      e.target.closest &&
      e.target.closest(".bv-dock, .bv-strip, .bv-fan, .bv-hl-pill, .ra-root, button, a, input, textarea, select")
    )
      return;
    // Tapping outside the expanded phone fan collapses it (§7.8).
    // That is the ONLY thing a page tap does now.
    if (phoneOpen) {
      setPhoneOpen(false);
      return;
    }
  };

  // -- Wheel: one spread per gesture, throttled (§4.5) ---------------------------
  const onWheel = useCallback(
    (e) => {
      if (mode === "thumbs") return;
      if (
        e.target.closest &&
        e.target.closest(".bv-dock, .bv-strip, .bv-fan")
      )
        return;
      const now = Date.now();
      if (now - lastWheelRef.current < 500) return;
      if (Math.abs(e.deltaY) < 24) return;
      lastWheelRef.current = now;
      turnBy(e.deltaY > 0 ? 1 : -1);
    },
    [mode, turnBy]
  );

  // -- Drag turns (INVENTORY 114d) ------------------------------------------------
  // A horizontal drag as if turning a page drives the flip leaf
  // itself; release past the threshold completes the turn, short of
  // it the leaf settles back. A drag that forms a text selection
  // never turns: touch selection is long-press driven (and the
  // release guard re-checks the selection), and a MOUSE drag only
  // qualifies when it starts off the text block — page margins or
  // surround — never on the words themselves. A fast flick that never
  // engages the leaf keeps the original release-swipe behavior.
  const onPointerDownStage = (e) => {
    if (
      e.target.closest &&
      e.target.closest(".bv-dock, .bv-strip, .bv-fan, .bv-hl-pill, .ra-root, button, a, input, textarea, select")
    )
      return;
    // Dock fan dismissal (DESIGN §7.8 / INVENTORY 115): a touch that
    // begins outside the fan collapses it, and the gesture is spent
    // on the dismissal — it does not also turn the page.
    if (phoneOpen) {
      setPhoneOpen(false);
      dragTurnAtRef.current = Date.now();
      dragRef2.current = null;
      return;
    }
    if (mode === "thumbs" || hlMode) return;
    if (e.pointerType === "mouse") {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest(".bv-page-text")) return;
    }
    dragRef2.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      active: false,
      dir: 0,
      from: 0,
      to: 0,
    };
  };
  const onPointerMoveStage = (e) => {
    const d = dragRef2.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dx) < 30 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      // A selection forming under the drag cancels the turn gesture.
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        dragRef2.current = null;
        return;
      }
      const dir = dx < 0 ? 1 : -1;
      const from = currentSpreadIdxRef.current;
      const step = modeRef.current === "one" ? 1 : 2;
      const to = from + dir * step;
      const starts = tableRef.current.starts;
      if (to < 0 || to >= starts.length) {
        dragRef2.current = null;
        return;
      }
      d.active = true;
      d.dir = dir;
      d.from = from;
      d.to = to;
    } else if (
      Math.sign(dx) !== (d.dir > 0 ? -1 : 1) &&
      Math.abs(dx) > 30
    ) {
      // Dragged back across the start point the other way: disengage.
      setFlip(null);
      dragRef2.current = null;
      return;
    }
    const frac = clamp(Math.abs(dx) / (layoutRef.current.pageW * 0.9), 0, 1);
    setFlip({
      dir: d.dir,
      from: d.from,
      to: d.to,
      frac: d.dir > 0 ? frac : 1 - frac,
      phase: "drag",
    });
  };
  const settleFlip = (complete) => {
    setFlip((f) =>
      f
        ? {
            ...f,
            frac: complete ? (f.dir > 0 ? 1 : 0) : f.dir > 0 ? 0 : 1,
            phase: "settle",
          }
        : f
    );
    window.clearTimeout(flipTimerRef.current);
    flipTimerRef.current = window.setTimeout(() => setFlip(null), 210);
  };
  const onPointerUpStage = (e) => {
    const d = dragRef2.current;
    dragRef2.current = null;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      // Fast flick (the leaf never engaged): the original swipe —
      // turn on release past the threshold, selection permitting.
      if (Math.abs(dx) >= 52 && Math.abs(dy) < Math.abs(dx) * 0.6) {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
        dragTurnAtRef.current = Date.now();
        turnBy(dx < 0 ? 1 : -1);
      }
      return;
    }
    dragTurnAtRef.current = Date.now();
    const sel = window.getSelection();
    const fracNow = clamp(
      Math.abs(dx) / (layoutRef.current.pageW * 0.9),
      0,
      1
    );
    if ((sel && !sel.isCollapsed) || fracNow < 0.35) {
      settleFlip(false);
      return;
    }
    // Complete the turn: commit the anchor instantly (the leaf is
    // already most of the way around) and let it settle flat.
    goToIdx(d.to, { instant: true });
    setFlip({
      dir: d.dir,
      from: d.from,
      to: d.to,
      frac: d.dir > 0 ? 1 : 0,
      phase: "settle",
    });
    window.clearTimeout(flipTimerRef.current);
    flipTimerRef.current = window.setTimeout(() => setFlip(null), 210);
  };
  const onPointerCancelStage = () => {
    if (dragRef2.current && dragRef2.current.active) settleFlip(false);
    dragRef2.current = null;
  };

  // -- Highlight capture ---------------------------------------------------------
  useEffect(() => {
    if (!hlMode) {
      setPendingSel(null);
      document.body.classList.remove("ra-hl-capturing");
      return undefined;
    }
    document.body.classList.add("ra-hl-capturing");
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPendingSel(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const pt = (container, offset) => {
        let node = container;
        let off = offset;
        // Element containers (whole-page selections, triple-clicks)
        // address child indices, not characters — descend to the
        // boundary text node so the math below stays in text terms.
        while (node.nodeType !== 3) {
          const kids = node.childNodes;
          if (!kids || kids.length === 0) return null;
          if (off >= kids.length) {
            node = kids[kids.length - 1];
            off = node.textContent ? node.textContent.length : 0;
          } else {
            node = kids[off];
            off = 0;
          }
        }
        const el = node.parentElement;
        const blk = el && el.closest ? el.closest(".bv-blk") : null;
        if (!blk) return null;
        const bs = Number(blk.dataset.start);
        if (!Number.isFinite(bs)) return null;
        try {
          const pre = document.createRange();
          pre.selectNodeContents(blk);
          pre.setEnd(node, off);
          return bs + pre.toString().length;
        } catch {
          return null;
        }
      };
      const s = pt(range.startContainer, range.startOffset);
      const e2 = pt(range.endContainer, range.endOffset);
      if (s === null || e2 === null || e2 <= s) {
        setPendingSel(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setPendingSel({
        start: Math.min(s, e2),
        end: Math.max(s, e2),
        rect: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
      });
    };
    document.addEventListener("selectionchange", onSelChange);
    return () => {
      document.removeEventListener("selectionchange", onSelChange);
      document.body.classList.remove("ra-hl-capturing");
    };
  }, [hlMode]);

  const addPendingHighlight = useCallback(() => {
    if (!pendingSel) return;
    setSavedHls((prev) =>
      [...prev, { start: pendingSel.start, end: pendingSel.end }].slice(
        0,
        MAX_HL_RANGES
      )
    );
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    setPendingSel(null);
  }, [pendingSel]);

  // -- Scrubber ---------------------------------------------------------------------
  // Info for one dash of the scrubber, by dash index. The caller (the
  // Scrubber) owns the dash count and derives the index from the LIVE
  // element rect on every pointer event, so a gesture never depends on
  // cached geometry: the old geometry ref was seeded with n: 0 (the
  // "-Infinity%" tooltip, INVENTORY 130) and a ResizeObserver reset
  // could re-poison it mid-drag — iOS Safari resizes the strip when
  // its URL bar shows/hides, which froze real-phone drags while the
  // desktop harness (fixed viewport) never saw it. Every value below
  // is clamped finite regardless.
  const scrubInfoIdx = useCallback(
    (idxRaw, n) => {
      if (!text || !(text.length > 0) || !(n > 0)) return null;
      const idx = clamp(Math.floor(idxRaw), 0, n - 1);
      const sliceStart = clamp(
        Math.floor((idx / n) * text.length),
        0,
        Math.max(0, text.length - 1)
      );
      const sliceEnd = Math.floor(((idx + 1) / n) * text.length);
      const sec = sectionAt(sliceStart);
      const t = tableRef.current;
      const pg = paginatorRef.current;
      let pageRange = null;
      if (pg && sliceEnd <= pg.primaryCover) {
        const a = BookPaginator.pageOf(t.starts, sliceStart) + 1;
        const b = BookPaginator.pageOf(t.starts, Math.max(sliceStart, sliceEnd - 1)) + 1;
        pageRange = a === b ? `p. ${a}` : `pp. ${a}–${b}`;
      }
      return {
        idx,
        sliceStart,
        label: sec ? sec.label : title,
        pct: clamp(Math.round((sliceStart / text.length) * 100), 0, 100),
        pageRange,
      };
    },
    [text, sectionAt, title]
  );

  // -- Rendering ---------------------------------------------------------------------
  const { display, paragraphs } = reflowRef.current;
  const starts = table.starts;
  const totalPages = starts.length;
  const curSection = sectionAt(anchor);
  const pctNow = text && text.length ? Math.round((anchor / text.length) * 100) : 0;
  const readoutMain = table.exact
    ? `PAGE ${currentIdx + 1} / ${totalPages}`
    : `${curSection ? curSection.label : title} · ${pctNow}%`;
  const readoutPhone = table.exact
    ? `${currentIdx + 1}/${totalPages} · ${pctNow}%`
    : `${pctNow}%`;

  const renderPage = (idx, side) => {
    if (idx < 0 || idx >= starts.length) {
      return <div key={`empty-${side}`} className={`bv-page bv-page-empty bv-${side}`} style={{ width: layout.pageW, height: layout.pageH }} aria-hidden="true" />;
    }
    const s = starts[idx];
    const e = idx + 1 < starts.length ? starts[idx + 1] : text ? text.length : s;
    const blocks = display ? pageBlocks(paragraphs, display, s, e) : [];
    const isLeft = side === "left";
    const headLabel =
      mode === "one"
        ? (idx + 1) % 2 === 0
          ? title
          : sectionAt(s)?.label || title
        : isLeft
          ? title
          : sectionAt(s)?.label || title;
    const padL = mode === "one" ? layout.padOuter : isLeft ? layout.padOuter : layout.padInner;
    const padR = mode === "one" ? layout.padOuter : isLeft ? layout.padInner : layout.padOuter;
    return (
      <div
        key={idx}
        className={`bv-page bv-${side}${readingPage === idx ? " is-reading" : ""}`}
        style={{ width: layout.pageW, height: layout.pageH }}
        role="group"
        aria-label={`Page ${idx + 1}`}
      >
        <div
          className="bv-page-head"
          style={{
            left: padL,
            right: padR,
            top: Math.max(5, layout.padTop - 17),
            flexDirection: isLeft || mode === "one" ? "row" : "row-reverse",
          }}
        >
          <span className="bv-folio">{idx + 1}</span>
          <span className="bv-head-label">{headLabel}</span>
        </div>
        <div
          className="bv-page-text bv-text"
          data-start={s}
          ref={(el) => {
            if (el) pageElsRef.current[idx] = el;
            else delete pageElsRef.current[idx];
          }}
          style={{
            top: layout.padTop,
            bottom: layout.padBottom,
            left: padL,
            right: padR,
            fontSize: layout.fontPx,
            lineHeight: layout.lhMult,
          }}
        >
          {blocks.map((b) => (
            <div key={b.key} className={b.cls} data-start={b.start}>
              {b.text}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const spreadGutter = layout.phone ? { marginLeft: 44 } : undefined;

  // The flip composition (INVENTORY 114): the incoming spread lies
  // flat beneath, and the turning leaf — front and back faces —
  // rotates around the spine (two-page) or the page's left edge
  // (one-page, where the turned leaf's back is blank paper). frac is
  // the rotation progress: 0 = leaf flat on the right showing its
  // front, 1 = flat on the left showing its back; rotateY(-180*frac)
  // serves both directions.
  const renderFlip = () => {
    const { dir, from, to, frac, phase } = flip;
    const leafStyle = {
      width: layout.pageW,
      height: layout.pageH,
      transform: `rotateY(${-180 * frac}deg)`,
      transition:
        phase === "go"
          ? "transform 0.44s cubic-bezier(0.3, 0.55, 0.3, 1)"
          : phase === "settle"
            ? "transform 0.18s ease-out"
            : "none",
    };
    // Face selection is deterministic (INVENTORY 124/125): exactly
    // one face is visible at any rotation — the one facing the
    // reader. The build before this fix relied on backface-visibility
    // alone, and on engines where the culling fails (Safari, where
    // Joshua's videos were shot) the hidden face painted through as
    // MIRRORED text sweeping over the page beneath. A face with
    // visibility:hidden cannot paint at all, in any engine.
    const frontFaceStyle = { visibility: frac < 0.5 ? "visible" : "hidden" };
    const backFaceStyle = { visibility: frac >= 0.5 ? "visible" : "hidden" };
    const blankBack = (
      <div
        className="bv-page bv-leaf-blank"
        style={{ width: layout.pageW, height: layout.pageH }}
        aria-hidden="true"
      />
    );
    if (mode === "one") {
      leafStyle.left = 0;
      return (
        <div className="bv-spread bv-single bv-flipping" style={spreadGutter}>
          {renderPage(dir > 0 ? to : from, "single")}
          <div className="bv-leaf" style={leafStyle} aria-hidden="true">
            <div className="bv-leaf-face bv-leaf-front" style={frontFaceStyle}>
              {renderPage(dir > 0 ? from : to, "single")}
            </div>
            <div className="bv-leaf-face bv-leaf-back" style={backFaceStyle}>{blankBack}</div>
          </div>
        </div>
      );
    }
    leafStyle.left = layout.pageW;
    return (
      <div className="bv-spread bv-flipping" style={spreadGutter}>
        {renderPage(dir > 0 ? from : to, "left")}
        {renderPage(dir > 0 ? to + 1 : from + 1, "right")}
        <div className="bv-leaf" style={leafStyle} aria-hidden="true">
          <div className="bv-leaf-face bv-leaf-front" style={frontFaceStyle}>
            {renderPage(dir > 0 ? from + 1 : to + 1, "right")}
          </div>
          <div className="bv-leaf-face bv-leaf-back" style={backFaceStyle}>
            {renderPage(dir > 0 ? to : from, "left")}
          </div>
        </div>
      </div>
    );
  };

  const renderSpread = (spreadIdx) => {
    if (mode === "one") {
      return (
        <div className="bv-spread bv-single" key={`sp-${spreadIdx}`} style={spreadGutter}>
          {renderPage(spreadIdx, "single")}
        </div>
      );
    }
    return (
      <div className="bv-spread" key={`sp-${spreadIdx}`} style={spreadGutter}>
        {renderPage(spreadIdx, "left")}
        {renderPage(spreadIdx + 1, "right")}
      </div>
    );
  };

  // The Dock carries only its own additions (INVENTORY 118): Contents,
  // Find, Highlights, and Share live solely in the AssistiveTouch orb
  // (ReaderAssist, driving the book through the bookNav bridge), so
  // their Dock slots — and the panels behind them — are gone. The Back
  // button is gone too (Joshua's order, 2026-11-20): the top dock is
  // the way back to the library, so a second back control here was
  // redundant. What remains: Entry info, Theme, View.
  const dockButtons = [
    { id: "info", icon: I.info, label: "Entry info", onClick: () => { setPhoneOpen(false); if (onInfo) onInfo(); } },
    {
      id: "theme",
      icon: I.theme,
      label: `Theme: ${THEME_NAMES[THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]]}`,
      onClick: cycleThemeDock,
    },
    {
      id: "view",
      icon: mode === "two" ? I.viewTwo : mode === "one" ? I.viewOne : I.viewThumbs,
      label: `View: ${MODE_NAMES[mode]}`,
      onClick: cycleView,
    },
  ];

  const viewIcon = mode === "two" ? I.viewTwo : mode === "one" ? I.viewOne : I.viewThumbs;

  return (
    <div
      className="bv-root"
      data-bvtheme={theme}
      ref={stageRef}
      tabIndex={-1}
      onWheel={onWheel}
      onClick={onStageClick}
      onPointerDown={onPointerDownStage}
      onPointerMove={onPointerMoveStage}
      onPointerUp={onPointerUpStage}
      onPointerCancel={onPointerCancelStage}
    >
      {!textDone && text && (
        <div className="bv-stream-status" role="status">
          Loading more of this text…
        </div>
      )}
      {/* The typesetter lives offscreen (appended by the paginator
          effect to document.body with .bv-typesetter). */}
      {mode === "thumbs" ? (
        <ThumbsGrid
          starts={starts}
          exact={table.exact}
          textLength={text ? text.length : 0}
          display={display}
          paragraphs={paragraphs}
          currentIdx={currentIdx}
          sectionAt={sectionAt}
          layout={layout}
          onJump={(idx) => {
            const back = readModeRef.current || "two";
            setMode(back);
            goToIdx(idx, { pairMode: back });
          }}
        />
      ) : (
        <div className="bv-stage">
          {flip ? (
            renderFlip()
          ) : (
            <div
              className={`bv-track${turnAnim ? (turnAnim.dir > 0 ? " is-turn-next" : " is-turn-prev") : ""}`}
              key={currentSpreadIdx}
            >
              {renderSpread(currentSpreadIdx)}
            </div>
          )}
          {/* A tap on the stage never turns the page (Joshua's rule,
              2026-11-20 — see onStageClick): turns come from the
              bottom arrows or a swipe/drag only. Overlay tap zones
              would sit on the text and block selection across most
              of the page (§7.9). */}
        </div>
      )}

      {/* Dock — desktop: one floating assembly, icons over scrubber. */}
      {!layout.phone && (
        <div
          className={`bv-dock${dockIdle ? " is-idle" : ""}`}
          onPointerEnter={pokeDock}
          onPointerMove={pokeDock}
        >
          <div className="bv-dock-icons" onPointerMove={magnify} onPointerLeave={demagnify}>
            {dockButtons.map((b) => (
              <button
                key={b.id}
                type="button"
                className="bv-dock-btn"
                aria-label={b.label}
                ref={(el) => {
                  dockBtnRefs.current[b.id] = el;
                }}
                onClick={b.onClick}
                onFocus={(e) => {
                  e.currentTarget.style.transform = "scale(1.28)";
                  e.currentTarget.classList.add("is-hot");
                }}
                onBlur={(e) => {
                  e.currentTarget.style.transform = "";
                  e.currentTarget.classList.remove("is-hot");
                }}
              >
                {b.icon}
                <span className="bv-dock-chip" aria-hidden="true">{b.label}</span>
              </button>
            ))}
          </div>
          <div className="bv-dock-divider" aria-hidden="true" />
          <Scrubber
            text={text}
            sections={sections}
            anchor={anchor}
            currentIdx={currentIdx}
            scrubInfoIdx={scrubInfoIdx}
            preview={scrubPreview}
            setPreview={setScrubPreview}
            onJump={(off) => turnToOffset(off)}
          />
          <div className="bv-readout">
            <div className="bv-readout-main">{readoutMain}</div>
            {stats && (
              <div className="bv-readout-sub">
                {stats.words.toLocaleString()} WORDS · ~{stats.minutes} MIN READ
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dock — phone: collapsed strip + expandable fan (§7.8). */}
      {layout.phone && (
        <>
          <div className="bv-strip">
            <button
              type="button"
              className="bv-strip-expand"
              aria-label="Open reading tools"
              aria-expanded={phoneOpen}
              onClick={() => setPhoneOpen((v) => !v)}
            >
              {I.expand}
            </button>
            <Scrubber
              text={text}
              sections={sections}
              anchor={anchor}
              currentIdx={currentIdx}
              scrubInfoIdx={scrubInfoIdx}
              preview={scrubPreview}
              setPreview={setScrubPreview}
              onJump={(off) => turnToOffset(off)}
              phone
            />
            <div className="bv-strip-chip">{readoutPhone}</div>
          </div>
          {phoneOpen && (
            <div className="bv-fan" role="menu" aria-label="Reading tools">
              {dockButtons.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="bv-fan-btn"
                  aria-label={b.label}
                  ref={(el) => {
                    dockBtnRefs.current[b.id] = el;
                  }}
                  onClick={() => {
                    b.onClick();
                    // Choosing any tool collapses the fan (§7.8).
                    setPhoneOpen(false);
                  }}
                >
                  {b.icon}
                  <span className="bv-fan-chip" aria-hidden="true">{b.label}</span>
                </button>
              ))}
              <span className="bv-fan-viewstate" aria-hidden="true">{viewIcon}</span>
            </div>
          )}
        </>
      )}

      {/* Page-turn arrows (INVENTORY 114): two icon-only arrows at the
          very bottom of the reading page — previous / next page of
          THIS text, in both one-page and spread views. */}
      {mode !== "thumbs" && (
        <div className="bv-turnbar">
          <button
            type="button"
            className="bv-turn-btn"
            aria-label="Previous page"
            disabled={currentSpreadIdx <= 0}
            onClick={() => turnBy(-1)}
          >
            {I.prevPage}
          </button>
          <button
            type="button"
            className="bv-turn-btn"
            aria-label="Next page"
            disabled={
              currentSpreadIdx >=
              spreadStartIdx(Math.max(0, starts.length - 1))
            }
            onClick={() => turnBy(1)}
          >
            {I.nextPage}
          </button>
        </div>
      )}

      {toast && (
        <div className="bv-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      {/* Highlight capture pill, anchored to the selection (§7.9). */}
      {hlMode && (
        <div
          className="bv-hl-pill"
          style={
            pendingSel
              ? {
                  left: clamp(pendingSel.rect.left + pendingSel.rect.width / 2, 90, window.innerWidth - 90),
                  top:
                    pendingSel.rect.bottom + 56 > window.innerHeight
                      ? Math.max(8, pendingSel.rect.top - 52)
                      : pendingSel.rect.bottom + 10,
                }
              : { left: "50%", bottom: 84, top: "auto" }
          }
          role="dialog"
          aria-label="Highlight capture"
        >
          <button
            type="button"
            className="bv-hl-add"
            disabled={!pendingSel}
            onClick={addPendingHighlight}
          >
            + Add highlight
          </button>
          <span className="bv-hl-count" role="status">
            {savedHls.length} saved
          </span>
          <button
            type="button"
            className="bv-hl-done"
            onClick={() => setHlMode(false)}
          >
            Done
          </button>
          <button
            type="button"
            className="bv-hl-cancel"
            aria-label="Cancel highlight capture"
            onClick={() => setHlMode(false)}
          >
            {I.close}
          </button>
        </div>
      )}

      {/* The orb: sole home of Search, Contents, Share, Highlight, and
          Listen in book view (INVENTORY 112/118). */}
      {bootGone && text && (
        <ReaderAssist
          text={text}
          title={title}
          chunkStarts={table.starts}
          shownChunks={table.starts.length}
          winStart={0}
          ensureChunk={() => {}}
          chunkElsRef={pageElsRef}
          onActiveMark={() => {}}
          bookNav={bookNavRef.current}
          hidden={popupOpen}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dash scrubber (§7.4): a column of dashes tiling [0, text.length).
// ---------------------------------------------------------------------------
function Scrubber({
  text,
  sections,
  anchor,
  scrubInfoIdx,
  preview,
  setPreview,
  onJump,
  phone,
}) {
  const colRef = useRef(null);
  const [height, setHeight] = useState(320);
  // Gesture state (INVENTORY 130 reliability revamp, 2026-11-20): the
  // shipped version keyed everything off a cached geometry ref and a
  // 200 ms long-press, and had no pointercancel path at all — on a
  // real iPhone the drag registered only intermittently (Joshua's
  // verdict). Now: position comes from the LIVE element rect on every
  // event, the loupe engages on first movement (or a short 130 ms
  // hold), and EVERY way a gesture can end — release, pointercancel
  // (iOS claiming the gesture), lost capture — resolves through one
  // finish path that lands the jump at the finger's last position.
  const gestureRef = useRef(null); // {id, startY, idx} of the active press
  const magTimerRef = useRef(0);
  const [mag, setMag] = useState(false);

  useEffect(() => {
    const el = colRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      setHeight(el.getBoundingClientRect().height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = clamp(Math.floor(height / 5), 24, 160);

  const sectionDash = useMemo(() => {
    const set = new Set();
    if (!text || text.length === 0) return set;
    for (const s of sections) {
      set.add(Math.min(n - 1, Math.floor((s.offset / text.length) * n)));
    }
    return set;
  }, [sections, text, n]);

  const curDash =
    text && text.length > 0
      ? Math.min(n - 1, Math.floor((anchor / text.length) * n))
      : 0;
  const previewInfo = preview !== null ? scrubInfoIdx(preview, n) : null;

  // Position from the live rect — never from cached geometry (see the
  // gesture note above). A rect read per pointer event is cheap here:
  // nothing in the drag dirties the column's own layout.
  const infoAt = (clientY) => {
    const el = colRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!(r.height > 0)) return null;
    const frac = clamp((clientY - r.top) / r.height, 0, 0.9999);
    return scrubInfoIdx(Math.floor(frac * n), n);
  };

  const raiseMagSoon = () => {
    window.clearTimeout(magTimerRef.current);
    magTimerRef.current = window.setTimeout(() => {
      if (gestureRef.current) setMag(true);
    }, 130);
  };

  const beginGesture = (e) => {
    const info = infoAt(e.clientY);
    if (!info) return false;
    gestureRef.current = { id: e.pointerId, startY: e.clientY, idx: info.idx };
    setPreview(info.idx);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    if (phone) {
      setMag(false);
      raiseMagSoon();
    }
    return true;
  };

  const handleDown = (e) => {
    if (gestureRef.current) return; // one active pointer at a time
    beginGesture(e);
    // Click and drag share one rule (§7.4): the press previews, the
    // release jumps — a plain click is just a press+release in place.
  };
  const handleMove = (e) => {
    const g = gestureRef.current;
    if (!g) {
      if (e.pointerType === "mouse" && e.buttons === 0) {
        // Desktop hover preview.
        const info = infoAt(e.clientY);
        setPreview(info ? info.idx : null);
        return;
      }
      if (e.buttons > 0) {
        // A drag whose pointerdown we somehow missed (self-heal):
        // adopt it rather than ignoring the whole gesture.
        beginGesture(e);
      }
      return;
    }
    if (e.pointerId !== g.id) return;
    const info = infoAt(e.clientY);
    if (!info) return;
    g.idx = info.idx;
    setPreview(info.idx);
    if (phone && !mag && Math.abs(e.clientY - g.startY) > 6) {
      window.clearTimeout(magTimerRef.current);
      setMag(true);
    }
  };
  // One finish path for pointerup, pointercancel, and lost capture:
  // the reader lands where the finger last was — a cancelled gesture
  // (iOS selection/callout takeover, system gesture) must never die
  // silently or leave the loupe/preview stuck on screen.
  const finishGesture = (e) => {
    const g = gestureRef.current;
    if (!g) return;
    if (e && e.pointerId !== undefined && e.pointerId !== g.id) return;
    gestureRef.current = null;
    window.clearTimeout(magTimerRef.current);
    setMag(false);
    setPreview(null);
    let idx = g.idx;
    if (e && typeof e.clientY === "number") {
      const info = infoAt(e.clientY);
      if (info) idx = info.idx;
    }
    const info = scrubInfoIdx(idx, n);
    if (info) onJump(info.sliceStart);
  };
  const handleUp = (e) => finishGesture(e);
  const handleCancel = (e) => finishGesture(e);

  const curInfo = scrubInfoIdx(curDash, n);
  // The loupe rides at the finger's height, clamped so its full
  // circle stays inside the column at the rail's ends.
  const magTop =
    preview !== null
      ? clamp(((preview + 0.5) / n) * height, 62, Math.max(62, height - 62))
      : 0;

  return (
    <div className={`bv-scrub-wrap${phone ? " bv-scrub-phone" : ""}`}>
      <div
        ref={colRef}
        className="bv-scrub"
        role="slider"
        tabIndex={0}
        aria-label="Position in this text"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={curInfo ? curInfo.pct : 0}
        aria-valuetext={
          curInfo
            ? `${curInfo.label}, ${curInfo.pct}% through the text`
            : undefined
        }
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleCancel}
        onLostPointerCapture={handleCancel}
        onPointerLeave={() => {
          if (!gestureRef.current) {
            setPreview(null);
            setMag(false);
          }
        }}
        onKeyDown={(e) => {
          if (!text) return;
          const stepSlice = text.length / n;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const d = e.key === "ArrowDown" ? 1 : -1;
            onJump(clamp(anchor + d * stepSlice, 0, text.length - 1));
          } else if (e.key === "PageDown" || e.key === "PageUp") {
            e.preventDefault();
            const d = e.key === "PageDown" ? 1 : -1;
            onJump(clamp(anchor + d * text.length * 0.1, 0, text.length - 1));
          } else if (e.key === "Home") {
            e.preventDefault();
            onJump(0);
          } else if (e.key === "End") {
            e.preventDefault();
            onJump(text.length - 1);
          }
        }}
      >
        {Array.from({ length: n }, (_, i) => (
          <span
            key={i}
            className={
              "bv-dash" +
              (sectionDash.has(i) ? " is-section" : "") +
              (i === curDash ? " is-current" : "") +
              (preview === i ? " is-preview" : "")
            }
          />
        ))}
      </div>
      {previewInfo && !phone && (
        <div className="bv-scrub-label" role="status">
          <span className="bv-scrub-label-title">{previewInfo.label}</span>
          <span className="bv-scrub-label-meta">
            {previewInfo.pct}%
            {previewInfo.pageRange ? ` · ${previewInfo.pageRange}` : ""}
          </span>
        </div>
      )}
      {previewInfo && phone && mag && (
        <div
          className="bv-scrub-mag"
          role="status"
          style={{ top: magTop }}
        >
          <span className="bv-scrub-mag-title">{previewInfo.label}</span>
          <span className="bv-scrub-mag-meta">
            {previewInfo.pageRange ? `${previewInfo.pageRange} · ` : ""}
            {previewInfo.pct}%
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thumbnails (§7.6): typeset page miniatures, virtualized rows.
// ---------------------------------------------------------------------------
function ThumbsGrid({ starts, textLength, display, paragraphs, currentIdx, sectionAt, layout, onJump }) {
  const ref = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  const cols = layout.phone ? 3 : 6;
  const cellW = layout.phone ? 104 : 132;
  const cellH = Math.round(cellW * 1.45);
  const rowH = cellH + 34;
  const rows = Math.ceil(starts.length / cols);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setViewH(el.clientHeight);
    el.scrollTop = Math.max(0, Math.floor(currentIdx / cols) * rowH - 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstRow = Math.max(0, Math.floor(scrollTop / rowH) - 1);
  const lastRow = Math.min(rows - 1, Math.ceil((scrollTop + viewH) / rowH) + 1);
  const scale = cellW / layout.pageW;

  const cells = [];
  for (let r = firstRow; r <= lastRow; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= starts.length) break;
      const s = starts[idx];
      const e = idx + 1 < starts.length ? starts[idx + 1] : textLength;
      const blocks = display ? pageBlocks(paragraphs, display, s, e) : [];
      cells.push(
        <button
          key={idx}
          type="button"
          className={`bv-thumb${idx === currentIdx ? " is-current" : ""}`}
          style={{
            position: "absolute",
            left: c * (cellW + 14),
            top: r * rowH,
            width: cellW,
          }}
          onClick={() => onJump(idx)}
          aria-label={`Go to page ${idx + 1}`}
        >
          <span className="bv-thumb-page" style={{ width: cellW, height: cellH }}>
            <span
              className="bv-thumb-text bv-text"
              style={{
                width: layout.contentW,
                fontSize: layout.fontPx,
                lineHeight: layout.lhMult,
                transform: `scale(${scale})`,
                left: layout.padInner * scale,
                top: layout.padTop * scale,
              }}
            >
              {blocks.map((b) => (
                <div key={b.key} className={b.cls}>
                  {b.text}
                </div>
              ))}
            </span>
          </span>
          <span className="bv-thumb-cap">
            {idx + 1} · {sectionAt(s)?.label || ""}
          </span>
        </button>
      );
    }
  }

  return (
    <div
      className="bv-thumbs"
      ref={ref}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      role="grid"
      aria-label="Page thumbnails"
    >
      <div
        className="bv-thumbs-inner"
        style={{ height: rows * rowH, width: cols * (cellW + 14) }}
      >
        {cells}
      </div>
    </div>
  );
}
