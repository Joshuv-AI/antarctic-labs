//! Tower of Babel counting/derivation + reshape-allocation kernels
//! — Rust/WebAssembly ports of the JavaScript in:
//!   - src/lib/helix-scene.js  (allocateStations / allocateStationsArr
//!     / allocateStationsGroup — the reshape allocation math),
//!   - src/pages.jsx           (facetCountSteps — the faceted-count
//!     derivation: bitset AND/popcount kernels, era + bucket tallies,
//!     bitset word builders),
//!   - src/lib/filter-engine.js (startFilterScan — the result scan
//!     whose committed length is the result count).
//!
//! Every port reproduces the JS observable behavior EXACTLY:
//!   - allocations run the identical f64 expression trees in the
//!     identical order (IEEE-754 double arithmetic is bit-exact
//!     across JS and Rust for +,-,*,/ and floor), with JS Math.round
//!     replicated as (x + 0.5).floor() — exact for every input the
//!     callers can produce (integer counts and integer budgets over
//!     ROWS=6, whose k/6 fractional parts are either exact .5 steps
//!     or far from a rounding boundary) — and the largest-remainder
//!     ordering uses a stable sort in both engines, so remainder
//!     ties resolve to the same coil;
//!   - bitset kernels read operands through the operand's own
//!     element size (u8/u16/u32), mirroring JS typed-array indexing
//!     semantics element-for-element, including out-of-range reads
//!     behaving as JS `undefined` does in each predicate (falsy in
//!     the era tally and the scan; a thrown TypeError in the bucket
//!     tally, reported here as an error code so the JS wrapper
//!     falls back to the JS loop, which throws identically and the
//!     facet job commits nothing — the same end state);
//!   - popcounts are u32 count_ones, bit-identical to the JS SWAR
//!     pop32 in facetCountSteps.
//!
//! ABI (little-endian throughout; single-threaded caller):
//!   tk_reset()                       arena bump back to 0
//!   tk_alloc(len) -> ptr             bump-allocate in the arena
//!   tk_stage(slot, len) -> ptr       size one of 16 staging slots
//!   tk_out_ptr() -> ptr              last kernel's output bytes
//!   tk_out_len() -> u32              output length, in BYTES
//!   tk_version() -> u32              ABI version (1)
//!   tk_alloc_bands(counts, n, target, min_st, rows) -> i32
//!   tk_alloc_arr(counts, n, target, min_st, rows) -> i32
//!   tk_alloc_group(counts, n, target, min_st, rows, literal_max) -> i32
//!       counts: f64 array in the arena; output: f64 stations (out)
//!   tk_and_pop(a, a_elem, a_len, b, b_elem, b_len, w_limit) -> i64
//!   tk_and_words(a, a_elem, a_len, b, b_elem, b_len, w_words) -> i32
//!       output: u32[w_words] (out)
//!   tk_build_era_words(codes_u8, n, code) -> i32
//!       output: u32[ceil(n/32)] (out)
//!   tk_build_mask_words(codes_u16, n, mask_u8, mask_len) -> i32
//!       output: u32[ceil(n/32)] (out)
//!   tk_era_tally(within, w_elem, w_len, era_u8, era_len,
//!                w_from, w_to, num_eras, counts_u32_inout) -> i32
//!   tk_bucket_tally(within, w_elem, w_len, codes_u16, codes_len,
//!                w_from, w_to, counts_u32_inout, num_codes) -> i32
//!   tk_scan_range(order_u32, order_len, pos_from, max_pos,
//!                codes_u16|0, codes_len, mask_u8|0, mask_len,
//!                era_u8|0, era_len, era_code,
//!                member_u8|0, member_len, mbits_u32|0, mbits_len,
//!                out_u32, out_cap) -> i32
//!       output: u32[2] = [positions consumed, matches written] (out)
//! Return codes: 0 ok, 1 semantic divergence detected (JS would
//! throw — wrapper falls back), -99 a caught panic. After any call
//! the JS side must re-read memory.buffer before touching views
//! (calls may grow linear memory).

use std::cell::RefCell;

struct Rt {
    arena: Vec<u8>,
    bump: usize,
    slots: Vec<Vec<u8>>,
    out: Vec<u8>,
}

