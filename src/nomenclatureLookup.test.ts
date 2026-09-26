// @vitest-environment node

/**
 * The provider-free executor for `nomenclature` evidence-gap reserve missions.
 *
 * GBIF bodies are replayed from `src/lib/__fixtures__/gbif/*.json`, each captured
 * from api.gbif.org on 2026-09-25 (capture URL and date in its `_capture`
 * header). The one exception is `match-fuzzy-fixture-only.json`, which is
 * labelled as a documented-shape fixture with fictional names. The three issue
 * bodies are the real reserve missions #816-#818, copied verbatim. The
 * Gastrochilus fargesii (#818), Thrixspermum arunachalensis (#823) and
 * non-strict follow-up bodies were captured the same way on 2026-09-26.
 * Report/comment bounds that no real GBIF answer reaches (60+ synonyms, an
 * oversized report, a backtick in a name) use synthetic shapes, labelled where
 * they are built.
 */

import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  COMMENT_MARKER_PREFIX,
  COMMENT_SYNONYM_LIMIT,
  EMBEDDED_JSON_TRUNCATED_MARKER,
  EXIT,
  MAX_COMMENT_CHARS,
  MAX_GBIF_GETS,
  MissionRefused,
  NONSTRICT_LABEL,
  REVIEW_BANNER,
  SYNONYM_LIMIT,
  TransportFailure,
  assertNomenclatureUrl,
  buildReport,
  embeddedReportBlock,
  flagSynonyms,
  lookupGbif,
  malformedNameFlags,
  matchUrl,
  nonstrictCandidates,
  nonstrictMatchUrl,
  parseMission,
  renderComment,
  resolutionFor,
  runNomenclatureLookup,
  speciesUrl,
  synonymsUrl,
} from '../scripts/oc-nomenclature-lookup.mjs';
import {
  NOMENCLATURE_CAPABILITY as DERIVED_CAPABILITY,
  RESERVE_MISSION_NODE,
  deriveReserveMissionBinding,
} from '../scripts/oc-reserve-mission-binding.mjs';
import {
  DETERMINISTIC_CAPABILITIES,
  LOCAL_EXECUTORS,
  PROVIDER_CAPABILITIES,
  commandsFor,
  routeIssue,
} from '../scripts/oc-capability-router.mjs';
import { declaredNodesByIssue, makePlan, type Issue, type Lease, type Snapshot } from '../scripts/oc-dispatch-control';
import { COMPLETION_GRAPH } from './lib/completion-graph/completionGraphData';
import type { CompletionNode } from './lib/completion-graph/types';
import {
  NOMENCLATURE_CAPABILITY,
  RESERVE_MISSION_GRAPH_NODE,
  bridgeBackendReservePlan,
} from './lib/control-plane/backendReserveQueueBridge';
import { discoverSupervisorWork } from './lib/control-plane/supervisorDiscovery';
import reserveIssues from './lib/__fixtures__/reserve-mission-issues-816-818.json';

type Fixture = { _capture: { url: string | null }; status: number; content_type: string; body: string };
const fixture = (name: string): Fixture =>
  JSON.parse(readFileSync(new URL(`./lib/__fixtures__/gbif/${name}.json`, import.meta.url), 'utf8'));

const REAL: Record<string, string> = {
  [matchUrl('Gastrochilus calceolaris')]: 'match-gastrochilus-calceolaris',
  [matchUrl('Aerides leopardorum')]: 'match-aerides-leopardorum-synonym',
  [matchUrl('Oncidium flexuosum')]: 'match-oncidium-flexuosum-higherrank',
  [matchUrl('Gastrochilus zzyzxensis')]: 'match-gastrochilus-zzyzxensis-none',
  [nonstrictMatchUrl('Gastrochilus zzyzxensis')]: 'match-gastrochilus-zzyzxensis-nonstrict',
  [speciesUrl(5310649)]: 'species-5310649',
  [synonymsUrl(5310649)]: 'synonyms-5310649',
  [matchUrl('Gastrochilus fargesii')]: 'match-gastrochilus-fargesii',
  [speciesUrl(5310679)]: 'species-5310679',
  [synonymsUrl(5310679)]: 'synonyms-5310679',
  [matchUrl('Thrixspermum arunachalensis')]: 'match-thrixspermum-arunachalensis-none',
  [nonstrictMatchUrl('Thrixspermum arunachalensis')]: 'match-thrixspermum-arunachalensis-nonstrict',
};

const NOW = '2026-09-25T20:00:00.000Z';
const REPO = 'jsp1440/orchid-continuum-frontend';
const API = 'https://api.github.com';
const issue817 = reserveIssues.issues.find(i => i.number === 817)!;

function missionBody(name: string, domain = 'nomenclature', extra = '') {
  return issue817.body
    .replaceAll('Gastrochilus calceolaris', name)
    .replace('- Domain: nomenclature', `- Domain: ${domain}`) + extra;
}

type Call = { url: string; method: string; body?: string };
/** A fake network: GitHub issue/comment endpoints plus replayed GBIF fixtures. */
function network(opts: {
  issueBody: string;
  existingComments?: Array<{ body: string; user?: { login: string } }>;
  gbifOverride?: (url: string) => Response | undefined;
  extraGbif?: Record<string, string>;
}) {
  const calls: Call[] = [];
  const comments = [...(opts.existingComments ?? [])];
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
  const fetchImpl = async (url: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url, method, body: init.body });
    if (url === `${API}/repos/${REPO}/issues/817`) return json({ number: 817, body: opts.issueBody });
    if (url.startsWith(`${API}/repos/${REPO}/issues/817/comments`)) {
      if (method === 'POST') {
        // The lane posts with github.token, which GitHub records as the bot.
        comments.push({ body: JSON.parse(init.body!).body, user: { login: 'github-actions[bot]' } });
        return json({ id: comments.length }, 201);
      }
      return json(comments);
    }
    const override = opts.gbifOverride?.(url);
    if (override) return override;
    const name = { ...REAL, ...(opts.extraGbif ?? {}) }[url];
    if (!name) return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    const f = fixture(name);
    return new Response(f.body, { status: f.status, headers: { 'content-type': f.content_type } });
  };
  const gbifCalls = () => calls.filter(c => c.url.startsWith('https://api.gbif.org/'));
  return { fetchImpl, calls, comments, gbifCalls };
}

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })));
function envFor() {
  const dir = mkdtempSync(join(tmpdir(), 'oc-nomen-')); dirs.push(dir);
  return { ISSUE_NUMBER: '817', REPO, GH_TOKEN: 'fixture-token', OC_EVIDENCE_DIR: dir, GITHUB_API_URL: API };
}
const quiet = () => {};

