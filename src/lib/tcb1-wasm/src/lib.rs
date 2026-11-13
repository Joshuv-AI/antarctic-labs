//! TCB1 browse-dataset decoder — Rust/WebAssembly port of the TCB1
//! transpose session in src/lib/tcb1.js (which see for the format and
//! the contract). This crate reproduces that session's observable
//! behavior EXACTLY:
//!
//! - same dedupe contract (first occurrence of an artifact_id wins,
//!   verified byte-wise against an open-addressing id index over the
//!   retained id bytes; the index uses the same FNV-1a hash, the same
//!   capacity policy and the same growth trigger, so even the
//!   reported index byte size matches the JS session's),
//! - same session-local dictionary codes: creator codes are a dense
//!   counter in first-appearance order (the JS counter interning),
//!   the small dictionaries translate global codes through per-field
//!   tables (equivalent to the JS value-keyed interning because
//!   dictionary values are unique per global code), and years are
//!   interned by VALUE with number / string / null kept distinct
//!   (JS Map key semantics),
//! - same `fresh` lists, in the same per-column assignment order,
//! - same resetTo contract: retained chunks at/after the cursor are
//!   dropped and the id index is rebuilt over the committed prefix,
//!   while ALL dictionary state (xlate tables, year map, counters)
//!   survives — codes stay stable across a reset and already-shipped
//!   fresh values are never re-shipped.
//!
//! String VALUES never cross the boundary as decoded text: `fresh`
//! strings are staged as raw UTF-8 bytes (a blob + descriptors) and
//! the JS wrapper decodes them with the same TextDecoder
//! (ignoreBOM: true) the JS decoder uses, so U+FEFF handling and
//! U+FFFD normalization are the platform's own, byte-identical by
//! construction. The dictionary blobs and shard blobs this decoder
//! reads are encoder output (valid UTF-8), so byte equality is
//! decoded-string equality everywhere a comparison is made.
//!
//! ABI (all integers little-endian; the worker is single-threaded
//! and holds exactly one session, so the state is a thread-local):
//!   tw_alloc(len) -> ptr          size the input buffer, get its ptr
//!   tw_dict_load(len) -> i32      parse TCD1 from input[..len]
//!   tw_session_new(expected) -> i32
//!   tw_transpose(len, page_cursor) -> i32
//!   tw_reset_to(cursor)
//!   tw_session_free()
//!   tw_count() -> u32
//!   tw_stats_retained() -> u32    session stats(), JS semantics
//!   tw_stats_index_bytes() -> u32
//!   tw_out_n() -> u32             last transpose: accepted count
//!   tw_out_shard_index() -> u32   last transpose: shard's own index
//!   tw_out_ptr(which) -> ptr      output arrays (see OUT_* below)
//!   tw_out_len(which) -> u32      output lengths, in BYTES
//! Return codes: 0 ok, -1 malformed input, -99 a caught panic.
//! After any wasm call the JS side must re-read memory.buffer before
//! touching views (calls may grow linear memory).

use std::cell::RefCell;
use std::collections::HashMap;
use std::hash::{BuildHasherDefault, Hasher};

const INT32_NULL_YEAR: i32 = i32::MIN;

// ---------------------------------------------------------------------
// Small deterministic hasher for the internal maps (rustc's FxHash
// family). Hash quality affects only speed: every probe in this
// decoder is verified against the full key, so collisions can never
// change a result.
// ---------------------------------------------------------------------
#[derive(Default)]
struct FxHasher {
    hash: u64,
}
const FX_SEED: u64 = 0x51_7c_c1_b7_27_22_0a_95;
impl FxHasher {
    #[inline]
    fn add(&mut self, w: u64) {
        self.hash = (self.hash.rotate_left(5) ^ w).wrapping_mul(FX_SEED);
    }
}
impl Hasher for FxHasher {
    #[inline]
    fn write(&mut self, mut bytes: &[u8]) {
        while bytes.len() >= 8 {
            self.add(u64::from_le_bytes(bytes[..8].try_into().unwrap()));
            bytes = &bytes[8..];
        }
        if bytes.len() >= 4 {
            self.add(u32::from_le_bytes(bytes[..4].try_into().unwrap()) as u64);
            bytes = &bytes[4..];
        }
        if bytes.len() >= 2 {
            self.add(u16::from_le_bytes(bytes[..2].try_into().unwrap()) as u64);
            bytes = &bytes[2..];
        }
        if !bytes.is_empty() {
            self.add(bytes[0] as u64);
        }
    }
    #[inline]
    fn write_u8(&mut self, n: u8) {
        self.add(n as u64);
    }
    #[inline]
    fn write_u32(&mut self, n: u32) {
        self.add(n as u64);
    }
    #[inline]
    fn write_i32(&mut self, n: i32) {
        self.add(n as u32 as u64);
    }
    #[inline]
    fn write_u64(&mut self, n: u64) {
        self.add(n);
    }
    #[inline]
    fn write_usize(&mut self, n: usize) {
        self.add(n as u64);
    }
    #[inline]
    fn finish(&self) -> u64 {
        self.hash
    }
}
type FxMap<K, V> = HashMap<K, V, BuildHasherDefault<FxHasher>>;

