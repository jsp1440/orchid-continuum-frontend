import { readFileSync } from 'node:fs';
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
});
