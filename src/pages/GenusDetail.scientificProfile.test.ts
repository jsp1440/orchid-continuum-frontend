import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Source-integrity guard: the Genus Profile page must mount the canonical
 * featured-genus-profile/v1 exhibit in BOTH of its branches — the curated
 * field-guide entry and the no-curated-entry fallback — using the verified
 * genus identity in each case.
 */

const source = readFileSync(new URL('./GenusDetail.tsx', import.meta.url), 'utf8');

describe('GenusDetail scientific profile mount (source integrity)', () => {
  it('imports the canonical exhibit component', () => {
    expect(source).toContain(
      "import GenusScientificProfile from '@/components/orchid/GenusScientificProfile';",
    );
  });

  it('mounts the exhibit for curated entries with the verified genus', () => {
    expect(source).toContain('<GenusScientificProfile genus={entry.genus} />');
  });

  it('mounts the exhibit for genera without a curated entry, guarded by name', () => {
    expect(source).toContain('{name && (');
    expect(source).toContain('<GenusScientificProfile genus={name} />');
  });
});