thread_local! {
    static RT: RefCell<Rt> = RefCell::new(Rt {
        arena: Vec::new(),
        bump: 0,
        slots: (0..16).map(|_| Vec::new()).collect(),
        out: Vec::new(),
    });
}

fn guarded<F: FnOnce() -> i32>(f: F) -> i32 {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)) {
        Ok(rc) => rc,
        Err(_) => -99,
    }
}

#[no_mangle]
pub extern "C" fn tk_reset() {
    RT.with(|rt| {
        rt.borrow_mut().bump = 0;
    });
}

#[no_mangle]
pub extern "C" fn tk_alloc(len: u32) -> *mut u8 {
    RT.with(|rt| {
        let mut rt = rt.borrow_mut();
        let len = len as usize;
        let off = (rt.bump + 7) & !7;
        let end = off + len;
        if rt.arena.len() < end {
            rt.arena.resize(end, 0);
        }
        rt.bump = end;
        unsafe { rt.arena.as_mut_ptr().add(off) }
    })
}

#[no_mangle]
pub extern "C" fn tk_stage(slot: u32, len: u32) -> *mut u8 {
    RT.with(|rt| {
        let mut rt = rt.borrow_mut();
        let nslots = rt.slots.len();
        let s = &mut rt.slots[(slot as usize) % nslots];
        if s.len() < len as usize {
            s.resize(len as usize, 0);
        }
        s.as_mut_ptr()
    })
}

#[no_mangle]
pub extern "C" fn tk_out_ptr() -> *const u8 {
    RT.with(|rt| rt.borrow().out.as_ptr())
}

#[no_mangle]
pub extern "C" fn tk_out_len() -> u32 {
    RT.with(|rt| rt.borrow().out.len() as u32)
}

#[no_mangle]
pub extern "C" fn tk_version() -> u32 {
    1
}

fn set_out_f64(vals: &[f64]) {
    RT.with(|rt| {
        let mut rt = rt.borrow_mut();
        rt.out.clear();
        for v in vals {
            rt.out.extend_from_slice(&v.to_le_bytes());
        }
    });
}

fn set_out_u32(vals: &[u32]) {
    RT.with(|rt| {
        let mut rt = rt.borrow_mut();
        rt.out.clear();
        for v in vals {
            rt.out.extend_from_slice(&v.to_le_bytes());
        }
    });
}

fn out_u32_writer(n: usize) -> Vec<u32> {
    vec![0; n]
}

fn flush_out_u32(vals: &[u32]) {
    set_out_u32(vals);
}

// ------------------------------------------------------------------
// Allocations (helix-scene.js). All arithmetic is f64 in the JS
// expression order. `counts` arrive as f64; callers pass finite
// values (production counts are non-negative integers — the JS
// `|| 0` normalization for undefined/NaN happens in the wrapper,
// which is itself JS).
// ------------------------------------------------------------------

#[inline]
fn js_round(x: f64) -> f64 {
    // JS Math.round: floor(x + 0.5) computed exactly. For every
    // input reachable here (integer budgets and integer counts
    // divided by ROWS), the f64 sum x + 0.5 is exact or rounds to
    // the same value JS produces, so this is bit-exact.
    (x + 0.5).floor()
}

/// Largest-remainder ordering shared by all three allocators: a
/// STABLE descending sort by fractional part (JS Array.sort is
/// stable; Rust sort_by is stable; equal fractions keep pool
/// order in both).
fn sort_by_rem_desc(raw: &mut [(usize, f64)]) {
    raw.sort_by(|a, b| {
        let fa = a.1 - a.1.floor();
        let fb = b.1 - b.1.floor();
        fb.partial_cmp(&fa).unwrap_or(std::cmp::Ordering::Equal)
    });
}

