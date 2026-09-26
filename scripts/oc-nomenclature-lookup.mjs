/**
 * Provider-free executor for the Calyx evidence-gap reserve missions whose
 * domain is exactly `nomenclature`.
 *
 * The supervisor's backend reserve pass files these issues with a fixed
 * "Canonical bounded research mission" block (backendReserveQueueBridge.ts).
 * This script is the command bound to the `nomenclature-evidence-lookup`
 * capability in `oc-capability-router.mjs`, so it runs only through the
 * deterministic lane, with no provider secret present.
 *
 * What it does, and nothing else:
 *   1. Reads the issue through the GitHub REST API and parses the taxon id,
 *      taxon name and domain from the exact mission-block lines. Anything
 *      malformed is refused (non-zero exit), never guessed.
 *   2. Makes at most three GBIF GETs: species/match (strict), then, only for an
 *      EXACT match, the taxon record and its synonyms; or, only when the strict
 *      match is NONE, one non-strict species/match whose best names are kept
 *      as labelled `nonstrict_candidates` (never accepted, never evidence).
 *      Never an occurrence or any other locality endpoint.
 *   3. Lists every synonym GBIF returned and flags suspect entries for a
 *      reviewer (a duplicate of the accepted name, authorship-variant
 *      duplicates, a malformed scientific name). A flag is attention only:
 *      nothing is removed or corrected.
 *   4. Writes `.oc-evidence/nomenclature-report-<issue>.json`
 *      (`oc.nomenclature-evidence-report.v1`) and posts one idempotent,
 *      digest-marked issue comment that also embeds the full report JSON (it
 *      holds no locality), so the evidence outlives the expiring artifact.
 *
 * It never writes to the knowledge graph, taxonomy, a database, or any
 * publication surface. FUZZY, HIGHERRANK and NONE matches are always
 * `unresolved`; a near name is recorded, never adopted. A report that says
 * `unresolved` is still a produced report (exit 0). A transport failure or bad
 * input exits non-zero so the lane records a blocker, never an empty success.
 * Settlement moves a passing run to `oc-validating`; it can never reach
 * `oc-done`, because only the fixed Featured Genus validator may do that.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMissionBlock, RESERVE_MISSION_NODE } from './oc-reserve-mission-binding.mjs';

export const REPORT_SCHEMA = 'oc.nomenclature-evidence-report.v1';
export const COMMENT_MARKER_PREFIX = '<!-- oc-nomenclature-report:v1 digest=';
export const REVIEW_BANNER = 'Machine-retrieved evidence — requires human scientific review; not published';
export const GBIF_BASE = 'https://api.gbif.org/v1/species';
export const MAX_GBIF_GETS = 3;
export const SYNONYM_LIMIT = 20;
/**
 * Synonyms named in the comment. At least SYNONYM_LIMIT, so every synonym GBIF
 * returned is listed; the bound only guards a future larger request limit.
 */
export const COMMENT_SYNONYM_LIMIT = 50;
/** Candidate names kept from the non-strict follow-up for a NONE match. */
export const NONSTRICT_CANDIDATE_LIMIT = 3;
export const NONSTRICT_LABEL = 'candidate names from fuzzy matching — not accepted, not evidence';
export const SYNONYM_FLAG_NOTE = 'flag for reviewer: attention only; no synonym was removed or corrected';
/** GitHub rejects a comment over 65,536 characters; stay clear of it. */
export const MAX_COMMENT_CHARS = 65000;
export const MAX_EMBEDDED_JSON_CHARS = 60000;
export const EMBEDDED_JSON_TRUNCATED_MARKER = '… [truncated: the full report is in the lane evidence artifact]';
export const MAX_NAME_LENGTH = 120;
const TIMEOUT_MS = 10000;

export const EXIT = Object.freeze({ OK: 0, BAD_INPUT: 2, TRANSPORT: 3 });

export class MissionRefused extends Error {}
export class TransportFailure extends Error {}

const EPITHET = '[a-z]+(?:-[a-z]+)?';
const CANONICAL_NAME = new RegExp(
  `^[A-Z][a-z]+(?:-[a-z]+)? ${EPITHET}(?: (?:subsp\\.|var\\.|f\\.) ${EPITHET})?$`,
);

