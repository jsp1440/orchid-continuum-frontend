import type { SessionEvaluation } from '@/lib/matrixIdentification';

/**
 * Build the exact, reviewable Matrix state that a feedback case is about.
 *
 * Session source/provenance objects are intentionally not copied. They are
 * open-ended backend records and can contain protected locality or submitter
 * metadata. The feedback service only needs the bounded scientific ranking
 * shown on this page.
 */
export function matrixEvidenceFeedbackPayload(
  evaluation: SessionEvaluation,
): Record<string, unknown> {
  const { session, report, next_observation: nextObservation } = evaluation;

  return {
    schema_version: 'matrix-identification-feedback.v1',
    session_id: session.session_id,
    revision: session.revision,
    registry: {
      registry_id: session.registry.registry_id,
      version: session.registry.version,
      checksum_sha256: session.registry.checksum_sha256 ?? null,
      publication_state: session.registry.publication_state ?? null,
    },
    observations: session.observations.map((observation) => ({
      observation_id: observation.observation_id,
      character: observation.character,
      value: observation.value,
      certainty: observation.certainty,
      review_state: observation.review_state ?? null,
    })),
    ranking: report.candidates.map((candidate, index) => ({
      rank: index + 1,
      taxon_id: candidate.taxon_id,
      scientific_name: candidate.scientific_name,
      score: candidate.score,
      coverage: candidate.coverage,
      explanations: candidate.explanations.map((explanation) => ({
        character: explanation.character,
        observation: explanation.observation,
        candidate_state: explanation.candidate_state,
        certainty: explanation.certainty,
        similarity: explanation.similarity,
        status: explanation.status,
      })),
    })),
    report: {
      observation_count: report.observation_count,
      compared_character_count: report.compared_character_count,
      disclaimer: report.disclaimer,
    },
    next_observation: nextObservation
      ? {
          character: nextObservation.character,
          label: nextObservation.label,
          reason_code: nextObservation.reason_code ?? null,
        }
      : null,
    context_is_verified_identification: false,
    canonical_taxon_state_mutated: false,
  };
}