describe('mission parsing reads only the exact machine lines', () => {
  it('parses the real #817 mission block', () => {
    expect(parseMission(issue817.body)).toMatchObject({
      taxonId: '1',
      taxonName: 'Gastrochilus calceolaris',
      domain: 'nomenclature',
      materialFingerprint: 'e94120766fdf22482bb7f64de1a7bd601be09469cfda24a2d5639e5fae5a587f',
    });
  });

  it.each([
    ['no mission block', 'Prepared from the canonical backend reserve planner.\n- Taxon name: Gastrochilus calceolaris'],
    ['two mission blocks', `${issue817.body}\nCanonical bounded research mission:\n- Taxon ID: 2`],
    ['a reordered block', issue817.body.replace('- Taxon ID: 1\n- Taxon name: Gastrochilus calceolaris', '- Taxon name: Gastrochilus calceolaris\n- Taxon ID: 1')],
    ['no human-review line', issue817.body.replace('- Human review required: yes', '- Human review required: no')],
    ['a malformed taxon id', issue817.body.replace('- Taxon ID: 1', '- Taxon ID: 1; rm -rf /')],
    ['a non-nomenclature domain', missionBody('Gastrochilus calceolaris', 'morphology')],
    ['a hybrid formula', missionBody('Gastrochilus × calceolaris')],
    ['a lowercase genus', missionBody('gastrochilus calceolaris')],
    ['an uninomial', missionBody('Gastrochilus')],
    ['two infraspecific ranks', missionBody('Gastrochilus calceolaris var. biflora f. alba')],
    ['an overlong name', missionBody(`Gastrochilus ${'a'.repeat(130)}`)],
    ['trailing text on the name line', missionBody('Gastrochilus calceolaris (Buch.-Ham.) D.Don')],
  ])('refuses %s', (_label, body) => {
    expect(() => parseMission(body)).toThrow(MissionRefused);
  });

  it('accepts one infraspecific rank and epithet', () => {
    expect(parseMission(missionBody('Gastrochilus calceolaris var. biflora')).taxonName)
      .toBe('Gastrochilus calceolaris var. biflora');
  });

  it('never reads a name from prose outside the block', () => {
    const body = `Taxon name: Vanda coerulea\n${issue817.body}`;
    expect(parseMission(body).taxonName).toBe('Gastrochilus calceolaris');
  });
});

describe('match-type mapping never coerces a near match', () => {
  it.each([
    [{ matchType: 'EXACT', status: 'ACCEPTED', usageKey: 1 }, 'accepted_match'],
    [{ matchType: 'EXACT', status: 'SYNONYM', usageKey: 1, acceptedUsageKey: 2 }, 'synonym_of'],
    [{ matchType: 'EXACT', status: 'HETEROTYPIC_SYNONYM', usageKey: 1, acceptedUsageKey: 2 }, 'synonym_of'],
    [{ matchType: 'EXACT', status: 'SYNONYM', usageKey: 1 }, 'unresolved'],
    [{ matchType: 'EXACT', status: 'DOUBTFUL', usageKey: 1 }, 'unresolved'],
    [{ matchType: 'FUZZY', status: 'ACCEPTED', usageKey: 1 }, 'unresolved'],
    [{ matchType: 'HIGHERRANK', status: 'ACCEPTED', usageKey: 1 }, 'unresolved'],
    [{ matchType: 'NONE' }, 'unresolved'],
    [{ matchType: 'SOMETHING_NEW', status: 'ACCEPTED', usageKey: 1 }, 'unresolved'],
  ])('%j -> %s', (match, expected) => {
    expect(resolutionFor(match)).toBe(expected);
  });

  it('resolves the real accepted EXACT match with three bounded GETs', async () => {
    const net = network({ issueBody: issue817.body });
    const lookup = await lookupGbif('Gastrochilus calceolaris', net.fetchImpl, () => NOW);
    expect(lookup.resolution).toBe('accepted_match');
    expect(lookup.gets).toBe(3);
    expect(lookup.gbif).toMatchObject({
      match_type: 'EXACT', confidence: 99, status: 'ACCEPTED', rank: 'SPECIES',
      scientific_name: 'Gastrochilus calceolaris (Buch.-Ham. ex Sm.) D.Don',
      authorship: '(Buch.-Ham. ex Sm.) D.Don', accepted_usage_key: 5310649,
      accepted_canonical_name: 'Gastrochilus calceolaris',
    });
    expect(lookup.synonyms.returned).toBe(13);
    expect(lookup.synonyms.truncated).toBe(false);
    expect(net.gbifCalls().map(c => c.url)).toEqual([
      matchUrl('Gastrochilus calceolaris'), speciesUrl(5310649), synonymsUrl(5310649),
    ]);
  });

  it('maps the real SYNONYM match onto its accepted taxon', async () => {
    const net = network({ issueBody: issue817.body });
    const lookup = await lookupGbif('Aerides leopardorum', net.fetchImpl, () => NOW);
    expect(lookup.resolution).toBe('synonym_of');
    expect(lookup.gbif).toMatchObject({
      status: 'SYNONYM', usage_key: 2804159, accepted_usage_key: 5310649,
      authorship: 'Wall. ex Hook.f.', accepted_canonical_name: 'Gastrochilus calceolaris',
    });
    expect(net.gbifCalls().map(c => c.url)).toEqual([
      matchUrl('Aerides leopardorum'), speciesUrl(5310649), synonymsUrl(5310649),
    ]);
  });

  // NONE alone makes one non-strict follow-up GET (candidate names only); the
  // other unresolved match types stay at a single GET.
  it.each([
    ['HIGHERRANK', 'Oncidium flexuosum', {}, 1],
    ['NONE', 'Gastrochilus zzyzxensis', {}, 2],
    ['FUZZY (fixture-only shape)', 'Fixturea exemplaris', { [matchUrl('Fixturea exemplaris')]: 'match-fuzzy-fixture-only' }, 1],
  ])('keeps %s unresolved and adopts nothing', async (_label, name, extraGbif, gets) => {
    const net = network({ issueBody: issue817.body, extraGbif });
    const lookup = await lookupGbif(name, net.fetchImpl, () => NOW);
    expect(lookup.resolution).toBe('unresolved');
    expect(lookup.gets).toBe(gets);
    expect(lookup.nonstrict_candidates === null).toBe(gets === 1);
    expect(lookup.gbif.accepted_name).toBeNull();
    expect(lookup.gbif.accepted_usage_key).toBeNull();
    expect(lookup.synonyms.items).toEqual([]);
  });
});

