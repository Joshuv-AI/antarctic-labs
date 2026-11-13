// Tower of Babel — catalog core primitives shared by the main-thread
// catalog (catalog.js) and the browse-stream worker (browse-worker.js).
//
// Extracted verbatim from catalog.js (2026-11-11 phone load fix) so the
// worker can run the exact same hash, id-index and transpose code off
// the main thread: byte-for-byte identical output is a correctness
// requirement, not a nicety — the worker's transposed chunks are
// committed into the same column store the main-thread transpose
// builds, and both dedupe against byte-mode id indexes whose probes
// must agree.

export const textEncoder = new TextEncoder();

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Same hash over the UTF-8 bytes of a string. Identical to fnv1a for
// ASCII text (byte == char code), which covers artifact ids in
// practice; a byte-mode table only ever probes against itself, so the
// two variants never mix inside one table.
export function fnv1aBytes(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Exact UTF-8 byte length of a string, matching TextEncoder semantics
// (unpaired surrogates encode as the 3-byte U+FFFD replacement). Lets
// the transpose size its buffers exactly and fill them with
// encodeInto in one pass — no per-string Uint8Array allocations and
// no copy loop (2026-11-11 smoothness: the encode+copy text half of
// the transpose measured ~2x this walk+encodeInto pass, and the old
// parts arrays were pure GC churn). Byte-identical output vs the
// encode() path, verified over adversarial + fuzz inputs.
export function utf8ByteLength(str) {
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
      if (d >= 0xdc00 && d <= 0xdfff) {
        n += 4;
        i++;
      } else n += 3;
    } else n += 3;
  }
  return n;
}