// FNV-1a over bytes — bit-identical to fnv1aBytes in catalog-core.js.
#[inline]
fn fnv1a(bytes: &[u8]) -> u32 {
    let mut h: u32 = 0x811c9dc5;
    for &b in bytes {
        h ^= b as u32;
        h = h.wrapping_mul(0x01000193);
    }
    h
}

// ---------------------------------------------------------------------
// Little-endian readers (bounds-checked; None = malformed input).
// ---------------------------------------------------------------------
fn rd_u16(buf: &[u8], p: usize) -> Option<u16> {
    Some(u16::from_le_bytes(buf.get(p..p + 2)?.try_into().ok()?))
}
fn rd_u32(buf: &[u8], p: usize) -> Option<u32> {
    Some(u32::from_le_bytes(buf.get(p..p + 4)?.try_into().ok()?))
}

// ---------------------------------------------------------------------
// TCD1 dictionary (mirrors parseTcb1Dict in tcb1.js).
// ---------------------------------------------------------------------
struct DictField {
    nullable: bool,
    count: u32,
    offsets: Vec<u32>,
    blob: Vec<u8>,
}

struct Dict {
    // (field name bytes, field) in file order.
    fields: Vec<(Vec<u8>, DictField)>,
}

impl Dict {
    fn get(&self, name: &[u8]) -> Option<&DictField> {
        self.fields
            .iter()
            .find(|(n, _)| n.as_slice() == name)
            .map(|(_, f)| f)
    }
}

fn parse_dict(buf: &[u8]) -> Result<Dict, i32> {
    if buf.len() < 8 || &buf[0..4] != b"TCD1" {
        return Err(-1);
    }
    let version = rd_u16(buf, 4).ok_or(-1)?;
    if version != 1 {
        return Err(-1);
    }
    let field_count = rd_u16(buf, 6).ok_or(-1)? as usize;
    let mut p: usize = 8;
    let mut fields = Vec::with_capacity(field_count);
    for _ in 0..field_count {
        let name_len = *buf.get(p).ok_or(-1)? as usize;
        p += 1;
        let name = buf.get(p..p + name_len).ok_or(-1)?.to_vec();
        p += name_len;
        let nullable = *buf.get(p).ok_or(-1)? != 0;
        p += 1;
        let count = rd_u32(buf, p).ok_or(-1)?;
        p += 4;
        p += (8 - (p % 8)) % 8;
        let n_off = (count as usize + 1) * 4;
        let off_bytes = buf.get(p..p + n_off).ok_or(-1)?;
        let mut offsets = Vec::with_capacity(count as usize + 1);
        for i in 0..count as usize + 1 {
            offsets.push(u32::from_le_bytes(
                off_bytes[i * 4..i * 4 + 4].try_into().map_err(|_| -1)?,
            ));
        }
        p += n_off;
        let blob_len = offsets[count as usize] as usize;
        let blob = buf.get(p..p + blob_len).ok_or(-1)?.to_vec();
        p += blob_len;
        fields.push((name, DictField { nullable, count, offsets, blob }));
    }
    Ok(Dict { fields })
}

// The raw dictionary value for a code: None for the null slot of a
// nullable dictionary, else the value's bytes. Out-of-range codes
// (never produced by a valid dataset) yield empty bytes, the same
// empty decode the JS subarray arithmetic produces.
fn dict_value<'a>(d: &'a DictField, code: u32) -> Option<&'a [u8]> {
    if d.nullable && code == 0 {
        return None;
    }
    let idx = if d.nullable { code - 1 } else { code } as usize;
    if idx >= d.count as usize {
        return Some(&[]);
    }
    let s = d.offsets[idx] as usize;
    let e = d.offsets[idx + 1] as usize;
    Some(&d.blob[s..e])
}

// ---------------------------------------------------------------------
// CatalogIdIndex, byte mode (mirrors catalog-core.js exactly,
// including the capacity policy and the growth trigger, so the
// table's byte size — reported through stats() — matches the JS
// session's).
// ---------------------------------------------------------------------
struct Chunk {
    page_cursor: i32,
    start: u32,
    n: u32,
    id_bytes: Vec<u8>,
    id_off: Vec<u32>,
}

struct IdIndex {
    cap: usize,
    table: Vec<u32>,
    count: u32,
    built_len: u32,
}

fn bytes_at(chunks: &[Chunk], chunk_of: &[u32], i: u32) -> (usize, usize, usize) {
    let ci = chunk_of[i as usize] as usize;
    let c = &chunks[ci];
    let local = (i - c.start) as usize;
    (ci, c.id_off[local] as usize, c.id_off[local + 1] as usize)
}