describe('the executor end to end', () => {
  it('writes a review_required report and posts one marked comment for the real #817 mission', async () => {
    const env = envFor();
    const net = network({ issueBody: issue817.body });
    const result = await runNomenclatureLookup({ env, fetchImpl: net.fetchImpl, now: () => NOW, log: quiet });

    expect(result.exitCode).toBe(EXIT.OK);
    const report = JSON.parse(readFileSync(join(env.OC_EVIDENCE_DIR, 'nomenclature-report-817.json'), 'utf8'));
    expect(report).toMatchObject({
      schema: 'oc.nomenclature-evidence-report.v1',
      issue: 817,
      graph_node: 'cap-kg-evidence-gap-research-missions',
      taxon: { id: '1', kg_name: 'Gastrochilus calceolaris', domain: 'nomenclature' },
      resolution: 'accepted_match',
      contradiction: null,
      review_required: true,
      automatic_publication: false,
      knowledge_graph_mutation: false,
      taxonomy_mutation: false,
      sensitive_locality_disclosure: false,
      provider_calls: 0,
    });
    expect(report.sources.map((s: { url: string }) => s.url)).toEqual([
      matchUrl('Gastrochilus calceolaris'), speciesUrl(5310649), synonymsUrl(5310649),
    ]);
    expect(report.sources.every((s: { retrieved_at: string }) => s.retrieved_at === NOW)).toBe(true);
    expect(report.uncertainty.length).toBeGreaterThan(0);
    expect(report.uncertainty.join(' ')).toContain('not been reviewed by a person');

    const posts = net.calls.filter(c => c.method === 'POST');
    expect(posts).toHaveLength(1);
    const comment = net.comments[0].body;
    expect(comment.startsWith(`${COMMENT_MARKER_PREFIX}${report.digest} -->`)).toBe(true);
    expect(comment).toContain(REVIEW_BANNER);
    expect(comment).toContain('Machine-retrieved evidence — requires human scientific review; not published');
  });

  it('records a contradiction when GBIF treats the KG name as a synonym', async () => {
    const env = envFor();
    const net = network({ issueBody: missionBody('Aerides leopardorum') });
    const result = await runNomenclatureLookup({ env, fetchImpl: net.fetchImpl, now: () => NOW, log: quiet });
    expect(result.exitCode).toBe(EXIT.OK);
    expect(result.report.resolution).toBe('synonym_of');
    expect(result.report.contradiction).toMatchObject({
      kind: 'kg_name_is_gbif_synonym',
      kg_name: 'Aerides leopardorum',
      gbif_accepted_name: 'Gastrochilus calceolaris (Buch.-Ham. ex Sm.) D.Don',
      gbif_accepted_usage_key: 5310649,
    });
    expect(net.comments[0].body).toContain('Contradiction with the knowledge-graph name: kg_name_is_gbif_synonym');
  });

  it('still produces a report (exit 0) for an unresolved name', async () => {
    const env = envFor();
    const net = network({ issueBody: missionBody('Gastrochilus zzyzxensis') });
    const result = await runNomenclatureLookup({ env, fetchImpl: net.fetchImpl, now: () => NOW, log: quiet });
    expect(result.exitCode).toBe(EXIT.OK);
    expect(result.report.resolution).toBe('unresolved');
    expect(result.report.contradiction).toBeNull();
    expect(result.report.uncertainty.join(' ')).toContain('no match');
  });

  it('is idempotent: the same evidence on a later run posts no second comment', async () => {
    const first = network({ issueBody: issue817.body });
    const a = await runNomenclatureLookup({ env: envFor(), fetchImpl: first.fetchImpl, now: () => NOW, log: quiet });
    const second = network({ issueBody: issue817.body, existingComments: first.comments });
    const b = await runNomenclatureLookup({
      env: envFor(), fetchImpl: second.fetchImpl, now: () => '2026-09-26T08:00:00.000Z', log: quiet,
    });
    expect(b.exitCode).toBe(EXIT.OK);
    expect(b.report.digest).toBe(a.report.digest);
    expect(b.commented).toBe(false);
    expect(second.calls.filter(c => c.method === 'POST')).toHaveLength(0);
  });

  it('ignores a digest marker a person posted: the real report is still posted', async () => {
    const first = network({ issueBody: issue817.body });
    const a = await runNomenclatureLookup({ env: envFor(), fetchImpl: first.fetchImpl, now: () => NOW, log: quiet });
    // A third party copies the exact marker (same digest) into their own comment.
    const forged = first.comments.map(c => ({ body: c.body, user: { login: 'someone-else' } }));
    const authorless = first.comments.map(c => ({ body: c.body }));
    for (const existingComments of [forged, authorless]) {
      const second = network({ issueBody: issue817.body, existingComments });
      const b = await runNomenclatureLookup({ env: envFor(), fetchImpl: second.fetchImpl, now: () => NOW, log: quiet });
      expect(b.exitCode).toBe(EXIT.OK);
      expect(b.report.digest).toBe(a.report.digest);
      expect(b.commented).toBe(true);
      expect(second.calls.filter(c => c.method === 'POST')).toHaveLength(1);
    }
  });

  it.each([
    ['an HTML page', () => new Response('<html>maintenance</html>', { status: 200, headers: { 'content-type': 'text/html' } })],
    ['HTTP 500', () => new Response('{"error":"x"}', { status: 500, headers: { 'content-type': 'application/json' } })],
    ['a JSON content type over a non-JSON body', () => new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } })],
    ['no content type', () => new Response('{}', { status: 200 })],
  ])('treats %s from GBIF as a transport failure: non-zero exit, no report, no comment', async (_label, reply) => {
    const env = envFor();
    const net = network({ issueBody: issue817.body, gbifOverride: url => (url.startsWith('https://api.gbif.org/') ? reply() : undefined) });
    const result = await runNomenclatureLookup({ env, fetchImpl: net.fetchImpl, now: () => NOW, log: quiet });
    expect(result.exitCode).toBe(EXIT.TRANSPORT);
    expect(existsSync(join(env.OC_EVIDENCE_DIR, 'nomenclature-report-817.json'))).toBe(false);
    expect(net.calls.filter(c => c.method === 'POST')).toHaveLength(0);
  });

  it('treats a network error as a transport failure', async () => {
    const env = envFor();
    const net = network({ issueBody: issue817.body, gbifOverride: url => { if (url.includes('gbif')) throw new Error('ECONNRESET'); return undefined; } });
    const result = await runNomenclatureLookup({ env, fetchImpl: net.fetchImpl, now: () => NOW, log: quiet });
    expect(result.exitCode).toBe(EXIT.TRANSPORT);
  });

  it('refuses bad input before any GBIF call', async () => {
    const env = envFor();
    const net = network({ issueBody: missionBody('Gastrochilus calceolaris', 'morphology') });
    const result = await runNomenclatureLookup({ env, fetchImpl: net.fetchImpl, now: () => NOW, log: quiet });
    expect(result.exitCode).toBe(EXIT.BAD_INPUT);
    expect(net.gbifCalls()).toHaveLength(0);
    expect(net.calls.filter(c => c.method === 'POST')).toHaveLength(0);
  });

  it('never calls more than three GBIF URLs, and never an occurrence or locality endpoint', async () => {
    for (const body of [issue817.body, missionBody('Aerides leopardorum'), missionBody('Oncidium flexuosum')]) {
      const net = network({ issueBody: body });
      await runNomenclatureLookup({ env: envFor(), fetchImpl: net.fetchImpl, now: () => NOW, log: quiet });
      expect(net.gbifCalls().length).toBeLessThanOrEqual(MAX_GBIF_GETS);
      for (const call of net.gbifCalls()) {
        expect(call.method).toBe('GET');
        expect(call.url).toMatch(/^https:\/\/api\.gbif\.org\/v1\/species\//);
        expect(call.url).not.toMatch(/occurrence|locality|coordinate/i);
      }
    }
    expect(() => assertNomenclatureUrl('https://api.gbif.org/v1/occurrence/search?taxonKey=5310649')).toThrow();
    expect(() => assertNomenclatureUrl('https://api.gbif.org/v1/species/5310649/occurrence')).toThrow();
  });
});

