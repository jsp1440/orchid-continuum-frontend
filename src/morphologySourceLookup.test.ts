// @vitest-environment node

/**
 * The provider-free executor for `morphology` evidence-gap reserve missions.
 *
 * The species/match bodies are the real captures already used by the
 * nomenclature tests (`src/lib/__fixtures__/gbif/match-*.json`). Every
 * descriptions and source-usage body is a `*-fixture-only.json` documented-shape
 * fixture with fictional `FIXTURE-` content: api.gbif.org was not reachable from
 * the capture sandbox, so no live descriptions body could be recorded. The
 * three issue bodies are the real morphology missions #825-#827, verbatim.
 * No test touches the network.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CAPABILITY,
  COMMENT_MARKER_PREFIX,
  EXIT,
  MAX_GBIF_GETS,
  MAX_SOURCE_USAGES,
  MissionRefused,
  REPORT_SCHEMA,
  REVIEW_BANNER,
  assertMorphologyUrl,
  citationFor,
  classifyType,
  descriptionsUrl,
  parseMission,
  runMorphologySourceLookup,
} from '../scripts/oc-morphology-source-lookup.mjs';
import { matchUrl, speciesUrl } from '../scripts/oc-nomenclature-lookup.mjs';
import {
  EXECUTABLE_RESERVE_DOMAINS,
  MORPHOLOGY_CAPABILITY as DERIVED_CAPABILITY,
  RESERVE_MISSION_NODE,
  deriveReserveMissionBinding,
  isUnexecutableReserveMission,
} from '../scripts/oc-reserve-mission-binding.mjs';
import { DETERMINISTIC_CAPABILITIES, LOCAL_EXECUTORS, PROVIDER_CAPABILITIES, commandsFor, routeIssue } from '../scripts/oc-capability-router.mjs';
import { MORPHOLOGY_CAPABILITY, bridgeBackendReservePlan } from './lib/control-plane/backendReserveQueueBridge';
import { discoverSupervisorWork } from './lib/control-plane/supervisorDiscovery';
import { COMPLETION_GRAPH } from './lib/completion-graph/completionGraphData';
import morphologyIssues from './lib/__fixtures__/reserve-mission-issues-825-827.json';
import nomenclatureIssues from './lib/__fixtures__/reserve-mission-issues-816-818.json';

type Fixture = { status: number; content_type: string; body: string };
const fixture = (name: string): Fixture =>
  JSON.parse(readFileSync(new URL(`./lib/__fixtures__/gbif/${name}.json`, import.meta.url), 'utf8'));

const GBIF: Record<string, string> = {
  [matchUrl('Gastrochilus calceolaris')]: 'match-gastrochilus-calceolaris',
  [matchUrl('Gastrochilus zzyzxensis')]: 'match-gastrochilus-zzyzxensis-none',
  [matchUrl('Oncidium flexuosum')]: 'match-oncidium-flexuosum-higherrank',
  [descriptionsUrl(5310649)]: 'descriptions-5310649-fixture-only',
  [speciesUrl(900000101)]: 'species-900000101-fixture-only',
  [speciesUrl(900000102)]: 'species-900000102-fixture-only',
  [speciesUrl(900000103)]: 'species-900000103-fixture-only',
};

const NOW = '2026-09-26T08:00:00.000Z';
const REPO = 'jsp1440/orchid-continuum-frontend';
const API = 'https://api.github.com';
const issue825 = morphologyIssues.issues.find(i => i.number === 825)!;
const BOT = 'github-actions[bot]';
/** The reserve bot's authorship and label, as the dispatch snapshot records them. */
const bot = { author: BOT, labels: [{ name: 'oc-discovered' }] };
const botIssue = (i: { number: number; body: string; labels: string[] }) =>
  ({ ...i, author: BOT, labels: i.labels.map(name => ({ name })) });
const withName = (name: string) => issue825.body.replaceAll('Gastrochilus calceolaris', name);