fn bytes_match(chunks: &[Chunk], chunk_of: &[u32], i: u32, id: &[u8]) -> bool {
    let (ci, s, e) = bytes_at(chunks, chunk_of, i);
    let stored = &chunks[ci].id_bytes[s..e];
    stored == id
}

impl IdIndex {
    fn new(expected: u32) -> IdIndex {
        let mut cap: usize = 1024;
        while cap < (expected as usize + 1) * 2 {
            cap *= 2;
        }
        IdIndex { cap, table: vec![0; cap], count: 0, built_len: 0 }
    }

    fn probe(&self, chunks: &[Chunk], chunk_of: &[u32], id: &[u8], hash: u32) -> usize {
        let mut slot = (hash as usize) & (self.cap - 1);
        loop {
            let v = self.table[slot];
            if v == 0 || bytes_match(chunks, chunk_of, v - 1, id) {
                return slot;
            }
            slot = (slot + 1) & (self.cap - 1);
        }
    }

    fn probe_bytes_at(&self, chunks: &[Chunk], chunk_of: &[u32], i: u32) -> usize {
        let (ci, s, e) = bytes_at(chunks, chunk_of, i);
        let id = &chunks[ci].id_bytes[s..e];
        let h = fnv1a(id);
        self.probe(chunks, chunk_of, id, h)
    }

    fn grow(&mut self, chunks: &[Chunk], chunk_of: &[u32]) {
        let old = std::mem::take(&mut self.table);
        self.cap *= 2;
        self.table = vec![0; self.cap];
        self.count = 0;
        for v in old.iter() {
            if *v != 0 {
                let slot = self.probe_bytes_at(chunks, chunk_of, v - 1);
                self.table[slot] = *v;
                self.count += 1;
            }
        }
    }

    fn get_bytes(&self, chunks: &[Chunk], chunk_of: &[u32], id: &[u8], hash: u32) -> Option<u32> {
        let slot = self.probe(chunks, chunk_of, id, hash);
        let v = self.table[slot];
        if v == 0 {
            None
        } else {
            Some(v - 1)
        }
    }

    fn add_bytes(&mut self, chunks: &[Chunk], chunk_of: &[u32], idx: u32, id: &[u8], hash: u32) {
        if (self.count as usize + 1) * 2 > self.cap {
            self.grow(chunks, chunk_of);
        }
        let slot = self.probe(chunks, chunk_of, id, hash);
        if self.table[slot] == 0 {
            self.count += 1;
        }
        self.table[slot] = idx + 1;
    }

    fn sync_to_bytes(&mut self, chunks: &[Chunk], chunk_of: &[u32], length: u32) {
        while self.built_len < length {
            let i = self.built_len;
            if (self.count as usize + 1) * 2 > self.cap {
                self.grow(chunks, chunk_of);
            }
            let slot = self.probe_bytes_at(chunks, chunk_of, i);
            if self.table[slot] == 0 {
                self.count += 1;
            }
            self.table[slot] = i + 1;
            self.built_len = i + 1;
        }
    }
}

// ---------------------------------------------------------------------
// Year values: JS Map key semantics — number, string and null are
// three disjoint key spaces (and "2026" the string never equals 2026
// the number).
// ---------------------------------------------------------------------
#[derive(PartialEq, Eq, Hash, Clone)]
enum YearKey {
    Null,
    Num(i32),
    Str(Vec<u8>),
}

// One staged `fresh` entry: tag 0 = null, 1 = string (a = blob
// offset, b = byte length), 2 = number (a = the i32 value's bits).
type FreshEnt = (u32, u32, u32);
const FRESH_NULL: FreshEnt = (0, 0, 0);

struct Fresh {
    blob: Vec<u8>,
    cols: [Vec<FreshEnt>; 6], // creator, year, coll, fmt, rights, dl
}

impl Fresh {
    fn new() -> Fresh {
        Fresh { blob: Vec::new(), cols: Default::default() }
    }
    fn push_str(&mut self, col: usize, bytes: &[u8]) {
        let off = self.blob.len() as u32;
        self.blob.extend_from_slice(bytes);
        self.cols[col].push((1, off, bytes.len() as u32));
    }
}

// ---------------------------------------------------------------------
// The session (mirrors createTcb1Session in tcb1.js).
// ---------------------------------------------------------------------
struct Session {
    dict: Dict,
    expected: u32,
    // Dictionary-code translation state. Survives reset_to, exactly
    // like the JS session's closures.
    creator_xlate: Vec<i32>,
    creator_next: u32,
    coll_xlate: Vec<i32>,
    coll_next: u32,
    fmt_xlate: Vec<i32>,
    fmt_next: u32,
    rights_xlate: Vec<i32>,
    rights_next: u32,
    dl_xlate: Vec<i32>,
    dl_next: u32,
    year_map: FxMap<YearKey, u32>,
    year_next: u32,
    // Dedupe state.
    chunks: Vec<Chunk>,
    chunk_of: Vec<u32>,
    count: u32,
    index: IdIndex,
    // Output staging for the most recent transpose.
    out_n: u32,
    out_shard_index: u32,
    out_id_bytes: Vec<u8>,
    out_id_off: Vec<u32>,
    out_title_bytes: Vec<u8>,
    out_title_off: Vec<u32>,
    out_creator: Vec<u32>,
    out_year: Vec<u32>,
    out_coll: Vec<u8>,
    out_fmt: Vec<u8>,
    out_rights: Vec<u8>,
    out_dl: Vec<u8>,
    out_fresh_blob: Vec<u8>,
    out_fresh_desc: Vec<u8>,
}