// Open-addressing id -> index table. Probes are verified by content,
// so hash collisions can never produce a wrong answer. Duplicate ids
// keep the LAST index, matching Map.set semantics. Also exported for
// the page derivation's phase-0 id index (pages.jsx), which attaches
// the current artifacts array and syncs incrementally as it grows.
//
// Two probe modes, fixed at construction:
//  - string mode: `keyAt(i)` returns the id of resident index i (or an
//    attached artifacts array supplies it). Used for plain arrays.
//  - byte mode (`bytesAt(i)` -> [buffer, start, end] of the id's UTF-8
//    bytes): probes hash and compare BYTES and never decode. The
//    2026-11-11 CPU profile found decode-per-probe (idAt) was ~46% of
//    all main-thread time during the catalog stream — millions of
//    TextDecoder calls, one per probe step, each allocating a string.
//    Byte equality is exactly decoded-string equality (both paths
//    normalize unpaired surrogates to U+FFFD), and the lookup id is
//    encoded once per operation instead of decoded per probe step.
// `expectedCount` pre-sizes the table (load factor <= 0.5) so a
// stream whose total is known never pays a rehash pass; the final
// table size is the same one repeated growth would reach.
export class CatalogIdIndex {
  constructor(keyAt, expectedCount = 0, bytesAt = null) {
    this._keyAt = keyAt || null;
    this._bytesAt = bytesAt || null;
    this._byteMode = !!bytesAt;
    this._arts = null;
    let cap = 1024;
    while (cap < (expectedCount + 1) * 2) cap *= 2;
    this.cap = cap;
    this.table = new Uint32Array(this.cap);
    this.count = 0;
    this.builtLen = 0;
  }
  attach(artifacts) {
    this._arts = artifacts;
  }
  _key(i) {
    return this._arts ? this._arts[i].artifact_id : this._keyAt(i);
  }
  // True when resident index i holds exactly these id bytes.
  _bytesMatch(i, idBytes) {
    const b = this._bytesAt(i);
    if (!b) return false;
    const buf = b[0];
    const s = b[1];
    if (b[2] - s !== idBytes.length) return false;
    for (let k = 0; k < idBytes.length; k++) {
      if (buf[s + k] !== idBytes[k]) return false;
    }
    return true;
  }
  _probe(id, idBytes) {
    let slot =
      (idBytes ? fnv1aBytes(idBytes) : fnv1a(id)) & (this.cap - 1);
    for (;;) {
      const v = this.table[slot];
      if (
        v === 0 ||
        (idBytes
          ? this._bytesMatch(v - 1, idBytes)
          : this._key(v - 1) === id)
      )
        return slot;
      slot = (slot + 1) & (this.cap - 1);
    }
  }
  _grow() {
    const old = this.table;
    this.cap *= 2;
    this.table = new Uint32Array(this.cap);
    this.count = 0;
    for (let i = 0; i < old.length; i++) {
      const v = old[i];
      if (v !== 0) {
        // Byte mode reinserts from the stored bytes (no decode, no
        // string needed); string mode re-keys from keyAt/attached.
        const slot = this._byteMode
          ? this._probeBytesAt(v - 1)
          : this._probe(this._key(v - 1), null);
        this.table[slot] = v;
        this.count++;
      }
    }
  }
  // Probe for the id whose bytes are bytesAt(i) of some resident
  // index — used by _grow and by syncToBytes, where no id string
  // exists yet and none should be materialized.
  _probeBytesAt(i) {
    const b = this._bytesAt(i);
    const bytes =
      b[1] === 0 && b[2] === b[0].length
        ? b[0]
        : b[0].subarray(b[1], b[2]);
    return this._probe(null, bytes);
  }
  // Insert index for id, or overwrite the existing entry (last wins).
  add(idx, id) {
    if ((this.count + 1) * 2 > this.cap) this._grow();
    const slot = this._byteMode
      ? this._probe(id, textEncoder.encode(id))
      : this._probe(id, null);
    if (this.table[slot] === 0) this.count++;
    this.table[slot] = idx + 1;
  }
  get(id) {
    if (typeof id !== "string") return undefined;
    const slot = this._byteMode
      ? this._probe(id, textEncoder.encode(id))
      : this._probe(id, null);
    const v = this.table[slot];
    return v === 0 ? undefined : v - 1;
  }
  // Byte-mode probe for callers that hold an id's UTF-8 bytes and no
  // string (the TCB1 binary session, tcb1.js): identical semantics to
  // get() — byte equality is decoded-string equality — without
  // materializing the string. Byte-mode indexes only.
  getBytes(idBytes) {
    if (!this._byteMode) return undefined;
    const slot = this._probe(null, idBytes);
    const v = this.table[slot];
    return v === 0 ? undefined : v - 1;
  }
  // Byte-mode insert twin of add(): same last-wins semantics.
  addBytes(idx, idBytes) {
    if ((this.count + 1) * 2 > this.cap) this._grow();
    const slot = this._probe(null, idBytes);
    if (this.table[slot] === 0) this.count++;
    this.table[slot] = idx + 1;
  }
  // Extend the index over an artifacts array-like (growing-prefix
  // incremental, exactly like the Map fill loop it replaces).
  syncTo(artifacts, maxNew = Infinity) {
    this.attach(artifacts);
    const stop = Math.min(artifacts.length, this.builtLen + maxNew);
    while (this.builtLen < stop) {
      const i = this.builtLen;
      this.add(i, artifacts[i].artifact_id);
      this.builtLen = i + 1;
    }
  }
  // Byte-mode twin of syncTo: index `length` residents straight from
  // their stored bytes — no record is materialized and no id is
  // decoded. Same last-wins, growing-prefix semantics.
  syncToBytes(length, maxNew = Infinity) {
    const stop = Math.min(length, this.builtLen + maxNew);
    while (this.builtLen < stop) {
      const i = this.builtLen;
      if ((this.count + 1) * 2 > this.cap) this._grow();
      const slot = this._probeBytesAt(i);
      if (this.table[slot] === 0) this.count++;
      this.table[slot] = i + 1;
      this.builtLen = i + 1;
    }
  }
  // Mode-aware sync for callers holding an array-like whose length is
  // the resident count (the catalog view pins it at publish).
  syncSmart(artifacts, maxNew = Infinity) {
    if (this._byteMode) this.syncToBytes(artifacts.length, maxNew);
    else this.syncTo(artifacts, maxNew);
  }
}