describe('every synonym is listed and suspect entries are flagged, never removed', () => {
  it('lists all 13 real #817 synonyms in the comment, not the first 8', async () => {
    const env = envFor();
    const net = network({ issueBody: issue817.body });
    const result = await runNomenclatureLookup({ env, fetchImpl: net.fetchImpl, now: () => NOW, log: quiet });
    const comment = net.comments[0].body.split('<details>')[0];
    expect(result.report.synonyms.items).toHaveLength(13);
    for (const s of result.report.synonyms.items) {
      expect(comment).toContain(`usage key ${s.key})`);
    }
    // The last two in GBIF order were beyond the old 8-name cut.
    expect(comment).toContain('Saccolabium calceolare (Buch.-Ham. ex Sm.) Lindl. ex Wall.');
    expect(comment).toContain('Sarcochilus nepalensis Spreng.');
    expect(comment).not.toMatch(/more in the report/);
    expect(COMMENT_SYNONYM_LIMIT).toBeGreaterThanOrEqual(SYNONYM_LIMIT);
  });

  it('flags the real #817 authorship-variant duplicates and nothing else', async () => {
    const net = network({ issueBody: issue817.body });
    const lookup = await lookupGbif('Gastrochilus calceolaris', net.fetchImpl, () => NOW);
    const flagged = lookup.synonyms.items.filter((s: { review_flags: string[] }) => s.review_flags.length);
    expect(flagged.map((s: { key: number }) => s.key)).toEqual([8536230, 2797637, 8664498, 2804159, 8213645, 8035017]);
    expect(flagged.every((s: { review_flags: string[] }) => s.review_flags.join() === 'authorship_variant_duplicate')).toBe(true);
    // Orthographic variants (philippinense / philippinensis) are different canonical names: not flagged.
    expect(lookup.synonyms.items.find((s: { key: number }) => s.key === 5543018).review_flags).toEqual([]);
    expect(lookup.synonyms).toMatchObject({ returned: 13, flagged: 6 });
    expect(lookup.synonyms.flag_note).toMatch(/^flag for reviewer: .*no synonym was removed or corrected/);
  });

  it('flags the real #818 run-on entry as a duplicate of the accepted name and malformed, and keeps it verbatim', async () => {
    const env = envFor();
    const net = network({ issueBody: missionBody('Gastrochilus fargesii') });
    const result = await runNomenclatureLookup({ env, fetchImpl: net.fetchImpl, now: () => NOW, log: quiet });
    expect(result.exitCode).toBe(EXIT.OK);
    const { synonyms, resolution } = result.report;
    expect(resolution).toBe('accepted_match');
    expect(synonyms.items).toHaveLength(2);
    expect(synonyms.items[0]).toMatchObject({
      key: 12380926,
      scientific_name: 'Gastrochilus fargesii (Kraenzlin, 1903) Schlechter.A.Plants, 1919',
      canonical_name: 'Gastrochilus fargesii',
      review_flags: [
        'duplicates_accepted_name',
        'malformed_scientific_name:run_on_author_token',
        'malformed_scientific_name:year_in_author_citation',
      ],
    });
    expect(synonyms.items[1]).toMatchObject({ scientific_name: 'Saccolabium fargesii Kraenzl.', review_flags: [] });
    const comment = net.comments[0].body.split('<details>')[0];
    expect(comment).toContain('Gastrochilus fargesii (Kraenzlin, 1903) Schlechter.A.Plants, 1919 (SYNONYM, usage key 12380926) — flag for reviewer: ' +
      'same canonical name as the accepted taxon; malformed name (run-on author token); malformed name (year in author citation)');
    expect(comment).toContain('- Saccolabium fargesii Kraenzl. (SYNONYM, usage key 2804202)\n');
    expect(comment).not.toMatch(/correct(?:ed|ion) to|replaced by/i);
    expect(result.report.uncertainty.join(' ')).toContain('none was removed or corrected');
  });

  it('never flags a well-formed real name as malformed', async () => {
    const net = network({ issueBody: issue817.body });
    const lookup = await lookupGbif('Gastrochilus calceolaris', net.fetchImpl, () => NOW);
    for (const s of lookup.synonyms.items) expect(malformedNameFlags(s.scientific_name)).toEqual([]);
    for (const name of ['Gastrochilus calceolaris (Buch.-Ham. ex Sm.) D.Don', 'Gastrochilus fargesii (Kraenzl.) Schltr.',
      'Dendrobium roylei A.D.Hawkes & A.H.Heller', 'Aerides leopardorum Wall. ex Hook.f.']) {
      expect(malformedNameFlags(name)).toEqual([]);
    }
  });

  it.each([
    // Synthetic strings, one check each.
    ['Fixturea alba (Fixt. Fixt.', ['unbalanced_parentheses']],
    ['Fixturea alba Fixt.) Fixt.', ['unbalanced_parentheses']],
    ['Fixturea alba )Fixt.( Fixt.', ['unbalanced_parentheses']],
    ['Fixturea alba Fixtureson.B.Other', ['run_on_author_token']],
    ['Fixturea alba Fixt., 1901', ['year_in_author_citation']],
    ['Fixturea alba Fixt.; see note', ['unexpected_characters']],
    ['Fixturea alba Fixt. [ined.]', ['unexpected_characters']],
  ])('flags %s as %j', (name, flags) => {
    expect(malformedNameFlags(name)).toEqual(flags);
  });

  it('flags without dropping, reordering or rewriting any entry', () => {
    // Synthetic items.
    const items = [
      { key: 1, scientific_name: 'Fixturea alba Fixt.', canonical_name: 'Fixturea alba', authorship: 'Fixt.' },
      { key: 2, scientific_name: 'Fixturea alba Other', canonical_name: 'Fixturea alba', authorship: 'Other' },
      { key: 3, scientific_name: 'Fixturea rosea Fixt.', canonical_name: 'Fixturea rosea', authorship: 'Fixt.' },
      { key: 4, scientific_name: 'Fixturea rosea Fixt.', canonical_name: 'Fixturea rosea', authorship: 'Fixt.' },
    ];
    const flagged = flagSynonyms(items, 'Fixturea accepta');
    expect(flagged.map((s: { key: number }) => s.key)).toEqual([1, 2, 3, 4]);
    expect(flagged.map((s: { review_flags: string[] }) => s.review_flags)).toEqual([
      ['authorship_variant_duplicate'], ['authorship_variant_duplicate'], [], [],
    ]);
    flagged.forEach((s: Record<string, unknown>, i: number) => expect({ ...s, review_flags: undefined }).toEqual({ ...items[i], review_flags: undefined }));
    expect(flagSynonyms(items, 'Fixturea rosea').map((s: { review_flags: string[] }) => s.review_flags[0] ?? null))
      .toEqual(['authorship_variant_duplicate', 'authorship_variant_duplicate', 'duplicates_accepted_name', 'duplicates_accepted_name']);
    // No accepted taxon (unresolved): no accepted-name flag is invented.
    expect(flagSynonyms([items[2]], null)[0].review_flags).toEqual([]);
  });

  it('names at most COMMENT_SYNONYM_LIMIT synonyms and says how many more are in the report', async () => {
    const net = network({ issueBody: issue817.body });
    const lookup = await lookupGbif('Gastrochilus calceolaris', net.fetchImpl, () => NOW);
    const report = buildReport({ issue: 817, repository: REPO, mission: parseMission(issue817.body), lookup, generatedAt: NOW });
    // Synthetic: 60 distinct synonym rows, beyond any real SYNONYM_LIMIT page.
    const many = Array.from({ length: 60 }, (_, i) => ({
      key: 900000000 + i, scientific_name: `Fixturea n${'a'.repeat(i % 5)}${i} Fixt.`, canonical_name: `Fixturea n${i}`,
      authorship: 'Fixt.', taxonomic_status: 'SYNONYM', rank: 'SPECIES', review_flags: [],
    }));
    const comment = renderComment({ ...report, synonyms: { ...report.synonyms, returned: 60, items: many } }).split('<details>')[0];
    expect(comment.match(/^ {2}- Fixturea n/gm)).toHaveLength(COMMENT_SYNONYM_LIMIT);
    expect(comment).toContain(`  - ${60 - COMMENT_SYNONYM_LIMIT} more in the report`);
  });
});

