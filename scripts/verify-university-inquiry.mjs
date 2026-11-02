#!/usr/bin/env node
// Exercise a served candidate frontend against an actual University API.
// No route fulfillment, response fixtures, learner mutation or model call.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const [frontendOrigin, backendOrigin, evidencePath = 'university-inquiry-evidence.json'] = process.argv.slice(2);
if (!frontendOrigin || !backendOrigin) throw new Error('Usage: node scripts/verify-university-inquiry.mjs <frontend-origin> <backend-origin> [evidence.json]');
await mkdir(dirname(evidencePath), { recursive: true });
const check = (condition, message) => { if (!condition) throw new Error(message); };
const read = async (path) => {
  const response = await fetch(backendOrigin + path);
  check(response.ok, path + ' returned ' + response.status);
  return response.json();
};
const readiness = await read('/api/learning/release-readiness');
check(readiness.read_only_ready === true, 'Requires the read-only release');
for (const name of ['session_writes_enabled', 'durable_sessions_enabled', 'publication_enabled', 'candidate_knowledge_writes_enabled', 'calyx_model_calls_enabled']) {
  check(readiness[name] === false, name + ' must remain false');
}
const catalog = await read('/api/learning/catalog');
const lab = await read('/api/learning/laboratories/' + encodeURIComponent(catalog.laboratory.id));
check(lab.data_origin === 'simulated_instructional_case', 'Expected explicit simulated case');
check(lab.inquiry_activity?.steps?.length === 7, 'Expected seven actual API activity steps');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
});
const evidence = {
  frontend_origin: frontendOrigin, backend_origin: backendOrigin,
  started_at: new Date().toISOString(), response_fixtures: false,
  backend_release: readiness.release_contract, activity_version: lab.inquiry_activity.version,
  checks: [], learning_requests: [],
};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().startsWith(backendOrigin + '/api/learning/')) {
      evidence.learning_requests.push({ method: request.method(), url: request.url() });
    }
  });
  await page.goto(frontendOrigin + '/university', { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Open flowering inquiry lesson', exact: true }).click();
  await page.getByRole('heading', { name: 'Guided inquiry practice', exact: true }).waitFor();
  check(await page.getByText('Simulated instructional case.', { exact: false }).count() > 0, 'Missing simulation disclosure');
  evidence.checks.push('University entry → lesson → actual API chapter/laboratory → practice');
  for (const [index, step] of lab.inquiry_activity.steps.entries()) {
    await page.getByRole('heading', { name: 'Stage ' + (index + 1) + ' of 7: ' + step.stage, exact: true }).waitFor();
    const appropriate = step.choices.find((choice) => choice.appropriate === true);
    await page.getByRole('radio', { name: appropriate.label, exact: true }).check();
    await page.getByLabel('Your question or hypothesis', { exact: false }).fill('Verification note for ' + step.stage);
    await page.getByRole('button', { name: 'Check reasoning', exact: true }).click();
    await page.getByRole('status').filter({ hasText: appropriate.feedback }).waitFor();
    await page.getByRole('button', { name: index === 6 ? 'Review activity' : 'Next stage', exact: true }).click();
    evidence.checks.push('Stage ' + (index + 1) + ': actual case references, response, note and reasoning feedback');
  }
  await page.getByRole('heading', { name: 'Review your learning activity', exact: true }).waitFor();
  for (const step of lab.inquiry_activity.steps) {
    check(await page.getByText('Your note: Verification note for ' + step.stage, { exact: true }).isVisible(), 'Final note missing: ' + step.stage);
  }
  check((await page.getByRole('listitem').filter({ hasText: 'Scenario references:' }).count()) === 7, 'Incomplete final review');
  check(evidence.learning_requests.every((request) => request.method === 'GET'), 'Unexpected University mutation request');
  check(evidence.learning_requests.some((request) => request.url.includes('/chapters/')), 'No actual frontend chapter request');
  check(evidence.learning_requests.some((request) => request.url.includes('/laboratories/')), 'No actual frontend laboratory request');
  check(errors.length === 0, 'Browser runtime errors: ' + errors.join('; '));
  evidence.checks.push('Final review contains all seven notes; actual learning requests are GET only; no page errors');
  await page.getByRole('button', { name: 'Start again', exact: true }).click();
  check(await page.getByLabel('Your question or hypothesis', { exact: false }).inputValue() === '', 'Reset retained notes');
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.getByRole('heading', { name: 'Stage 1 of 7: observe', exact: true }).isVisible(), 'Narrow-screen practice not visible');
  const screenshotPath = evidencePath.replace(/\.json$/, '') + '.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Stage 1 of 7: observe', exact: true }).waitFor();
  check(await page.getByLabel('Your question or hypothesis', { exact: false }).inputValue() === '', 'Reload retained notes');
  evidence.checks.push('Reset, narrow viewport and reload preserve the ephemeral session contract');
  evidence.result = 'pass';
  evidence.completed_at = new Date().toISOString();
  evidence.frontend_release = await page.locator('meta[name="ocu-release-sha"]').getAttribute('content');
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.result = 'fail';
  evidence.error = error instanceof Error ? error.message : String(error);
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  throw error;
} finally {
  await browser.close();
}