// ---------------------------------------------------------------------
// Transpose session (2026-11-11 phone load fix): the browse worker's
// half of the column transpose. It performs, off the main thread, the
// exact work appendRecordsToStore (catalog.js) does on it — the same
// dedupe contract (first occurrence of an artifact_id wins, records
// without an id are skipped, verified against a byte-mode
// CatalogIdIndex over the session's own retained id bytes), the same
// UTF-8 length walk + single encodeInto pass — but instead of writing
// into the shared column store it returns a self-contained payload:
//
//   { n, idBytes, idOff, titleBytes, titleOff,
//     codes: { creator, year, coll, fmt, rights, dl },
//     fresh: { creator, year, coll, fmt, rights, dl } }
//
// `codes` are SESSION-LOCAL dictionary codes (Uint32 for creator/year,
// Uint8 for the rest — the same widths the store uses). `fresh` lists,
// per column, the dictionary values this call assigned new local codes
// to, in code order: the main thread assigns each a global code in its
// own dictionaries and remaps the page's codes through them, so the
// committed columns are identical to a main-thread transpose. The
// session retains a COPY of each chunk's id bytes (the payload's are
// transferred to the main thread) so its dedupe index can keep
// probing; resetTo() drops the chunks a caller never committed (a
// stream that stopped at a failed page and later resumes) and rebuilds
// the index over the committed prefix only.
export const TRANSPOSE_COLUMNS = [
  ["creator", "creator", Uint32Array],
  ["year", "year", Uint32Array],
  ["coll", "collection", Uint8Array],
  ["fmt", "format", Uint8Array],
  ["rights", "rights_status", Uint8Array],
  ["dl", "download_status", Uint8Array],
];

