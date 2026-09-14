import { readFile, writeFile } from 'node:fs/promises';

const token = process.env.GITHUB_TOKEN || '';
const outputPath = new URL('../public/data/oc-live-completion-ledger.json', import.meta.url);
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

const active = [];
const heartbeat = {};
for (const repo of repositories) {
  const issues = await github(`/repos/${repo.slug}/issues?state=open&per_page=100&sort=updated&direction=desc`);
  heartbeat[repo.short] = { open_items_scanned: issues.length };
  for (const issue of issues) {
    const status = deriveStatus(issue);
    if (!status) continue;
    active.push({
      ref: `${repo.short}#${issue.number}`,
      title: issue.title,
      status,
      url: issue.html_url,
      updated_at: issue.updated_at,
      kind: issue.pull_request ? 'pull_request' : 'issue',
    });
  }
}

const rank = { running: 0, queued: 1, owner_gate: 2, blocked: 3 };
active.sort((a, b) => (rank[a.status] - rank[b.status]) || Date.parse(b.updated_at) - Date.parse(a.updated_at));

const next = {
  ...current,
  generated_at: new Date().toISOString(),
  verified_complete_count: Array.isArray(current.completed) ? current.completed.length : 0,
  active,
  heartbeat,
};

await writeFile(outputPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
console.log(`live ledger: ${next.verified_complete_count} complete, ${active.length} active/queued/gated/blocked`);