describe('an unresolved name gets labelled non-strict candidates, and stays unresolved', () => {
  it('records the real #823 Thrixspermum arunachalensis candidate under nonstrict_candidates', async () => {
    const env = envFor();
    const net = network({ issueBody: missionBody('Thrixspermum arunachalensis') });
    const result = await runNomenclatureLookup({ env, fetchImpl: net.fetchImpl, now: () => NOW, log: quiet });
    expect(result.exitCode).toBe(EXIT.OK);
    const report = JSON.parse(readFileSync(join(env.OC_EVIDENCE_DIR, 'nomenclature-report-817.json'), 'utf8'));
    expect(report.resolution).toBe('unresolved');
    expect(report.gbif).toMatchObject({ match_type: 'NONE', accepted_name: null, accepted_usage_key: null, usage_key: null });
    expect(report.contradiction).toBeNull();
    expect(report.nonstrict_candidates).toEqual({
      label: 'candidate names from non-strict matching — not accepted, not evidence',
      query: { name: 'Thrixspermum arunachalensis', strict: false },
      source_url: nonstrictMatchUrl('Thrixspermum arunachalensis'),
      accepted: false,
      evidence: false,
      items: [{ canonical_name: 'Thrixspermum', scientific_name: 'Thrixspermum Lour.', match_type: 'HIGHERRANK',
        confidence: 94, usage_key: 2846663, status: 'ACCEPTED', rank: 'GENUS' }],
    });
    expect(net.gbifCalls().map(c => c.url)).toEqual([
      matchUrl('Thrixspermum arunachalensis'), nonstrictMatchUrl('Thrixspermum arunachalensis'),
    ]);
    expect(report.sources.map((s: { url: string }) => s.url)).toEqual(net.gbifCalls().map(c => c.url));
    expect(report.uncertainty.join(' ')).toContain(`they are ${NONSTRICT_LABEL}, and the name stays unresolved`);
    const comment = net.comments[0].body.split('<details>')[0];
    expect(comment).toContain('resolution **unresolved**');
    expect(comment).toContain(`- Non-strict follow-up, ${NONSTRICT_LABEL}:\n  - Thrixspermum (HIGHERRANK, rank GENUS, confidence 94, usage key 2846663, GBIF status ACCEPTED)`);
  });

  it('keeps at most three real candidates from GBIF alternatives, best first', () => {
    const body = JSON.parse(fixture('match-dendrobium-nobilis-nonstrict').body);
    expect(body.alternatives.length).toBeGreaterThan(3);
    const items = nonstrictCandidates(body);
    expect(items.map((c: { usage_key: number }) => c.usage_key)).toEqual([5317489, 10795343, 5317367]);
    expect(items[0]).toEqual({ canonical_name: 'Dendrobium nobile', scientific_name: 'Dendrobium nobile Lindl.',
      match_type: 'FUZZY', confidence: 96, usage_key: 5317489, status: 'ACCEPTED', rank: 'SPECIES' });
  });

  it('skips NONE rows and repeated keys, and refuses a body with no matchType', () => {
    // Synthetic shapes.
    expect(nonstrictCandidates({ matchType: 'NONE', confidence: 100 })).toEqual([]);
    expect(nonstrictCandidates({ matchType: 'FUZZY', usageKey: 1, alternatives: [{ matchType: 'FUZZY', usageKey: 1 }, { matchType: 'NONE', usageKey: 2 }, null] })
      .map((c: { usage_key: number }) => c.usage_key)).toEqual([1]);
    expect(() => nonstrictCandidates({ usageKey: 1 })).toThrow(TransportFailure);
    expect(() => nonstrictCandidates([])).toThrow(TransportFailure);
  });

  it('fails closed when the non-strict follow-up fails: non-zero exit, no report, no comment', async () => {
    for (const reply of [
      () => new Response('{"error":"x"}', { status: 503, headers: { 'content-type': 'application/json' } }),
      () => new Response('{"usageKey":1}', { status: 200, headers: { 'content-type': 'application/json' } }),
    ]) {
      const env = envFor();
      const net = network({ issueBody: missionBody('Thrixspermum arunachalensis'),
        gbifOverride: url => (url.includes('strict=false') ? reply() : undefined) });
      const result = await runNomenclatureLookup({ env, fetchImpl: net.fetchImpl, now: () => NOW, log: quiet });
      expect(result.exitCode).toBe(EXIT.TRANSPORT);
      expect(existsSync(join(env.OC_EVIDENCE_DIR, 'nomenclature-report-817.json'))).toBe(false);
      expect(net.calls.filter(c => c.method === 'POST')).toHaveLength(0);
    }
  });

  it('never makes the follow-up for a match that is not NONE', async () => {
    for (const [name, extraGbif] of [
      ['Gastrochilus calceolaris', {}], ['Aerides leopardorum', {}], ['Oncidium flexuosum', {}],
      ['Fixturea exemplaris', { [matchUrl('Fixturea exemplaris')]: 'match-fuzzy-fixture-only' }],
    ] as Array<[string, Record<string, string>]>) {
      const net = network({ issueBody: issue817.body, extraGbif });
      const lookup = await lookupGbif(name, net.fetchImpl, () => NOW);
      expect(lookup.nonstrict_candidates).toBeNull();
      expect(net.gbifCalls().some(c => c.url.includes('strict=false'))).toBe(false);
    }
  });

  it('anchors the allowlist: only strict=true, or exactly strict=false&verbose=true, on species/match', () => {
    expect(nonstrictMatchUrl('Thrixspermum arunachalensis'))
      .toBe('https://api.gbif.org/v1/species/match?name=Thrixspermum%20arunachalensis&strict=false&verbose=true');
    expect(() => assertNomenclatureUrl(nonstrictMatchUrl('Thrixspermum arunachalensis'))).not.toThrow();
    expect(() => assertNomenclatureUrl(matchUrl('Thrixspermum arunachalensis'))).not.toThrow();
    for (const url of [
      'https://api.gbif.org/v1/species/match?name=X%20y&strict=false',
      'https://api.gbif.org/v1/species/match?name=X%20y&verbose=true',
      'https://api.gbif.org/v1/species/match?name=X%20y&strict=false&verbose=true&kingdom=Plantae',
      'https://api.gbif.org/v1/species/match?name=X%20y&strict=false&verbose=true#x',
      'https://api.gbif.org/v1/species/match?name=X%20y&strict=false&verbose=truex',
      'https://api.gbif.org/v1/species/search?name=X%20y&strict=false&verbose=true',
      'https://api.gbif.org/v1/occurrence/match?name=X%20y&strict=false&verbose=true',
      'https://api.gbif.org.evil/v1/species/match?name=X%20y&strict=false&verbose=true',
      'http://api.gbif.org/v1/species/match?name=X%20y&strict=false&verbose=true',
    ]) expect(() => assertNomenclatureUrl(url)).toThrow();
  });

  it('keeps the NONE path within the three-GET budget', async () => {
    for (const body of [missionBody('Thrixspermum arunachalensis'), missionBody('Gastrochilus zzyzxensis')]) {
      const net = network({ issueBody: body });
      await runNomenclatureLookup({ env: envFor(), fetchImpl: net.fetchImpl, now: () => NOW, log: quiet });
      expect(net.gbifCalls()).toHaveLength(2);
      expect(net.gbifCalls().length).toBeLessThanOrEqual(MAX_GBIF_GETS);
    }
  });
});

