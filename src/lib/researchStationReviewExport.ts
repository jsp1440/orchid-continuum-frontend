import type { CalyxCitation } from '@/lib/calyxWorkspace';
import type { RunEvidenceManifest } from '@/lib/evidenceDecisionManifest';
import type { ResearchStationDossier } from '@/lib/researchStation';
import type { ResearchStationSynthesis } from '@/lib/researchStationSynthesis';

export type ResearchStationReviewExportInput = {
  dossier: ResearchStationDossier;
  result: ResearchStationSynthesis;
  manifest: RunEvidenceManifest;
};

function inline(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function count(value: unknown): string {
  return Number.isInteger(value) && Number(value) >= 0 ? String(value) : 'unavailable';
}

function citationIdentifier(citation: CalyxCitation): string {
  const doi = inline(citation.doi);
  if (doi) return `DOI: ${doi}`;
  const pmid = inline(citation.pmid);
  if (pmid) return `PMID: ${pmid}`;
  const pmcid = inline(citation.pmcid);
  if (pmcid) return `PMCID: ${pmcid}`;
  return 'Persistent identifier unavailable';
}

function citationLine(citation: CalyxCitation, index: number): string {
  const title = inline(citation.title);
  const bibliographic = [
    inline(citation.authors),
    inline(citation.publication_date),
    inline(citation.journal),
  ].filter(Boolean);
  const reviewState = inline(citation.review_state) || 'REVIEW_REQUIRED';
  return [
    `${index + 1}. ${title || 'Untitled display-authorized source'}`,
    bibliographic.length ? `   - ${bibliographic.join(' · ')}` : null,
    `   - ${citationIdentifier(citation)}`,
    `   - Evidence status: ${citation.canonical_evidence ? 'canonical Continuum evidence' : reviewState}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

/**
 * Creates a deterministic, cited review packet from the exact Research Station
 * response and immutable run manifest. It is an export for human review only:
 * it neither approves the conclusion nor mutates scientific or canonical data.
 */
export function buildResearchStationReviewExport({
  dossier,
  result,
  manifest,
}: ResearchStationReviewExportInput): string {
  const structure = result.structure;
  const missionConclusions = result.mission?.conclusions ?? [];
  const claimCoverage = structure?.claim_coverage ?? [];
  const missingEvidence = Array.from(
    new Set(
      [
        ...(structure?.missing_evidence ?? []),
        ...(result.mission?.missing_evidence ?? []),
      ]
        .map(inline)
        .filter(Boolean),
    ),
  );

  const lines: string[] = [
    '# Orchid Continuum scientific review packet',
    '',
    '## Review status',
    '',
    '- HUMAN REVIEW REQUIRED',
    `- Verification state: ${manifest.verification_state}`,
    `- Immutable run fingerprint: ${manifest.run_fingerprint}`,
    `- Run ID: ${manifest.run_id}`,
    `- Automatic scientific publication allowed: ${manifest.automatic_scientific_publication_allowed ? 'yes' : 'no'}`,
    `- Canonical knowledge mutation allowed: ${manifest.canonical_knowledge_mutation_allowed ? 'yes' : 'no'}`,
    '- This packet records a proposal for review. It is not an approval, publication, or Knowledge Graph mutation.',
    '',
    '## Investigation',
    '',
    `- Project: ${inline(dossier.project.title) || dossier.project.project_id}`,
    `- Project ID: ${dossier.project.project_id}`,
    `- Subject taxon: ${inline(dossier.subject?.taxon_id) || 'unavailable'}`,
    `- Taxonomy snapshot: ${inline(manifest.taxonomy_snapshot_id) || 'unavailable'}`,
    `- Research question: ${inline(manifest.research_question) || 'unavailable'}`,
    '',
    '## Provisional synthesis',
    '',
    inline(result.answer) || 'Unavailable — no governed synthesis answer was returned.',
    '',
    '### Brain conclusions',
    '',
    ...(missionConclusions.length
      ? missionConclusions.map(
          (conclusion, index) =>
            `${index + 1}. ${inline(conclusion.text)} [${inline(conclusion.type) || 'type unavailable'}]`,
        )
      : ['Unavailable — no complete governed Brain mission conclusion was returned.']),
    '',
    '## Evidence comparison',
    '',
    ...(claimCoverage.length
      ? claimCoverage.map((claim) => {
          const families = Array.isArray(claim.source_families)
            ? claim.source_families.map(inline).filter(Boolean).join(', ')
            : '';
          return [
            `- ${inline(claim.claim) || inline(claim.claim_id) || 'Unnamed claim'}`,
            `  - Coverage: ${inline(claim.coverage) || 'unresolved'}`,
            `  - Supporting records: ${count(claim.supporting_count)}`,
            `  - Contradicting records: ${count(claim.contradicting_count)}`,
            `  - Source families: ${families || 'unavailable'}`,
          ].join('\n');
        })
      : ['Unavailable — no backend claim coverage was returned.']),
    '',
    '## Contradictions',
    '',
    ...(manifest.contradictions.length
      ? manifest.contradictions.map((item) => `- ${inline(item)}`)
      : ['None recorded. This is not evidence that all sources agree.']),
    '',
    '## Missing evidence and knowledge gaps',
    '',
    ...(missingEvidence.length
      ? missingEvidence.map((item) => `- ${item}`)
      : [
          manifest.missing_evidence_count > 0 || manifest.knowledge_gap_count > 0
            ? `Unavailable detail — manifest records ${manifest.missing_evidence_count} missing evidence item(s) and ${manifest.knowledge_gap_count} knowledge gap(s).`
            : 'None recorded. This is not evidence that the investigation is complete.',
        ]),
    '',
    '## Display-authorized citations',
    '',
    ...(result.citations.length
      ? result.citations.map(citationLine)
      : ['Unavailable — no display-authorized citations were returned.']),
    '',
    '## Human decision',
    '',
    `- Review decision: ${inline(manifest.review_decision) || 'not recorded'}`,
    `- Epistemic state: ${inline(manifest.epistemic_state) || 'not recorded'}`,
    '- Any Knowledge Graph handoff remains proposal-only and requires explicit human authority.',
    '',
  ];

  return lines.join('\n');
}