impl Session {
    fn new(dict: Dict, expected: u32) -> Result<Session, i32> {
        let creator_count = dict.get(b"creator").ok_or(-1)?.count;
        let coll_count = dict.get(b"collection").ok_or(-1)?.count;
        let fmt_count = dict.get(b"format").ok_or(-1)?.count;
        let rights_count = dict.get(b"rights_status").ok_or(-1)?.count;
        let dl_count = dict.get(b"download_status").ok_or(-1)?.count;
        let s = Session {
            creator_xlate: vec![-1; creator_count as usize + 1],
            coll_xlate: vec![-1; coll_count as usize],
            fmt_xlate: vec![-1; fmt_count as usize],
            rights_xlate: vec![-1; rights_count as usize],
            dl_xlate: vec![-1; dl_count as usize],
            dict,
            expected,
            creator_next: 0,
            coll_next: 0,
            fmt_next: 0,
            rights_next: 0,
            dl_next: 0,
            year_map: FxMap::default(),
            year_next: 0,
            chunks: Vec::new(),
            chunk_of: Vec::new(),
            count: 0,
            index: IdIndex::new(expected),
            out_n: 0,
            out_shard_index: 0,
            out_id_bytes: Vec::new(),
            out_id_off: Vec::new(),
            out_title_bytes: Vec::new(),
            out_title_off: Vec::new(),
            out_creator: Vec::new(),
            out_year: Vec::new(),
            out_coll: Vec::new(),
            out_fmt: Vec::new(),
            out_rights: Vec::new(),
            out_dl: Vec::new(),
            out_fresh_blob: Vec::new(),
            out_fresh_desc: Vec::new(),
        };
        Ok(s)
    }

    fn creator_local(&mut self, global_code: u32, fresh: &mut Fresh) -> u32 {
        if global_code as usize >= self.creator_xlate.len() {
            self.creator_xlate.resize(global_code as usize + 1, -1);
        }
        let local = self.creator_xlate[global_code as usize];
        if local >= 0 {
            return local as u32;
        }
        let local = self.creator_next;
        self.creator_next += 1;
        match dict_value(self.dict.get(b"creator").unwrap(), global_code) {
            None => fresh.cols[0].push(FRESH_NULL),
            Some(bytes) => {
                let bytes = bytes.to_vec();
                fresh.push_str(0, &bytes);
            }
        }
        self.creator_xlate[global_code as usize] = local as i32;
        local
    }

    // Small dictionaries: the JS path interns by VALUE through
    // dictCodeLocal, but it only ever runs once per global code (the
    // xlate table guarantees it) and dictionary values are unique
    // per code, so a per-field counter behind the xlate table
    // assigns exactly the same local codes.
    fn small_local(
        xlate: &mut Vec<i32>,
        next: &mut u32,
        d: &DictField,
        global_code: u32,
        col: usize,
        fresh: &mut Fresh,
    ) -> u32 {
        if global_code as usize >= xlate.len() {
            xlate.resize(global_code as usize + 1, -1);
        }
        let local = xlate[global_code as usize];
        if local >= 0 {
            return local as u32;
        }
        let local = *next;
        *next += 1;
        match dict_value(d, global_code) {
            None => fresh.cols[col].push(FRESH_NULL),
            Some(bytes) => {
                let bytes = bytes.to_vec();
                fresh.push_str(col, &bytes);
            }
        }
        xlate[global_code as usize] = local as i32;
        local
    }

    fn year_local(&mut self, key: YearKey, fresh: &mut Fresh) -> u32 {
        if let Some(&code) = self.year_map.get(&key) {
            return code;
        }
        let code = self.year_next;
        self.year_next += 1;
        match &key {
            YearKey::Null => fresh.cols[1].push(FRESH_NULL),
            YearKey::Num(v) => fresh.cols[1].push((2, *v as u32, 0)),
            YearKey::Str(bytes) => {
                let bytes = bytes.clone();
                fresh.push_str(1, &bytes);
            }
        }
        self.year_map.insert(key, code);
        code
    }

