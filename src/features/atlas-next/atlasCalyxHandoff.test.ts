import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCalyxRouteContext } from '@/lib/calyxConversation';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/features/atlas-next/OccurrenceCard.tsx'), 'utf8');

describe('Atlas Next → Calyx handoff', () => {
  it('hands the selected occurrence genus into the existing bounded Calyx route contract', () => {
    expect(SOURCE).toContain("/calyx?genus=${encodeURIComponent(calyxGenus)}&origin=atlas-next");
    expect(SOURCE).toContain('Continue {calyxGenus} in Calyx');

    const route = parseCalyxRouteContext('?genus=Laelia&origin=atlas-next');
    expect(route).toEqual({
      origin: 'atlas-next',
      featuredTaxon: { rank: 'genus', name: 'Laelia' },
    });
  });

  it('does not pass occurrence coordinates or locality text through the Calyx URL', () => {
    const handoffLine = SOURCE.split('\n').find((line) => line.includes('/calyx?genus=')) ?? '';
    expect(handoffLine).not.toContain('lat');
    expect(handoffLine).not.toContain('lng');
    expect(handoffLine).not.toContain('locality');
    expect(handoffLine).not.toContain('occurrenceId');
  });
});
