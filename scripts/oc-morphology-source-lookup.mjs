/**
 * Provider-free executor for the Calyx evidence-gap reserve missions whose
 * domain is exactly `morphology`.
 *
 * The mission asks which published sources give morphological evidence
 * (description, fruit capsule, scent, diagnostic comparison) for a taxon the
 * knowledge graph holds none for. This script answers only "which sources", as
 * a pointer list for a human reviewer. It is the command bound to the
 * `morphology-source-lookup` capability in `oc-capability-router.mjs`, so it
 * runs only through the deterministic lane, with no provider secret present.
 *
 * What it does, and nothing else:
 *   1. Parses the issue's canonical mission block (shared structural parser)
 *      and refuses any domain other than `morphology`.
 *   2. Makes a bounded set of GBIF species GETs: species/match (strict); only
 *      for an EXACT accepted (or synonym-with-accepted-key) match, the
 *      descriptions of the accepted usage; then the species record of at most
 *      MAX_SOURCE_USAGES distinct source-checklist usages, read only for their
 *      dataset key. Never an occurrence, distribution or any locality endpoint.
 *   3. Keeps only description records whose publisher-assigned `type` is on a
 *      fixed morphology allowlist. Every other record (distribution, habitat,
 *      ecology, materials examined, ...) is counted, never described.
 *   4. Never reproduces description text. For a kept record it records the
 *      type, language, licence, text length, dataset key and three
 *      keyword-presence booleans. The text itself is read in memory only to
 *      compute those, then discarded. The publisher-supplied source citation is
 *      never put in the issue comment; the report keeps it only when it passes a
 *      conservative bibliographic screen (a 4-digit year, no elevation,
 *      distance, collecting, site-word, locality or coordinate marker,
 *      <= 300 chars; only a DOI's `10.NNNN/` prefix is set aside, its suffix
 *      is still screened).
 *   5. Writes `.oc-evidence/morphology-source-report-<issue>.json`
 *      (`oc.morphology-source-report.v1`) and posts one idempotent,
 *      digest-marked issue comment.
 *
 * It never writes to the knowledge graph, taxonomy, a database, or any
 * publication surface. A report with no sources is still a produced report
 * (exit 0): absence in GBIF is stated, never read as absence in the
 * literature. A transport failure or bad input exits non-zero so the lane
 * records a blocker. Settlement moves a passing run to `oc-validating`; it can
 * never reach `oc-done`.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMissionBlock, RESERVE_MISSION_NODE } from './oc-reserve-mission-binding.mjs';
import {
  EXIT,
  GBIF_BASE,
  MissionRefused,
  REVIEW_BANNER,
  TransportFailure,
  existingDigests,
  getJson,
  githubHeaders,
  matchUrl,
  postComment,
  resolutionFor,
  safe,
  speciesUrl,
  validateTaxonName,
} from './oc-nomenclature-lookup.mjs';

export { EXIT, MissionRefused, TransportFailure, REVIEW_BANNER };

export const CAPABILITY = 'morphology-source-lookup';
export const REPORT_SCHEMA = 'oc.morphology-source-report.v1';
export const COMMENT_MARKER_PREFIX = '<!-- oc-morphology-source-report:v1 digest=';
export const DESCRIPTION_LIMIT = 50;
export const MAX_SOURCE_USAGES = 5;
/** match + descriptions + source usages. */
export const MAX_GBIF_GETS = 2 + MAX_SOURCE_USAGES;
export const MAX_CITATION_CHARS = 300;
export const MAX_LICENSE_CHARS = 200;
/** ISO 639 / BCP 47-ish language code, bounded. Anything else is dropped. */
const LANGUAGE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;

/**
 * Publisher-assigned description types (GBIF Description extension, lower-cased,
 * spaces and hyphens folded to `_`) that describe the plant itself. `general`
 * is kept but flagged: a general description can mix morphology with
 * distribution or habitat prose, which is one reason no text is reproduced.
 */
