import { readFile, writeFile } from 'node:fs/promises';

const token = process.env.GITHUB_TOKEN || '';
const outputPath = new URL('../public/data/oc-live-completion-ledger.json', import.meta.url);
const csvOutputPath = new URL('../public/data/oc-live-completion-ledger.csv', import.meta.url);
const current = JSON.parse(await readFile(outputPath, 'utf8'));

const repositories = [
  { slug: 'jsp1440/orchid-continuum-frontend', short: 'frontend' },
  { slug: 'jsp1440/orchid-calyx-backend', short: 'backend' },
  { slug: 'jsp1440/Orchid-Continuum-Brain', short: 'Brain' },
];

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'orchid-continuum-live-ledger',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${path}`);
  return response.json();
}

async function pagedIssues(repoSlug, state = 'all') {
  const values = [];
  for (let page = 1; page <= 100; page += 1) {
    const batch = await github(`/repos/${repoSlug}/issues?state=${state}&per_page=100&page=${page}&sort=updated&direction=desc`);
    values.push(...batch.filter((item) => !item.pull_request));
    if (batch.length < 100) return values;
  }
  throw new Error(`Incomplete GitHub pagination for ${repoSlug}`);
}

function labelsOf(issue) {
  return new Set((issue.labels || []).map((label) => typeof label === 'string' ? label : label.name).filter(Boolean));
}

function deriveStatus(issue) {
  const labels = labelsOf(issue);
  if (labels.has('oc-running')) return 'running';
  if (labels.has('oc-owner-gate')) return 'owner_gate';
  if (labels.has('oc-blocked') || labels.has('oc-runtime-backoff')) return 'blocked';
  if (labels.has('oc-queued')) return 'queued';
  return null;
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function buildCsv(ledger) {
  const rows = [['ledger_id', 'record_type', 'status', 'reference', 'title', 'timestamp', 'evidence_url']];
  for (const item of ledger.completed) {
    rows.push([item.id ?? '', 'completion', 'complete', item.ref ?? '', item.title, item.completed_at ?? '', item.url ?? '']);
  }
  for (const item of ledger.active) {
    rows.push(['', 'active', item.status, item.ref ?? '', item.title, item.updated_at ?? '', item.url ?? '']);
  }
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

const active = [];
const doneReceipts = [];
const heartbeat = {};
for (const repo of repositories) {
  const issues = await pagedIssues(repo.slug, 'all');
  const openIssues = issues.filter((issue) => issue.state === 'open');
  const doneIssues = issues.filter((issue) => issue.state === 'closed' && labelsOf(issue).has('oc-done'));
  heartbeat[repo.short] = {
    issues_scanned: issues.length,
    open_issues_scanned: openIssues.length,
    canonical_done_receipts: doneIssues.length,
  };

  for (const issue of openIssues) {
    const status = deriveStatus(issue);
    if (!status) continue;
    active.push({
      ref: `${repo.short}#${issue.number}`,
      title: issue.title,
      status,
      url: issue.html_url,
      updated_at: issue.updated_at,
      kind: 'issue',
    });
  }

  for (const issue of doneIssues) {
    doneReceipts.push({
      ref: `${repo.short}#${issue.number}`,
      title: issue.title,
      status: 'complete',
      url: issue.html_url,
      completed_at: issue.closed_at || issue.updated_at,
      source: 'oc-done',
    });
  }
}

const rank = { running: 0, queued: 1, owner_gate: 2, blocked: 3 };
active.sort((a, b) => (rank[a.status] - rank[b.status]) || Date.parse(b.updated_at) - Date.parse(a.updated_at));
doneReceipts.sort((a, b) => Date.parse(a.completed_at || '0') - Date.parse(b.completed_at || '0') || a.ref.localeCompare(b.ref));

const existingCompleted = Array.isArray(current.completed) ? current.completed : [];
const existingRefs = new Set(existingCompleted.map((item) => item.ref).filter(Boolean));
let nextId = existingCompleted.reduce((max, item) => Number.isSafeInteger(item.id) ? Math.max(max, item.id) : max, 0) + 1;
const newlyDiscovered = [];
for (const receipt of doneReceipts) {
  if (existingRefs.has(receipt.ref)) continue;
  newlyDiscovered.push({ id: nextId, ...receipt });
  existingRefs.add(receipt.ref);
  nextId += 1;
}
const completed = [...existingCompleted, ...newlyDiscovered];

const latestCandidates = [
  ...active.map((item) => item.updated_at),
  ...doneReceipts.map((item) => item.completed_at),
].filter(Boolean);
const lastStateChangeAt = latestCandidates.reduce((latest, value) =>
  !latest || Date.parse(value) > Date.parse(latest) ? value : latest, null);

const semanticNext = {
  ...current,
  verified_complete_count: completed.length,
  completed,
  active,
  heartbeat,
  last_state_change_at: lastStateChangeAt,
};
delete semanticNext.generated_at;

const semanticCurrent = { ...current };
delete semanticCurrent.generated_at;
const changed = JSON.stringify(semanticCurrent) !== JSON.stringify(semanticNext);
const next = changed ? { ...semanticNext, generated_at: new Date().toISOString() } : current;

await writeFile(csvOutputPath, buildCsv(next), 'utf8');
if (!changed) {
  console.log(`live ledger unchanged: ${semanticNext.verified_complete_count} complete, ${active.length} active/queued/gated/blocked; CSV mirror refreshed`);
  process.exit(0);
}

await writeFile(outputPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
console.log(`live ledger updated: ${next.verified_complete_count} complete (${newlyDiscovered.length} newly discovered oc-done receipts), ${active.length} active/queued/gated/blocked`);