    fn transpose(&mut self, buf: &[u8], page_cursor: i32) -> Result<(), i32> {
        // ---- parse the shard (mirrors parseTcb1Shard) ----
        if buf.len() < 16 || &buf[0..4] != b"TCB1" {
            return Err(-1);
        }
        let version = rd_u16(buf, 4).ok_or(-1)?;
        if version != 1 {
            return Err(-1);
        }
        let total = rd_u32(buf, 8).ok_or(-1)?;
        let shard_index = rd_u32(buf, 12).ok_or(-1)?;
        // Section directory, in SHARD_SECTIONS order.
        let mut sec = [(0usize, 0usize); 13];
        for i in 0..13 {
            let off = rd_u32(buf, 16 + i * 8).ok_or(-1)? as usize;
            let len = rd_u32(buf, 20 + i * 8).ok_or(-1)? as usize;
            if off + len > buf.len() {
                return Err(-1);
            }
            sec[i] = (off, len);
        }
        let sec_u32 = |i: usize| -> Result<Vec<u32>, i32> {
            let (off, len) = sec[i];
            if len % 4 != 0 {
                return Err(-1);
            }
            let raw = &buf[off..off + len];
            let mut v = Vec::with_capacity(len / 4);
            for j in 0..len / 4 {
                v.push(u32::from_le_bytes(raw[j * 4..j * 4 + 4].try_into().map_err(|_| -1)?));
            }
            Ok(v)
        };
        let sec_i32 = |i: usize| -> Result<Vec<i32>, i32> {
            Ok(sec_u32(i)?.into_iter().map(|x| x as i32).collect())
        };
        let sec_u8 = |i: usize| -> Vec<u8> { buf[sec[i].0..sec[i].0 + sec[i].1].to_vec() };

        let id_offsets = sec_u32(0)?;
        let id_blob = &buf[sec[1].0..sec[1].0 + sec[1].1];
        let title_offsets = sec_u32(2)?;
        let title_blob = &buf[sec[3].0..sec[3].0 + sec[3].1];
        let creator_codes = sec_u32(4)?;
        let years = sec_i32(5)?;
        let year_str_rows = sec_u32(6)?;
        let year_str_offsets = sec_u32(7)?;
        let year_str_blob = &buf[sec[8].0..sec[8].0 + sec[8].1];
        let coll_codes = sec_u8(9);
        let dl_codes = sec_u8(10);
        let rights_codes = sec_u8(11);
        let fmt_codes = sec_u8(12);

        if id_offsets.len() != total as usize + 1
            || title_offsets.len() != total as usize + 1
            || creator_codes.len() != total as usize
            || years.len() != total as usize
            || coll_codes.len() != total as usize
            || dl_codes.len() != total as usize
            || rights_codes.len() != total as usize
            || fmt_codes.len() != total as usize
        {
            return Err(-1);
        }

        let mut fresh = Fresh::new();
        self.out_shard_index = shard_index;

        if total == 0 {
            self.chunks.push(Chunk {
                page_cursor,
                start: self.count,
                n: 0,
                id_bytes: Vec::new(),
                id_off: vec![0],
            });
            self.out_n = 0;
            self.out_id_bytes = Vec::new();
            self.out_id_off = vec![0];
            self.out_title_bytes = Vec::new();
            self.out_title_off = vec![0];
            self.out_creator = Vec::new();
            self.out_year = Vec::new();
            self.out_coll = Vec::new();
            self.out_fmt = Vec::new();
            self.out_rights = Vec::new();
            self.out_dl = Vec::new();
            self.finish_fresh(fresh);
            return Ok(());
        }

        // ---- dedupe (mirrors transposeShard): first wins, within
        // the shard and against everything the session accepted ----
        // The probe slot of every accepted id is remembered: the
        // insert pass below places the id there directly when the
        // slot is still empty and the table has not grown since
        // (linear-probing invariant: slots on a probe chain never
        // become empty once filled, so a slot that was the chain's
        // first empty cell stays a correct insertion point; if it
        // was taken meanwhile, the insert re-probes). This skips the
        // second full probe the JS session performs per record. The
        // table's contents differ in layout only — never in what a
        // probe returns, and its size policy is untouched, so stats
        // parity holds.
        let mut seen: FxMap<u32, Vec<(u32, u32)>> = FxMap::default();
        let mut accepted: Vec<u32> = Vec::with_capacity(total as usize);
        let mut accepted_slots: Vec<u32> = Vec::with_capacity(total as usize);
        let cap_at_dedupe = self.index.cap;
        for i in 0..total as usize {
            let s = id_offsets[i] as usize;
            let e = id_offsets[i + 1] as usize;
            if e == s {
                continue; // no id — the JSON path skips id-less records
            }
            let id = &id_blob[s..e];
            let h = fnv1a(id);
            if let Some(bucket) = seen.get(&h) {
                let mut dup = false;
                for &(bs, be) in bucket.iter() {
                    if &id_blob[bs as usize..be as usize] == id {
                        dup = true;
                        break;
                    }
                }
                if dup {
                    continue;
                }
            }
            let slot = self.index.probe(&self.chunks, &self.chunk_of, id, h);
            if self.index.table[slot] != 0 {
                continue; // probe verified a match: already resident
            }
            seen.entry(h).or_default().push((s as u32, e as u32));
            accepted.push(i as u32);
            accepted_slots.push(slot as u32);
        }
        let n = accepted.len();
        let start = self.count;

        // ---- id/title arenas ----
        let mut id_off = vec![0u32; n + 1];
        let mut title_off = vec![0u32; n + 1];
        let mut id_len = 0u32;
        let mut title_len = 0u32;
        for j in 0..n {
            let i = accepted[j] as usize;
            id_len += id_offsets[i + 1] - id_offsets[i];
            id_off[j + 1] = id_len;
            title_len += title_offsets[i + 1] - title_offsets[i];
            title_off[j + 1] = title_len;
        }
        let mut id_bytes = vec![0u8; id_len as usize];
        let mut title_bytes = vec![0u8; title_len as usize];
        for j in 0..n {
            let i = accepted[j] as usize;
            let (s, e) = (id_offsets[i] as usize, id_offsets[i + 1] as usize);
            id_bytes[id_off[j] as usize..id_off[j + 1] as usize].copy_from_slice(&id_blob[s..e]);
            let (s, e) = (title_offsets[i] as usize, title_offsets[i + 1] as usize);
            title_bytes[title_off[j] as usize..title_off[j + 1] as usize]
                .copy_from_slice(&title_blob[s..e]);
        }

        // ---- code columns ----
        let mut codes_creator = vec![0u32; n];
        let mut codes_year = vec![0u32; n];
        let mut codes_coll = vec![0u8; n];
        let mut codes_fmt = vec![0u8; n];
        let mut codes_rights = vec![0u8; n];
        let mut codes_dl = vec![0u8; n];
        for j in 0..n {
            let i = accepted[j] as usize;
            codes_creator[j] = self.creator_local(creator_codes[i], &mut fresh);
            // yearRaw (mirrors tcb1.js): numeric years ride the i32
            // column; the sentinel selects the string side table by
            // binary search, and a miss is a null year.
            let yv = years[i];
            let key = if yv != INT32_NULL_YEAR {
                YearKey::Num(yv)
            } else {
                let rows = &year_str_rows;
                let mut lo: i64 = 0;
                let mut hi: i64 = rows.len() as i64 - 1;
                let mut found: Option<usize> = None;
                while lo <= hi {
                    let mid = ((lo + hi) >> 1) as usize;
                    if rows[mid] as usize == i {
                        found = Some(mid);
                        break;
                    }
                    if (rows[mid] as usize) < i {
                        lo = mid as i64 + 1;
                    } else {
                        hi = mid as i64 - 1;
                    }
                }
                match found {
                    Some(k) => {
                        let s = year_str_offsets[k] as usize;
                        let e = year_str_offsets[k + 1] as usize;
                        YearKey::Str(year_str_blob[s..e].to_vec())
                    }
                    None => YearKey::Null,
                }
            };
            codes_year[j] = self.year_local(key, &mut fresh);
            // Small dictionaries: clone the field handles' data out
            // of self.dict is unnecessary — small_local takes the
            // field by reference; satisfy the borrow checker by
            // taking raw offsets through dict_value on cloned arcs.
            codes_coll[j] = {
                let d = self.dict.get(b"collection").ok_or(-1)?;
                Self::small_local(
                    &mut self.coll_xlate,
                    &mut self.coll_next,
                    d,
                    coll_codes[i] as u32,
                    2,
                    &mut fresh,
                ) as u8
            };
            codes_fmt[j] = {
                let d = self.dict.get(b"format").ok_or(-1)?;
                Self::small_local(
                    &mut self.fmt_xlate,
                    &mut self.fmt_next,
                    d,
                    fmt_codes[i] as u32,
                    3,
                    &mut fresh,
                ) as u8
            };
            codes_rights[j] = {
                let d = self.dict.get(b"rights_status").ok_or(-1)?;
                Self::small_local(
                    &mut self.rights_xlate,
                    &mut self.rights_next,
                    d,
                    rights_codes[i] as u32,
                    4,
                    &mut fresh,
                ) as u8
            };
            codes_dl[j] = {
                let d = self.dict.get(b"download_status").ok_or(-1)?;
                Self::small_local(
                    &mut self.dl_xlate,
                    &mut self.dl_next,
                    d,
                    dl_codes[i] as u32,
                    5,
                    &mut fresh,
                ) as u8
            };
        }

        // ---- retain + index (order mirrors the JS session: the
        // chunk is retained and addressable before the first probe
        // verifies a new resident) ----
        let chunk_idx = self.chunks.len() as u32;
        self.chunks.push(Chunk {
            page_cursor,
            start,
            n: n as u32,
            id_bytes: id_bytes.clone(),
            id_off: id_off.clone(),
        });
        for _ in 0..n {
            self.chunk_of.push(chunk_idx);
        }
        for j in 0..n {
            let i = accepted[j] as usize;
            let idx = start + j as u32;
            let slot = accepted_slots[j] as usize;
            if self.index.cap == cap_at_dedupe && self.index.table[slot] == 0 {
                // Direct placement at the dedupe probe's slot (see
                // the invariant above). The growth trigger is the
                // same one add_bytes applies.
                if (self.index.count as usize + 1) * 2 > self.index.cap {
                    self.index.grow(&self.chunks, &self.chunk_of);
                    let id = &id_blob[id_offsets[i] as usize..id_offsets[i + 1] as usize];
                    let h = fnv1a(id);
                    let index = &mut self.index;
                    index.add_bytes(&self.chunks, &self.chunk_of, idx, id, h);
                } else {
                    self.index.table[slot] = idx + 1;
                    self.index.count += 1;
                }
            } else {
                let id = &id_blob[id_offsets[i] as usize..id_offsets[i + 1] as usize];
                let h = fnv1a(id);
                let index = &mut self.index;
                index.add_bytes(&self.chunks, &self.chunk_of, idx, id, h);
            }
        }
        self.count += n as u32;
        self.index.built_len = self.count;

        self.out_n = n as u32;
        self.out_id_bytes = id_bytes;
        self.out_id_off = id_off;
        self.out_title_bytes = title_bytes;
        self.out_title_off = title_off;
        self.out_creator = codes_creator;
        self.out_year = codes_year;
        self.out_coll = codes_coll;
        self.out_fmt = codes_fmt;
        self.out_rights = codes_rights;
        self.out_dl = codes_dl;
        self.finish_fresh(fresh);
        Ok(())
    }

