import { describe, expect, it } from 'vitest';
import type { RunEvidenceManifest } from '@/lib/evidenceDecisionManifest';
import type { ResearchStationDossier } from '@/lib/researchStation';
import type { ResearchStationSynthesis } from '@/lib/researchStationSynthesis';
import { buildResearchStationReviewExport } from '@/lib/researchStationReviewExport';

const dossier = {
  project: {
    project_id: 'project-phal',
    title: 'Phalaenopsis temperature comparison',
    research_question: 'Cool-growing or warm-growing?',
    status: 'ACTIVE',
  },
  subject: {
    project_id: 'project-phal',
    taxon_id: 'taxon:phalaenopsis',
    relationship: 'SUBJECT',
  },
  comparisons: [],
  context: [],
  supporting: [],
  conflicts: [],
  methods: [],
  evidence: [],
  openQuestions: [],
  evidenceEmpty: false,
} as ResearchStationDossier;

const manifest: RunEvidenceManifest = {
  contract_version: 'oc-run-evidence-manifest-v1',
  run_id: 'run:project-phal:conversation-1',
  research_question: 'Cool-growing or warm-growing?',
  taxon_id: 'taxon:phalaenopsis',
  taxonomy_snapshot_id: 'world-plants:2.1.2026',
  run_fingerprint: 'a'.repeat(64),
  created_at_utc: '2026-09-13T00:00:00Z',
  verification_state: 'ready_for_review',
  resolved_evidence_count: 1,
  missing_evidence_count: 1,
  knowledge_gap_count: 1,
  contradictions: ['claim-warm'],
  review_decision: null,
  epistemic_state: null,
  human_review_required: true,
  automatic_scientific_publication_allowed: false,
  canonical_knowledge_mutation_allowed: false,
  canonical_activation_requires_human_authority: true,
  immutable: true,
};

const result = {
  conversationId: 'conversation-1',
  answer: 'The evidence supports a provisional comparison.',
  structure: {
    generative: false,
    claim_coverage: [
      {
        claim_id: 'claim-cool',
        claim: 'Cool nights are supported by the linked observations.',
        coverage: 'supported',
        source_families: ['literature', 'trait_record'],
        supporting_count: 2,
        contradicting_count: 0,
      },
    ],
    missing_evidence: ['controlled warm-regime replication'],
    resolved_subject: 'Phalaenopsis',
    taxonomy_snapshot_id: 'world-plants:2.1.2026',
  },
  plan: null,
  mission: null,
  citations: [
    {
      title: 'Temperature response in Phalaenopsis',
      authors: 'Example A.',
      publication_date: '2025',
      journal: 'Orchid Research',
      doi: '10.1000/example',
      review_state: 'REVIEW_REQUIRED',
      canonical_evidence: false,
    },
  ],
  degraded: true,
} as ResearchStationSynthesis;

describe('buildResearchStationReviewExport', () => {
  it('exports citations, conflicts, missingness, immutable identity, and review boundaries', () => {
    const packet = buildResearchStationReviewExport({ dossier, result, manifest });

    expect(packet).toContain('# Orchid Continuum scientific review packet');
    expect(packet).toContain('DOI: 10.1000/example');
    expect(packet).toContain('claim-warm');
    expect(packet).toContain('controlled warm-regime replication');
    expect(packet).toContain(manifest.run_fingerprint);
    expect(packet).toContain('Automatic scientific publication allowed: no');
    expect(packet).toContain('Canonical knowledge mutation allowed: no');
    expect(packet).toContain('proposal-only');
    expect(packet).toContain('Review decision: not recorded');
  });

  it('keeps absent citations and gap detail explicitly unavailable', () => {
    const packet = buildResearchStationReviewExport({
      dossier,
      result: { ...result, citations: [], structure: null },
      manifest: {
        ...manifest,
        contradictions: [],
        missing_evidence_count: 0,
        knowledge_gap_count: 0,
      },
    });

    expect(packet).toContain('Unavailable — no display-authorized citations were returned.');
    expect(packet).toContain('None recorded. This is not evidence that the investigation is complete.');
    expect(packet).toContain('None recorded. This is not evidence that all sources agree.');
  });
});