export function createTransposeSession(expectedCount = 0) {
  const dicts = {};
  for (const [key] of TRANSPOSE_COLUMNS) {
    dicts[key] = { map: new Map(), values: [] };
  }
  // Retained chunks: {pageCursor, start, n, idBytes, idOff} — the id
  // bytes the dedupe index probes against (bytesAt below).
  const retained = [];
  const chunkOf = []; // resident index -> retained chunk
  let count = 0;
  const bytesAt = (i) => {
    const c = chunkOf[i];
    if (!c) return null;
    const local = i - c.start;
    return [c.idBytes, c.idOff[local], c.idOff[local + 1]];
  };
  let index = new CatalogIdIndex(null, expectedCount || 0, bytesAt);

  function dictCodeLocal(key, v, fresh) {
    const d = dicts[key];
    let code = d.map.get(v);
    if (code === undefined) {
      code = d.values.length;
      d.map.set(v, code);
      d.values.push(v);
      fresh[key].push(v);
    }
    return code;
  }

  function transpose(records, pageCursor = 0) {
    const total = records ? records.length : 0;
    const fresh = {};
    for (const [key] of TRANSPOSE_COLUMNS) fresh[key] = [];
    const emptyCodes = () => {
      const codes = {};
      for (const [key, , ctor] of TRANSPOSE_COLUMNS) codes[key] = new ctor(0);
      return codes;
    };
    if (!total) {
      retained.push({
        pageCursor, start: count, n: 0,
        idBytes: new Uint8Array(0), idOff: new Uint32Array(1),
      });
      return {
        n: 0,
        idBytes: new Uint8Array(0), idOff: new Uint32Array(1),
        titleBytes: new Uint8Array(0), titleOff: new Uint32Array(1),
        codes: emptyCodes(), fresh,
      };
    }
    // Dedupe, identical to appendRecordsToStore: first wins, within
    // the batch and against everything the session has accepted.
    const seenLocal = new Set();
    const accepted = [];
    for (let j = 0; j < total; j++) {
      const r = records[j];
      if (!r || !r.artifact_id) continue;
      const id = r.artifact_id;
      if (seenLocal.has(id)) continue;
      if (index.get(id) !== undefined) continue;
      seenLocal.add(id);
      accepted.push(r);
    }
    const n = accepted.length;
    const start = count;
    const idOff = new Uint32Array(n + 1);
    const titleOff = new Uint32Array(n + 1);
    const idStrs = new Array(n);
    const titleStrs = new Array(n);
    let idLen = 0;
    let titleLen = 0;
    for (let j = 0; j < n; j++) {
      const r = accepted[j];
      const idStr = String(r.artifact_id);
      const titleStr = r.title == null ? "" : String(r.title);
      idStrs[j] = idStr;
      titleStrs[j] = titleStr;
      idOff[j + 1] = (idLen += utf8ByteLength(idStr));
      titleOff[j + 1] = (titleLen += utf8ByteLength(titleStr));
    }
    const idBytes = new Uint8Array(idLen);
    const titleBytes = new Uint8Array(titleLen);
    for (let j = 0; j < n; j++) {
      textEncoder.encodeInto(idStrs[j], idBytes.subarray(idOff[j]));
      textEncoder.encodeInto(titleStrs[j], titleBytes.subarray(titleOff[j]));
    }
    const codes = {};
    for (const [key, , ctor] of TRANSPOSE_COLUMNS) codes[key] = new ctor(n);
    for (let j = 0; j < n; j++) {
      const r = accepted[j];
      for (const [key, field] of TRANSPOSE_COLUMNS) {
        codes[key][j] = dictCodeLocal(key, r[field], fresh);
      }
    }
    // Retain a copy of the id bytes for the dedupe index (the
    // payload's arrays are transferred away by the worker), then index
    // the new residents — their ids must be readable through bytesAt
    // before the first probe verifies them, exactly as the store
    // pushes its chunk before indexing it.
    const chunk = {
      pageCursor, start, n,
      idBytes: idBytes.slice(), idOff: idOff.slice(),
    };
    retained.push(chunk);
    for (let j = 0; j < n; j++) chunkOf.push(chunk);
    for (let j = 0; j < n; j++) index.add(start + j, accepted[j].artifact_id);
    count += n;
    index.builtLen = count;
    return { n, idBytes, idOff, titleBytes, titleOff, codes, fresh };
  }

  // Drop every chunk whose page starts at or after `serverCursor`
  // (pages the caller buffered but never committed — the stream
  // stopped at a failed page) and rebuild the dedupe index over the
  // committed prefix, so a resumed stream re-accepts exactly the
  // records the caller is missing. Chunks are retained in transpose
  // order, and page cursors are non-decreasing along the stream.
  function resetTo(serverCursor) {
    let keep = 0;
    while (keep < retained.length && retained[keep].pageCursor < serverCursor) {
      keep++;
    }
    retained.length = keep;
    chunkOf.length = 0;
    count = 0;
    for (const c of retained) {
      c.start = count;
      for (let j = 0; j < c.n; j++) chunkOf.push(c);
      count += c.n;
    }
    index = new CatalogIdIndex(null, expectedCount || count, bytesAt);
    index.syncToBytes(count);
    index.builtLen = count;
  }

  // Retained-footprint accounting for the main thread's byte ledger
  // (2026-11-13): the bytes this session pins in the worker — the
  // retained chunk id bytes its dedupe index probes against, the
  // index table, and the session dictionaries (counted the same way
  // catalog.js's ledger counts the store's: UTF-8 bytes + 16 per
  // string value, a flat 8 per non-string).
  function stats() {
    let retainedBytes = 0;
    for (const c of retained) {
      retainedBytes += c.idBytes.byteLength + c.idOff.byteLength;
    }
    let dictBytes = 0;
    for (const [key] of TRANSPOSE_COLUMNS) {
      const d = dicts[key];
      for (const v of d.values) {
        dictBytes += typeof v === "string" ? utf8ByteLength(v) + 16 : 8;
      }
    }
    return { retainedBytes, indexBytes: index.table.byteLength, dictBytes };
  }

  return {
    transpose,
    resetTo,
    stats,
    get count() { return count; },
  };
}
