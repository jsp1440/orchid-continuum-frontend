import { describe, expect, it } from 'vitest';

import { resolveCultivatedIdentity } from './cultivatedTaxonIdentity';
import { speciesOfStoredIdentity } from '../../e2e/support/species-of-stored-identity.mjs';

/**
 * The client decides what to show the grower; the server decides which
 * published requirements to look up. Both start from the same stored string,
 * so both have to reduce it to the same species or the product lies: the
 * dossier names a species the assessment then reports no requirements for.
 *
 * They drifted once. The client learned the shorthands growers actually write
 * on labels — `Phrag. kovachii 'Daniela' x 'Maria'` — and the reference
 * backend did not, so that plant resolved on screen and found nothing on the
 * server. This test is what makes the next drift a failing build instead of a
 * bug someone has to notice.
 *
 * Parity is asserted over the string, not over one worked example. A case that
 * only exercises AM1 would pass while every other label form diverged.
 */

const speciesPerClient = (stored: string): string | null =>
  resolveCultivatedIdentity(stored)?.species ?? null;

const speciesPerServer = (stored: string): string | null =>
  speciesOfStoredIdentity(stored) as string | null;

/** Label forms a real collection contains, and the forms that must be refused. */
const LABEL_FORMS: readonly string[] = [
  // Fully written out.
  'Phragmipedium kovachii',
  "Phragmipedium kovachii 'Daniela' × Phragmipedium kovachii 'Maria'",
  "Phragmipedium kovachii 'Daniela' x Phragmipedium kovachii 'Maria'",
  // Shorthands: the genus abbreviated, repeated parts left implicit.
  "Phrag. kovachii 'Daniela' × 'Maria'",
  "Phrag kovachii 'Daniela' x 'Maria'",
  "Phragmipedium kovachii 'Daniela' × kovachii 'Maria'",
  "Phragmipedium kovachii ('Daniela' × 'Maria')",
  "Paph. rothschildianum 'A' x 'B'",
  "Phal. amabilis 'One'",
  // Genuinely unresolvable — a species-level answer here would be a fabrication.
  'Phragmipedium besseae × kovachii',
  "kovachii 'Daniela' x kovachii 'Maria'",
  'kovachii',
  "'Daniela' × 'Maria'",
  'Phragmipedium',
  '',
  '   ',
  // Adversarial: the reduction must not be talked into a species by punctuation.
  'Phragmipedium kovachii × Phalaenopsis amabilis',
  'Phragmipedium kovachii × Phragmipedium besseae × Phragmipedium schlimii',
  '(Phragmipedium kovachii)',
  'Phragmipedium kovachii ()',
  'PHRAGMIPEDIUM KOVACHII',
  'phragmipedium kovachii',
  'Phragmipedium kovachii <script>',
  'Phragmipedium kovachii {}',
  'Phragmipedium kovachii'.padEnd(300, 'a'),
  // Curly quotes are what a word processor turns a typed apostrophe into.
  'Phragmipedium kovachii \u2018Daniela\u2019 \u00d7 \u2018Maria\u2019',
  // Every abbreviation the client knows, since an abbreviation the server has
  // not learned resolves on screen and finds nothing in the requirements table.
  "Catt. labiata 'A' \u00d7 'B'",
  "C. labiata 'A' \u00d7 'B'",
  "Den. nobile 'A' \u00d7 'B'",
  "Onc. sphacelatum 'A' \u00d7 'B'",
  "Masd. veitchiana 'A' \u00d7 'B'",
  "Bulb. lobbii 'A' \u00d7 'B'",
  "Paph. rothschildianum 'A' \u00d7 'B'",
  "Phal. amabilis 'A' \u00d7 'B'",
  "Phrag. kovachii 'A' \u00d7 'B'",
  // Bracketed lines mean two different things, and both are in this collection.
  // A grex with its parentage must reduce the same way on both sides, or a
  // hybrid resolves on screen and finds another species' bounds on the server.
  'Phrag. Ingrid Suarez Ecuagenera (humboldtii \u00d7 kovachii)',
  'Phrag. Ingrid Suarez (kovachii \u00d7 kovachii)',
  'Phragmipedium kovachii (humboldtii \u00d7 besseae)',
  'Phragmipedium besseae (dalessandroi \u00d7 besseae)',
  "Phragmipedium kovachii ('Daniela' \u00d7 'Maria')",
  'Phragmipedium kovachii (humboldtii)',
  'Phragmipedium kovachii ()',
  // Capitalisation is the only thing separating a species from a grex.
  'Phrag Kovachii',
  'Phragmipedium Kovachii',
  'Phragmipedium Memoria Dick Clements',
  // Provenance written onto the tag is not part of the name.
  'Phrag. kovachii Ecuagenera',
];

describe('stored identity reduces the same way on both sides of the contract', () => {
  it.each(LABEL_FORMS)('agrees on %j', (stored) => {
    expect(speciesPerServer(stored)).toBe(speciesPerClient(stored));
  });

  it('agrees that the acceptance specimen is Phragmipedium kovachii', () => {
    const am1 = "Phragmipedium kovachii 'Daniela' × Phragmipedium kovachii 'Maria'";
    expect(speciesPerClient(am1)).toBe('Phragmipedium kovachii');
    expect(speciesPerServer(am1)).toBe('Phragmipedium kovachii');
  });

  it('agrees that a cross between two species resolves to neither', () => {
    const bigeneric = 'Phragmipedium besseae × Phragmipedium kovachii';
    expect(speciesPerClient(bigeneric)).toBeNull();
    expect(speciesPerServer(bigeneric)).toBeNull();
  });

  it('never lets the server resolve a species the client refused', () => {
    // Asymmetry in this direction is the dangerous one: the client would show
    // the grower that nothing can be looked up while the server quietly
    // returned some other plant's published bounds.
    for (const stored of LABEL_FORMS) {
      if (speciesPerClient(stored) === null) {
        expect(speciesPerServer(stored)).toBeNull();
      }
    }
  });
});
