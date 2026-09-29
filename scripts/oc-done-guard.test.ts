import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./oc-done-guard.ts', import.meta.url)),
  'utf8',
);

describe('oc-done guard inventory request', () => {
  it('pins the paginated issue inventory to GET query semantics', () => {
    const inventoryCall = source.match(
      /const issues = \(api<GhIssue\[]>\(([\s\S]*?)\) \?\? \[\]\)/,
    )?.[1];

    expect(inventoryCall).toBeDefined();
    expect(inventoryCall).toContain("'--method', 'GET'");
    expect(inventoryCall).toContain("'--paginate'");
    expect(inventoryCall).toContain("'state=all'");
    expect(inventoryCall).toContain(`labels=\${DONE_LABEL}`);
    expect(inventoryCall).toContain("'per_page=100'");
    expect(inventoryCall?.indexOf("'--method', 'GET'")).toBeLessThan(
      inventoryCall?.indexOf("'--paginate'") ?? -1,
    );
  });

  it('reaches the audit summary in report-only mode', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'oc-done-guard-'));
    const fakeGh = join(sandbox, 'gh');
    writeFileSync(
      fakeGh,
      `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] !== 'api' || args[1] !== 'repos/acme/widgets/issues') process.exit(2);
const method = args.indexOf('--method');
if (method < 0 || args[method + 1] !== 'GET') process.exit(3);
process.stdout.write('[]');
`,
      'utf8',
    );
    chmodSync(fakeGh, 0o755);

    try {
      const runner = fileURLToPath(
        new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url),
      );
      const result = spawnSync(
        process.execPath,
        [
          runner,
          fileURLToPath(new URL('./oc-done-guard.ts', import.meta.url)),
          '--repo',
          'acme/widgets',
          '--target-branch',
          'oc-autonomous-integration',
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${sandbox}:${process.env.PATH ?? ''}`,
          },
        },
      );

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('### oc-done guard — acme/widgets');
      expect(result.stdout).toContain('claims audited: 0; refused: 0');
      expect(result.stdout).not.toContain('transitions applied');
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
