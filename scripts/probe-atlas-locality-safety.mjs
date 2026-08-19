/**
 * READ-ONLY probe of the live occurrence store, for the Slice 2 locality-safety
 * trace. It writes nothing and mutates nothing.
 *
 * It exists because the checked-in migration and the generated types for
 * `atlas_occurrences` are both older than the live table — the frontend selects
 * columns neither of them declares — so the only reliable description of the
 * schema is the table itself.
 *
 * Runs in CI because the development sandbox has no egress to the data host.
 */
const URL_BASE = 'https://cvjuxzkznxzxcjkdvzla.databasepad.com/rest/v1';
const KEY = process.env.SUPABASE_ANON_KEY;
if (!KEY) {
  console.error('SUPABASE_ANON_KEY not set');
  process.exit(2);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const get = async (path, extraHeaders = {}) => {
  const res = await fetch(`${URL_BASE}/${path}`, { headers: { ...H, ...extraHeaders } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 400);
  }
  return { status: res.status, range: res.headers.get('content-range'), body };
};

/** Exact row count via the range header, without transferring rows. */
const countOf = async (query) => {
  const r = await get(`atlas_occurrences?${query}&select=id&limit=1`, { Prefer: 'count=exact' });
  const m = r.range && r.range.match(/\/(\d+)$/);
  return m ? Number(m[1]) : `? (status ${r.status})`;
};

const out = {};

// 1. What columns does the live table actually have?
const sample = await get('atlas_occurrences?select=*&limit=1');
out.liveColumns = Array.isArray(sample.body) && sample.body[0] ? Object.keys(sample.body[0]).sort() : sample;

// 2. Volume, and how much of it can resolve a conservation assessment.
out.totals = {
  allRecords: await countOf('id=not.is.null'),
  withSpeciesId: await countOf('species_id=not.is.null'),
  withoutSpeciesId: await countOf('species_id=is.null'),
};

// 3. Is there an authoritative per-occurrence assessment column, and is it populated?
if (Array.isArray(out.liveColumns) && out.liveColumns.includes('iucn_code')) {
  out.occurrenceLevelIucn = {
    populated: await countOf('iucn_code=not.is.null'),
    threatened: await countOf('iucn_code=in.(CR,EN,VU)'),
    threatenedWithoutSpeciesId: await countOf('iucn_code=in.(CR,EN,VU)&species_id=is.null'),
  };
} else {
  out.occurrenceLevelIucn = 'column absent from the live table';
}

// 4. Coordinate uncertainty coverage — separate from any withholding decision.
if (Array.isArray(out.liveColumns) && out.liveColumns.includes('coordinate_uncertainty_m')) {
  out.coordinateUncertainty = {
    stated: await countOf('coordinate_uncertainty_m=not.is.null'),
    notStated: await countOf('coordinate_uncertainty_m=is.null'),
    over10km: await countOf('coordinate_uncertainty_m=gt.10000'),
  };
}

// 5. The relationship-linkage booleans the older schema declared. If they are
//    live and populated they are a direct input to the knowledge-gap view.
for (const col of ['pollinator_linked', 'mycorrhizal_linked', 'verified', 'biome', 'accepted_name']) {
  if (Array.isArray(out.liveColumns) && out.liveColumns.includes(col)) {
    out[`${col}_coverage`] = {
      trueOrPresent: await countOf(col === 'verified' || col.endsWith('_linked') ? `${col}=is.true` : `${col}=not.is.null`),
    };
  }
}

// 6. THE SAFETY QUESTION. Can an anonymous client read a precise coordinate for
//    a record whose species is assessed as threatened? If yes, frontend
//    generalisation is a display courtesy and not a control.
const speciesThreatened = await get('species?select=id,genus,epithet,iucn_code&iucn_code=in.(CR,EN,VU)&limit=5');
out.threatenedSpeciesSample = Array.isArray(speciesThreatened.body)
  ? speciesThreatened.body.map((r) => ({ genus: r.genus, epithet: r.epithet, iucn: r.iucn_code }))
  : speciesThreatened;

if (Array.isArray(speciesThreatened.body) && speciesThreatened.body[0]) {
  const sp = speciesThreatened.body[0];
  const linked = await get(
    `atlas_occurrences?select=id,scientific_name,lat,lng,coordinate_uncertainty_m&species_id=eq.${sp.id}&limit=2`,
  );
  out.anonCanReadPreciseCoordsForThreatened = {
    species: `${sp.genus} ${sp.epithet} (${sp.iucn_code})`,
    status: linked.status,
    // Precision is reported as decimal places, never as the coordinate itself.
    rows: Array.isArray(linked.body)
      ? linked.body.map((r) => ({
          decimalPlacesLat: String(r.lat).split('.')[1]?.length ?? 0,
          decimalPlacesLng: String(r.lng).split('.')[1]?.length ?? 0,
          statedUncertaintyM: r.coordinate_uncertainty_m,
        }))
      : linked.body,
  };
}

// 7. Does the store expose any generalised//protected view as an alternative?
for (const candidate of ['atlas_occurrences_public', 'v_atlas_occurrences_public', 'atlas_occurrences_generalized']) {
  const r = await get(`${candidate}?select=id&limit=1`);
  out[`view_${candidate}`] = r.status === 200 ? 'EXISTS' : `absent (${r.status})`;
}

console.log(JSON.stringify(out, null, 2));

// ---------------------------------------------------------------------------
// PASS 2 — can a conservation assessment actually be resolved, and for how many?
// ---------------------------------------------------------------------------
//
// Pass 1 established that `iucn_code` is absent from the live occurrence table
// and that only ~1% of rows carry a species_id. Everything therefore depends on
// matching the occurrence's canonical name against the `species` table. Before
// changing how unresolved records are drawn, measure how many there are.

const pass2 = {};

pass2.speciesTable = {
  rows: await (async () => {
    const r = await get('species?select=id&limit=1', { Prefer: 'count=exact' });
    const m = r.range && r.range.match(/\/(\d+)$/);
    return m ? Number(m[1]) : `? (${r.status})`;
  })(),
};

const speciesCount = async (q) => {
  const r = await get(`species?${q}&select=id&limit=1`, { Prefer: 'count=exact' });
  const m = r.range && r.range.match(/\/(\d+)$/);
  return m ? Number(m[1]) : `? (${r.status})`;
};
pass2.speciesTable.withIucnCode = await speciesCount('iucn_code=not.is.null');
pass2.speciesTable.withConservationStatus = await speciesCount('conservation_status=not.is.null');
pass2.speciesTable.threatened = await speciesCount('iucn_code=in.(CR,EN,VU)');

// Build the same index the frontend builds: canonical "Genus epithet" -> assessment.
const allSpecies = await get('species?select=genus,epithet,iucn_code,conservation_status&limit=5000');
const assessed = new Map();
const known = new Set();
if (Array.isArray(allSpecies.body)) {
  for (const r of allSpecies.body) {
    if (!r.genus || !r.epithet) continue;
    const key = `${r.genus} ${r.epithet}`.trim().toLowerCase();
    known.add(key);
    if (r.iucn_code || r.conservation_status) assessed.set(key, r.iucn_code ?? r.conservation_status);
  }
}
pass2.speciesIndex = { namesInSpeciesTable: known.size, namesCarryingAnAssessment: assessed.size };

// Sample occurrence names and see how many resolve. A sample, clearly labelled:
// the REST interface cannot do this join, and 31k rows is more than this probe
// should pull.
const occSample = await get('atlas_occurrences?select=accepted_name,scientific_name,genus,species&limit=4000');
const binomial = (row) => {
  const src = (row.accepted_name || row.scientific_name || '').trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2 && /^[a-z-]+$/.test(parts[1])) return `${parts[0]} ${parts[1]}`.toLowerCase();
  if (row.genus && row.species) return `${row.genus} ${row.species}`.toLowerCase();
  return null;
};
let resolvable = 0;
let assessedHit = 0;
let noBinomial = 0;
const unresolvedExamples = new Set();
if (Array.isArray(occSample.body)) {
  for (const row of occSample.body) {
    const b = binomial(row);
    if (!b) {
      noBinomial += 1;
      continue;
    }
    if (known.has(b)) resolvable += 1;
    else unresolvedExamples.add(b);
    if (assessed.has(b)) assessedHit += 1;
  }
  pass2.nameResolution = {
    sampled: occSample.body.length,
    noUsableBinomial: noBinomial,
    matchedASpeciesRow: resolvable,
    matchedARowCarryingAnAssessment: assessedHit,
    unmatched: occSample.body.length - noBinomial - resolvable,
    percentUnresolved:
      Math.round(((occSample.body.length - resolvable) / Math.max(1, occSample.body.length)) * 1000) / 10,
    firstUnmatchedNames: Array.from(unresolvedExamples).slice(0, 8),
  };
}

console.log('=== PASS 2 ===');
console.log(JSON.stringify(pass2, null, 2));