type Call = { url: string; method: string; body?: string };
function network(opts: {
  issueBody: string;
  existingComments?: Array<{ body: string; user?: { login: string } }>;
  gbifOverride?: (url: string) => Response | undefined;
}) {
  const calls: Call[] = [];
  const comments = [...(opts.existingComments ?? [])];
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
  const fetchImpl = async (url: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url, method, body: init.body });
    if (url === `${API}/repos/${REPO}/issues/825`) return json({ number: 825, body: opts.issueBody, user: { login: BOT } });
    if (url.startsWith(`${API}/repos/${REPO}/issues/825/comments`)) {
      if (method === 'POST') {
        comments.push({ body: JSON.parse(init.body!).body, user: { login: BOT } });
        return json({ id: comments.length }, 201);
      }
      return json(comments);
    }
    const override = opts.gbifOverride?.(url);
    if (override) return override;
    const name = GBIF[url];
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
  const dir = mkdtempSync(join(tmpdir(), 'oc-morph-')); dirs.push(dir);
  return { ISSUE_NUMBER: '825', REPO, GH_TOKEN: 'fixture-token', OC_EVIDENCE_DIR: dir, GITHUB_API_URL: API };
}
const quiet = () => {};
const run = (net: ReturnType<typeof network>, env = envFor(), log: (line: string) => void = quiet) =>
  runMorphologySourceLookup({ env, fetchImpl: net.fetchImpl as unknown as typeof fetch, now: () => NOW, log });
const readReport = (env: ReturnType<typeof envFor>) =>
  JSON.parse(readFileSync(join(env.OC_EVIDENCE_DIR, 'morphology-source-report-825.json'), 'utf8'));

