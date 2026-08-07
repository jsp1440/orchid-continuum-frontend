#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';

const EXPECTED_CHAPTER = 'BITB-CHAPTER-ORCHID-FLOWERING-001';
const EXPECTED_LAB = 'OCU-LAB-FAILURE-TO-BLOOM-001';

function normalizeOrigin(value, label) {
  if (!value) throw new Error(`${label} is required`);
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} must use http or https`);
  }
  return url.toString().replace(/\/$/, '');
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: options.accept ?? '*/*' },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(url) {
  const response = await request(url, { accept: 'application/json' });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`${url} did not return JSON (${contentType || 'no content-type'})`);
  }
  return response.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyFrontend(frontendOrigin) {
  const routeUrl = `${frontendOrigin}/university/lab`;
  const response = await request(routeUrl, { accept: 'text/html' });
  assert(response.ok, `${routeUrl} returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') ?? '';
  assert(contentType.includes('text/html'), `${routeUrl} did not return HTML`);
  const html = await response.text();
  assert(/<div\s+id=["']root["']/.test(html), `${routeUrl} is not the canonical React app shell`);
  assert(!/Page not found/i.test(html), `${routeUrl} returned a rendered 404 page`);
  assert(!/Built on\s+Famous\.ai/i.test(html), `${routeUrl} is still served by the Famous.ai site`);
  return { url: routeUrl, status: response.status, canonical_app_shell: true };
}

async function verifyBackend(apiOrigin) {
  const readiness = await readJson(`${apiOrigin}/learning/release-readiness`);
  const requiredReadOnlyState = {
    university_enabled: true,
    read_only_ready: true,
    session_writes_enabled: false,
    publication_enabled: false,
    candidate_knowledge_writes_enabled: false,
    calyx_model_calls_enabled: false,
    human_review_required: true,
  };
  for (const [key, expected] of Object.entries(requiredReadOnlyState)) {
    assert(readiness[key] === expected, `release-readiness.${key} must be ${expected}`);
  }

  const capability = await readJson(`${apiOrigin}/learning/capabilities`);
  assert(capability.enabled === true, 'capabilities.enabled must be true');
  assert(capability.session_writes_enabled === false, 'capabilities.session_writes_enabled must be false');

  const catalog = await readJson(`${apiOrigin}/learning/catalog`);
  assert(catalog.chapter?.id === EXPECTED_CHAPTER, `catalog chapter must be ${EXPECTED_CHAPTER}`);
  assert(catalog.laboratory?.id === EXPECTED_LAB, `catalog laboratory must be ${EXPECTED_LAB}`);

  const chapter = await readJson(`${apiOrigin}/learning/chapters/${EXPECTED_CHAPTER}`);
  assert(chapter.chapter_id === EXPECTED_CHAPTER, 'chapter identifier mismatch');
  assert(Array.isArray(chapter.sections) && chapter.sections.length > 0, 'chapter has no sections');
  assert(chapter.publication_allowed === false, 'chapter publication must remain disabled');

  const laboratory = await readJson(`${apiOrigin}/learning/laboratories/${EXPECTED_LAB}`);
  assert(laboratory.laboratory_id === EXPECTED_LAB, 'laboratory identifier mismatch');
  assert(Array.isArray(laboratory.inquiry_sequence) && laboratory.inquiry_sequence.length === 7, 'laboratory inquiry sequence is incomplete');
  assert(Array.isArray(laboratory.evidence_catalog) && laboratory.evidence_catalog.length > 0, 'laboratory evidence catalog is empty');
  assert(laboratory.publication_allowed === false, 'laboratory publication must remain disabled');
  assert(laboratory.automatic_candidate_knowledge === false, 'Candidate Knowledge promotion must remain disabled');
  assert(laboratory.human_review_required === true, 'human review must remain required');

  return {
    readiness,
    capability,
    catalog: {
      chapter_id: catalog.chapter.id,
      laboratory_id: catalog.laboratory.id,
    },
    chapter_sections: chapter.sections.length,
    laboratory_evidence_items: laboratory.evidence_catalog.length,
  };
}

async function main() {
  const [frontendArg, apiArg, outputArg = 'university-production-evidence.json'] = process.argv.slice(2);
  const frontendOrigin = normalizeOrigin(frontendArg, 'frontend URL');
  const apiOrigin = normalizeOrigin(apiArg, 'API URL');
  const startedAt = new Date().toISOString();

  const evidence = {
    schema_version: '1.0.0',
    verification: 'OCU-SCI-007',
    started_at: startedAt,
    frontend_origin: frontendOrigin,
    api_origin: apiOrigin,
    frontend: await verifyFrontend(frontendOrigin),
    backend: await verifyBackend(apiOrigin),
    completed_at: new Date().toISOString(),
    result: 'pass',
  };

  await writeFile(outputArg, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`PASS: Orchid Continuum University production verification`);
  console.log(`Evidence: ${outputArg}`);
}

main().catch(async (error) => {
  const outputArg = process.argv[4] ?? 'university-production-evidence.json';
  const failure = {
    schema_version: '1.0.0',
    verification: 'OCU-SCI-007',
    completed_at: new Date().toISOString(),
    result: 'fail',
    error: error instanceof Error ? error.message : String(error),
  };
  await writeFile(outputArg, `${JSON.stringify(failure, null, 2)}\n`, 'utf8').catch(() => {});
  console.error(`FAIL: ${failure.error}`);
  process.exitCode = 1;
});
