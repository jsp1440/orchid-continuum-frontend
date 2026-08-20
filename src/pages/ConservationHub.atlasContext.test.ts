import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/pages/ConservationHub.tsx'), 'utf8');

describe('ConservationHub Atlas evidence handoff', () => {
  it('consumes only bounded genus-level context from the Atlas occurrence workflow', () => {
    expect(source).toContain("useSearchParams");
    expect(source).toContain("searchParams.get('genus')");
    expect(source).toContain("searchParams.get('origin') === 'atlas-next-occurrence-evidence'");
    expect(source).toContain('const genus = boundedGenus');
    expect(source).toContain('Atlas evidence handoff');
    expect(source).toContain('precise coordinates, locality, and occurrence identifiers remain in Atlas');
  });

  it('does not consume precise Atlas record fields from the conservation URL', () => {
    for (const field of ['lat', 'lng', 'latitude', 'longitude', 'locality', 'occurrenceId', 'occurrence_id', 'recordId']) {
      expect(source).not.toContain(`searchParams.get('${field}')`);
      expect(source).not.toContain(`searchParams.get("${field}")`);
    }
  });

  it('fails closed for malformed or oversized genus values', () => {
    expect(source).toContain("genus.length > 80");
    expect(source).toContain("/^[A-Za-z][A-Za-z .'-]*$/");
    expect(source).toContain('fromAtlasEvidence && genus');
  });
});
