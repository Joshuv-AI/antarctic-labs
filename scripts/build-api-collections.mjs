#!/usr/bin/env node
// Build public/api-collections.json from public/tower-hubs-index.json.
//
// GET /api/v1/collections needs only the hubs index's summary shape —
// snapshot date, total, per-collection counts, tradition/programme KEYS,
// author name/slug/count triples, course-group label/slug/count triples —
// but the hubs file also carries every group's full work list (~14.5 MB),
// and parsing it per isolate was one of the multi-MB parses behind the
// 2026-10-27 /api/v1 1102s. This script precomputes exactly the payload
// the endpoint returns (same derivation, incl. slugify) into a few-KB
// file the endpoint can fetch instead.
//
// PIPELINE RULE: rerun in the same push as any tower-hubs-index.json
// regeneration. Usage (site root): node scripts/build-api-collections.mjs
import { readFileSync, writeFileSync } from "node:fs";

function slugify(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const hubs = JSON.parse(readFileSync("public/tower-hubs-index.json", "utf8"));

const payload = {
  snapshot_date: hubs.snapshotDate || null,
  total: hubs.total ?? null,
  collections: hubs.collections || {},
  traditions: Object.keys(hubs.traditions || {}),
  programmes: Object.keys(hubs.programmes || {}),
  authors: (hubs.topAuthors || []).map((a) => ({
    name: a.name,
    slug: a.slug,
    count: a.count ?? null,
  })),
  course_groups: ((hubs.course && hubs.course.groups) || []).map((g) => ({
    label: g.label,
    slug: slugify(g.label),
    count: (g.items || []).length,
  })),
};

const body = JSON.stringify(payload);
writeFileSync("public/api-collections.json", body);
console.log(`api-collections.json: ${body.length} bytes`);