describe('mission parsing', () => {
  it('parses each real morphology mission #825-#827', () => {
    expect(morphologyIssues.issues.map(i => parseMission(i.body))).toMatchObject([
      { taxonId: '1', taxonName: 'Gastrochilus calceolaris', domain: 'morphology' },
      { taxonId: '10', taxonName: 'Gastrochilus fargesii', domain: 'morphology' },
      { taxonId: '100', taxonName: 'Robiquetia andamanica', domain: 'morphology' },
    ]);
    expect(parseMission(issue825.body).materialFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a nomenclature mission, a malformed block and a non-canonical name', () => {
    expect(() => parseMission(nomenclatureIssues.issues[0].body)).toThrow(MissionRefused);
    expect(() => parseMission(issue825.body.replace('- Human review required: yes', ''))).toThrow(MissionRefused);
    for (const name of ['Gastrochilus', 'gastrochilus calceolaris', 'Gastrochilus × calceolaris']) {
      expect(() => parseMission(withName(name))).toThrow(MissionRefused);
    }
  });
});

describe('description type classification', () => {
  it.each([
    ['morphology', 'morphology'], ['Morphology', 'morphology'], ['description', 'morphology'],
    ['Diagnostic Description', 'diagnostic'], ['diagnosis', 'diagnostic'], ['look-alikes', 'diagnostic'],
    ['general', 'general_mixed_possible'],
    ['distribution', 'locality_bearing'], ['Habitat', 'locality_bearing'], ['ecology', 'locality_bearing'],
    ['materials_examined', 'locality_bearing'], ['Conservation', 'locality_bearing'], ['biogeography', 'locality_bearing'],
    ['etymology', 'other'], ['uses', 'other'], ['', 'other'], [null, 'other'],
  ])('%s -> %s', (type, scope) => {
    expect(classifyType(type)).toBe(scope);
  });

  it('keeps only a bibliographic citation and withholds anything that could place a site', () => {
    expect(citationFor('Seidenfaden, G. (1988). Orchid genera in Thailand XIV. Opera Bot. 95: 1-398.'))
      .toEqual({ citation: 'Seidenfaden, G. (1988). Orchid genera in Thailand XIV. Opera Bot. 95: 1-398.', citation_withheld_reason: null });
    const LOCALITY = 'possible_locality_or_collecting_marker';
    for (const text of [
      'Fl. Fixt. 3: 12 (2001), near Kinabalu waterfall, 1200 m elev.',
      'Fixture Bull. 1999, 12 30 N, 77 15 W',
      'Fixture Bull. 1999, 12°30\'N',
      'Fixture Bull. 1999; 25.12345, 100.12345',
      'Fixture Bull. 1999, alt. 900',
      'Fixture Bull. 1999, 3 km from the fixture road',
      'Fixture Bull. 1999, coll. Fixture 12',
      'Fixture Bull. 1999, leg. Fixture',
      'Fixture Bull. 1999, type locality: Fixture Hill',
      'Fixture Bull. 1999, 3000 ft',
      'Fixture Bull. 1999, holotype K',
    ]) expect(citationFor(text)).toEqual({ citation: null, citation_withheld_reason: LOCALITY });
    expect(citationFor('Flora Fixturica 1: 12.')).toEqual({ citation: null, citation_withheld_reason: 'no_publication_year' });
    expect(citationFor(`Fixture ${'x'.repeat(300)} 1999`)).toEqual({ citation: null, citation_withheld_reason: 'longer_than_300_chars' });
    expect(citationFor(null)).toEqual({ citation: null, citation_withheld_reason: 'no_citation_supplied' });
  });
});

describe('a real mission against GBIF description records', () => {
  it('lists only morphology sources, as metadata, and never reproduces text or locality', async () => {
    const net = network({ issueBody: issue825.body });
    const env = envFor();
    const result = await run(net, env);
    expect(result.exitCode).toBe(EXIT.OK);
    const report = readReport(env);

    expect(report).toMatchObject({
      schema: REPORT_SCHEMA, capability: CAPABILITY, graph_node: RESERVE_MISSION_NODE, outcome: 'sources_found',
      taxon: { id: '1', kg_name: 'Gastrochilus calceolaris', domain: 'morphology' },
      gbif: { match_type: 'EXACT', status: 'ACCEPTED', resolution: 'accepted_match', described_usage_key: 5310649 },
      descriptions: { returned: 7, truncated: false, kept: 3, excluded: { locality_bearing: 3, other: 1 } },
      description_text_reproduced: false, review_required: true, automatic_publication: false,
      knowledge_graph_mutation: false, taxonomy_mutation: false, sensitive_locality_disclosure: false,
      provider_calls: 0, gbif_get_count: 5,
    });
    expect(report.morphology_sources.map((s: { type: string; scope: string }) => [s.type, s.scope])).toEqual([
      ['morphology', 'morphology'], ['Diagnostic Description', 'diagnostic'], ['general', 'general_mixed_possible'],
    ]);
    expect(report.morphology_sources[0]).toMatchObject({
      term_signals: { fruit_capsule: true, scent: true, diagnostic_comparison: false },
      dataset_key: '00000000-0000-4000-8000-000000000001', citation: 'FIXTURE-SOURCE Flora Fixturica vol. 1: 12. 2009.',
      citation_withheld_reason: null, language: 'eng',
      gbif_url: 'https://www.gbif.org/species/900000101',
    });
    expect(report.morphology_sources[1]).toMatchObject({ license: null, term_signals: { diagnostic_comparison: true },
      citation: null, citation_withheld_reason: 'possible_locality_or_collecting_marker' });
    expect(report.morphology_sources[2]).toMatchObject({ citation: null, citation_withheld_reason: 'possible_locality_or_collecting_marker' });
    expect(report.uncertainty.join('\n')).toMatch(/not verified morphological statements/);
    expect(report.uncertainty.join('\n')).toMatch(/states no usable licence/);
    expect(report.uncertainty.join('\n')).toMatch(/citation was withheld/);
    expect(report.uncertainty.join('\n')).toMatch(/"general" description may mix/);

    // Negative control: no description text, locality prose or coordinate
    // from any record, kept or excluded, reaches the report or the comment.
    expect(net.comments).toHaveLength(1);
    const comment = net.comments[0].body;
    for (const text of [JSON.stringify(report), comment]) {
      expect(text).not.toMatch(/FIXTURE-TEXT|FIXTURE-LOCALITY|Distribution Fixture|Habitat Fixture|Specimen Fixture|Etymology Fixture/);
      expect(text).not.toMatch(/25\.12345|27\.98765|100\.12345|1800 m|1200 m|FIXTURE-WATERFALL|fragrant|saccate/);
      expect(text).not.toMatch(/"description":/);
    }
    expect(comment.startsWith(`${COMMENT_MARKER_PREFIX}${report.digest} -->`)).toBe(true);
    expect(comment).toContain(REVIEW_BANNER);
    expect(comment).toContain('3 locality-bearing and 1 other excluded (not described)');
    // The comment carries no citation text at all, not even a screened one.
    expect(comment).not.toMatch(/FIXTURE-SOURCE|Flora Fixturica|Fixture Monograph/);
    expect(comment).toContain('- citation text is in the report artifact for reviewers');
    expect(comment).toContain('No description text was reproduced; source citations are publisher-supplied, ' +
      'withheld from this comment, and screened conservatively in the report.');
  });

  it('writes nothing but a bounded summary to stdout: no description or citation text', async () => {
    const lines: string[] = [];
    const env = envFor();
    await run(network({ issueBody: issue825.body }), env, line => lines.push(line));
    expect(lines).toHaveLength(1);
    expect(Object.keys(JSON.parse(lines[0])).sort())
      .toEqual(['comment', 'digest', 'issue', 'kept', 'outcome', 'provider_calls', 'report']);
    expect(lines[0]).not.toMatch(/FIXTURE-|Flora Fixturica|Fixture Monograph|1200 m|25\.12345|citation|description/i);
  });

  it('bounds publisher-supplied language and licence strings', async () => {
    const odd = { offset: 0, limit: 50, endOfRecords: true, results: [
      { key: 1, type: 'morphology', description: 'x', source: null, sourceTaxonKey: null,
        language: 'English, as spoken near Fixture Falls', license: `https://fixture.example/${'l'.repeat(250)}` },
      { key: 2, type: 'morphology', description: 'x', source: null, sourceTaxonKey: null, language: 'en-GB', license: 'CC0 1.0' },
    ] };
    const net = network({ issueBody: issue825.body, gbifOverride: url => url === descriptionsUrl(5310649)
      ? new Response(JSON.stringify(odd), { status: 200, headers: { 'content-type': 'application/json' } }) : undefined });
    const env = envFor();
    await run(net, env);
    const [a, b] = readReport(env).morphology_sources;
    expect(a).toMatchObject({ language: null, license: null });
    expect(b).toMatchObject({ language: 'en-GB', license: 'CC0 1.0' });
    expect(JSON.stringify(readReport(env)) + net.comments[0].body).not.toMatch(/Fixture Falls|l{200}/);
  });

  it('only ever GETs allowlisted GBIF species URLs, never an occurrence or distribution endpoint', async () => {
    const net = network({ issueBody: issue825.body });
    await run(net);
    const gbif = net.gbifCalls();
    expect(gbif.map(c => c.url)).toEqual([
      matchUrl('Gastrochilus calceolaris'), descriptionsUrl(5310649),
      speciesUrl(900000101), speciesUrl(900000102), speciesUrl(900000103),
    ]);
    for (const call of gbif) {
      expect(call.method).toBe('GET');
      expect(call.url).not.toMatch(/occurrence|locality|coordinate|distribution/i);
    }
    for (const url of [
      'https://api.gbif.org/v1/occurrence/search?taxonKey=5310649',
      'https://api.gbif.org/v1/species/5310649/distributions',
      'https://api.gbif.org/v1/species/5310649/descriptions?limit=50&type=distribution',
      'https://api.gbif.org/v1/species/5310649/media',
      'https://example.org/v1/species/5310649',
      'https://example.org/?u=https://api.gbif.org/v1/species/5310649',
      'http://api.gbif.org/v1/species/5310649',
    ]) expect(() => assertMorphologyUrl(url)).toThrow();
  });

  it('bounds source-usage lookups and says so', async () => {
    const many = { offset: 0, limit: 50, endOfRecords: false, results: Array.from({ length: 8 }, (_, i) => ({
      key: i + 1, type: 'morphology', description: 'x', source: 's', sourceTaxonKey: 800000000 + i, license: null,
    })) };
    const net = network({
      issueBody: issue825.body,
      gbifOverride: url => {
        const headers = { 'content-type': 'application/json' };
        if (url === descriptionsUrl(5310649)) return new Response(JSON.stringify(many), { status: 200, headers });
        const m = /species\/(8\d{8})$/.exec(url);
        return m ? new Response(JSON.stringify({ key: Number(m[1]), datasetKey: 'd' }), { status: 200, headers }) : undefined;
      },
    });
    const env = envFor();
    expect((await run(net, env)).exitCode).toBe(EXIT.OK);
    const report = readReport(env);
    expect(net.gbifCalls()).toHaveLength(2 + MAX_SOURCE_USAGES);
    expect(report.gbif_get_count).toBeLessThanOrEqual(MAX_GBIF_GETS);
    expect(report.descriptions).toMatchObject({ truncated: true, source_usages_unresolved: 3 });
    expect(report.uncertainty.join('\n')).toMatch(/only the first page was read/);
  });

  it('reports an explicit absence when only locality-bearing descriptions exist', async () => {
    const f = fixture('descriptions-locality-only-fixture-only');
    const net = network({
      issueBody: issue825.body,
      gbifOverride: url => url === descriptionsUrl(5310649)
        ? new Response(f.body, { status: 200, headers: { 'content-type': f.content_type } }) : undefined,
    });
    const env = envFor();
    expect((await run(net, env)).exitCode).toBe(EXIT.OK);
    const report = readReport(env);
    expect(report).toMatchObject({ outcome: 'no_morphology_source_in_gbif', morphology_sources: [],
      descriptions: { kept: 0, excluded: { locality_bearing: 1, other: 0 } } });
    expect(report.uncertainty.join('\n')).toMatch(/not evidence of absence in the literature/);
    expect(JSON.stringify(report) + net.comments[0].body).not.toMatch(/FIXTURE-LOCALITY|Fixture Island/);
  });

  it.each([
    ['Gastrochilus zzyzxensis', 'NONE'],
    ['Oncidium flexuosum', 'HIGHERRANK'],
  ])('requests no descriptions when %s does not resolve exactly (%s)', async (name, matchType) => {
    const net = network({ issueBody: withName(name) });
    const env = envFor();
    expect((await run(net, env)).exitCode).toBe(EXIT.OK);
    const report = readReport(env);
    expect(report).toMatchObject({ outcome: 'taxon_unresolved', gbif: { match_type: matchType, described_usage_key: null }, gbif_get_count: 1 });
    expect(net.gbifCalls().map(c => c.url)).toEqual([matchUrl(name)]);
  });
});

describe('failure and idempotence', () => {
  it.each([
    ['an HTTP 500', () => new Response('boom', { status: 500, headers: { 'content-type': 'text/plain' } })],
    ['a non-JSON body', () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })],
    ['no results array', () => new Response('{"offset":0}', { status: 200, headers: { 'content-type': 'application/json' } })],
  ])('exits TRANSPORT and posts nothing on %s from descriptions', async (_label, response) => {
    const net = network({ issueBody: issue825.body, gbifOverride: url => (url === descriptionsUrl(5310649) ? response() : undefined) });
    const result = await run(net);
    expect(result.exitCode).toBe(EXIT.TRANSPORT);
    expect(net.calls.some(c => c.method === 'POST')).toBe(false);
  });

  it('exits BAD_INPUT for a nomenclature issue and makes no GBIF request', async () => {
    const net = network({ issueBody: nomenclatureIssues.issues[1].body });
    expect((await run(net)).exitCode).toBe(EXIT.BAD_INPUT);
    expect(net.gbifCalls()).toEqual([]);
  });

  it('ignores a morphology digest marker posted by anyone but the lane bot', async () => {
    const first = network({ issueBody: issue825.body });
    await run(first);
    const forged = first.comments.map(c => ({ body: c.body, user: { login: 'someone-else' } }));
    expect(forged[0].body.startsWith(COMMENT_MARKER_PREFIX)).toBe(true);
    const second = network({ issueBody: issue825.body, existingComments: forged });
    const result = await run(second, envFor());
    expect(result.commented).toBe(true);
    expect(second.calls.filter(c => c.method === 'POST')).toHaveLength(1);
  });

  it('posts once for the same evidence and skips on a re-run', async () => {
    const first = network({ issueBody: issue825.body });
    await run(first);
    const second = network({ issueBody: issue825.body, existingComments: first.comments });
    const result = await run(second, envFor());
    expect(result.commented).toBe(false);
    expect(second.calls.filter(c => c.method === 'POST')).toEqual([]);
  });
});