export const MORPHOLOGY_TYPES = Object.freeze({
  morphology: 'morphology',
  description: 'morphology',
  diagnostic: 'diagnostic',
  diagnosis: 'diagnostic',
  diagnostic_description: 'diagnostic',
  look_alikes: 'diagnostic',
  general: 'general_mixed_possible',
});
/** Types that carry locality by nature. Counted separately; never described. */
const LOCALITY_TYPE = /distribution|habitat|ecolog|localit|material|specimen|occurrence|range|elevation|altitude|geograph|conservation|threat|population/;

// Keyword presence only. A true value means "the source text uses this word",
// not "the source states a verified fact about this character".
const TERM_SIGNALS = Object.freeze({
  fruit_capsule: /\b(?:capsules?|fruits?)\b/i,
  scent: /\b(?:scent(?:ed|less)?|fragran(?:t|ce)|odou?r(?:ous|less)?|perfumed?)\b/i,
  diagnostic_comparison: /\b(?:similar to|differs? from|distinguished (?:from|by)|resembl(?:es?|ing)|allied to|close to)\b/i,
});

// A citation is published to the report only when it looks bibliographic and
// carries no marker that could place a collecting site. Deliberately
// over-inclusive: a withheld citation costs a reviewer one click on the GBIF
// URL; a published locality cannot be taken back.
const CITATION_YEAR = /\b(?:1[5-9]|20)\d{2}\b/;

/**
 * A marker word that is also a common author surname (Long, Lat, Miles,
 * Roads). Lower-case and all-caps forms always count as a marker. The
 * capitalised form counts too, except in the one shape that is an author
 * citation: "Surname, I." (comma, capital initial, full stop), e.g.
 * "Long, D.G. (1984)" or "Miles, R.". The exemption is refused when the
 * "initial" is a compass letter (N., S., E., W.: "Road, N. of Hakgala",
 * "Lat, N. 18"), so an author initialled N/S/E/W is withheld too, and when a
 * number follows the initial ("Long, D. 98"). So "Mae Sa Road, 1980",
 * "Long. 77" or "Long D.G." stay withheld: over-withholding is acceptable, a
 * leaked locality is not. Other capitalised site words ("Near", "River",
 * "Ridge", "Hill") stay case-insensitive markers on purpose, although some
 * are surnames too, because they name sites far more often in locality prose.
 */
const surnameSafeMarker = words => {
  const lower = words.join('|');
  const title = words.map(w => w[0].toUpperCase() + w.slice(1)).join('|');
  const upper = words.map(w => w.toUpperCase()).join('|');
  const authorInitial = ',\\s?(?![NSEW]\\.)[A-Z]\\.(?!\\s*\\d)';
  return new RegExp(`\\b(?:${lower}|${upper})\\b|\\b(?:${title})\\b(?!${authorInitial})`);
};