/**
 * Parse the one canonical mission block. Only the exact lines the bridge
 * renders are read (the shared structural parser in
 * oc-reserve-mission-binding.mjs); prose elsewhere can never supply a value.
 */
export function parseMission(body) {
  let mission;
  try {
    mission = parseMissionBlock(body);
  } catch (error) {
    throw new MissionRefused(error instanceof Error ? error.message : String(error));
  }
  if (mission.domain !== 'nomenclature') {
    throw new MissionRefused(`domain '${mission.domain}' is not nomenclature; this executor refuses it`);
  }
  mission.taxonName = validateTaxonName(mission.taxonName);
  // Provenance only: the bridge renders it inline after a sentence, not on its own line.
  const fingerprint = /Material fingerprint: ([0-9a-f]{64})\b/.exec(String(body ?? ''));
  mission.materialFingerprint = fingerprint ? fingerprint[1] : null;
  return mission;
}

/** A canonical binomial, optionally with one infraspecific rank and epithet. */
export function validateTaxonName(name) {
  const text = String(name ?? '');
  if (text.length === 0 || text.length > MAX_NAME_LENGTH) {
    throw new MissionRefused(`taxon name length ${text.length} is outside 1..${MAX_NAME_LENGTH}`);
  }
  if (!CANONICAL_NAME.test(text)) {
    throw new MissionRefused('taxon name is not a canonical binomial (optionally one rank and epithet)');
  }
  return text;
}

export function matchUrl(name) {
  return `${GBIF_BASE}/match?name=${encodeURIComponent(name)}&strict=true`;
}
/**
 * The one follow-up for a strict NONE match. `verbose=true` makes GBIF include
 * its `alternatives`; the result is only ever recorded as candidate names.
 */
export function nonstrictMatchUrl(name) {
  return `${GBIF_BASE}/match?name=${encodeURIComponent(name)}&strict=false&verbose=true`;
}
export function speciesUrl(key) {
  return `${GBIF_BASE}/${key}`;
}
export function synonymsUrl(key) {
  return `${GBIF_BASE}/${key}/synonyms?limit=${SYNONYM_LIMIT}`;
}