    fn finish_fresh(&mut self, fresh: Fresh) {
        self.out_fresh_blob = fresh.blob;
        let mut desc = Vec::new();
        for col in 0..6 {
            desc.extend_from_slice(&(fresh.cols[col].len() as u32).to_le_bytes());
            for &(tag, a, b) in fresh.cols[col].iter() {
                desc.extend_from_slice(&tag.to_le_bytes());
                desc.extend_from_slice(&a.to_le_bytes());
                desc.extend_from_slice(&b.to_le_bytes());
            }
        }
        self.out_fresh_desc = desc;
    }

    fn reset_to(&mut self, server_cursor: i32) {
        let mut keep = 0;
        while keep < self.chunks.len() && self.chunks[keep].page_cursor < server_cursor {
            keep += 1;
        }
        self.chunks.truncate(keep);
        self.chunk_of.clear();
        self.count = 0;
        for ci in 0..self.chunks.len() {
            self.chunks[ci].start = self.count;
            let n = self.chunks[ci].n;
            for _ in 0..n {
                self.chunk_of.push(ci as u32);
            }
            self.count += n;
        }
        let expected = if self.expected != 0 { self.expected } else { self.count };
        self.index = IdIndex::new(expected);
        let count = self.count;
        let index = &mut self.index;
        index.sync_to_bytes(&self.chunks, &self.chunk_of, count);
        self.index.built_len = self.count;
    }

