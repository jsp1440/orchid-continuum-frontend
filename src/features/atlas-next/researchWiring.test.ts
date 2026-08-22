import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { atlasNextResearchHref } from './researchHandoff';
import { parseResearchRouteContext } from '@/lib/researchRouteContext';

const src = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

/**
 * The Atlas Next → Research Station handoff, end to end.
 *
 * The contract landed in #272 with no caller on either side: Atlas offered no
 * way out to Research, and Research re-derived the route rule inline in a form
 * that recognised only the featured-taxon origin. These pin both halves now
 * that they are wired to the same governed contract.
 */
describe('Atlas Next → Research Station wiring', () => {
  it('produces a handoff the Research parser accepts', () => {
    const href = atlasNextResearchHref({ genus: 'Phalaenopsis', projectId: 'naocc-phalaenopsis' });
    expect(href).not.toBeNull();

    const context = parseResearchRouteContext(href!.slice(href!.indexOf('?')));
    expect(context).toEqual({
      origin: 'atlas-next',
      genus: 'Phalaenopsis',
      projectId: 'naocc-phalaenopsis',
      contextIsEvidence: false,
    });
  });

  it('offers no handoff when the Atlas has no genus selected', () => {
    // The affordance must be absent rather than producing a link the Research
    // parser would refuse on arrival.
    expect(atlasNextResearchHref({ genus: '' })).toBeNull();
    expect(atlasNextResearchHref({ genus: 'not a genus' })).toBeNull();
  });

  it('routes the Atlas affordance through the governed builder', () => {
    const shell = src('features/atlas-next/AtlasNextShell.tsx');
    expect(shell).toContain('atlasNextResearchHref');
    expect(shell).toContain('to={researchHref}');
    // No hand-written research URL may bypass the contract.
    expect(shell).not.toContain('to="/research"');
    expect(shell).not.toContain("to='/research'");
  });

  it('reads both governed origins in Research through the shared parser', () => {
    const research = src('pages/ResearchCenter.tsx');
    expect(research).toContain('parseResearchRouteContext');
    expect(research).toContain('ATLAS_NEXT_RESEARCH_ORIGIN');
    // The inline re-derivation this replaced must not come back.
    expect(research).not.toContain("searchParams.get('origin') ===");
    expect(research).not.toContain("searchParams.get('genus')");
  });

  it('still carries nothing but genus, origin, project and the evidence flag', () => {
    const href = atlasNextResearchHref({ genus: 'Phalaenopsis', projectId: 'p1' })!;
    const keys = [...new URLSearchParams(href.slice(href.indexOf('?'))).keys()].sort();
    expect(keys).toEqual(['context_is_evidence', 'genus', 'origin', 'project']);
  });
});
