import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ATLAS_NEXT_CALYX_ORIGIN,
  atlasNextCalyxHref,
} from '@/features/atlas-next/researchHandoff';
import { rejectsCalyxNavigationContext } from '@/lib/calyxRouteTrustBoundary';
import { atlasChecklistCalyxHref, ATLAS_CHECKLIST_LAYER_ORIGIN, MAX_ATLAS_CALYX_QUESTION_CHARACTERS } from '@/features/atlas-next/calyxHandoff';
import { buildCalyxTurnContext, parseCalyxRouteContext } from '@/lib/calyxConversation';
import {
  ATLAS_WORKSPACE_ORIGIN,
  FEATURED_TAXON_ORIGIN,
  atlasWorkspaceCalyxHref,
  featuredTaxonCalyxHref,
} from '@/lib/featuredTaxonNavigation';
import { GENUS_PROFILE_ORIGIN, genusProfileCalyxHref } from '@/lib/genusProfileNavigation';

const routeSource = readFileSync(
  resolve(process.cwd(), 'src/components/calyx/AtlasAwareCalyxRoute.tsx'),
  'utf8',
);
const genusProfileSource = readFileSync(resolve(process.cwd(), 'src/pages/GenusDetail.tsx'), 'utf8');

describe('Calyx governed genus route trust boundary', () => {
  it('accepts the canonical Atlas workspace, featured-taxon, Genus Profile, and Atlas Next producers', () => {
    expect(rejectsCalyxNavigationContext(new URL(atlasWorkspaceCalyxHref('Phalaenopsis'), 'https://orchidcontinuum.org').search)).toBe(false);
    expect(rejectsCalyxNavigationContext(new URL(featuredTaxonCalyxHref('Phalaenopsis'), 'https://orchidcontinuum.org').search)).toBe(false);
    expect(rejectsCalyxNavigationContext(new URL(genusProfileCalyxHref('Phalaenopsis'), 'https://orchidcontinuum.org').search)).toBe(false);
    expect(rejectsCalyxNavigationContext(new URL(atlasNextCalyxHref({ genus: 'Phalaenopsis' })!, 'https://orchidcontinuum.org').search)).toBe(false);
  });

  it.each([
    ATLAS_WORKSPACE_ORIGIN,
    FEATURED_TAXON_ORIGIN,
    GENUS_PROFILE_ORIGIN,
    ATLAS_NEXT_CALYX_ORIGIN,
  ])(
    'rejects %s when the non-evidence declaration is missing or promoted',
    (origin) => {
      expect(rejectsCalyxNavigationContext(`?genus=Phalaenopsis&origin=${origin}`)).toBe(true);
      expect(
        rejectsCalyxNavigationContext(
          `?genus=Phalaenopsis&origin=${origin}&context_is_evidence=true`,
        ),
      ).toBe(true);
    },
  );

  it.each(['taxon', 'species', 'subject_id', 'record_id', 'project_id'])(
    'rejects a governed genus arrival that also carries conflicting %s identity',
    (key) => {
      expect(
        rejectsCalyxNavigationContext(
          `?genus=Phalaenopsis&origin=${FEATURED_TAXON_ORIGIN}&context_is_evidence=false&${key}=Phalaenopsis%20aphrodite`,
        ),
      ).toBe(true);
    },
  );

  it('accepts legitimate Research Station genus-only and matching exact-species arrivals', () => {
    expect(
      rejectsCalyxNavigationContext('?genus=Phalaenopsis&origin=research-station'),
    ).toBe(false);
    expect(
      rejectsCalyxNavigationContext(
        '?genus=Phalaenopsis&taxon=Phalaenopsis%20amabilis&origin=research-station',
      ),
    ).toBe(false);
    expect(
      rejectsCalyxNavigationContext('?taxon=canonical%3Ataxon%3A123&origin=research-station'),
    ).toBe(false);
  });

  it.each([
    '?genus=Phalaenopsis&taxon=&origin=research-station',
    '?genus=Phalaenopsis&taxon=%2Fetc%2Fpasswd&origin=research-station',
    '?genus=Paphiopedilum&taxon=Phalaenopsis%20amabilis&origin=research-station',
    '?genus=Phalaenopsis&taxon=canonical%3Ataxon%3A123&origin=research-station',
  ])('rejects malformed or contradictory Research Station exact identity: %s', (search) => {
    expect(rejectsCalyxNavigationContext(search)).toBe(true);
  });

  it('does not reinterpret unrelated governed adapters through this generic boundary', () => {
    expect(
      rejectsCalyxNavigationContext(
        '?genus=Phalaenopsis&origin=research-station&context_is_evidence=true',
      ),
    ).toBe(false);
    expect(
      rejectsCalyxNavigationContext('?genus=Phalaenopsis&origin=atlas-next-occurrence-evidence'),
    ).toBe(false);
  });

  it('is mounted before the Calyx workspace can consume a tampered route', () => {
    expect(routeSource).toContain('rejectsCalyxNavigationContext(location.search)');
    expect(routeSource).toContain('if (rejectedNavigationContext)');
    expect(routeSource.indexOf('if (rejectedNavigationContext)')).toBeLessThan(
      routeSource.search(/<CalyxWorkspace\b/),
    );
    expect(routeSource).toContain('Open Calyx without carried context');
  });

  it('mounts the direct Genus Profile producer on the live cross-Continuum action', () => {
    expect(genusProfileSource).toContain('genusProfileCalyxHref');
    expect(genusProfileSource).toContain("{ label: 'Ask Calyx', to: genusProfileCalyxHref(genus) }");
  });
});


