// actions/upload-artifact v4.4+ excludes hidden files and directories by
// default. The settle job uploaded `.oc-receipts/*.json` without
// `include-hidden-files: true`, so the receipt was silently dropped and the
// audit reported "Admitted graph plan and actual lane receipts diverged" for a
// lane that had written one (run 36230834756). This parses every workflow and
// composite action and refuses any upload whose path enters a dot-directory
// without the flag.
//
// A path written as an expression is resolved, not skipped: `${{ env.X }}` is
// looked up in step, then job, then workflow `env`, as Actions does. Any
// expression that cannot be resolved statically fails the test, because an
// unreadable path is one this guard cannot vouch for.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

type Env = Record<string, unknown> | undefined;
type Step = { name?: string; uses?: string; with?: Record<string, unknown>; env?: Env };
type Workflow = { env?: Env; jobs?: Record<string, { env?: Env; steps?: Step[] }> };
type Action = { runs?: { using?: string; steps?: Step[] } };
type Upload = { where: string; paths: string[]; unresolved: string[]; includesHidden: boolean };

const HAS_EXPRESSION = /\$\{\{/;
const EXPRESSION = /\$\{\{\s*([^}]*?)\s*\}\}/g;
const ENV_REFERENCE = /^env\.([A-Za-z_][A-Za-z0-9_]*)$/;

/** Resolve `${{ env.X }}` against the given scopes, innermost first; report anything else. */
function resolvePath(raw: string, scopes: Env[]): { value: string; unresolved: string[] } {
  const unresolved: string[] = [];
  let value = raw;
  // Bounded: an env value may itself reference env, but never indefinitely.
  for (let depth = 0; depth < 5 && HAS_EXPRESSION.test(value) && unresolved.length === 0; depth++) {
    value = value.replace(EXPRESSION, (whole, body: string) => {
      const name = ENV_REFERENCE.exec(body)?.[1];
      const scope = name === undefined ? undefined : scopes.find(env => env !== undefined && Object.prototype.hasOwnProperty.call(env, name));
      if (name === undefined || scope === undefined) { unresolved.push(whole); return whole; }
      return String(scope[name]);
    });
  }
  // Still an expression after the bound, or one the pattern could not even parse.
  if (unresolved.length === 0 && HAS_EXPRESSION.test(value)) unresolved.push(value);
  return { value, unresolved };
}
function uploadsFromSteps(steps: Step[], where: string, outer: Env[]): Upload[] {
  return steps.filter(step => step.uses?.startsWith('actions/upload-artifact@')).map(step => {
    const resolved = resolvePath(String(step.with?.path ?? ''), [step.env, ...outer]);
    return { where: `${where}:${step.name ?? step.with?.name}`,
      paths: resolved.value.split('\n').map(line => line.trim()).filter(Boolean),
      unresolved: resolved.unresolved, includesHidden: step.with?.['include-hidden-files'] === true };
  });
}
function uploadsInWorkflow(workflow: Workflow, file: string): Upload[] {
  return Object.entries(workflow.jobs ?? {}).flatMap(([job, { env, steps = [] }]) =>
    uploadsFromSteps(steps, `${file}:${job}`, [env, workflow.env]));
}
function uploadsInAction(action: Action, file: string): Upload[] {
  return uploadsFromSteps(action.runs?.steps ?? [], file, []);
}
/** Every `action.yml` / `action.yaml` under `root`; nothing when `root` does not exist. */
function compositeActionFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter(file => /(^|\/)action\.ya?ml$/.test(file)).map(file => join(root, file)).sort();
}
// A path segment that starts with a dot, other than `.` / `..` themselves.
const entersHiddenDirectory = (path: string) => path.split('/').some(segment => /^\.[^./]/.test(segment));
function violations(uploads: Upload[]) {
  return uploads.flatMap(upload => [
    ...upload.unresolved.map(expression => `${upload.where}: unresolvable path expression ${expression}`),
    ...(upload.paths.some(entersHiddenDirectory) && !upload.includesHidden ? [`${upload.where}: hidden path without include-hidden-files: true`] : []),
  ]);
}

const workflowDir = '.github/workflows';
const repositoryUploads = () => [
  ...readdirSync(workflowDir).filter(file => /\.ya?ml$/.test(file)).sort()
    .flatMap(file => uploadsInWorkflow(yaml.load(readFileSync(join(workflowDir, file), 'utf8')) as Workflow, file)),
  ...compositeActionFiles('.github/actions')
    .flatMap(file => uploadsInAction(yaml.load(readFileSync(file, 'utf8')) as Action, file)),
];

