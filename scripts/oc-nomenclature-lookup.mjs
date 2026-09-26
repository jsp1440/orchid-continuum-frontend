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
 *      EXACT match, the taxon record and its synonyms. Never an occurrence or
 *      any other locality endpoint.
 *   3. Writes `.oc-evidence/nomenclature-report-<issue>.json`
 *      (`oc.nomenclature-evidence-report.v1`) and posts one idempotent,
 *      digest-marked issue comment.
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
export function speciesUrl(key) {
  return `${GBIF_BASE}/${key}`;
}
export function synonymsUrl(key) {
  return `${GBIF_BASE}/${key}/synonyms?limit=${SYNONYM_LIMIT}`;
}

/** Defence in depth: the only GBIF URLs this executor can ever request. */
export function assertNomenclatureUrl(url) {
  const allowed = /^https:\/\/api\.gbif\.org\/v1\/species\/(?:match\?name=[^&#]+&strict=true|\d+|\d+\/synonyms\?limit=\d+)$/;
  if (!allowed.test(url) || /occurrence|locality|coordinate/i.test(url)) {
    throw new Error(`refusing non-nomenclature GBIF URL ${url}`);
  }
}

async function getJson(fetchImpl, url, headers = {}) {
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

  const synonymItems = (synonyms?.results ?? [])
    .filter(row => row && (detail ? row.acceptedKey === detail.key : true))
    .map(row => ({
      key: int(row.key),
      scientific_name: str(row.scientificName),
      canonical_name: str(row.canonicalName),
      authorship: str(row.authorship),
      taxonomic_status: str(row.taxonomicStatus),
      rank: str(row.rank),
    }));
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
      items: synonymItems.slice(0, SYNONYM_LIMIT),
    },
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
  } else if (lookup.resolution === 'unresolved') {
    lines.push(`GBIF returned match type ${matchType} with status ${lookup.gbif.status ?? 'missing'}; no resolution is asserted.`);
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
function safe(value) {
  if (value === null || value === undefined || value === '') return 'n/a';
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>`|*_[\]\\]/g, ch => `\\${ch}`)
    .replace(/@/g, '@​')
    .slice(0, 300);
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
    `- Synonyms listed: ${report.synonyms.returned}${report.synonyms.truncated ? ' (truncated)' : ''}` +
      (report.synonyms.items.length ? `: ${report.synonyms.items.slice(0, 8).map(s => safe(s.scientific_name)).join('; ')}` : ''),
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
      `Full report: \`nomenclature-report-${report.issue}.json\` in the lane evidence artifact.`,
  ];
  return lines.join('\n');
}

function githubHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'oc-nomenclature-lookup',
  };
}

/**
 * The only author whose digest marker is honoured. The report is posted with
 * the lane's GITHUB_TOKEN, which the REST API reports as `github-actions[bot]`.
 * A marker in anyone else's comment is ignored, so a third party cannot pre-post
 * a digest to suppress the real report.
 */
export const REPORT_COMMENT_AUTHOR = 'github-actions[bot]';

async function existingDigests(fetchImpl, api, repo, issue, token) {
  const digests = new Set();
  for (let page = 1; page <= 10; page += 1) {
    const { json } = await getJson(fetchImpl,
      `${api}/repos/${repo}/issues/${issue}/comments?per_page=100&page=${page}`, githubHeaders(token));
    if (!Array.isArray(json)) throw new TransportFailure('GitHub comments response is not an array');
    for (const comment of json) {
      if (comment?.user?.login !== REPORT_COMMENT_AUTHOR) continue;
      const body = String(comment?.body ?? '');
      const at = body.indexOf(COMMENT_MARKER_PREFIX);
      if (at === 0) digests.add(body.slice(COMMENT_MARKER_PREFIX.length).split(' ')[0]);
    }
    if (json.length < 100) break;
  }
  return digests;
}

async function postComment(fetchImpl, api, repo, issue, token, body) {
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