/// allocateStations (pool starts with EVERY index, zero counts
/// included) and allocateStationsArr (pool starts with positive
/// counts only) differ only in that initial pool.
fn alloc_generic(
    counts: &[f64],
    include_zero: bool,
    target: f64,
    min_st: f64,
    rows: f64,
) -> Vec<f64> {
    let n = counts.len();
    let mut out = vec![0.0; n];
    let mut floored = vec![false; n];
    let mut floored_n: f64 = 0.0;
    let mut pool: Vec<usize> = (0..n)
        .filter(|&i| include_zero || counts[i] > 0.0)
        .collect();
    loop {
        let pool_count: f64 = pool.iter().map(|&i| counts[i]).sum();
        let budget = target - floored_n * min_st * rows;
        let tiny: Vec<usize> = pool
            .iter()
            .cloned()
            .filter(|&i| (counts[i] * budget) / pool_count.max(1.0) < min_st * rows)
            .collect();
        if tiny.is_empty() || pool.is_empty() {
            break;
        }
        for &i in &tiny {
            floored[i] = true;
            floored_n += 1.0;
        }
        pool.retain(|i| !floored[*i]);
    }
    let pool_count: f64 = pool.iter().map(|&i| counts[i]).sum();
    let budget = target - floored_n * min_st * rows;
    for i in 0..n {
        if floored[i] {
            out[i] = min_st;
        }
    }
    if !pool.is_empty() {
        let target_st = js_round(budget / rows);
        let mut raw: Vec<(usize, f64)> = pool
            .iter()
            .map(|&i| (i, (counts[i] * budget) / pool_count.max(1.0) / rows))
            .collect();
        let mut sum = 0.0;
        for &(i, v) in &raw {
            let f = v.floor();
            out[i] = f;
            sum += f;
        }
        sort_by_rem_desc(&mut raw);
        let mut k = 0usize;
        while sum < target_st && !raw.is_empty() {
            let i = raw[k % raw.len()].0;
            out[i] += 1.0;
            sum += 1.0;
            k += 1;
        }
    }
    out
}

/// allocateStationsGroup: literal small coils, proportional pool,
/// with the generic array allocation as its documented fallback.
fn alloc_group(
    counts: &[f64],
    target: f64,
    min_st: f64,
    rows: f64,
    literal_max: f64,
) -> Vec<f64> {
    let n = counts.len();
    let mut out = vec![0.0; n];
    let target_st = target / rows;
    let mut literal: Vec<usize> = Vec::new();
    let mut pool: Vec<usize> = Vec::new();
    for i in 0..n {
        let c = counts[i].max(0.0);
        if c == 0.0 {
            continue;
        }
        if c <= literal_max {
            literal.push(i);
        } else {
            pool.push(i);
        }
    }
    let mut used = 0.0;
    for &i in &literal {
        out[i] = js_round(counts[i] / rows).max(1.0);
        used += out[i];
    }
    if pool.is_empty() || used >= target_st {
        return alloc_generic(counts, false, target, min_st, rows);
    }
    let budget = target_st - used - pool.len() as f64;
    for &i in &pool {
        out[i] = 1.0;
    }
    let pool_count: f64 = pool.iter().map(|&i| counts[i]).sum();
    let mut raw: Vec<(usize, f64)> = pool
        .iter()
        .map(|&i| (i, (counts[i] * budget) / pool_count.max(1.0)))
        .collect();
    let mut sum = 0.0;
    for &(i, v) in &raw {
        let f = v.floor();
        out[i] += f;
        sum += f;
    }
    sort_by_rem_desc(&mut raw);
    let mut k = 0usize;
    while sum < budget && !raw.is_empty() {
        let i = raw[k % raw.len()].0;
        out[i] += 1.0;
        sum += 1.0;
        k += 1;
    }
    out
}

unsafe fn counts_from(ptr: *const u8, n: usize) -> Vec<f64> {
    let mut v = Vec::with_capacity(n);
    for i in 0..n {
        let mut b = [0u8; 8];
        for j in 0..8 {
            b[j] = unsafe { *ptr.add(i * 8 + j) };
        }
        v.push(f64::from_le_bytes(b));
    }
    v
}

#[no_mangle]
pub extern "C" fn tk_alloc_bands(
    counts: *const u8,
    n: u32,
    target: f64,
    min_st: f64,
    rows: f64,
) -> i32 {
    guarded(|| {
        let c = unsafe { counts_from(counts, n as usize) };
        set_out_f64(&alloc_generic(&c, true, target, min_st, rows));
        0
    })
}

#[no_mangle]
pub extern "C" fn tk_alloc_arr(
    counts: *const u8,
    n: u32,
    target: f64,
    min_st: f64,
    rows: f64,
) -> i32 {
    guarded(|| {
        let c = unsafe { counts_from(counts, n as usize) };
        set_out_f64(&alloc_generic(&c, false, target, min_st, rows));
        0
    })
}

