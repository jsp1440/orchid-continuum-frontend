/**
 * Audit `oc-done` claims in a repository and fail them closed to `oc-validating`.
 *
 * Read-only by default; `--apply` performs the bounded label transitions. All
 * GitHub access goes through `gh api` with the caller's GH_TOKEN.
 *
 *   npx --no-install tsx scripts/oc-done-guard.ts --repo owner/name [--apply] [--limit 25] [--target-branch main]
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import {
  DONE_LABEL,
  FULL_SHA,
  VALIDATING_LABEL,
  decide,
  parseReceiptComment,
  transitions,
  type Observation,
  type Receipt,
} from '../src/lib/control-plane/ocDoneGuard';

type Args = { repo: string; targetBranch: string; limit: number; apply: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { repo: process.env.GITHUB_REPOSITORY ?? '', targetBranch: 'main', limit: 25, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--repo') args.repo = argv[++i] ?? '';
    else if (flag === '--target-branch') args.targetBranch = argv[++i] ?? 'main';
    else if (flag === '--limit') args.limit = Number(argv[++i] ?? 25);
    else if (flag === '--apply') args.apply = true;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(args.repo)) throw new Error('Invalid repository');
  if (!Number.isInteger(args.limit) || args.limit < 0) throw new Error('Invalid limit');
  return args;
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
}

function api<T>(path: string, ...extra: string[]): T {
  const out = gh(['api', path, ...extra]);
  return JSON.parse(out.trim() ? out : 'null') as T;
}

type GhIssue = { number: number; state: string; labels: Array<{ name: string }>; pull_request?: unknown };
type GhComment = { body?: string };
type GhTimelineEvent = { event?: string; source?: { issue?: { pull_request?: { merged_at?: string | null; merge_commit_sha?: string | null } } } };

function shaOnTarget(repo: string, target: string): (sha: string) => boolean {
  const cache = new Map<string, boolean>();
  return (sha) => {
    if (!FULL_SHA.test(sha)) return false;
    if (!cache.has(sha)) {
      try {
        const compare = api<{ status?: string }>(`repos/${repo}/compare/${target}...${sha}`);
        cache.set(sha, compare?.status === 'identical' || compare?.status === 'behind');
      } catch {
        cache.set(sha, false);
      }
    }
    return cache.get(sha) ?? false;
  };
}

function observe(repo: string, issue: GhIssue): Observation {
  const comments = api<GhComment[]>(`repos/${repo}/issues/${issue.number}/comments`, '--paginate') ?? [];
  const receipts = comments.map((c) => parseReceiptComment(c.body ?? '')).filter((r): r is Receipt => r !== null);
  const timeline = api<GhTimelineEvent[]>(`repos/${repo}/issues/${issue.number}/timeline`, '--paginate') ?? [];
  const merged = timeline
    .filter((e) => e.event === 'cross-referenced' && e.source?.issue?.pull_request?.merged_at)
    .map((e) => String(e.source?.issue?.pull_request?.merge_commit_sha ?? '').toLowerCase())
    .filter((sha) => FULL_SHA.test(sha));
  return {
    number: issue.number,
    state: issue.state.toLowerCase() === 'closed' ? 'closed' : 'open',
    labels: issue.labels.map((l) => l.name),
    receipts,
    mergedPullRequestShas: merged,
  };
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const issues = (api<GhIssue[]>(`repos/${args.repo}/issues`, '--paginate', '-f', 'state=all', '-f', `labels=${DONE_LABEL}`, '-f', 'per_page=100') ?? [])
    .filter((issue) => !('pull_request' in issue));
  const onTarget = shaOnTarget(args.repo, args.targetBranch);
  const decisions = issues.map((issue) => decide(observe(args.repo, issue), onTarget));
  const refused = transitions(decisions);

  const lines = [`### oc-done guard — ${args.repo}`, '', `claims audited: ${decisions.length}; refused: ${refused.length}`, ''];
  for (const t of refused) lines.push(`- #${t.number}: ${t.reason} ${JSON.stringify(t.evidence)}`);

  let applied = 0;
  if (args.apply) {
    for (const t of refused.slice(0, args.limit)) {
      gh(['issue', 'edit', String(t.number), '--repo', args.repo, '--remove-label', DONE_LABEL, '--add-label', VALIDATING_LABEL]);
      gh(['issue', 'comment', String(t.number), '--repo', args.repo, '--body',
        `[OC-DONE-GUARD] \`${DONE_LABEL}\` withdrawn: ${t.reason} ${JSON.stringify(t.evidence)}. Completion requires a closed issue, a receipt whose full implementation SHA is on \`${args.targetBranch}\`, and changed files or a merged PR. Returned to \`${VALIDATING_LABEL}\`.`]);
      applied++;
    }
    lines.push('', `transitions applied: ${applied} (limit ${args.limit})`);
  }

  const text = lines.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  return 0;
}

process.exit(main());