describe('the full machine report is embedded in the same comment', () => {
  const extract = (comment: string) => {
    const m = /<details><summary>Full machine report \(JSON\)<\/summary>\n\n```json\n([\s\S]*)\n```\n\n<\/details>$/.exec(comment);
    return m ? m[1] : null;
  };

  it('embeds the exact report JSON, collapsed, in the one digest-marked comment', async () => {
    const env = envFor();
    const net = network({ issueBody: missionBody('Gastrochilus fargesii') });
    const result = await runNomenclatureLookup({ env, fetchImpl: net.fetchImpl, now: () => NOW, log: quiet });
    expect(net.comments).toHaveLength(1);
    const comment = net.comments[0].body;
    expect(comment.startsWith(`${COMMENT_MARKER_PREFIX}${result.report.digest} -->`)).toBe(true);
    const json = extract(comment);
    expect(json).not.toBeNull();
    const onDisk = JSON.parse(readFileSync(join(env.OC_EVIDENCE_DIR, 'nomenclature-report-817.json'), 'utf8'));
    expect(JSON.parse(json!)).toEqual(onDisk);
    expect(comment.length).toBeLessThanOrEqual(MAX_COMMENT_CHARS);
    expect(onDisk.sensitive_locality_disclosure).toBe(false);
  });

  it('escapes backticks and angle brackets so GBIF text cannot break out of the block', () => {
    // Synthetic hostile name.
    const report = { schema: 'x', name: 'Fixturea ```</details><img src=x>` alba' };
    const block = embeddedReportBlock(report);
    const json = extract(block)!;
    expect(json).not.toMatch(/[`<>]/);
    expect(JSON.parse(json)).toEqual(report);
    expect(block.match(/```/g)).toHaveLength(2);
    expect(block.match(/<\/details>/g)).toHaveLength(1);
  });

  it('truncates an oversized report with an explicit marker and keeps the comment under the GitHub limit', async () => {
    const net = network({ issueBody: issue817.body });
    const lookup = await lookupGbif('Gastrochilus calceolaris', net.fetchImpl, () => NOW);
    const report = buildReport({ issue: 817, repository: REPO, mission: parseMission(issue817.body), lookup, generatedAt: NOW });
    // Synthetic: padding far beyond any real report.
    const huge = { ...report, uncertainty: [...report.uncertainty, 'x'.repeat(200000)] };
    const comment = renderComment(huge);
    expect(comment.length).toBeLessThanOrEqual(MAX_COMMENT_CHARS);
    expect(comment).toContain(EMBEDDED_JSON_TRUNCATED_MARKER);
    expect(comment.endsWith('```\n\n</details>')).toBe(true);
    // A report that fits is not marked.
    expect(renderComment(report)).not.toContain(EMBEDDED_JSON_TRUNCATED_MARKER);
  });
});

describe('reserve bodies declare a binding, gated on domain', () => {
  const payload = (domain: string) => ({
    automatic_publication: false, domain, execution_mode: 'bounded_research_mission',
    knowledge_graph_mutation: false, research_question: `Which sources give ${domain} evidence?`,
    review_required: true, schema: 'oc.knowledge-gap-reserve-source.v1', sensitive_locality_disclosure: false,
    taxon_id: '1', taxon_name: 'Gastrochilus calceolaris', taxonomy_mutation: false,
  });
  const bridged = (domain: string) => bridgeBackendReservePlan({
    schema: 'oc.reserve-refill.v1', reserve_depth: 1, queued_count: 0, deficit: 1, status: 'refill_planned',
    proposals: [{ source_ref: `gap:1:${domain}`, source_kind: 'objective', queue_source_kind: 'brain-knowledge-gap',
      material_fingerprint: 'f'.repeat(64), semantic_key: `calyx-evidence-gap:1:${domain}`, priority: 2,
      title: `Research ${domain} gap`, source_payload: payload(domain) }],
  }, []).plan.create[0].body;

  it('uses the same node and capability names as the executor and router', () => {
    expect(RESERVE_MISSION_GRAPH_NODE).toBe(RESERVE_MISSION_NODE);
    expect(NOMENCLATURE_CAPABILITY).toBe(DERIVED_CAPABILITY);
  });

  it('emits the node marker and the capability for a nomenclature mission', () => {
    const body = bridged('nomenclature');
    expect(body).toMatch(/^OC-GRAPH-NODE: cap-kg-evidence-gap-research-missions$/m);
    expect(body).toMatch(/^OC-SWARM-CAPABILITY: nomenclature-evidence-lookup$/m);
    const routing = routeIssue({ number: 1, body });
    expect(routing.providerFree).toBe(true);
    expect(commandsFor(routing)).toEqual(['npm run research:nomenclature-lookup']);
    expect(parseMission(body).taxonName).toBe('Gastrochilus calceolaris');
  });

  it('emits only the node marker for any other domain, which keeps an honest undeclared route', () => {
    for (const domain of ['phenology', 'ecology', 'nomenclature-extended', 'Nomenclature', 'Morphology']) {
      const body = bridged(domain);
      expect(body).toMatch(/^OC-GRAPH-NODE: cap-kg-evidence-gap-research-missions$/m);
      expect(body).not.toMatch(/OC-SWARM-CAPABILITY/);
      expect(routeIssue({ number: 1, body }).undeclared).toBe(true);
    }
  });
});