const CHECKLIST_QUESTION = 'Which orchids grow in the synthetic area?';
function checklistParams() {
  return new URL(atlasChecklistCalyxHref(CHECKLIST_QUESTION)!, 'https://orchidcontinuum.org').searchParams;
}

function expectRejectedChecklist(params: URLSearchParams) {
  const search = `?${params}`;
  expect(rejectsCalyxNavigationContext(search)).toBe(true);
  expect(buildCalyxTurnContext({ projectId: '', uploadedFiles: [], routeSearch: search }).route_context).toBeUndefined();
}

describe('Atlas checklist question-only route contract', () => {
  it.each([CHECKLIST_QUESTION, 'Where does Synthetic example grow?', 'q'.repeat(MAX_ATLAS_CALYX_QUESTION_CHARACTERS)])(
    'admits the actual producer and retains its non-evidence question downstream: %s', (question) => {
      const search = new URL(atlasChecklistCalyxHref(question)!, 'https://orchidcontinuum.org').search;
      expect(rejectsCalyxNavigationContext(search)).toBe(false);
      expect(parseCalyxRouteContext(search)).toEqual({
        origin: ATLAS_CHECKLIST_LAYER_ORIGIN, featuredTaxon: null,
        questionContext: { question, question_source: 'user', question_is_evidence: false },
      });
      expect(buildCalyxTurnContext({ projectId: '', uploadedFiles: [], routeSearch: search }).route_context).toEqual({
        origin: ATLAS_CHECKLIST_LAYER_ORIGIN, featured_taxon: undefined,
        question, question_source: 'user', question_is_evidence: false,
      });
    },
  );

  it.each(['genus', 'taxon', 'species', 'subject_id', 'project_id', 'conversation_id', 'occurrence_id', 'record_id', 'latitude', 'longitude', 'locality', 'evidence', 'confidence', 'conclusion', 'citation', 'provenance', 'context_is_evidence', 'unexpected'])(
    'rejects an extra %s key, including otherwise valid genus identity', (key) => {
      const params = checklistParams();
      params.set(key, key === 'genus' ? 'Phalaenopsis' : 'synthetic-value');
      expectRejectedChecklist(params);
    },
  );

  it.each(['origin', 'question', 'question_source', 'question_is_evidence'])(
    'rejects duplicate %s even when the values agree', (key) => {
      const params = checklistParams();
      params.append(key, params.get(key)!);
      expectRejectedChecklist(params);
    },
  );

  it.each(['origin', 'question', 'question_source', 'question_is_evidence'])(
    'rejects missing %s instead of admitting partial provenance', (key) => {
      const params = checklistParams();
      params.delete(key);
      expectRejectedChecklist(params);
    },
  );

  it.each([
    ['question', ''], ['question', '   '], ['question', 'q'.repeat(MAX_ATLAS_CALYX_QUESTION_CHARACTERS + 1)],
    ['question_source', 'backend'], ['question_source', 'USER'],
    ['question_is_evidence', 'true'], ['question_is_evidence', 'FALSE'],
  ])('rejects malformed %s=%s', (key, value) => {
    const params = checklistParams();
    params.set(key, value);
    expectRejectedChecklist(params);
  });

  it.each([true, false])('rejects conflicting origin duplicates regardless of order (%s)', (checklistFirst) => {
    const params = checklistParams();
    params.delete('origin');
    for (const origin of checklistFirst ? [ATLAS_CHECKLIST_LAYER_ORIGIN, 'legacy'] : ['legacy', ATLAS_CHECKLIST_LAYER_ORIGIN]) params.append('origin', origin);
    expectRejectedChecklist(params);
  });
});