/** Defence in depth: the only GBIF URLs this executor can ever request. */
export function assertNomenclatureUrl(url) {
  const allowed = /^https:\/\/api\.gbif\.org\/v1\/species\/(?:match\?name=[^&#]+&strict=(?:true|false&verbose=true)|\d+|\d+\/synonyms\?limit=\d+)$/;
  if (!allowed.test(url) || /occurrence|locality|coordinate/i.test(url)) {
    throw new Error(`refusing non-nomenclature GBIF URL ${url}`);
  }
}

export async function getJson(fetchImpl, url, headers = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new TransportFailure(`GET ${url} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const contentType = String(response.headers?.get?.('content-type') ?? '');
  if (!response.ok) throw new TransportFailure(`GET ${url} returned HTTP ${response.status}`);
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json\b/i.test(contentType)) {
    throw new TransportFailure(`GET ${url} returned non-JSON content type '${contentType || 'none'}'`);
  }
  const text = await response.text();
  try {
    return { status: response.status, json: JSON.parse(text) };
  } catch {
    throw new TransportFailure(`GET ${url} returned a body that is not JSON`);
  }
}

const SYNONYM_STATUSES = new Set(['SYNONYM', 'HOMOTYPIC_SYNONYM', 'HETEROTYPIC_SYNONYM', 'PROPARTE_SYNONYM']);
const UNRESOLVED_MATCH_TYPES = new Set(['FUZZY', 'HIGHERRANK', 'NONE']);

/** Map a GBIF match onto the report's resolution. Never coerces a near match. */
export function resolutionFor(match) {
  const matchType = String(match?.matchType ?? '');
  if (UNRESOLVED_MATCH_TYPES.has(matchType) || matchType !== 'EXACT') return 'unresolved';
  if (!Number.isSafeInteger(match?.usageKey)) return 'unresolved';
  if (match.status === 'ACCEPTED') return 'accepted_match';
  if (SYNONYM_STATUSES.has(match.status) && Number.isSafeInteger(match.acceptedUsageKey)) return 'synonym_of';
  return 'unresolved';
}

const str = value => (typeof value === 'string' && value.trim() ? value.trim() : null);
const int = value => (Number.isSafeInteger(value) ? value : null);
const normalizeName = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Reviewer flags for one GBIF scientific name that looks malformed. Each check
 * names a pattern a well-formed botanical (ICN) name does not show; none of
 * them decides the name is wrong, and the name is kept exactly as GBIF gave it.
 *   - run_on_author_token: a word glued to an initial, e.g. "Schlechter.A.Plants"
 *     (legitimate abbreviations such as "D.Don", "Hook.f." or "L.R.Shakya" do
 *     not match: the glued initial must follow a lowercase word of 3+ letters).
 *   - unbalanced_parentheses.
 *   - year_in_author_citation: botanical author citations carry no year
 *     ("(Kraenzlin, 1903) ..., 1919" is zoological style or a parse artefact).
 *   - unexpected_characters: anything outside letters, marks, digits, spaces
 *     and the punctuation author citations use.
 */
export function malformedNameFlags(scientificName) {
  const name = String(scientificName ?? '');
  const flags = [];
  if (/[a-z]{3,}\.[A-Z]\./.test(name)) flags.push('run_on_author_token');
  let depth = 0;
  for (const ch of name) {
    if (ch === '(') depth += 1;
    else if (ch === ')' && (depth -= 1) < 0) break;
  }
  if (depth !== 0) flags.push('unbalanced_parentheses');
  if (/\b(?:1[5-9]|20)\d{2}\b/.test(name)) flags.push('year_in_author_citation');
  if (/[^\p{L}\p{M}\d .,'’()&×-]/u.test(name)) flags.push('unexpected_characters');
  return flags;
}

/**
 * Add `review_flags` to each synonym without removing or rewriting any:
 *   - duplicates_accepted_name: same canonical name as the accepted taxon.
 *   - authorship_variant_duplicate: two or more synonyms share a canonical name
 *     but differ in authorship (the same name recorded more than once).
 *   - malformed_scientific_name:<check>: see malformedNameFlags.
 */
export function flagSynonyms(items, acceptedCanonical) {
  const accepted = acceptedCanonical ? normalizeName(acceptedCanonical) : null;
  const authorshipsByName = new Map();
  for (const item of items) {
    const canonical = normalizeName(item.canonical_name);
    if (!canonical) continue;
    if (!authorshipsByName.has(canonical)) authorshipsByName.set(canonical, new Set());
    authorshipsByName.get(canonical).add(normalizeName(item.authorship));
  }
  return items.map(item => {
    const canonical = normalizeName(item.canonical_name);
    const flags = [];
    if (accepted && canonical && canonical === accepted) flags.push('duplicates_accepted_name');
    if (canonical && authorshipsByName.get(canonical).size > 1) flags.push('authorship_variant_duplicate');
    for (const check of malformedNameFlags(item.scientific_name)) flags.push(`malformed_scientific_name:${check}`);
    return { ...item, review_flags: flags };
  });
}

/**
 * Up to NONSTRICT_CANDIDATE_LIMIT candidate names from a non-strict match body:
 * the best match, then GBIF's `alternatives`, skipping NONE and repeated keys.
 * These are recorded for a reviewer only; nothing here is adopted.
 */
export function nonstrictCandidates(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.matchType !== 'string') {
    throw new TransportFailure('GBIF non-strict match response has no matchType');
  }
  const rows = [body, ...(Array.isArray(body.alternatives) ? body.alternatives : [])];
  const seen = new Set();
  const items = [];
  for (const row of rows) {
    if (items.length >= NONSTRICT_CANDIDATE_LIMIT) break;
    if (!row || typeof row !== 'object' || row.matchType === 'NONE') continue;
    const key = int(row.usageKey);
    if (key === null || seen.has(key)) continue;
    seen.add(key);
    items.push({
      canonical_name: str(row.canonicalName),
      scientific_name: str(row.scientificName),
      match_type: str(row.matchType),
      confidence: typeof row.confidence === 'number' ? row.confidence : null,
      usage_key: key,
      status: str(row.status),
      rank: str(row.rank),
    });
  }
  return items;
}

/**
 * Perform the bounded lookup. Returns the GBIF-derived portion of the report.
 * At most MAX_GBIF_GETS requests; detail requests only for an EXACT match.
 */
export async function lookupGbif(name, fetchImpl, now = () => new Date().toISOString()) {
  const sources = [];
  let gets = 0;
  const get = async url => {
    assertNomenclatureUrl(url);
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
  let resolution = resolutionFor(match);
  const uncertainty = [];
  let detail = null;
  let synonyms = null;
  let nonstrict = null;
  if (match.matchType === 'NONE') {
    // One extra GET, still inside MAX_GBIF_GETS: a NONE match never reads detail.
    const url = nonstrictMatchUrl(name);
    const items = nonstrictCandidates(await get(url));
    nonstrict = {
      label: NONSTRICT_LABEL,
      query: { name, strict: false },
      source_url: url,
      accepted: false,
      evidence: false,
      items,
    };
  }
  if (resolution !== 'unresolved') {
    const detailKey = resolution === 'synonym_of' ? match.acceptedUsageKey : match.usageKey;
    detail = await get(speciesUrl(detailKey));
    synonyms = await get(synonymsUrl(detailKey));
    if (!detail || detail.key !== detailKey) {
      throw new TransportFailure(`GBIF species record did not describe key ${detailKey}`);
    }
    if (!Array.isArray(synonyms?.results)) throw new TransportFailure('GBIF synonyms response has no results array');
    if (detail.taxonomicStatus !== 'ACCEPTED') {
      uncertainty.push(`GBIF record ${detailKey} reports taxonomicStatus ${detail.taxonomicStatus ?? 'missing'}, not ACCEPTED; the resolution is withheld.`);
      resolution = 'unresolved';
    }
  }

  const synonymItems = flagSynonyms((synonyms?.results ?? [])
    .filter(row => row && (detail ? row.acceptedKey === detail.key : true))
    .map(row => ({
      key: int(row.key),
      scientific_name: str(row.scientificName),
      canonical_name: str(row.canonicalName),
      authorship: str(row.authorship),
      taxonomic_status: str(row.taxonomicStatus),
      rank: str(row.rank),
    })), detail ? str(detail.canonicalName) : null);
  const keptSynonyms = synonymItems.slice(0, SYNONYM_LIMIT);
  const matchedSynonym = synonymItems.find(row => row.key === match.usageKey) ?? null;
  const accepted = detail && resolution !== 'unresolved' ? {
    usage_key: int(detail.key),
    scientific_name: str(detail.scientificName),
    canonical_name: str(detail.canonicalName),
    authorship: str(detail.authorship),
    rank: str(detail.rank),
  } : null;

  return {
    gets,
    sources,
    resolution,
    uncertainty,
    gbif: {
      match_type: match.matchType,
      confidence: typeof match.confidence === 'number' ? match.confidence : null,
      status: str(match.status),
      usage_key: int(match.usageKey),
      scientific_name: str(match.scientificName),
      canonical_name: str(match.canonicalName),
      authorship: resolution === 'accepted_match'
        ? accepted?.authorship ?? null
        : matchedSynonym?.authorship ?? null,
      rank: str(match.rank),
      accepted_usage_key: resolution === 'synonym_of' ? int(match.acceptedUsageKey)
        : resolution === 'accepted_match' ? int(match.usageKey) : null,
      accepted_name: accepted?.scientific_name ?? null,
      accepted_canonical_name: accepted?.canonical_name ?? null,
      accepted_authorship: accepted?.authorship ?? null,
      note: str(match.note),
    },
    synonyms: {
      requested_limit: SYNONYM_LIMIT,
      returned: synonymItems.length,
      truncated: synonyms ? synonyms.endOfRecords === false || synonymItems.length > SYNONYM_LIMIT : false,
      flagged: keptSynonyms.filter(row => row.review_flags.length > 0).length,
      flag_note: SYNONYM_FLAG_NOTE,
      items: keptSynonyms,
    },
    nonstrict_candidates: nonstrict,
  };
}

/** A contradiction exists only when GBIF names an accepted taxon other than the KG's. */
export function detectContradiction(kgName, lookup) {
  const acceptedCanonical = lookup.gbif.accepted_canonical_name;
  if (lookup.resolution === 'unresolved' || !acceptedCanonical) return null;
  if (normalizeName(acceptedCanonical) === normalizeName(kgName)) return null;
  return {
    kind: lookup.resolution === 'synonym_of' ? 'kg_name_is_gbif_synonym' : 'gbif_accepted_name_differs',
    kg_name: kgName,
    gbif_accepted_name: lookup.gbif.accepted_name,
    gbif_accepted_canonical_name: acceptedCanonical,
    gbif_accepted_usage_key: lookup.gbif.accepted_usage_key,
    note: 'GBIF Backbone treats the knowledge-graph name differently. This is recorded for human review only; no name was changed.',
  };
}

function uncertaintyFor(lookup, contradiction) {
  const lines = [...lookup.uncertainty];
  const { match_type: matchType, scientific_name: returned } = lookup.gbif;
  if (matchType === 'FUZZY') {
    lines.push(`GBIF returned only a FUZZY match${returned ? ` (${returned})` : ''}; it is recorded, not adopted.`);
  } else if (matchType === 'HIGHERRANK') {
    lines.push(`GBIF matched only a higher rank${returned ? ` (${returned})` : ''}; the name itself was not found.`);
  } else if (matchType === 'NONE') {
    lines.push('GBIF Backbone returned no match for this name.');
    const candidates = lookup.nonstrict_candidates?.items ?? [];
    lines.push(candidates.length
      ? `A non-strict follow-up returned ${candidates.length} candidate name(s); they are ${NONSTRICT_LABEL}, and the name stays unresolved.`
      : 'A non-strict follow-up returned no candidate name either.');
  } else if (lookup.resolution === 'unresolved') {
    lines.push(`GBIF returned match type ${matchType} with status ${lookup.gbif.status ?? 'missing'}; no resolution is asserted.`);
  }
  if (lookup.synonyms.flagged > 0) {
    lines.push(`${lookup.synonyms.flagged} GBIF synonym entr${lookup.synonyms.flagged === 1 ? 'y is' : 'ies are'} flagged for reviewer attention (duplicate of the accepted name, authorship-variant duplicate, or malformed name); none was removed or corrected.`);
  }
  if (contradiction) lines.push('The knowledge-graph name and the GBIF accepted name disagree; a human must decide which treatment the Continuum follows.');
  lines.push(
    'GBIF Backbone is one taxonomic authority; WCVP/POWO or a current Orchidaceae checklist may treat this name differently.',
    'The GBIF confidence value is a name-matching score, not a probability that the treatment is correct.',
    'This report was retrieved by a machine and has not been reviewed by a person.',
  );
  return lines;
}

/** The digest covers the evidence, not the retrieval time, so a re-run is idempotent. */
export function reportDigest(report) {
  const { sources, generated_at: _generatedAt, digest: _digest, ...rest } = report;
  const stable = { ...rest, sources: (sources ?? []).map(({ url, http_status }) => ({ url, http_status })) };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

export function buildReport({ issue, repository, mission, lookup, generatedAt }) {
  const contradiction = detectContradiction(mission.taxonName, lookup);
  const report = {
    schema: REPORT_SCHEMA,
    issue,
    repository,
    capability: 'nomenclature-evidence-lookup',
    graph_node: RESERVE_MISSION_NODE,
    taxon: { id: mission.taxonId, kg_name: mission.taxonName, domain: mission.domain },
    material_fingerprint: mission.materialFingerprint,
    query: { name: mission.taxonName, strict: true },
    sources: lookup.sources,
    gbif: lookup.gbif,
    synonyms: lookup.synonyms,
    nonstrict_candidates: lookup.nonstrict_candidates,
    resolution: lookup.resolution,
    contradiction,
    uncertainty: uncertaintyFor(lookup, contradiction),
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

/** Neutralise GBIF-sourced text before it goes into Markdown on an issue. */
export function safe(value) {
  if (value === null || value === undefined || value === '') return 'n/a';
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>`|*_[\]\\]/g, ch => `\\${ch}`)
    .replace(/@/g, '@​')
    .slice(0, 300);
}

const FLAG_TEXT = Object.freeze({
  duplicates_accepted_name: 'same canonical name as the accepted taxon',
  authorship_variant_duplicate: 'authorship-variant duplicate',
  'malformed_scientific_name:run_on_author_token': 'malformed name (run-on author token)',
  'malformed_scientific_name:unbalanced_parentheses': 'malformed name (unbalanced parentheses)',
  'malformed_scientific_name:year_in_author_citation': 'malformed name (year in author citation)',
  'malformed_scientific_name:unexpected_characters': 'malformed name (unexpected characters)',
});

function synonymLines(synonyms) {
  const shown = synonyms.items.slice(0, COMMENT_SYNONYM_LIMIT);
  const head = `- Synonyms listed: ${synonyms.returned}${synonyms.truncated ? ' (truncated)' : ''}` +
    (synonyms.flagged ? `; ${synonyms.flagged} flagged for reviewer (attention only; nothing removed or corrected)` : '');
  return [
    head,
    ...shown.map(s => `  - ${safe(s.scientific_name)} (${safe(s.taxonomic_status)}, usage key ${safe(s.key)})` +
      (s.review_flags?.length ? ` — flag for reviewer: ${s.review_flags.map(f => FLAG_TEXT[f] ?? safe(f)).join('; ')}` : '')),
    ...(synonyms.items.length > shown.length ? [`  - ${synonyms.items.length - shown.length} more in the report`] : []),
  ];
}

function candidateLines(nonstrict) {
  if (!nonstrict) return [];
  return [
    `- Non-strict follow-up, ${NONSTRICT_LABEL}: ${nonstrict.items.length ? '' : 'none returned'}`.trimEnd(),
    ...nonstrict.items.map(c => `  - ${safe(c.canonical_name)} (${safe(c.match_type)}, rank ${safe(c.rank)}, confidence ${safe(c.confidence)}, ` +
      `usage key ${safe(c.usage_key)}, GBIF status ${safe(c.status)})`),
  ];
}

/**
 * The full report as JSON inside a collapsed block. Backticks and angle
 * brackets are written as JSON \\u escapes (still valid JSON, same values), so
 * GBIF-sourced text cannot close the code fence or the details element. The
 * block is bounded by `budget` characters and says so when it is cut.
 */
export function embeddedReportBlock(report, budget = MAX_EMBEDDED_JSON_CHARS) {
  const encode = value => value.replace(/[`<>]/g, ch => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const limit = Math.min(budget, MAX_EMBEDDED_JSON_CHARS);
  let json = encode(JSON.stringify(report, null, 2));
  if (json.length > limit) json = encode(JSON.stringify(report));
  if (json.length > limit) json = `${json.slice(0, Math.max(0, limit - EMBEDDED_JSON_TRUNCATED_MARKER.length - 1))}\n${EMBEDDED_JSON_TRUNCATED_MARKER}`;
  return ['<details><summary>Full machine report (JSON)</summary>', '', '```json', json, '```', '', '</details>'].join('\n');
}

export function renderComment(report) {
  const g = report.gbif;
  const lines = [
    `${COMMENT_MARKER_PREFIX}${report.digest} -->`,
    `**${REVIEW_BANNER}**`,
    '',
    `Nomenclature evidence report for taxon \`${report.taxon.id}\` (${safe(report.taxon.kg_name)}): resolution **${report.resolution}**.`,
    '',
    `- GBIF match: ${safe(g.match_type)}, confidence ${safe(g.confidence)}, status ${safe(g.status)}, rank ${safe(g.rank)}`,
    `- Matched name: ${safe(g.scientific_name)} (usage key ${safe(g.usage_key)}; authorship ${safe(g.authorship)})`,
    `- Accepted name: ${safe(g.accepted_name)} (usage key ${safe(g.accepted_usage_key)})`,
    ...synonymLines(report.synonyms),
    ...candidateLines(report.nonstrict_candidates),
    `- Contradiction with the knowledge-graph name: ${report.contradiction
      ? `${report.contradiction.kind}: KG ${safe(report.contradiction.kg_name)} vs GBIF accepted ${safe(report.contradiction.gbif_accepted_name)}`
      : 'none detected'}`,
    '',
    '**Uncertainty**',
    ...report.uncertainty.map(line => `- ${safe(line)}`),
    '',
    '**Sources**',
    ...report.sources.map(s => `- ${s.url} (retrieved ${s.retrieved_at}, HTTP ${s.http_status})`),
    '',
    'No knowledge-graph, taxonomy, database, or publication change was made. Provider calls: 0. ' +
      `Full report: \`nomenclature-report-${report.issue}.json\` in the lane evidence artifact, and embedded below (it holds no locality).`,
  ];
  const head = lines.join('\n');
  const wrapper = 200; // the details/summary/fence lines around the JSON, generously
  return `${head}\n\n${embeddedReportBlock(report, MAX_COMMENT_CHARS - head.length - wrapper)}`;
}

export function githubHeaders(token, userAgent = 'oc-nomenclature-lookup') {
  return {
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': userAgent,
  };
}

/**
 * The only author whose digest marker is honoured. The report is posted with
 * the lane's GITHUB_TOKEN, which the REST API reports as `github-actions[bot]`.
 * A marker in anyone else's comment is ignored, so a third party cannot pre-post
 * a digest to suppress the real report.
 */
export const REPORT_COMMENT_AUTHOR = 'github-actions[bot]';

export async function existingDigests(fetchImpl, api, repo, issue, token, markerPrefix = COMMENT_MARKER_PREFIX) {
  const digests = new Set();
  for (let page = 1; page <= 10; page += 1) {
    const { json } = await getJson(fetchImpl,
      `${api}/repos/${repo}/issues/${issue}/comments?per_page=100&page=${page}`, githubHeaders(token));
    if (!Array.isArray(json)) throw new TransportFailure('GitHub comments response is not an array');
    for (const comment of json) {
      if (comment?.user?.login !== REPORT_COMMENT_AUTHOR) continue;
      const body = String(comment?.body ?? '');
      const at = body.indexOf(markerPrefix);
      if (at === 0) digests.add(body.slice(markerPrefix.length).split(' ')[0]);
    }
    if (json.length < 100) break;
  }
  return digests;
}

export async function postComment(fetchImpl, api, repo, issue, token, body) {
  let response;
  try {
    response = await fetchImpl(`${api}/repos/${repo}/issues/${issue}/comments`, {
      method: 'POST',
      headers: { ...githubHeaders(token), accept: 'application/vnd.github+json', 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new TransportFailure(`posting the report comment failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new TransportFailure(`posting the report comment returned HTTP ${response.status}`);
}

/**
 * The whole executor, with its I/O injectable for tests. Returns the exit code
 * rather than exiting, so a caller decides how to surface it.
 */
export async function runNomenclatureLookup({ env = process.env, fetchImpl = fetch, now = () => new Date().toISOString(), log = console.log } = {}) {
  const issue = Number(env.ISSUE_NUMBER);
  const repo = String(env.REPO ?? '');
  const token = String(env.GH_TOKEN ?? '');
  const api = String(env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  try {
    if (!Number.isSafeInteger(issue) || issue <= 0) throw new MissionRefused('ISSUE_NUMBER is not a positive integer');
    if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) throw new MissionRefused('REPO is not owner/name');
    if (!token) throw new MissionRefused('GH_TOKEN is required to read the issue');

    const { json: record } = await getJson(fetchImpl, `${api}/repos/${repo}/issues/${issue}`, githubHeaders(token));
    if (record?.number !== issue) throw new MissionRefused('GitHub returned a different issue');
    const mission = parseMission(record.body);
    const lookup = await lookupGbif(mission.taxonName, fetchImpl, now);
    const report = buildReport({ issue, repository: repo, mission, lookup, generatedAt: now() });

    const dir = env.OC_EVIDENCE_DIR || '.oc-evidence';
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `nomenclature-report-${issue}.json`);
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);

    const seen = await existingDigests(fetchImpl, api, repo, issue, token);
    const commented = !seen.has(report.digest);
    if (commented) await postComment(fetchImpl, api, repo, issue, token, renderComment(report));
    log(JSON.stringify({ issue, resolution: report.resolution, contradiction: Boolean(report.contradiction),
      digest: report.digest, report: path, comment: commented ? 'posted' : 'skipped_same_digest', provider_calls: 0 }));
    return { exitCode: EXIT.OK, report, commented };
  } catch (error) {
    const transport = error instanceof TransportFailure;
    const refused = error instanceof MissionRefused;
    const exitCode = transport ? EXIT.TRANSPORT : EXIT.BAD_INPUT;
    log(JSON.stringify({ issue: Number.isSafeInteger(issue) ? issue : null,
      blocker: transport ? 'transport_failure' : refused ? 'mission_refused' : 'executor_error',
      detail: error instanceof Error ? error.message : String(error), provider_calls: 0 }));
    return { exitCode, error };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode } = await runNomenclatureLookup();
  process.exit(exitCode);
}
