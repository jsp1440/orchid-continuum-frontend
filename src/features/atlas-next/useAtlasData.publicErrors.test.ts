import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(process.cwd(), 'src/features/atlas-next/useAtlasData.ts'),
  'utf8',
);

describe('Atlas Next public load-error boundary', () => {
  it('keeps raw transport exceptions out of public unavailable state', () => {
    expect(SOURCE).toContain("console.error('[Atlas Next] occurrence load failed', error)");
    expect(SOURCE).toContain('No distribution inference has been substituted.');
    expect(SOURCE).not.toContain('error instanceof Error ? error.message');
    expect(SOURCE).not.toContain('e instanceof Error ? e.message');
  });
});