describe('the real reserve missions #816-#818 become executable with no edit', () => {
  // Built exactly as oc-dispatch-runtime.ts `snapshot()` builds one: `author` is `user.login`.
  const asIssue = (i: (typeof reserveIssues.issues)[number]): Issue => ({
    number: i.number, state: i.state, title: i.title, body: i.body,
    labels: i.labels.map(name => ({ name })).sort((a, b) => a.name.localeCompare(b.name)),
    author: i.user.login,
  });
  const bot = { author: 'github-actions[bot]', labels: [{ name: 'oc-discovered' }] };
  const issues = reserveIssues.issues.map(asIssue);

  it('carry no explicit marker, exactly as filed, by the reserve bot', () => {
    for (const i of issues) {
      expect(i.body).not.toMatch(/OC-GRAPH-NODE|OC-SWARM-CAPABILITY/);
      expect(i.labels.map(l => l.name)).toEqual(['oc-discovered', 'oc-p2', 'oc-prepared']);
      expect(i.author).toBe('github-actions[bot]');
    }
  });

  it('derive the node and the nomenclature capability from their machine lines', () => {
    for (const i of issues) {
      expect(deriveReserveMissionBinding(i)).toEqual({
        nodeId: 'cap-kg-evidence-gap-research-missions',
        capability: 'nomenclature-evidence-lookup',
        domain: 'nomenclature',
      });
      const routing = routeIssue(i);
      expect(routing.providerFree).toBe(true);
      expect(routing.deterministic).toEqual(['nomenclature-evidence-lookup']);
      expect(commandsFor(routing)).toEqual(['npm run research:nomenclature-lookup']);
    }
    expect(declaredNodesByIssue(issues)).toEqual({
      816: ['cap-kg-evidence-gap-research-missions'],
      817: ['cap-kg-evidence-gap-research-missions'],
      818: ['cap-kg-evidence-gap-research-missions'],
    });
  });

  it('are admitted from oc-prepared, one per wave, onto the evidence-gap leaf', () => {
    const snapshot: Snapshot = {
      issues, prs: [], integrationSha: 'a'.repeat(40), implementationSha: 'b'.repeat(40), material: { m: 'm' },
    };
    const plan = makePlan(snapshot, [], NOW);
    const admitted = plan.leaves.filter(l => [816, 817, 818].includes(l.issueNumber));
    expect(admitted).toHaveLength(1);
    expect(admitted[0].nodeId).toBe('cap-kg-evidence-gap-research-missions');
    expect(plan.unboundQueued).not.toEqual(expect.arrayContaining([816]));
    expect(plan.unboundQueued).not.toEqual(expect.arrayContaining([817]));
    expect(plan.unboundQueued).not.toEqual(expect.arrayContaining([818]));
  });

  it('derive the node but no capability for a reserve mission in another domain', () => {
    const body = issue817.body.replace('- Domain: nomenclature', '- Domain: phenology');
    expect(deriveReserveMissionBinding({ ...bot, body })).toMatchObject({ nodeId: RESERVE_MISSION_NODE, capability: null });
    expect(routeIssue({ ...bot, number: 817, body }).undeclared).toBe(true);
    expect(declaredNodesByIssue([{ ...asIssue(issue817), body }])).toEqual({ 817: [RESERVE_MISSION_NODE] });
  });

  it('derive nothing without the supervisor-source line or with a malformed block', () => {
    const withoutSource = issue817.body.replace('OC-SUPERVISOR-SOURCE: calyx-evidence-gap-reserve', '');
    const inlineSource = issue817.body.replace('\nOC-SUPERVISOR-SOURCE: calyx-evidence-gap-reserve', ' OC-SUPERVISOR-SOURCE: calyx-evidence-gap-reserve');
    const malformed = issue817.body.replace('- Human review required: yes\n', '');
    for (const body of [withoutSource, inlineSource, malformed]) {
      expect(deriveReserveMissionBinding({ ...bot, body })).toBeNull();
      expect(routeIssue({ ...bot, number: 817, body }).undeclared).toBe(true);
      expect(declaredNodesByIssue([{ ...asIssue(issue817), body }])).toEqual({});
    }
  });

  it('let an explicit marker or label win over the derived binding', () => {
    const explicitCap = `${issue817.body}\nOC-SWARM-CAPABILITY: test-execution`;
    expect(deriveReserveMissionBinding({ ...bot, body: explicitCap })).toBeNull();
    expect(routeIssue({ number: 817, body: explicitCap }).deterministic).toEqual(['test-execution']);

    const explicitNode = `${issue817.body}\nOC-GRAPH-NODE: gate-journey-research-matrix`;
    expect(declaredNodesByIssue([{ ...asIssue(issue817), body: explicitNode }]))
      .toEqual({ 817: ['gate-journey-research-matrix'] });
    expect(routeIssue({ number: 817, body: explicitNode }).undeclared).toBe(true);

    const labelled = { ...asIssue(issue817), labels: [{ name: 'oc-node:cap-conservatory-collection' }, { name: 'oc-prepared' }] };
    expect(declaredNodesByIssue([labelled])).toEqual({ 817: ['cap-conservatory-collection'] });
  });
});