describe('binding, routing and settlement shape', () => {
  it('uses one capability name across executor, binding, bridge and router', () => {
    expect(CAPABILITY).toBe('morphology-source-lookup');
    expect(DERIVED_CAPABILITY).toBe(CAPABILITY);
    expect(MORPHOLOGY_CAPABILITY).toBe(CAPABILITY);
    expect(LOCAL_EXECUTORS[CAPABILITY]).toBe('npm run research:morphology-source-lookup');
    expect(DETERMINISTIC_CAPABILITIES[CAPABILITY]).toBe('npm run research:morphology-source-lookup');
    expect(PROVIDER_CAPABILITIES).not.toContain(CAPABILITY);
    expect([...EXECUTABLE_RESERVE_DOMAINS].sort()).toEqual(['morphology', 'nomenclature']);
  });

  it('leaves the closed #825-#827 as filed: explicit node, no capability, still undeclared', () => {
    // They carry an explicit OC-GRAPH-NODE line, so nothing is derived and
    // they never become executable retroactively (the owner closed them).
    for (const i of morphologyIssues.issues.map(botIssue)) {
      expect(i.body).toMatch(/^OC-GRAPH-NODE: cap-kg-evidence-gap-research-missions$/m);
      expect(i.body).not.toMatch(/OC-SWARM-CAPABILITY/);
      expect(deriveReserveMissionBinding(i)).toBeNull();
      expect(routeIssue(i).undeclared).toBe(true);
      expect(isUnexecutableReserveMission(i)).toBe(false);
    }
  });

  it('derives the morphology capability for a legacy body with only the machine lines', () => {
    const legacy = issue825.body.replace('OC-GRAPH-NODE: cap-kg-evidence-gap-research-missions\n', '');
    expect(deriveReserveMissionBinding({ ...bot, body: legacy }))
      .toEqual({ nodeId: RESERVE_MISSION_NODE, capability: CAPABILITY, domain: 'morphology' });
    // #837: without the bot author and `oc-discovered`, nothing is derived.
    expect(deriveReserveMissionBinding({ body: legacy })).toBeNull();
    expect(deriveReserveMissionBinding({ ...bot, author: 'octocat', body: legacy })).toBeNull();
    expect(deriveReserveMissionBinding({ author: BOT, labels: [], body: legacy })).toBeNull();
    expect(routeIssue({ number: 825, body: legacy }).undeclared).toBe(true);
    const routing = routeIssue({ ...bot, number: 825, body: legacy });
    expect(routing.providerFree).toBe(true);
    expect(commandsFor(routing)).toEqual(['npm run research:morphology-source-lookup']);
  });

  it('bridges a morphology payload with its capability line and nothing for phenology', () => {
    const body = (domain: string) => bridgeBackendReservePlan({
      schema: 'oc.reserve-refill.v1', reserve_depth: 1, queued_count: 0, deficit: 1, status: 'refill_planned',
      proposals: [{ source_ref: `gap:1:${domain}`, source_kind: 'objective', queue_source_kind: 'brain-knowledge-gap',
        material_fingerprint: 'e'.repeat(64), semantic_key: `calyx-evidence-gap:1:${domain}`, priority: 2,
        title: `Research ${domain} gap`, source_payload: {
          automatic_publication: false, domain, execution_mode: 'bounded_research_mission',
          knowledge_graph_mutation: false, research_question: 'Which sources?', review_required: true,
          schema: 'oc.knowledge-gap-reserve-source.v1', sensitive_locality_disclosure: false,
          taxon_id: '1', taxon_name: 'Gastrochilus calceolaris', taxonomy_mutation: false,
        } }],
    }, []).plan.create[0].body;
    expect(body('morphology')).toMatch(/^OC-SWARM-CAPABILITY: morphology-source-lookup$/m);
    expect(commandsFor(routeIssue({ number: 1, body: body('morphology') }))).toEqual(['npm run research:morphology-source-lookup']);
    expect(body('phenology')).not.toMatch(/OC-SWARM-CAPABILITY/);
    expect(routeIssue({ number: 1, body: body('phenology') }).undeclared).toBe(true);
  });

  it('is reported by the supervisor as provider-free', () => {
    const body = `${issue825.body.replace('\nOC-SUPERVISOR-SOURCE: calyx-evidence-gap-reserve', '')}\n` +
      'OC-SWARM-CAPABILITY: morphology-source-lookup\n\nOC-SUPERVISOR-SOURCE: calyx-evidence-gap-reserve';
    const result = discoverSupervisorWork(COMPLETION_GRAPH, [{ repository: REPO, issues: [
      { number: 901, repository: REPO, state: 'open', title: 't', body, labels: ['oc-prepared', 'oc-p2', 'oc-discovered'] },
    ] }], NOW);
    expect(result.packets.find(p => p.capability === CAPABILITY))
      .toMatchObject({ providerRequirement: 'none', executionMode: 'deterministic', status: 'eligible' });
  });
});
