import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { atlasOccurrenceEvidenceCalyxHref } from '@/features/atlas-next/calyxHandoff';
import { atlasNextCalyxHref } from '@/features/atlas-next/researchHandoff';
import { classroomCalyxHref } from '@/lib/classroomInvestigationNavigation';
import { atlasWorkspaceCalyxHref, featuredTaxonCalyxHref } from '@/lib/featuredTaxonNavigation';
import { genusProfileCalyxHref } from '@/lib/genusProfileNavigation';
import { speciesDossierCalyxHref } from '@/lib/speciesDossierCalyxNavigation';

/**
 * Keep the disclosure sweep pointed at addresses the product actually emits.
 *
 * e2e/calyx-arrival-disclosure.spec.ts visits one URL per governed producer and
 * asserts none of them arrives at Calyx without telling the reader what it
 * carried. Those URLs are written out literally in the spec, because a browser
 * spec cannot import the producers.
 *
 * Literal URLs rot. A producer that changes its shape would leave the sweep
 * happily testing an address nobody builds any more — still green, and no
 * longer about anything. So each literal is checked here against the producer
 * that is supposed to emit it. If a producer changes, this fails and names the
 * spec to update, instead of the sweep silently going hollow.
 */

const SWEEP_SOURCE = readFileSync(
  new URL('../../e2e/calyx-arrival-disclosure.spec.ts', import.meta.url),
  'utf8',
);

const GENUS = 'Phalaenopsis';
const TAXON = 'Phalaenopsis amabilis';

/** Producers whose whole address this test can rebuild exactly. */
const EXACT_PRODUCERS: ReadonlyArray<{ producer: string; href: string | null }> = [
  { producer: 'homepage featured taxon', href: featuredTaxonCalyxHref(GENUS) },
  { producer: 'Atlas workspace', href: atlasWorkspaceCalyxHref(GENUS) },
  { producer: 'Genus Profile', href: genusProfileCalyxHref(GENUS) },
  { producer: 'Atlas Next genus', href: atlasNextCalyxHref({ genus: GENUS }) },
  {
    producer: 'Species Dossier',
    href: speciesDossierCalyxHref({ taxon: TAXON, genus: GENUS }),
  },
  {
    producer: 'Classroom investigation',
    href: classroomCalyxHref(TAXON, 'Why here?'),
  },
  {
    producer: 'Atlas Next occurrence evidence',
    href: atlasOccurrenceEvidenceCalyxHref(GENUS, 'Where does it live?'),
  },
];

describe('the disclosure sweep visits addresses the producers really build', () => {
  it.each(EXACT_PRODUCERS)('$producer still builds an address', ({ href }) => {
    // A producer that returns null for its own canonical input is broken in a
    // way the sweep cannot see, because the sweep only has the literal.
    expect(href).toBeTruthy();
  });

  it.each(EXACT_PRODUCERS)('$producer matches the URL the sweep visits', ({ producer, href }) => {
    expect(
      SWEEP_SOURCE,
      `${producer} changed its address shape — update e2e/calyx-arrival-disclosure.spec.ts to "${href}"`,
    ).toContain(href!);
  });

  it('covers every producer the sweep claims to cover', () => {
    // Guards the other direction: a producer added to this list but never
    // added to the sweep would otherwise pass both assertions above while
    // going unvisited in a browser.
    for (const { producer } of EXACT_PRODUCERS) {
      expect(SWEEP_SOURCE, `${producer} is pinned here but not swept`).toContain(producer);
    }
  });

  it('names the Research Station arrival, which carries no declaration of its own', () => {
    // Research Station uses `taxon_is_evidence` inside the turn envelope rather
    // than a `context_is_evidence` query parameter, so its address is built by
    // a different contract and is asserted by presence, not by rebuild.
    expect(SWEEP_SOURCE).toContain('origin=research-station');
    expect(SWEEP_SOURCE).toContain('Research Station');
  });
});
