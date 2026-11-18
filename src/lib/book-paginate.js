// Book-view pagination engine (INVENTORY 101/102, DESIGN.md §§4–6).
//
// The one invariant everything rests on: every anchor is a CHARACTER
// OFFSET into the unchanged source text. Reflow is length-preserving —
// joining a prose paragraph replaces each intra-paragraph "\n" with a
// single " " (one char for one char) — so the display string has exactly
// the source's length and offsets index both identically. Pages are
// contiguous [start, end) ranges over that string, measured with the
// browser's own layout (a hidden typesetter sharing the page CSS), so
// measured breaks are rendered breaks by construction.

// ---------------------------------------------------------------------------
// Reflow
// ---------------------------------------------------------------------------

// A paragraph is prose (joinable) only when its lines predominantly run
// long and it has at least two lines (DESIGN §4.4). Everything else —
// verse, transcripts, statute lists, tables — keeps its line breaks.
const PROSE_MIN_MEDIAN = 58;

export function reflowText(text, sectionStarts) {
  const marks = sectionStarts || new Set();
  const paragraphs = [];
  const joins = []; // offsets of "\n" chars that become " " in display
  let lineStart = 0;
  let paraLines = null; // [{start, len}]

  const flushPara = () => {
    if (!paraLines || paraLines.length === 0) return;
    const start = paraLines[0].start;
    const lastLine = paraLines[paraLines.length - 1];
    const end = lastLine.start + lastLine.len;
    let kind = "lineated";
    if (paraLines.length >= 2) {
      const lens = paraLines.map((l) => l.len).sort((a, b) => a - b);
      const median = lens[lens.length >> 1];
      if (median >= PROSE_MIN_MEDIAN) kind = "prose";
    }
    if (marks.has(start)) kind = "heading";
    if (kind === "prose") {
      for (let i = 0; i < paraLines.length - 1; i++) {
        joins.push(paraLines[i].start + paraLines[i].len); // the "\n" itself
      }
    }
    paragraphs.push({ start, end, kind, sectionStart: marks.has(start) });
    paraLines = null;
  };

  // Cursor line walk (no split("\n") — same discipline as chunkReaderText).
  for (;;) {
    let nl = text.indexOf("\n", lineStart);
    if (nl === -1) nl = text.length;
    const len = nl - lineStart;
    const line = text.slice(lineStart, nl);
    if (line.trim() === "") {
      flushPara();
    } else {
      if (!paraLines) paraLines = [];
      paraLines.push({ start: lineStart, len });
    }
    if (nl >= text.length) break;
    lineStart = nl + 1;
  }
  flushPara();

  // Build the display string: source with the join positions blanked.
  let display = text;
  if (joins.length > 0) {
    const parts = [];
    let last = 0;
    for (const p of joins) {
      parts.push(text.slice(last, p), " ");
      last = p + 1;
    }
    parts.push(text.slice(last));
    display = parts.join("");
  }
  return { display, paragraphs };
}

// Chunked reflow for very long texts: reflowText over the whole text
// is O(n) but still seconds on a 28M-char dictionary, which must not
// block first paint. Chunks are cut at blank-line boundaries ("\n\n"),
// so no paragraph ever spans a cut and each chunk's paragraphs are
// identical to the whole-text reflow's. Chunk displays concatenate
// exactly into the full display (joins never cross a boundary), so a
// paginator fed the prefix can EXTEND its table as chunks land.
export class ChunkedReflower {
  constructor(text, sectionStarts, chunkChars = 400000) {
    this.text = text;
    this.marks = sectionStarts || new Set();
    this.chunkChars = Math.max(50000, chunkChars);
    this.upto = 0;
    this.displayParts = [];
    this.paragraphs = [];
    this.display = "";
    this.done = false;
  }

  step() {
    if (this.done) return true;
    const text = this.text;
    let end;
    if (this.upto + this.chunkChars >= text.length) {
      end = text.length;
    } else {
      const cut = text.indexOf("\n\n", this.upto + this.chunkChars);
      end = cut === -1 ? text.length : cut + 2;
    }
    const base = this.upto;
    const chunk = text.slice(base, end);
    let localMarks = null;
    for (const m of this.marks) {
      if (m >= base && m < end) {
        if (!localMarks) localMarks = new Set();
        localMarks.add(m - base);
      }
    }
    const { display, paragraphs } = reflowText(chunk, localMarks);
    this.displayParts.push(display);
    for (const p of paragraphs) {
      this.paragraphs.push({
        start: p.start + base,
        end: p.end + base,
        kind: p.kind,
        sectionStart: p.sectionStart,
      });
    }
    this.upto = end;
    this.done = end >= text.length;
    this.display = this.displayParts.join("");
    return this.done;
  }
}

