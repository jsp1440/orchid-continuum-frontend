import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'src');

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

// Guards docs/contracts/KNOWLEDGE-GRAPH-ROUTE-NAMING-CONTRACT.md: "Knowledge
// Graph" is reserved for the backend-integrated, genus-scoped evidence
// capability. The client-derived, whole-collection rollup at
// /intelligence-graph (aliased at /knowledge) is a distinct capability named
// "Intelligence Graph" and must never re-adopt the "Knowledge Graph" brand.
describe('Knowledge Graph route naming contract', () => {
  it('does not label the /knowledge footer link "Knowledge Graph"', () => {
    const footer = source('components/orchid/Footer.tsx');
    expect(footer).toContain("route: '/knowledge'");
    expect(footer).not.toContain("{ label: 'Knowledge Graph', route: '/knowledge' }");
  });

  it('does not brand the client-derived Intelligence Graph page as "Knowledge Graph"', () => {
    const page = source('pages/IntelligenceGraph.tsx');
    expect(page).not.toMatch(/>\s*Knowledge Graph\s*</);
    expect(page).toContain('Intelligence Graph');
    expect(page).toContain('genus-scoped Knowledge Graph evidence');
  });

  it('keeps the genus-scoped backend contract as the sole caller of the knowledge-graph backend endpoint', () => {
    const knowledgeGraphLib = source('lib/knowledgeGraph.ts');
    const orchidContinuum = source('lib/orchidContinuum.ts');
    expect(knowledgeGraphLib).toContain('/api/knowledge-graph/genus/');
    expect(orchidContinuum).not.toContain('/api/knowledge-graph');
  });

  it('preserves the anti-fabrication fail-closed statuses on genus KG evidence', () => {
    const knowledgeGraphLib = source('lib/knowledgeGraph.ts');
    expect(knowledgeGraphLib).toContain("'not_found'");
    expect(knowledgeGraphLib).toContain("'unavailable'");
    expect(knowledgeGraphLib).toContain("'invalid'");
  });

  it('keeps the client-derived Intelligence Graph free of coordinates, exact locality, and occurrence/project identifiers', () => {
    const orchidContinuum = source('lib/orchidContinuum.ts');
    const graphSection = orchidContinuum.slice(
      orchidContinuum.indexOf('export interface GraphNode'),
      orchidContinuum.indexOf('export async function fetchIntelligenceGraph') +
        orchidContinuum.slice(orchidContinuum.indexOf('export async function fetchIntelligenceGraph')).indexOf('\n\n\n'),
    );
    expect(graphSection).not.toMatch(/\blat(itude)?\b/i);
    expect(graphSection).not.toMatch(/\blon(gitude)?\b|\blng\b/i);
    expect(graphSection).not.toMatch(/occurrence_id|occurrenceId|project_id|projectId/);
  });
});
