import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ATLAS_WORKSPACE_ORIGIN,
  atlasWorkspaceResearchHref,
} from '@/lib/featuredTaxonNavigation';
import { parseResearchRouteContext } from '@/lib/researchRouteContext';

const navbarSource = readFileSync(
  resolve(process.cwd(), 'src/components/orchid/Navbar.tsx'),
  'utf8',
);
const researchSource = readFileSync(
  resolve(process.cwd(), 'src/pages/ResearchCenter.tsx'),
  'utf8',
);

describe('Atlas workspace → Research genus continuity', () => {
  it('emits only bounded navigation context and round-trips it as non-evidence', () => {
    const href = atlasWorkspaceResearchHref('Phalaenopsis');
    const url = new URL(href, 'https://orchid-continuum.invalid');

    expect(url.pathname).toBe('/research');
    expect(url.searchParams.get('genus')).toBe('Phalaenopsis');
    expect(url.searchParams.get('origin')).toBe(ATLAS_WORKSPACE_ORIGIN);
    expect(url.searchParams.get('context_is_evidence')).toBe('false');
    expect([...url.searchParams.keys()].sort()).toEqual(
      ['context_is_evidence', 'genus', 'origin'].sort(),
    );

    expect(parseResearchRouteContext(url.search)).toEqual({
      origin: ATLAS_WORKSPACE_ORIGIN,
      genus: 'Phalaenopsis',
      projectId: null,
      contextIsEvidence: false,
    });
  });

  it('fails closed if canonical Atlas context is not explicitly non-evidentiary', () => {
    expect(
      parseResearchRouteContext('?genus=Phalaenopsis&origin=atlas-workspace'),
    ).toBeNull();
    expect(
      parseResearchRouteContext(
        '?genus=Phalaenopsis&origin=atlas-workspace&context_is_evidence=true',
      ),
    ).toBeNull();
  });

  it('does not admit locality or occurrence material even when appended by a hostile URL', () => {
    const href = `${atlasWorkspaceResearchHref('Phalaenopsis')}&lat=34.1&lng=-120.4&locality=secret&occurrence_id=123&collector=someone&catalogue_number=ABC`;
    const parsed = parseResearchRouteContext(new URL(href, 'https://orchid-continuum.invalid').search);

    expect(parsed).toEqual({
      origin: ATLAS_WORKSPACE_ORIGIN,
      genus: 'Phalaenopsis',
      projectId: null,
      contextIsEvidence: false,
    });
    expect(Object.keys(parsed ?? {})).toEqual([
      'origin',
      'genus',
      'projectId',
      'contextIsEvidence',
    ]);
  });

  it('mounts the handoff in site navigation when Atlas holds exactly one genus', () => {
    expect(navbarSource).toContain('atlasWorkspaceResearchHref');
    expect(navbarSource).toContain(
      "l.route === '/research' && atlasGenus) navigate(atlasWorkspaceResearchHref(atlasGenus))",
    );
  });

  it('attributes both Atlas implementations to Atlas, never to Genus of the Day', () => {
    expect(researchSource).toContain("import { ATLAS_WORKSPACE_ORIGIN } from '@/lib/featuredTaxonNavigation';");
    expect(researchSource).toContain('routeContext?.origin === ATLAS_WORKSPACE_ORIGIN');
    expect(researchSource).toContain("? 'Continuing from the Atlas'");
  });
});