// Binary search: index of the last paragraph with start <= offset.
export function paragraphIndexAt(paragraphs, offset) {
  let lo = 0;
  let hi = paragraphs.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (paragraphs[mid].start <= offset) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

// ---------------------------------------------------------------------------
// Paginator
// ---------------------------------------------------------------------------

// Block class names — shared verbatim between the typesetter and the
// rendered page (styles.css .bv-blk rules), which is what makes measured
// breaks equal rendered breaks.
export function blockClass(para, continuation, afterHeading) {
  let cls = "bv-blk bv-" + para.kind;
  if (continuation) cls += " bv-cont";
  if (afterHeading) cls += " bv-after-head";
  return cls;
}

export class BookPaginator {
  // typesetter: a hidden element styled exactly like a page's text box
  // (same width as the page content box, same font/leading). The caller
  // owns its geometry; the paginator only fills and measures it.
  constructor({ display, paragraphs, typesetter, contentH, lineHeightPx, complete }) {
    this.display = display;
    this.paragraphs = paragraphs;
    this.complete = complete !== false;
    this.ts = typesetter;
    this.targetH = Math.max(40, contentH - lineHeightPx * 0.5); // §5.2 reserve
    this.contentH = contentH;
    // Primary segment: paginated from offset 0, append-only, prefix-stable.
    this.starts = paragraphs.length > 0 ? [0] : [];
    this.cursor = { para: 0, off: 0 };
    this.done = paragraphs.length === 0;
    // Optional window segment for far jumps into a long text (§5.3):
    // paginated forward from a paragraph boundary; heals away when the
    // primary segment reaches it.
    this.win = null;
    this.charsPerPage = 2900; // adaptive estimate, refined per measured page
  }

  get textLength() {
    return this.display.length;
  }

  // Offset the window segment has exactly paginated up to
  // (approximated by one page past its last measured start).
  get winReach() {
    if (!this.win) return -1;
    if (this.win.done) return this.textLength;
    const last = this.win.starts[this.win.starts.length - 1];
    return last + Math.max(400, Math.round(this.charsPerPage));
  }

  // Offset the primary segment has exactly paginated up to.
  get primaryCover() {
    if (this.done) return this.textLength;
    const p = this.paragraphs[this.cursor.para];
    return p ? p.start + this.cursor.off : this.textLength;
  }

  // -- measurement primitives ------------------------------------------------

  _block(para, from, continuation, afterHeading) {
    const el = document.createElement("div");
    el.className = blockClass(para, continuation, afterHeading);
    el.textContent = this.display.slice(para.start + from, para.end);
    return el;
  }

  // Line rects of a block's single text node, grouped by line: returns
  // [{top, bottom}] in viewport coords, one entry per visual line.
  _linesOf(blockEl) {
    const node = blockEl.firstChild;
    if (!node) return [];
    const range = document.createRange();
    range.selectNodeContents(blockEl);
    const rects = range.getClientRects();
    const lines = [];
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r.height === 0 && r.width === 0) continue;
      const last = lines[lines.length - 1];
      if (last && Math.abs(r.top - last.top) < 1.5) {
        last.bottom = Math.max(last.bottom, r.bottom);
      } else {
        lines.push({ top: r.top, bottom: r.bottom });
      }
    }
    return lines;
  }

  // Smallest char offset (within the block's text node) whose glyph sits
  // on a line BELOW `top`. Used to convert "last fitting line" into a
  // break offset. Returns the text length when no char is below.
  _firstCharBelow(blockEl, top) {
    const node = blockEl.firstChild;
    if (!node) return 0;
    const len = node.textContent.length;
    const probeTop = (c) => {
      // First measurable rect at or after char c (spaces at a line start
      // and "\n" chars may report no rect of their own).
      for (let k = c; k < Math.min(len, c + 6); k++) {
        const r = document.createRange();
        r.setStart(node, k);
        r.setEnd(node, Math.min(len, k + 1));
        const rects = r.getClientRects();
        for (let i = 0; i < rects.length; i++) {
          if (rects[i].height > 0 || rects[i].width > 0) return rects[i].top;
        }
      }
      return null;
    };
    let lo = 0;
    let hi = len;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const t = probeTop(mid);
      if (t === null || t > top + 1.5) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  // Measure one page starting at (paraIdx, off). Returns the position
  // where the next page starts: {para, off} or null when the text ended.
  _measurePage(paraIdx, off) {
    const ts = this.ts;
    const paras = this.paragraphs;
    ts.textContent = "";
    const tsTop = ts.getBoundingClientRect().top;
    const availBottom = tsTop + this.targetH;
    let prevKind = null;
    let blocksOnPage = 0;
    let lastConsumed = null; // {para, off} end of last fully consumed para

    for (let pi = paraIdx; pi < paras.length; pi++) {
      const para = paras[pi];
      const from = pi === paraIdx ? off : 0;
      // §4.3: a top-level section starts a new page when the current
      // page is already >=60% full.
      if (blocksOnPage > 0 && para.sectionStart && pi !== paraIdx) {
        const fill = ts.scrollHeight;
        if (fill >= this.targetH * 0.6) {
          return { para: pi, off: 0 };
        }
      }
      const block = this._block(para, from, from > 0, prevKind === "heading");
      ts.appendChild(block);
      const h = ts.scrollHeight;
      if (h <= this.targetH) {
        blocksOnPage++;
        prevKind = para.kind;
        lastConsumed = { para: pi, off: para.end - para.start };
        if (pi === paras.length - 1) return null; // text ended
        continue;
      }
      // Overflow. Work out how many of this block's lines fit.
      const lines = this._linesOf(block);
      let fitLines = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].bottom <= availBottom + 0.5) fitLines = i + 1;
        else break;
      }
      if (fitLines === 0) {
        if (blocksOnPage === 0) {
          // A single block taller than a fresh page (pathological box):
          // force one line so pagination always advances.
          const adv = lines.length
            ? Math.max(1, this._firstCharBelow(block, lines[0].top))
            : para.end - para.start - from;
          return { para: pi, off: from + adv };
        }
        // Nothing of this paragraph fits: page ends at its start.
        ts.removeChild(block);
        return { para: pi, off: from };
      }
      if (fitLines >= lines.length) {
        // Rounding disagreement: rects say it fits, scrollHeight said
        // not. Trust the rects (they are what renders) and consume it;
        // the block stays in the typesetter, so the next paragraph's
        // own line-fit ends the page at the right place.
        blocksOnPage++;
        prevKind = para.kind;
        lastConsumed = { para: pi, off: para.end - para.start };
        if (pi === paras.length - 1) return null;
        continue;
      }
      // Break inside this paragraph after fitLines lines.
      const totalLines = lines.length;
      let breakChar = this._firstCharBelow(block, lines[fitLines - 1].top);
      // Soft widow/orphan rules (§5.2.3).
      const remaining = totalLines - fitLines;
      if (remaining === 1 && fitLines >= 2) {
        // Orphan: one line would strand on the next page — pull the
        // break back one line so two lines travel together.
        breakChar = this._firstCharBelow(block, lines[fitLines - 2].top);
      } else if (fitLines === 1 && totalLines >= 3 && blocksOnPage > 0) {
        // Widow: a lone first line at the page foot — move the whole
        // paragraph to the next page.
        ts.removeChild(block);
        return { para: pi, off: from };
      }
      const localEnd = from + breakChar;
      if (localEnd >= para.end - para.start) {
        blocksOnPage++;
        lastConsumed = { para: pi, off: para.end - para.start };
        if (pi === paras.length - 1) return null;
        continue;
      }
      return { para: pi, off: localEnd };
    }
    return null;
  }

  // Normalize a _measurePage result into the next cursor + page start
  // offset. A result offset at a paragraph's end rolls to the next
  // paragraph's start; running off the last paragraph ends the text.
  _advance(result) {
    if (!result) return null;
    let { para, off } = result;
    const p = this.paragraphs[para];
    if (!p) return null;
    if (off >= p.end - p.start) {
      para += 1;
      off = 0;
      if (para >= this.paragraphs.length) return null;
    }
    return { para, off, start: this.paragraphs[para].start + off };
  }

  // Paginate the primary segment forward until the ms budget is spent
  // or the text is covered. Returns the number of pages added.
  paginateStep(budgetMs) {
    if (this.done) return 0;
    const t0 = performance.now();
    let added = 0;
    for (;;) {
      const next = this._advance(this._measurePage(this.cursor.para, this.cursor.off));
      if (!next) {
        this.done = true;
        break;
      }
      this.starts.push(next.start);
      const prevStart = this.starts[this.starts.length - 2];
      const cpp = next.start - prevStart;
      if (cpp > 200 && cpp < 20000) {
        this.charsPerPage = this.charsPerPage * 0.7 + cpp * 0.3;
      }
      this.cursor = { para: next.para, off: next.off };
      added++;
      if (added >= 2 && performance.now() - t0 >= budgetMs) break;
    }
    return added;
  }

  // -- window segment --------------------------------------------------------

  startWindow(offset) {
    if (this.paragraphs.length === 0) return;
    const pi = paragraphIndexAt(this.paragraphs, offset);
    const para = this.paragraphs[pi];
    if (para.start <= this.primaryCover) return; // primary already there
    this.win = {
      base: para.start,
      starts: [para.start],
      cursor: { para: pi, off: 0 },
      done: false,
    };
  }

  paginateWindowStep(budgetMs) {
    const w = this.win;
    if (!w || w.done) return 0;
    const t0 = performance.now();
    let added = 0;
    for (;;) {
      // Reuse the measure machinery against the window cursor by
      // temporarily swapping the shared routine's inputs.
      const next = this._advance(this._measurePage(w.cursor.para, w.cursor.off));
      if (!next) {
        w.done = true;
        break;
      }
      w.starts.push(next.start);
      w.cursor = { para: next.para, off: next.off };
      added++;
      if (added >= 2 && performance.now() - t0 >= budgetMs) break;
    }
    if (this.primaryCover >= w.base) this.win = null; // healed
    return added;
  }

  // -- unified view ------------------------------------------------------------

  // The full page-start table the UI reads: primary pages, then (while
  // a window segment exists ahead of the primary) estimated pages
  // bridging the gap, then the window's exact pages. `exact` is true
  // only when the primary segment covers the whole text.
  // Swap in a longer input (progressive reflow / streaming text). When
  // the new display extends the old one, the measured table stays
  // valid — pagination simply continues from its frontier. Anything
  // else resets the table (the caller re-windows around the anchor).
  update(display, paragraphs, complete) {
    const extendsOld =
      display.length >= this.display.length &&
      display.startsWith(this.display);
    this.display = display;
    this.paragraphs = paragraphs;
    this.complete = !!complete;
    if (!extendsOld) {
      this.starts = display.length === 0 ? [] : [0];
      this.cursor = { para: 0, off: 0 };
      this.done = display.length === 0;
      this.win = null;
    } else {
      // Extension: both measured segments stay valid — chunk
      // boundaries sit on blank lines, so every paragraph in the
      // shared region is identical in the longer input, window
      // included. (Dropping the window here made a restored deep
      // position creep forward with the primary frontier.)
      this.done = this.done && this.complete;
      // A window that "finished" against the shorter input is not
      // finished against the longer one: if its cursor no longer
      // sits at the end of the paragraph list, it has more text to
      // measure. Without this, winReach reports the full text
      // length for a window that stopped at the old prefix end —
      // and jump guards trust it and never re-base (the share
      // landing that stopped one chunk short of its target).
      if (
        this.win &&
        this.win.done &&
        this.win.cursor.para < paragraphs.length
      ) {
        this.win.done = false;
      }
    }
  }

  pageTable() {
    const starts = this.starts.slice();
    // Exact only when the measured table covers the COMPLETE text:
    // `done` alone means "to the end of the current input", which
    // during streaming / progressive reflow is only a prefix (§5.7).
    let exact = this.done && this.complete !== false;
    const w = this.win;
    if (w && !this.done) {
      const cover = this.primaryCover;
      if (cover < w.base) {
        exact = false;
        const step = Math.max(400, Math.round(this.charsPerPage));
        let s = cover;
        // Bridge estimates: uniform steps from the primary frontier to
        // the window base (never duplicating the window's first start).
        while (s + step < w.base) {
          s += step;
          starts.push(s);
        }
        for (const ws of w.starts) {
          if (ws > starts[starts.length - 1]) starts.push(ws);
        }
      } else if (w.starts.length > 1) {
        // Primary reached the window base: the window's pages beyond
        // the frontier are still the best local truth until the
        // primary pass covers them.
        for (const ws of w.starts) {
          if (ws > starts[starts.length - 1]) starts.push(ws);
        }
        exact = false;
      }
    }
    return { starts, exact };
  }

  // Page index containing `offset` in a starts table (binary search).
  static pageOf(starts, offset) {
    let lo = 0;
    let hi = starts.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= offset) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }
}
