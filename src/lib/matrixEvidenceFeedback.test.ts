import { describe, expect, it } from 'vitest';

import { matrixEvidenceFeedbackPayload } from '@/lib/matrixEvidenceFeedback';
import type { SessionEvaluation } from '@/lib/matrixIdentification';

const evaluation: SessionEvaluation = {
  session: {
    session_id: 'matrix-session-7',
    revision: 4,
    registry: {
      registry_id: 'paphiopedilum',
      version: '2026.09',
      checksum_sha256: 'a'.repeat(64),
      publication_state: 'reviewed',
    },
    observations: [
      {
        observation_id: 'observation-1',
        character: 'dorsal_sepal_shape',
        value: 'ovate',
        certainty: 'probable',
        review_state: 'accepted',
        source: {
          locality: 'protected collection site',
          decimalLatitude: -12.345,
          submitter_email: 'private@example.org',
        },
      },
    ],
  },
  report: {
    candidates: [
      {
        taxon_id: 'taxon-1',
        scientific_name: 'Paphiopedilum example',
        score: 0.84,
        coverage: 0.6,
        provenance: {
          locality: 'another protected site',
          collector: 'Private Person',
        },
        explanations: [
          {
            character: 'dorsal_sepal_shape',
            observation: 'ovate',
            candidate_state: 'ovate',
            certainty: 'probable',
            similarity: 1,
            status: 'match',
          },
        ],
      },
    ],
    observation_count: 1,
    compared_character_count: 1,
    disclaimer: 'A ranking is not a verified identification.',
  },
  next_observation: {
    character: 'petal_posture',
    label: 'Petal posture',
    reason_code: 'highest_information_gain',
  },
};

describe('matrixEvidenceFeedbackPayload', () => {
  it('binds feedback to the exact session revision and displayed ranking', () => {
    expect(matrixEvidenceFeedbackPayload(evaluation)).toMatchObject({
      session_id: 'matrix-session-7',
      revision: 4,
      registry: {
        registry_id: 'paphiopedilum',
        version: '2026.09',
        checksum_sha256: 'a'.repeat(64),
      },
      ranking: [
        {
          rank: 1,
          taxon_id: 'taxon-1',
          scientific_name: 'Paphiopedilum example',
          score: 0.84,
          coverage: 0.6,
        },
      ],
      context_is_verified_identification: false,
      canonical_taxon_state_mutated: false,
    });
  });

  it('does not copy open-ended source or provenance data into feedback', () => {
    const serialized = JSON.stringify(matrixEvidenceFeedbackPayload(evaluation));

    expect(serialized).not.toContain('protected collection site');
    expect(serialized).not.toContain('another protected site');
    expect(serialized).not.toContain('private@example.org');
    expect(serialized).not.toContain('Private Person');
    expect(serialized).not.toContain('decimalLatitude');
  });
});