export const CITATION_LOCALITY_MARKERS = Object.freeze([
  /\d+\s?m\b/i,                     // elevation / distance in metres
  /\d+\s?(?:ft|feet)\b/i,
  /\balt\.|\baltitude\b|\belev/i,
  /\bkm\b/i,
  /\bnear\b/i,
  /\bcoll\.|\bleg\.|\bcollect(?:ed|or|ing)\b|\bholotype\b|\bspecimens?\b/i,
  /\btype locality\b|\blocality\b|\blocalities\b/i,
  /[°º]|\bdeg(?:rees?)?\b/i,          // degrees
  /\d\s*['′’"″]/,                    // minutes / seconds
  /\b\d{1,3}(?:[\s.:]\d{1,2}){0,2}\s*[NSEW]\b/, // 12 30 N, 77.15 W
  /-?\b\d{1,3}\.\d{3,}(?:[NSEW]\b|\b)/, // decimal coordinates, also "12.3456N"
  surnameSafeMarker(['mi', 'mile', 'miles']), // distance in miles (not "Miles, R.")
  /\b[NSEW]\.?\s+(?:side\s+)?of\b/,     // "15 mi E of ...", "S. of ...", "W. side of ..."
  surnameSafeMarker(['lat', 'lon', 'long']),  // lat / lon / long (not "Long, D.G.")
  surnameSafeMarker(['road', 'roads']),       // not "Roads, K."
  /\b(?:ridges?|trails?|villages?|summits?|streams?|rivers?|valleys?|mountains?|hills?)\b/i,
]);
/**
 * A DOI is bibliographic, and its registrant prefix ("10.1007/") would
 * otherwise trip the decimal-coordinate marker. Only that prefix is set aside
 * for the locality screen: the suffix is screened like any other text, so
 * coordinates or site words glued onto a DOI ("10.1007/abc,12.3456,-77.1234")
 * are still caught. Real suffixes (s12225-011-9281-2, zenodo.123456,
 * phytotaxa.100.1.1) carry no marker. Underscores are read as spaces, so
 * "near_the_river" is screened as words. The year check, in contrast, drops
 * the whole DOI token: a year must appear outside it.
 */
const DOI_PREFIX = /\b10\.\d{4,9}\//g;
const DOI_TOKEN = /\b10\.\d{4,9}\/\S+/g;

export function descriptionsUrl(key) {
  return `${GBIF_BASE}/${key}/descriptions?limit=${DESCRIPTION_LIMIT}`;
}

/** Defence in depth: the only GBIF URLs this executor can ever request. */
export function assertMorphologyUrl(url) {
  const allowed = /^https:\/\/api\.gbif\.org\/v1\/species\/(?:match\?name=[^&#]+&strict=true|\d+|\d+\/descriptions\?limit=\d+)$/;
  if (!allowed.test(url) || /occurrence|locality|coordinate|distribution/i.test(url)) {
    throw new Error(`refusing non-morphology GBIF URL ${url}`);
  }
}

export function parseMission(body) {
  let mission;
  try {
    mission = parseMissionBlock(body);
  } catch (error) {
    throw new MissionRefused(error instanceof Error ? error.message : String(error));
  }
  if (mission.domain !== 'morphology') {
    throw new MissionRefused(`domain '${mission.domain}' is not morphology; this executor refuses it`);
  }
  mission.taxonName = validateTaxonName(mission.taxonName);
  const fingerprint = /Material fingerprint: ([0-9a-f]{64})\b/.exec(String(body ?? ''));
  mission.materialFingerprint = fingerprint ? fingerprint[1] : null;
  return mission;
}

export function normalizeType(type) {
  return String(type ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** 'morphology' | 'diagnostic' | 'general_mixed_possible' | 'locality_bearing' | 'other'. */
export function classifyType(type) {
  const t = normalizeType(type);
  if (Object.hasOwn(MORPHOLOGY_TYPES, t)) return MORPHOLOGY_TYPES[t];
  if (LOCALITY_TYPE.test(t)) return 'locality_bearing';
  return 'other';
}

const str = value => (typeof value === 'string' && value.trim() ? value.trim() : null);
const int = value => (Number.isSafeInteger(value) ? value : null);
const plain = html => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

/** { citation, citation_withheld_reason }: a citation only if it passes the screen. */
export function citationFor(source) {
  const text = str(source);
  if (!text) return { citation: null, citation_withheld_reason: 'no_citation_supplied' };
  if (text.length > MAX_CITATION_CHARS) return { citation: null, citation_withheld_reason: 'longer_than_300_chars' };
  const screened = text.replace(DOI_PREFIX, ' ').replace(/_/g, ' ');
  if (CITATION_LOCALITY_MARKERS.some(re => re.test(screened))) {
    return { citation: null, citation_withheld_reason: 'possible_locality_or_collecting_marker' };
  }
  if (!CITATION_YEAR.test(text.replace(DOI_TOKEN, ' '))) return { citation: null, citation_withheld_reason: 'no_publication_year' };
  return { citation: text, citation_withheld_reason: null };
}

const languageOf = value => {
  const text = str(value);
  return text && LANGUAGE.test(text) ? text : null;
};
const licenseOf = value => {
  const text = str(value);
  return text && text.length <= MAX_LICENSE_CHARS && !/[\u0000-\u001f\u007f]/.test(text) ? text : null;
};

/** Reduce one kept description record to metadata. The text is not returned. */
export function sourceRecord(row) {
  const text = plain(row.description);
  const signals = Object.fromEntries(Object.entries(TERM_SIGNALS).map(([name, re]) => [name, re.test(text)]));
  return {
    description_key: int(row.key),
    type: str(row.type),
    scope: classifyType(row.type),
    language: languageOf(row.language),
    license: licenseOf(row.license),
    ...citationFor(row.source),
    source_taxon_key: int(row.sourceTaxonKey),
    dataset_key: null,
    gbif_url: int(row.sourceTaxonKey) ? `https://www.gbif.org/species/${row.sourceTaxonKey}` : null,
    text_length: text.length,
    term_signals: signals,
  };
}

export async function lookupGbif(name, fetchImpl, now = () => new Date().toISOString()) {
  const sources = [];
  let gets = 0;
  const get = async url => {
    assertMorphologyUrl(url);
    if (gets >= MAX_GBIF_GETS) throw new Error('GBIF request budget exhausted');
    gets += 1;
    const retrievedAt = now();
    const result = await getJson(fetchImpl, url);
    sources.push({ url, retrieved_at: retrievedAt, http_status: result.status });
    return result.json;
  };

  const match = await get(matchUrl(name));
  if (!match || typeof match !== 'object' || Array.isArray(match) || typeof match.matchType !== 'string') {
    throw new TransportFailure('GBIF match response has no matchType');
  }
  const resolution = resolutionFor(match);
  const taxon = {
    match_type: match.matchType,
    status: str(match.status),
    matched_usage_key: int(match.usageKey),
    matched_name: str(match.scientificName),
    resolution,
    described_usage_key: resolution === 'accepted_match' ? int(match.usageKey)
      : resolution === 'synonym_of' ? int(match.acceptedUsageKey) : null,
  };
  const empty = { returned: 0, truncated: false, kept: 0, excluded: { locality_bearing: 0, other: 0 } };
  if (taxon.described_usage_key === null) {
    return { gets, sources, taxon, descriptions: empty, records: [] };
  }

  const page = await get(descriptionsUrl(taxon.described_usage_key));
  if (!page || !Array.isArray(page.results)) throw new TransportFailure('GBIF descriptions response has no results array');
  const rows = page.results.filter(row => row && typeof row === 'object');
  const excluded = { locality_bearing: 0, other: 0 };
  const records = [];
  for (const row of rows) {
    const scope = classifyType(row.type);
    if (scope === 'locality_bearing' || scope === 'other') excluded[scope] += 1;
    else records.push(sourceRecord(row));
  }

  const usageKeys = [...new Set(records.map(r => r.source_taxon_key).filter(k => k !== null))];
  const datasetFor = new Map();
  for (const key of usageKeys.slice(0, MAX_SOURCE_USAGES)) {
    const usage = await get(speciesUrl(key));
    if (!usage || usage.key !== key) throw new TransportFailure(`GBIF species record did not describe key ${key}`);
    datasetFor.set(key, str(usage.datasetKey));
  }
  for (const record of records) record.dataset_key = datasetFor.get(record.source_taxon_key) ?? null;

  return {
    gets,
    sources,
    taxon,
    descriptions: {
      returned: rows.length,
      truncated: page.endOfRecords === false,
      kept: records.length,
      excluded,
      source_usages_unresolved: Math.max(0, usageKeys.length - MAX_SOURCE_USAGES),
    },
    records,
  };
}

export function outcomeFor(lookup) {
  if (lookup.taxon.described_usage_key === null) return 'taxon_unresolved';
  return lookup.records.length > 0 ? 'sources_found' : 'no_morphology_source_in_gbif';
}

function uncertaintyFor(lookup, outcome) {
  const lines = [];
  if (outcome === 'taxon_unresolved') {
    lines.push(`GBIF returned match type ${lookup.taxon.match_type} with status ${lookup.taxon.status ?? 'missing'}; no description was requested because the name did not resolve exactly.`);
  }
  if (lookup.taxon.resolution === 'synonym_of') {
    lines.push('The knowledge-graph name is a synonym in the GBIF Backbone; descriptions were read for the GBIF accepted usage, which a human must confirm is the same taxon.');
  }
  if (outcome === 'no_morphology_source_in_gbif') {
    lines.push('No GBIF description record carries a morphology or diagnostic type for this taxon. Absence in GBIF is not evidence of absence in the literature.');
  }
  if (lookup.descriptions.truncated) lines.push(`GBIF has more than ${DESCRIPTION_LIMIT} description records; only the first page was read.`);
  if (lookup.descriptions.source_usages_unresolved) {
    lines.push(`${lookup.descriptions.source_usages_unresolved} source usage(s) beyond the first ${MAX_SOURCE_USAGES} were not resolved to a dataset.`);
  }
  if (lookup.records.some(r => r.scope === 'general_mixed_possible')) {
    lines.push('A "general" description may mix morphology with distribution or habitat content; its text was not reproduced.');
  }
  if (lookup.records.some(r => !r.license)) lines.push('At least one source record states no usable licence; any reuse of its text needs a rights review.');
  if (lookup.records.some(r => r.citation_withheld_reason)) {
    lines.push('At least one publisher-supplied citation was withheld by the conservative bibliographic screen; the GBIF URL identifies the source.');
  }
  lines.push(
    'Description types are assigned by each publishing checklist, not verified by Orchid Continuum.',
    'Term signals record only that a word appears in the source text (capsule/fruit, scent/fragrance, a comparison phrase); they are not verified morphological statements.',
    'Description text is not reproduced here; a reviewer must read each source under its own licence.',
    'GBIF aggregates only some published floras and treatments; protologues and monographs may hold morphology that GBIF does not.',
    'This report was retrieved by a machine and has not been reviewed by a person.',
  );
  return lines;
}

export function reportDigest(report) {
  const { sources, generated_at: _generatedAt, digest: _digest, ...rest } = report;
  const stable = { ...rest, sources: (sources ?? []).map(({ url, http_status }) => ({ url, http_status })) };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

export function buildReport({ issue, repository, mission, lookup, generatedAt }) {
  const outcome = outcomeFor(lookup);
  const report = {
    schema: REPORT_SCHEMA,
    issue,
    repository,
    capability: CAPABILITY,
    graph_node: RESERVE_MISSION_NODE,
    taxon: { id: mission.taxonId, kg_name: mission.taxonName, domain: mission.domain },
    material_fingerprint: mission.materialFingerprint,
    query: { name: mission.taxonName, strict: true },
    sources: lookup.sources,
    gbif: lookup.taxon,
    descriptions: lookup.descriptions,
    morphology_sources: lookup.records,
    outcome,
    uncertainty: uncertaintyFor(lookup, outcome),
    description_text_reproduced: false,
    review_required: true,
    automatic_publication: false,
    knowledge_graph_mutation: false,
    taxonomy_mutation: false,
    sensitive_locality_disclosure: false,
    provider_calls: 0,
    gbif_get_count: lookup.gets,
    generated_at: generatedAt,
  };
  return { ...report, digest: reportDigest(report) };
}

const yesNo = value => (value ? 'yes' : 'no');

export function renderComment(report) {
  const d = report.descriptions;
  const lines = [
    `${COMMENT_MARKER_PREFIX}${report.digest} -->`,
    `**${REVIEW_BANNER}**`,
    '',
    `Morphology source report for taxon \`${report.taxon.id}\` (${safe(report.taxon.kg_name)}): outcome **${report.outcome}**.`,
    '',
    `- GBIF match: ${safe(report.gbif.match_type)}, status ${safe(report.gbif.status)}; descriptions read for usage key ${safe(report.gbif.described_usage_key)}`,
    `- Description records: ${d.returned} returned${d.truncated ? ' (truncated)' : ''}, ${d.kept} morphology/diagnostic kept, ` +
      `${d.excluded.locality_bearing} locality-bearing and ${d.excluded.other} other excluded (not described)`,
    '',
    ...(report.morphology_sources.length ? ['**Sources holding morphology descriptions** (text not reproduced)'] : []),
    ...report.morphology_sources.slice(0, 10).map(r =>
      `- ${safe(r.type)} (${safe(r.scope)}), ${safe(r.language)}, licence ${safe(r.license ?? 'unspecified')}, ${r.text_length} chars; ` +
      `dataset ${safe(r.dataset_key)}, ${safe(r.gbif_url)}; ` +
      `mentions capsule/fruit ${yesNo(r.term_signals.fruit_capsule)}, scent ${yesNo(r.term_signals.scent)}, comparison ${yesNo(r.term_signals.diagnostic_comparison)}`),
    ...(report.morphology_sources.length > 10 ? [`- ${report.morphology_sources.length - 10} more in the full report`] : []),
    ...(report.morphology_sources.length ? ['- citation text is in the report artifact for reviewers'] : []),
    '',
    '**Uncertainty**',
    ...report.uncertainty.map(line => `- ${safe(line)}`),
    '',
    '**Sources**',
    ...report.sources.map(s => `- ${s.url} (retrieved ${s.retrieved_at}, HTTP ${s.http_status})`),
    '',
    'No knowledge-graph, taxonomy, database, or publication change was made. ' +
      'No description text was reproduced; source citations are publisher-supplied, withheld from this comment, and screened conservatively in the report. ' +
      `Provider calls: 0. Full report: \`morphology-source-report-${report.issue}.json\` in the lane evidence artifact.`,
  ];
  return lines.join('\n');
}

export async function runMorphologySourceLookup({ env = process.env, fetchImpl = fetch, now = () => new Date().toISOString(), log = console.log } = {}) {
  const issue = Number(env.ISSUE_NUMBER);
  const repo = String(env.REPO ?? '');
  const token = String(env.GH_TOKEN ?? '');
  const api = String(env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  try {
    if (!Number.isSafeInteger(issue) || issue <= 0) throw new MissionRefused('ISSUE_NUMBER is not a positive integer');
    if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) throw new MissionRefused('REPO is not owner/name');
    if (!token) throw new MissionRefused('GH_TOKEN is required to read the issue');

    const { json: record } = await getJson(fetchImpl, `${api}/repos/${repo}/issues/${issue}`, githubHeaders(token, 'oc-morphology-source-lookup'));
    if (record?.number !== issue) throw new MissionRefused('GitHub returned a different issue');
    const mission = parseMission(record.body);
    const lookup = await lookupGbif(mission.taxonName, fetchImpl, now);
    const report = buildReport({ issue, repository: repo, mission, lookup, generatedAt: now() });

    const dir = env.OC_EVIDENCE_DIR || '.oc-evidence';
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `morphology-source-report-${issue}.json`);
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);

    const seen = await existingDigests(fetchImpl, api, repo, issue, token, COMMENT_MARKER_PREFIX);
    const commented = !seen.has(report.digest);
    if (commented) await postComment(fetchImpl, api, repo, issue, token, renderComment(report));
    log(JSON.stringify({ issue, outcome: report.outcome, kept: report.descriptions.kept, digest: report.digest,
      report: path, comment: commented ? 'posted' : 'skipped_same_digest', provider_calls: 0 }));
    return { exitCode: EXIT.OK, report, commented };
  } catch (error) {
    const transport = error instanceof TransportFailure;
    const refused = error instanceof MissionRefused;
    log(JSON.stringify({ issue: Number.isSafeInteger(issue) ? issue : null,
      blocker: transport ? 'transport_failure' : refused ? 'mission_refused' : 'executor_error',
      detail: error instanceof Error ? error.message : String(error), provider_calls: 0 }));
    return { exitCode: transport ? EXIT.TRANSPORT : EXIT.BAD_INPUT, error };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode } = await runMorphologySourceLookup();
  process.exit(exitCode);
}