#[no_mangle]
pub extern "C" fn tk_alloc_group(
    counts: *const u8,
    n: u32,
    target: f64,
    min_st: f64,
    rows: f64,
    literal_max: f64,
) -> i32 {
    guarded(|| {
        let c = unsafe { counts_from(counts, n as usize) };
        set_out_f64(&alloc_group(&c, target, min_st, rows, literal_max));
        0
    })
}

// ------------------------------------------------------------------
// Bitset kernels (facetCountSteps + startFilterScan). Operand
// reads go through the operand's own element size, mirroring JS
// typed-array indexing.
// ------------------------------------------------------------------

#[inline]
unsafe fn rd(base: *const u8, elem: u32, idx: usize) -> u32 {
    unsafe {
        match elem {
            1 => *base.add(idx) as u32,
            2 => {
                let p = base.add(idx * 2);
                u16::from_le_bytes([*p, *p.add(1)]) as u32
            }
            _ => {
                let p = base.add(idx * 4);
                u32::from_le_bytes([*p, *p.add(1), *p.add(2), *p.add(3)])
            }
        }
    }
}

#[no_mangle]
pub extern "C" fn tk_and_pop(
    a: *const u8,
    a_elem: u32,
    a_len: u32,
    b: *const u8,
    b_elem: u32,
    b_len: u32,
    w_limit: u32,
) -> i64 {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let lim = a_len.min(b_len).min(w_limit) as usize;
        let mut n: u64 = 0;
        for w in 0..lim {
            let v = unsafe { rd(a, a_elem, w) & rd(b, b_elem, w) };
            n += v.count_ones() as u64;
        }
        n as i64
    })) {
        Ok(v) => v,
        Err(_) => -99,
    }
}

#[no_mangle]
pub extern "C" fn tk_and_words(
    a: *const u8,
    a_elem: u32,
    a_len: u32,
    b: *const u8,
    b_elem: u32,
    b_len: u32,
    w_words: u32,
) -> i32 {
    guarded(|| {
        let lim = a_len.min(b_len).min(w_words) as usize;
        let mut out = out_u32_writer(w_words as usize);
        for w in 0..lim {
            out[w] = unsafe { rd(a, a_elem, w) & rd(b, b_elem, w) };
        }
        flush_out_u32(&out);
        0
    })
}

#[no_mangle]
pub extern "C" fn tk_build_era_words(codes: *const u8, n: u32, code: u32) -> i32 {
    guarded(|| {
        let n = n as usize;
        let mut out = out_u32_writer((n + 31) / 32);
        for i in 0..n {
            if unsafe { *codes.add(i) } as u32 == code {
                out[i >> 5] |= 1u32 << (i & 31);
            }
        }
        flush_out_u32(&out);
        0
    })
}

#[no_mangle]
pub extern "C" fn tk_build_mask_words(
    codes: *const u8,
    n: u32,
    mask: *const u8,
    mask_len: u32,
) -> i32 {
    guarded(|| {
        let n = n as usize;
        let mut out = out_u32_writer((n + 31) / 32);
        for i in 0..n {
            let c = unsafe { rd(codes, 2, i) } as usize;
            if c < mask_len as usize && unsafe { *mask.add(c) } != 0 {
                out[i >> 5] |= 1u32 << (i & 31);
            }
        }
        flush_out_u32(&out);
        0
    })
}

#[no_mangle]
pub extern "C" fn tk_era_tally(
    within: *const u8,
    w_elem: u32,
    w_len: u32,
    era: *const u8,
    era_len: u32,
    w_from: u32,
    w_to: u32,
    num_eras: u32,
    counts: *mut u8,
) -> i32 {
    guarded(|| {
        for w in w_from as usize..w_to as usize {
            let mut word = if w < w_len as usize {
                unsafe { rd(within, w_elem, w) }
            } else {
                0
            };
            while word != 0 {
                let b = word & word.wrapping_neg();
                let i = (w << 5) + b.trailing_zeros() as usize;
                let ec = if i < era_len as usize {
                    (unsafe { *era.add(i) }) as u32
                } else {
                    0
                };
                if ec != 0 {
                    if ec > num_eras {
                        return 1;
                    }
                    let p = unsafe { counts.add(((ec - 1) as usize) * 4) };
                    let cur = u32::from_le_bytes(unsafe { [*p, *p.add(1), *p.add(2), *p.add(3)] });
                    let nv = (cur + 1).to_le_bytes();
                    unsafe {
                        *p = nv[0];
                        *p.add(1) = nv[1];
                        *p.add(2) = nv[2];
                        *p.add(3) = nv[3];
                    }
                }
                word ^= b;
            }
        }
        0
    })
}

