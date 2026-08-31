import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  atlasWorkspaceMatrixHref,
  relationshipMatrixCalyxHref,
} from '@/lib/featuredTaxonNavigation';
import { buildCalyxTurnContext } from '@/lib/calyxConversation';

type ProofCell = {
  subject_id: string;
  state: string;
  provenance?: Array<Record<string, unknown>> | null;
};

type CrossRepoProof = {
  dimension: string;
  source_mode: string;
  source_domain: string;
  genus_scope: string | null;
  cells: ProofCell[];
};

const proofPath = process.env.OC_CROSS_REPO_PROOF_JSON;
const proofDescribe = proofPath ? describe : describe.skip;

function readProof(): CrossRepoProof {
  if (!proofPath) {
    throw new Error('OC_CROSS_REPO_PROOF_JSON must point to the backend-generated convergence receipt');
  }
  return JSON.parse(readFileSync(resolve(process.cwd(), proofPath), 'utf8')) as CrossRepoProof;
}

proofDescribe('cross-repository canonical evidence → Matrix → Atlas → Calyx proof', () => {
  it('consumes a backend-generated governed Matrix receipt without changing evidence semantics', () => {
    const proof = readProof();

    expect(proof.dimension).toBe('trait');
    expect(proof.source_mode).toBe('canonical_governed_source');
    expect(proof.source_domain).toBe('traits');
    expect(proof.genus_scope).toBe('Phalaenopsis');

    const states = Object.fromEntries(proof.cells.map((cell) => [cell.subject_id, cell.state]));
    expect(states['101']).toBe('present');
    expect(states['999']).toBe('not_recorded');
    expect(states['999']).not.toBe('absent');

    const present = proof.cells.find((cell) => cell.subject_id === '101');
    expect(present?.provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_domain: 'traits',
          source_query_id: 'traits_resolved_v4',
          source_pk: 'trait-proof-1',
          support_count: 4,
          confidence_label: 'high',
        }),
      ]),
    );

    const serialized = JSON.stringify(proof).toLowerCase();
    for (const forbidden of [
      'decimallatitude',
      'decimallongitude',
      'latitude',
      'longitude',
      'locality',
      'occurrenceid',
    ]) {
      expect(serialized).not.toContain(`\"${forbidden}\"`);
    }
  });

  it('continues the same governed genus through Atlas → Matrix → Calyx as non-evidence context', () => {
    const proof = readProof();
    const genus = proof.genus_scope;
    expect(genus).toBe('Phalaenopsis');
    if (!genus) throw new Error('backend proof did not attest a genus scope');

    const matrixHref = atlasWorkspaceMatrixHref(genus);
    expect(matrixHref).toBe('/relationship-matrix?genus=Phalaenopsis');

    const calyxHref = relationshipMatrixCalyxHref(genus);
    expect(calyxHref).toBe(
      '/calyx?genus=Phalaenopsis&origin=relationship-matrix&context_is_evidence=false',
    );

    const turn = buildCalyxTurnContext({
      projectId: 'cross-repo-convergence-proof',
      uploadedFiles: [],
      routeSearch: new URL(calyxHref, 'https://orchidcontinuum.org').search,
    });

    expect(turn.route_context).toEqual({
      origin: 'relationship-matrix',
      featured_taxon: {
        rank: 'genus',
        accepted_name: 'Phalaenopsis',
      },
      featured_taxon_is_evidence: false,
    });
  });
});