    fn stats(&self) -> (u32, u32) {
        let mut retained: u64 = 0;
        for c in self.chunks.iter() {
            retained += c.id_bytes.len() as u64 + (c.id_off.len() * 4) as u64;
        }
        (retained as u32, (self.index.table.len() * 4) as u32)
    }
}

// ---------------------------------------------------------------------
// Runtime state + FFI surface.
// ---------------------------------------------------------------------
struct Runtime {
    input: Vec<u8>,
    dict: Option<Dict>,
    session: Option<Session>,
}

thread_local! {
    static RT: RefCell<Runtime> = RefCell::new(Runtime {
        input: Vec::new(),
        dict: None,
        session: None,
    });
}

fn guard(f: impl FnOnce() -> i32) -> i32 {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)) {
        Ok(v) => v,
        Err(_) => -99,
    }
}

#[no_mangle]
pub extern "C" fn tw_alloc(len: u32) -> *mut u8 {
    RT.with(|rt| {
        let mut rt = rt.borrow_mut();
        if rt.input.len() < len as usize {
            rt.input.resize(len as usize, 0);
        }
        rt.input.as_mut_ptr()
    })
}

#[no_mangle]
pub extern "C" fn tw_dict_load(len: u32) -> i32 {
    guard(|| {
        RT.with(|rt| {
            let mut rt = rt.borrow_mut();
            let n = (len as usize).min(rt.input.len());
            match parse_dict(&rt.input[..n]) {
                Ok(d) => {
                    rt.dict = Some(d);
                    0
                }
                Err(e) => e,
            }
        })
    })
}

#[no_mangle]
pub extern "C" fn tw_session_new(expected: u32) -> i32 {
    guard(|| {
        RT.with(|rt| {
            let mut rt = rt.borrow_mut();
            let dict = match rt.dict.take() {
                Some(d) => d,
                None => return -1,
            };
            match Session::new(dict, expected) {
                Ok(s) => {
                    rt.session = Some(s);
                    0
                }
                Err(e) => e,
            }
        })
    })
}