#[no_mangle]
pub extern "C" fn tk_bucket_tally(
    within: *const u8,
    w_elem: u32,
    w_len: u32,
    codes: *const u8,
    codes_len: u32,
    w_from: u32,
    w_to: u32,
    counts: *mut u8,
    num_codes: u32,
) -> i32 {
    guarded(|| {
        for w in w_from as usize..w_to as usize {
            let mut word = if w < w_len as usize {
                unsafe { rd(within, w_elem, w) }
            } else {
                0
            };
            while word != 0 {
                let b = word & word.wrapping_neg();
                let i = (w << 5) + b.trailing_zeros() as usize;
                if i >= codes_len as usize {
                    // JS reads bucketKeys[i] === undefined and throws
                    // on .split — report divergence; the wrapper
                    // falls back and JS reproduces the throw.
                    return 1;
                }
                let c = unsafe { rd(codes, 2, i) } as usize;
                if c >= num_codes as usize {
                    return 1;
                }
                let p = unsafe { counts.add(c * 4) };
                let cur = u32::from_le_bytes(unsafe { [*p, *p.add(1), *p.add(2), *p.add(3)] });
                let nv = (cur + 1).to_le_bytes();
                unsafe {
                    *p = nv[0];
                    *p.add(1) = nv[1];
                    *p.add(2) = nv[2];
                    *p.add(3) = nv[3];
                }
                word ^= b;
            }
        }
        0
    })
}

#[no_mangle]
pub extern "C" fn tk_scan_range(
    order: *const u8,
    order_len: u32,
    pos_from: u32,
    max_pos: u32,
    codes: *const u8,
    codes_len: u32,
    mask: *const u8,
    mask_len: u32,
    era: *const u8,
    era_len: u32,
    era_code: u32,
    member: *const u8,
    member_len: u32,
    mbits: *const u8,
    mbits_len: u32,
    out: *mut u8,
    out_cap: u32,
) -> i32 {
    guarded(|| {
        // `order` points at a CHUNK of the display order whose
        // first entry is position pos_from of the full order; the
        // chunk holds exactly max_pos entries (order_len is the
        // chunk length, retained in the ABI for symmetry with the
        // staged operands). Indexing is chunk-relative.
        let _ = (order_len, pos_from);
        let mut consumed: u32 = 0;
        let mut written: u32 = 0;
        while consumed < max_pos && written < out_cap {
            let i = unsafe { rd(order, 4, consumed as usize) } as usize;
            consumed += 1;
            if !mask.is_null() {
                let ok = if i < codes_len as usize {
                    let c = unsafe { rd(codes, 2, i) } as usize;
                    c < mask_len as usize && unsafe { *mask.add(c) } != 0
                } else {
                    false
                };
                if !ok {
                    continue;
                }
            }
            if era_code != 0 {
                if era.is_null() {
                    continue;
                }
                let ec = if i < era_len as usize {
                    (unsafe { *era.add(i) }) as u32
                } else {
                    u32::MAX
                };
                if ec != era_code {
                    continue;
                }
            }
            if !member.is_null()
                && (i >= member_len as usize || unsafe { *member.add(i) } == 0)
            {
                continue;
            }
            if !mbits.is_null() {
                let widx = i >> 5;
                let bit = if widx < mbits_len as usize {
                    (unsafe { rd(mbits, 4, widx) } >> (i & 31)) & 1
                } else {
                    0
                };
                if bit == 0 {
                    continue;
                }
            }
            let p = unsafe { out.add((written as usize) * 4) };
            let nv = (i as u32).to_le_bytes();
            unsafe {
                *p = nv[0];
                *p.add(1) = nv[1];
                *p.add(2) = nv[2];
                *p.add(3) = nv[3];
            }
            written += 1;
        }
        set_out_u32(&[consumed, written]);
        0
    })
}