describe('artifact uploads keep hidden receipt directories', () => {
  const all = repositoryUploads();

  it('finds the uploads it is meant to police', () => {
    // Parsing silently finding nothing would make the next assertions vacuous.
    expect(all.filter(u => u.paths.some(p => p.startsWith('.oc-'))).length).toBeGreaterThanOrEqual(6);
  });

  it('sets include-hidden-files: true on every upload of an .oc-* path', () => {
    expect(all.filter(u => u.paths.some(p => p.startsWith('.oc-')) && !u.includesHidden).map(u => u.where)).toEqual([]);
  });

  it('has no hidden upload without the flag and no path it cannot resolve', () => {
    expect(violations(all)).toEqual([]);
  });

  it('recognises a hidden segment anywhere in the path, and nothing else', () => {
    expect(['.oc-receipts/*.json', 'e2e/.artifacts/', '.oc-wave/plan.json'].every(entersHiddenDirectory)).toBe(true);
    expect(['artifacts/', 'playwright-report/', './dist', '../x', 'docs/evidence/atlas-next'].some(entersHiddenDirectory)).toBe(false);
  });
});

// Negative controls: each shape below hides the defect from a literal-path
// check. Each must be reported, and the flag must satisfy it.
describe('the guard cannot be bypassed by indirection', () => {
  const upload = (path: string, extra: Record<string, unknown> = {}, env?: Env): Step =>
    ({ name: 'up', uses: 'actions/upload-artifact@sha', with: { name: 'n', path, ...extra }, env });

  it.each([
    ['step', { jobs: { settle: { steps: [upload('${{ env.RECEIPTS }}', {}, { RECEIPTS: '.oc-receipts/*.json' })] } } }],
    ['job', { jobs: { settle: { env: { RECEIPTS: '.oc-receipts/*.json' }, steps: [upload('${{env.RECEIPTS}}')] } } }],
    ['workflow', { env: { RECEIPTS: '.oc-receipts/*.json' }, jobs: { settle: { steps: [upload('${{ env.RECEIPTS }}')] } } }],
    ['nested', { env: { BASE: '.oc-receipts', RECEIPTS: '${{ env.BASE }}/*.json' }, jobs: { settle: { steps: [upload('${{ env.RECEIPTS }}')] } } }],
  ] as Array<[string, Workflow]>)('resolves a %s-level env path and flags it without the flag', (_level, workflow) => {
    const uploads = uploadsInWorkflow(workflow, 'synthetic.yml');
    expect(uploads[0].paths).toEqual(['.oc-receipts/*.json']);
    expect(violations(uploads)).toEqual(['synthetic.yml:settle:up: hidden path without include-hidden-files: true']);
    const fixed = structuredClone(workflow);
    for (const job of Object.values(fixed.jobs ?? {})) for (const step of job.steps ?? []) step.with!['include-hidden-files'] = true;
    expect(violations(uploadsInWorkflow(fixed, 'synthetic.yml'))).toEqual([]);
  });

  it('lets the innermost env win, as Actions does', () => {
    const workflow: Workflow = { env: { DIR: 'artifacts' }, jobs: { j: { steps: [upload('${{ env.DIR }}', {}, { DIR: '.oc-wave' })] } } };
    expect(uploadsInWorkflow(workflow, 'w.yml')[0].paths).toEqual(['.oc-wave']);
  });

  it.each([
    '${{ inputs.receipts_dir }}',
    '${{ env.UNDEFINED_ANYWHERE }}',
    "${{ format('{0}/x', env.DIR) }}",
    'prefix/${{ steps.dir.outputs.path }}/x',
  ])('fails closed on a path expression it cannot resolve: %s', path => {
    const uploads = uploadsInWorkflow({ env: { DIR: '.oc-wave' }, jobs: { j: { steps: [upload(path, { 'include-hidden-files': true })] } } }, 'w.yml');
    expect(violations(uploads)).toEqual([expect.stringContaining('unresolvable path expression')]);
  });

  it('fails closed on a self-referencing env that never resolves', () => {
    const uploads = uploadsInWorkflow({ env: { A: '${{ env.A }}' }, jobs: { j: { steps: [upload('${{ env.A }}')] } } }, 'w.yml');
    expect(violations(uploads)).toEqual([expect.stringContaining('unresolvable path expression')]);
  });

  it('scans composite actions, and is a no-op when there are none', () => {
    const action: Action = { runs: { using: 'composite', steps: [upload('.oc-receipts/*.json')] } };
    expect(violations(uploadsInAction(action, '.github/actions/receipts/action.yml')))
      .toEqual(['.github/actions/receipts/action.yml:up: hidden path without include-hidden-files: true']);
    expect(compositeActionFiles('.github/actions-that-do-not-exist')).toEqual([]);
    expect(compositeActionFiles('.github/workflows')).toEqual([]);
  });

  it('discovers nested action.yml files on disk and reads their uploads', () => {
    const root = mkdtempSync(join(tmpdir(), 'oc-actions-'));
    try {
      mkdirSync(join(root, 'receipts', 'inner'), { recursive: true });
      writeFileSync(join(root, 'receipts', 'inner', 'action.yml'),
        'runs:\n  using: composite\n  steps:\n    - name: up\n      uses: actions/upload-artifact@sha\n      with:\n        path: .oc-receipts/*.json\n');
      const files = compositeActionFiles(root);
      expect(files).toEqual([join(root, 'receipts', 'inner', 'action.yml')]);
      expect(violations(files.flatMap(file => uploadsInAction(yaml.load(readFileSync(file, 'utf8')) as Action, file))))
        .toEqual([`${files[0]}:up: hidden path without include-hidden-files: true`]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
