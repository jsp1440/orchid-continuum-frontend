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

    expect(proof.dimension).toBeTruthy();
    expect(proof.source_mode).toBe('canonical_governed_source');
    expect(proof.source_domain).toBeTruthy();
    expect(proof.genus_scope).toBe('Phalaenopsis');
    expect(proof.cells.length).toBeGreaterThan(0);

    const present = proof.cells.filter((cell) => cell.state === 'present');
    const notRecorded = proof.cells.filter((cell) => cell.state === 'not_recorded');

    expect(present.length).toBeGreaterThan(0);
    expect(notRecorded.length).toBeGreaterThan(0);
    expect(proof.cells.some((cell) => cell.state === 'absent')).toBe(false);
    expect(
      present.some(
        (cell) => Array.isArray(cell.provenance) && cell.provenance.length > 0,
      ),
    ).toBe(true);

    const serialized = JSON.stringify(proof).toLowerCase();
    for (const forbidden of [
      'decimallatitude',
      'decimallongitude',
      'latitude',
      'longitude',
      'locality',
      'occurrenceid',
    ]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
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
