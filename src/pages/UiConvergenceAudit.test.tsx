// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UiConvergenceAudit from './UiConvergenceAudit';

vi.mock('@/components/orchid/Navbar', () => ({ default: () => <div data-testid="navbar" /> }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const fixture = {"schema_version":1,"audit_id":"UI-CONVERGENCE-001","source_revision":"119199f5e2482bb7e7478a76ede4e6d709c9a7b7","generated_at":"2026-09-29T06:00:00Z","authority_rule":"Famous and narrative assets are presentation-only. Canonical Orchid Continuum services remain the sole scientific and operational authority.","dispositions":["KEEP","PORT","CONVERGE","SUPERSEDE","ARCHIVE","OWNER_REVIEW"],"assets":[{"id":"famous-lexicon-presentation","label":"Illustrated Orchid Lexicon presentation system","origin":"famous_ai_export","availability":"present","source_repository":"jsp1440/orchid-continuum-frontend","source_paths":["src/components/lexicon","src/features/lexicon","docs/CALYX-LEXICON-INTEGRATION-001.md"],"original_capability":"Illustrated A–Z browsing, layered entry pages, visual teaching components, provenance and display settings.","canonical_equivalent":"Canonical Orchid Continuum Lexicon mounted at /lexicon.","canonical_destination":"/lexicon","canonical_data_authority":"/api/lexicon via src/lib/lexiconService.ts","disposition":"CONVERGE","duplication_or_staleness":"Presentation is reusable; any embedded scientific content is migration fallback and never write authority.","representative_slice":true},{"id":"famous-lexicon-fallback","label":"Recovered Famous Lexicon records and overrides","origin":"famous_ai_export","availability":"present","source_repository":"jsp1440/orchid-continuum-frontend","source_paths":["src/data/famousLexiconSupplement.ts","src/data/famousExportRecordOverrides.ts","src/data/lexiconEntries.ts"],"original_capability":"Recovered term definitions and presentation metadata from the uploaded Famous export.","canonical_equivalent":"Read-only fallback merged by slug beneath reviewed canonical concepts.","canonical_destination":"src/lib/lexiconService.ts","canonical_data_authority":"Reviewed /api/lexicon records supersede fallback scientific fields.","disposition":"KEEP","duplication_or_staleness":"Draft migration content; fallback-only entries must remain visibly noncanonical.","representative_slice":false},{"id":"famous-resupination-teaching","label":"Resupination visual teaching sequence","origin":"famous_ai_export","availability":"present","source_repository":"jsp1440/orchid-continuum-frontend","source_paths":["src/data/famousResupinationEnrichment.ts","src/components/lexicon/Schematics.tsx","src/components/lexicon/EntryView.tsx"],"original_capability":"Conceptual visual sequence and layered educational explanation.","canonical_equivalent":"Lexicon concept page with a governed handoff into Matrix Identification.","canonical_destination":"/lexicon/resupination → /orchid-identification","canonical_data_authority":"Canonical Lexicon concept plus governed Matrix session APIs; schematic is explicitly conceptual.","disposition":"CONVERGE","duplication_or_staleness":"Useful pedagogy; must not be represented as a measured specimen or observation.","representative_slice":true},{"id":"famous-partner-copy","label":"Famous-era partner, grant and demo banner copy","origin":"famous_ai_export","availability":"present","source_repository":"jsp1440/orchid-continuum-frontend","source_paths":["src/data/partners.ts","src/components/lexicon/PartnersView.tsx","src/components/lexicon/AboutView.tsx"],"original_capability":"Partner acknowledgements, grant messaging and prototype provenance.","canonical_equivalent":"Canonical partner records and owner-approved public acknowledgements.","canonical_destination":"Orchid Continuum partner/provenance surfaces","canonical_data_authority":"Owner-approved organization records and current grant evidence.","disposition":"OWNER_REVIEW","duplication_or_staleness":"Contains proposed/historical wording that must not be promoted or silently refreshed.","representative_slice":false},{"id":"famous-matrix-concept","label":"Famous Matrix implementation concept","origin":"famous_ai_brief","availability":"referenced_only","source_repository":"jsp1440/orchid-continuum-frontend","source_paths":["docs/CALYX-MATRIX-UI-002-CONTRACT.md"],"original_capability":"Candidate narrowing, morphology layers, evidence trail and guided interaction.","canonical_equivalent":"Governed session-driven Matrix Identification workspace.","canonical_destination":"/orchid-identification","canonical_data_authority":"/api/matrix-identification via src/lib/matrixIdentification.ts","disposition":"SUPERSEDE","duplication_or_staleness":"Do not create a second Famous Matrix app; canonical implementation already owns the journey.","representative_slice":false},{"id":"bramble-story-export","label":"Bramble narrative/storytelling export","origin":"external_owner_workspace","availability":"unavailable","source_repository":null,"source_paths":[],"original_capability":"Optional whimsical narrative doorway described by the owner.","canonical_equivalent":"No canonical repository asset located in this audit.","canonical_destination":"Future optional story route linked to the same canonical taxon and module objects.","canonical_data_authority":"Canonical taxon, Lexicon, Matrix, Atlas, Literature and Calyx objects only.","disposition":"OWNER_REVIEW","duplication_or_staleness":"Source export is missing; content and rights cannot be audited or integrated yet.","representative_slice":false},{"id":"genus-of-the-day-export","label":"Genus-of-the-Day Famous presentation","origin":"external_owner_workspace","availability":"unavailable","source_repository":null,"source_paths":[],"original_capability":"A concise educational genus feature separable from narrative storytelling.","canonical_equivalent":"No Famous export located; canonical genus/species surfaces already exist.","canonical_destination":"Future presentation component over canonical genus records.","canonical_data_authority":"Canonical taxonomy, media provenance, Atlas and Literature services.","disposition":"OWNER_REVIEW","duplication_or_staleness":"External source unavailable; do not infer its contents or create a competing data model.","representative_slice":false}]};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 })));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('UiConvergenceAudit', () => {
  it('renders dispositions, canonical destinations, and unavailable evidence', async () => {
    await act(async () => {
      root.render(<MemoryRouter><UiConvergenceAudit /></MemoryRouter>);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Famous & Legacy Surface Audit');
    expect(container.textContent).toContain('Illustrated Orchid Lexicon presentation system');
    expect(container.textContent).toContain('CONVERGE');
    expect(container.textContent).toContain('/orchid-identification');
    expect(container.textContent).toContain('No auditable source export is present');
    expect(container.textContent).toContain('Bramble');
  });

  it('loads the machine-readable registry with cache bypass', async () => {
    await act(async () => {
      root.render(<MemoryRouter><UiConvergenceAudit /></MemoryRouter>);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/data/ui-convergence-registry.json?t=');
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
  });
});