#[no_mangle]
pub extern "C" fn tw_transpose(len: u32, page_cursor: i32) -> i32 {
    guard(|| {
        RT.with(|rt| {
            let mut rt = rt.borrow_mut();
            // Take the input buffer out (no copy) so the session
            // borrow never aliases it; hand the allocation back
            // afterwards so the JS side's next write reuses it.
            let n = (len as usize).min(rt.input.len());
            let mut buf = std::mem::take(&mut rt.input);
            buf.truncate(n);
            let rc = match rt.session.as_mut() {
                Some(s) => match s.transpose(&buf, page_cursor) {
                    Ok(()) => 0,
                    Err(e) => e,
                },
                None => -1,
            };
            rt.input = buf;
            rc
        })
    })
}

#[no_mangle]
pub extern "C" fn tw_reset_to(cursor: i32) {
    let _ = guard(|| {
        RT.with(|rt| {
            let mut rt = rt.borrow_mut();
            if let Some(s) = rt.session.as_mut() {
                s.reset_to(cursor);
            }
            0
        })
    });
}

#[no_mangle]
pub extern "C" fn tw_session_free() {
    RT.with(|rt| {
        let mut rt = rt.borrow_mut();
        rt.session = None;
        rt.dict = None;
    });
}

#[no_mangle]
pub extern "C" fn tw_count() -> u32 {
    RT.with(|rt| {
        let rt = rt.borrow();
        rt.session.as_ref().map(|s| s.count).unwrap_or(0)
    })
}

#[no_mangle]
pub extern "C" fn tw_stats_retained() -> u32 {
    RT.with(|rt| {
        let rt = rt.borrow();
        rt.session.as_ref().map(|s| s.stats().0).unwrap_or(0)
    })
}

#[no_mangle]
pub extern "C" fn tw_stats_index_bytes() -> u32 {
    RT.with(|rt| {
        let rt = rt.borrow();
        rt.session.as_ref().map(|s| s.stats().1).unwrap_or(0)
    })
}

#[no_mangle]
pub extern "C" fn tw_out_n() -> u32 {
    RT.with(|rt| {
        let rt = rt.borrow();
        rt.session.as_ref().map(|s| s.out_n).unwrap_or(0)
    })
}

#[no_mangle]
pub extern "C" fn tw_out_shard_index() -> u32 {
    RT.with(|rt| {
        let rt = rt.borrow();
        rt.session.as_ref().map(|s| s.out_shard_index).unwrap_or(0)
    })
}

// Output selectors for tw_out_ptr / tw_out_len.
pub const OUT_ID_BYTES: u32 = 0;
pub const OUT_ID_OFF: u32 = 1;
pub const OUT_TITLE_BYTES: u32 = 2;
pub const OUT_TITLE_OFF: u32 = 3;
pub const OUT_CREATOR: u32 = 4;
pub const OUT_YEAR: u32 = 5;
pub const OUT_COLL: u32 = 6;
pub const OUT_FMT: u32 = 7;
pub const OUT_RIGHTS: u32 = 8;
pub const OUT_DL: u32 = 9;
pub const OUT_FRESH_BLOB: u32 = 10;
pub const OUT_FRESH_DESC: u32 = 11;

fn out_slice(s: &Session, which: u32) -> &[u8] {
    fn u32_bytes(v: &[u32]) -> &[u8] {
        unsafe { std::slice::from_raw_parts(v.as_ptr() as *const u8, v.len() * 4) }
    }
    match which {
        OUT_ID_BYTES => &s.out_id_bytes,
        OUT_ID_OFF => u32_bytes(&s.out_id_off),
        OUT_TITLE_BYTES => &s.out_title_bytes,
        OUT_TITLE_OFF => u32_bytes(&s.out_title_off),
        OUT_CREATOR => u32_bytes(&s.out_creator),
        OUT_YEAR => u32_bytes(&s.out_year),
        OUT_COLL => &s.out_coll,
        OUT_FMT => &s.out_fmt,
        OUT_RIGHTS => &s.out_rights,
        OUT_DL => &s.out_dl,
        OUT_FRESH_BLOB => &s.out_fresh_blob,
        OUT_FRESH_DESC => &s.out_fresh_desc,
        _ => &[],
    }
}

#[no_mangle]
pub extern "C" fn tw_out_ptr(which: u32) -> *const u8 {
    RT.with(|rt| {
        let rt = rt.borrow();
        match rt.session.as_ref() {
            Some(s) => out_slice(s, which).as_ptr(),
            None => std::ptr::null(),
        }
    })
}

#[no_mangle]
pub extern "C" fn tw_out_len(which: u32) -> u32 {
    RT.with(|rt| {
        let rt = rt.borrow();
        match rt.session.as_ref() {
            Some(s) => out_slice(s, which).len() as u32,
            None => 0,
        }
    })
}