describe('a derived reserve binding requires the reserve bot as author and the oc-discovered label', () => {
  const real: Issue = {
    number: 817, state: issue817.state, title: issue817.title, body: issue817.body,
    labels: issue817.labels.map(name => ({ name })), author: issue817.user.login,
  };
  const refused: Array<[string, Record<string, unknown>]> = [
    ['a person filed the identical body and labels', { ...real, author: 'octocat' }],
    ['a person filed it, with a REST user.login', { ...real, author: undefined, user: { login: 'octocat' } }],
    ['the reserve bot filed it without oc-discovered', { ...real, labels: [{ name: 'oc-p2' }, { name: 'oc-prepared' }] }],
    ['the snapshot records no author (fail closed)', { ...real, author: undefined }],
    ['the snapshot author is null', { ...real, author: null }],
    ['the recorded logins disagree', { ...real, user: { login: 'octocat' } }],
    ['a look-alike login', { ...real, author: 'github-actions-bot' }],
  ];
  it.each(refused)('derives nothing when %s', (_label, issue) => {
    expect(deriveReserveMissionBinding(issue)).toBeNull();
    expect(routeIssue({ number: 817, ...issue }).undeclared).toBe(true);
    expect(declaredNodesByIssue([issue as unknown as Issue])).toEqual({});
  });

  it.each([
    ['REST user.login', { user: { login: 'github-actions[bot]' } }],
    ['snapshot author', { author: 'github-actions[bot]' }],
    ['GraphQL Bot login', { author: 'github-actions' }],
    ['plain-string labels', { author: 'github-actions[bot]', labels: ['oc-p2', 'oc-discovered'] }],
  ])('derives the binding for the reserve bot via %s', (_label, identity) => {
    const issue = { number: 817, body: issue817.body, labels: [{ name: 'oc-discovered' }], ...identity };
    expect(deriveReserveMissionBinding(issue)).toEqual({
      nodeId: RESERVE_MISSION_NODE, capability: DERIVED_CAPABILITY, domain: 'nomenclature',
    });
    expect(routeIssue(issue).providerFree).toBe(true);
  });

  // The builders shell out to `gh`, so they are checked at the source: a builder
  // that dropped the author would silently unbind #816-#818 (fail closed).
  it.each([
    ['scripts/oc-dispatch-runtime.ts', /author: user\?\.login \?\? null/],
    ['scripts/oc-supervisor-discovery.ts', /author: issue\.user\?\.login \?\? null/],
    ['scripts/oc-provider-free-route.mjs', /routeIssue\(\{[^}]*author: issue\.user\?\.login \?\? null \}\)/],
  ])('%s threads the issue author into what it routes', (path, pattern) => {
    expect(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')).toMatch(pattern);
  });

  it('keeps a human-filed forgery out of the plan: no node, no lane', () => {
    const forged: Issue = { ...real, number: 9001, author: 'octocat' };
    const plan = makePlan({ issues: [forged], prs: [], integrationSha: 'a'.repeat(40), implementationSha: 'b'.repeat(40), material: {} }, [], NOW);
    expect(plan.leaves.map(l => l.issueNumber)).not.toContain(9001);
    expect(plan.issues).not.toContain(9001);
  });

  it('leaves the admission fingerprint unchanged by the author field', () => {
    // Both logins are the reserve bot, so both bind; if `author` were hashed the
    // fingerprints would differ (and every existing ledger fingerprint would move).
    const snap = (issues: Issue[]): Snapshot => ({ issues, prs: [], integrationSha: 'a'.repeat(40), implementationSha: 'b'.repeat(40), material: {} });
    const rest = makePlan(snap([real]), [], NOW).leaves;
    const graphql = makePlan(snap([{ ...real, author: 'github-actions' }]), [], NOW).leaves;
    expect(rest).toHaveLength(1);
    expect(graphql).toHaveLength(1);
    expect(rest[0].fingerprint).toBe(graphql[0].fingerprint);
  });
});

describe('routing and graph binding', () => {
  it('routes nomenclature-evidence-lookup as provider-free and lane-executable', () => {
    expect(LOCAL_EXECUTORS['nomenclature-evidence-lookup']).toBe('npm run research:nomenclature-lookup');
    expect(DETERMINISTIC_CAPABILITIES['nomenclature-evidence-lookup']).toBe('npm run research:nomenclature-lookup');
    expect(PROVIDER_CAPABILITIES).not.toContain('nomenclature-evidence-lookup');
    const routing = routeIssue({ number: 9, body: 'OC-SWARM-CAPABILITY: nomenclature-evidence-lookup' });
    expect(routing).toMatchObject({ providerFree: true, fullyBlocked: false, undeclared: false, blockingProvider: [] });
  });

  const all: CompletionNode[] = [];
  const walk = (n: CompletionNode) => { all.push(n); n.children.forEach(walk); };
  walk(COMPLETION_GRAPH);
  const leaf = all.find(n => n.id === 'cap-kg-evidence-gap-research-missions')!;

  it('binds to an admissible leaf under the knowledge-graph core module', () => {
    expect(leaf).toBeTruthy();
    expect(leaf.children).toEqual([]);
    expect(leaf.parentId).toBe('module-knowledge-graph-core');
    expect(all.find(n => n.id === 'module-knowledge-graph-core')!.children.map(c => c.id)).toContain(leaf.id);
    expect(leaf.status).toBe('PARTIAL');
    expect(leaf.threeLevels.productComplete).toBe('NOT_MET');
    expect(leaf.nextAction).toBe('deliver a review_required nomenclature evidence report; no publication/KG/taxonomy mutation');
    expect(leaf.dependsOn ?? []).toEqual([]);
    expect(all.filter(n => (n.dependsOn ?? []).includes(leaf.id))).toEqual([]);
  });

  it('holds only its own node while leased; an unrelated leaf is still admitted', () => {
    const issues: Issue[] = [
      { number: 816, state: 'open', title: 'a', body: reserveIssues.issues[0].body, labels: [{ name: 'oc-discovered' }, { name: 'oc-running' }], author: 'github-actions[bot]' },
      { number: 817, state: 'open', title: 'b', body: issue817.body, labels: [{ name: 'oc-discovered' }, { name: 'oc-prepared' }], author: 'github-actions[bot]' },
      { number: 703, state: 'open', title: 'c', body: null, labels: [{ name: 'oc-node:gate-journey-research-matrix' }, { name: 'oc-queued' }] },
    ];
    const lease: Lease = {
      id: 'l', issue: 816, nodeId: leaf.id, fingerprint: 'f', waveHash: 'w', runId: '1', runAttempt: '1',
      expiresAt: '2099-01-01T00:00:00.000Z', reservedUsd: 0, lane: 'provider-free', state: 'running',
    };
    const plan = makePlan({ issues, prs: [], integrationSha: 'a'.repeat(40), implementationSha: 'b'.repeat(40), material: {} }, [lease], NOW);
    expect(plan.issues).toContain(703);
    expect(plan.issues).not.toContain(817);
    expect(plan.unreachableQueued.map(u => u.issueNumber)).toContain(817);
  });
});

describe('the supervisor reports the capability honestly', () => {
  it('classifies an explicitly declared nomenclature mission as provider-free, not provider-required', () => {
    const body = `${issue817.body.replace('\nOC-SUPERVISOR-SOURCE: calyx-evidence-gap-reserve', '')}\n` +
      'OC-GRAPH-NODE: cap-kg-evidence-gap-research-missions\nOC-SWARM-CAPABILITY: nomenclature-evidence-lookup\n\n' +
      'OC-SUPERVISOR-SOURCE: calyx-evidence-gap-reserve';
    const result = discoverSupervisorWork(COMPLETION_GRAPH, [{ repository: REPO, issues: [
      { number: 900, repository: REPO, state: 'open', title: 't', body, labels: ['oc-prepared', 'oc-p2', 'oc-discovered'] },
    ] }], NOW);
    const packet = result.packets.find(p => p.capability === 'nomenclature-evidence-lookup');
    expect(packet).toMatchObject({ providerRequirement: 'none', executionMode: 'deterministic', status: 'eligible' });
  });
});
