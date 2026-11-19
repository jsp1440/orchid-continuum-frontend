import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * cap-locality-safety-cross-cutting: the direct grep-for-raw-coordinates check.
 *
 * completionGraphData.ts previously traced only Atlas, Atlas Next, Research
 * Station, Conservation and Species Dossier by hand and recorded the result as
 * evidence notes. This pins that same check as a running test — for those
 * five surfaces plus the three this pass adds (Matrix, Conservatory/OASIS,
 * University) — so the cross-cutting claim cannot silently regress the next
 * time one of these pages grows a new consumer of occurrence data.
 *
 * A bare word match is not the assertion: "locality" and "coordinate" are
 * legitimate English words in the policy prose these pages already render
 * (e.g. "precise coordinates ... remain in Atlas"). The assertion is that
 * every line matching the pattern is one of the lines already read and
 * accounted for below — an unlisted match means new, un-reviewed text next to
 * a locality/coordinate word, which fails the test until a human re-traces it.
 */

const ROOT = resolve(process.cwd(), 'src');

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

const RAW_COORDINATE_PATTERN = /latitude|longitude|\blat\b|\blng\b|\blon\b|locality|coordinate/i;

type TracedSurface = {
  domain: string;
  file: string;
  /** Substrings of every line in this file that is allowed to match the pattern. */
  allowedMatches: string[];
};

const TRACED_SURFACES: TracedSurface[] = [
  // Already traced by completionGraphData.ts before this pass; pinned here so
  // the finding is enforced, not just recorded as prose.
  {
    domain: 'Conservation',
    file: 'pages/ConservationHub.tsx',
    allowedMatches: ['coordinates, locality, and occurrence identifiers remain in atlas'],
  },
  {
    domain: 'Species Dossier',
    file: 'pages/SpeciesDossier.tsx',
    allowedMatches: [
      'atlas_locality_policy',
      'the standing locality policy. no coordinate from',
      'atlas-locality-policy',
    ],
  },

  // Newly traced this pass.
  {
    domain: 'Matrix',
    file: 'pages/RelationshipMatrixNext.tsx',
    allowedMatches: ['precise locality and coordinates are not requested or rendered here'],
  },
  { domain: 'Matrix', file: 'pages/MatrixRegistryConceptReview.tsx', allowedMatches: [] },
  { domain: 'Matrix', file: 'lib/matrixResearchNavigation.ts', allowedMatches: [] },
  { domain: 'Matrix', file: 'lib/matrixReports.ts', allowedMatches: [] },
  { domain: 'Matrix', file: 'lib/matrixIdentification.ts', allowedMatches: [] },
  { domain: 'Matrix', file: 'lib/matrixLexicon.ts', allowedMatches: [] },
  { domain: 'Matrix', file: 'lib/matrixRegistryReview.ts', allowedMatches: [] },
  {
    domain: 'Matrix',
    file: 'lib/matrixMorphologyLayers.ts',
    allowedMatches: ['this region carries no landmark coordinates'],
  },
  { domain: 'Matrix', file: 'lib/speciesDossierMatrixNavigation.ts', allowedMatches: [] },
  { domain: 'Matrix', file: 'components/matrix/MatrixVisionReviewPanel.tsx', allowedMatches: [] },
  { domain: 'Matrix', file: 'components/matrix/MatrixMorphologyViewer.tsx', allowedMatches: [] },
  { domain: 'Matrix', file: 'components/matrix/MatrixLexiconGuide.tsx', allowedMatches: [] },
  { domain: 'Matrix', file: 'components/matrix/MatrixReportPanel.tsx', allowedMatches: [] },
  {
    domain: 'Matrix',
    file: 'components/atlas/AtlasMatrixContinuation.tsx',
    allowedMatches: ['atlas record state, locality, coordinates, selected'],
  },

  { domain: 'Conservatory/OASIS', file: 'pages/MyConservatory.tsx', allowedMatches: [] },
  { domain: 'Conservatory/OASIS', file: 'components/conservatory/ConservatoryReadiness.tsx', allowedMatches: [] },
  { domain: 'Conservatory/OASIS', file: 'components/orchid/OasisConnective.tsx', allowedMatches: [] },
  {
    domain: 'Conservatory/OASIS',
    file: 'lib/conservatoryCultivationCalyx.ts',
    allowedMatches: ['absence of a locality is not enough to say so'],
  },

  {
    domain: 'University',
    file: 'pages/OrchidUniversity.tsx',
    allowedMatches: ['exact locality is excluded from the learning table'],
  },
  { domain: 'University', file: 'pages/UniversityLabPrototype.tsx', allowedMatches: [] },
  { domain: 'University', file: 'pages/UniversityReviewerWorkspace.tsx', allowedMatches: [] },
  { domain: 'University', file: 'components/university/UniversityLearnerNotebook.tsx', allowedMatches: [] },
  { domain: 'University', file: 'components/university/UniversityMyInvestigations.tsx', allowedMatches: [] },
  { domain: 'University', file: 'components/university/UniversityReviewerPanel.tsx', allowedMatches: [] },
  { domain: 'University', file: 'lib/universityApi.ts', allowedMatches: [] },
  { domain: 'University', file: 'lib/universityReviewerApi.ts', allowedMatches: [] },
  { domain: 'University', file: 'lib/universityRelease.ts', allowedMatches: [] },
];

describe('sensitive-locality redaction is cross-cutting (cap-locality-safety-cross-cutting)', () => {
  it.each(TRACED_SURFACES.map((s) => [`${s.domain}: ${s.file}`, s] as const))(
    '%s carries no unexplained raw coordinate/locality field',
    (_label, surface) => {
      const lines = source(surface.file).split('\n');
      const unexplained = lines
        .filter((line) => RAW_COORDINATE_PATTERN.test(line))
        .map((line) => line.trim())
        .filter((line) => {
          const lower = line.toLowerCase();
          return !surface.allowedMatches.some((allowed) => lower.includes(allowed));
        });

      expect(unexplained, `${surface.file}: unexplained locality/coordinate match(es)`).toEqual([]);
    },
  );
});
