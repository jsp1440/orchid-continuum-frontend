// actions/upload-artifact v4.4+ excludes hidden files and directories by
// default. The settle job uploaded `.oc-receipts/*.json` without
// `include-hidden-files: true`, so the receipt was silently dropped and the
// audit reported "Admitted graph plan and actual lane receipts diverged" for a
// lane that had written one (run 36230834756). This parses every workflow and
// refuses any upload whose path enters a dot-directory without the flag.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

type Step = { name?: string; uses?: string; with?: Record<string, unknown> };
type Workflow = { jobs?: Record<string, { steps?: Step[] }> };

const dir = '.github/workflows';
const files = readdirSync(dir).filter(file => /\.ya?ml$/.test(file)).sort();

function uploads() {
  return files.flatMap(file => {
    const workflow = yaml.load(readFileSync(join(dir, file), 'utf8')) as Workflow;
    return Object.entries(workflow.jobs ?? {}).flatMap(([job, { steps = [] }]) => steps
      .filter(step => step.uses?.startsWith('actions/upload-artifact@'))
      .map(step => ({ where: `${file}:${job}:${step.name ?? step.with?.name}`, step,
        paths: String(step.with?.path ?? '').split('\n').map(line => line.trim()).filter(Boolean) })));
  });
}
// A path segment that starts with a dot, other than `.` / `..` themselves.
const entersHiddenDirectory = (path: string) => path.split('/').some(segment => /^\.[^./]/.test(segment));

describe('artifact uploads keep hidden receipt directories', () => {
  const all = uploads();

  it('finds the uploads it is meant to police', () => {
    // Parsing silently finding nothing would make the next assertion vacuous.
    expect(all.filter(u => u.paths.some(p => p.startsWith('.oc-'))).length).toBeGreaterThanOrEqual(6);
  });

  it('sets include-hidden-files: true on every upload of an .oc-* path', () => {
    const missing = all.filter(u => u.paths.some(p => p.startsWith('.oc-')) && u.step.with?.['include-hidden-files'] !== true);
    expect(missing.map(u => u.where)).toEqual([]);
  });

  it('sets include-hidden-files: true on every upload that enters any dot-directory', () => {
    const missing = all.filter(u => u.paths.some(entersHiddenDirectory) && u.step.with?.['include-hidden-files'] !== true);
    expect(missing.map(u => u.where)).toEqual([]);
  });

  it('recognises a hidden segment anywhere in the path, and nothing else', () => {
    expect(['.oc-receipts/*.json', 'e2e/.artifacts/', '.oc-wave/plan.json'].every(entersHiddenDirectory)).toBe(true);
    expect(['artifacts/', 'playwright-report/', './dist', '../x', 'docs/evidence/atlas-next'].some(entersHiddenDirectory)).toBe(false);
  });
});
