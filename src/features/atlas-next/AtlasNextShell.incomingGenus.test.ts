import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const shell = fs.readFileSync(
  path.resolve(process.cwd(), 'src/features/atlas-next/AtlasNextShell.tsx'),
  'utf8',
);

describe('Atlas Next canonical incoming genus wiring', () => {
  it('hydrates the shell subject from the shared Atlas filter contract', () => {
    expect(shell).toContain("const { filters, setFilters } = useAtlasFilters();");
    expect(shell).toContain('resolveAtlasNextIncomingGenus(filters.genera');
    expect(shell).toContain('useState<string | null>(() => incomingGenus)');
    expect(shell).toContain('setGenus(incomingGenus)');
  });

  it('keeps manual genus selection on the same shared URL/filter contract', () => {
    expect(shell).toContain('genera: v ? [v] : undefined');
  });

  it('uses the hydrated genus for the mounted Research continuation', () => {
    expect(shell).toContain('atlasNextResearchHref({ genus })');
    expect(shell).toContain('Continue in Research Station');
  });
});
