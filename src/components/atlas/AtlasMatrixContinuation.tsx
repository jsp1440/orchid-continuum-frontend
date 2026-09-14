import React from 'react';
import { Link } from 'react-router-dom';
import { Network } from 'lucide-react';

import { atlasWorkspaceMatrixHref } from '@/lib/featuredTaxonNavigation';

type AtlasMatrixContinuationProps = {
  genera?: string[];
};

function matrixHrefForSingleGenus(genera: string[] | undefined): string | null {
  if (!genera || genera.length !== 1) return null;

  try {
    return atlasWorkspaceMatrixHref(genera[0]);
  } catch {
    return null;
  }
}

/**
 * Atlas → Relationship Matrix continuation.
 *
 * The control is intentionally available only when Atlas has exactly one
 * canonical genus filter. Atlas record state, locality, coordinates, selected
 * occurrence, active layers, confidence and conclusions never cross this
 * boundary; Relationship Matrix retrieves its own governed evidence.
 */
export default function AtlasMatrixContinuation({ genera }: AtlasMatrixContinuationProps) {
  const href = matrixHrefForSingleGenus(genera);
  if (!href) return null;

  const genus = genera?.[0] ?? '';

  return (
    <div className="rounded-2xl border border-[#c9a24a]/30 bg-[#c9a24a]/[0.06] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#c9a24a]">
            Canonical genus continuation
          </div>
          <p className="mt-1 text-xs leading-5 text-[#cfc8b8]/75">
            Continue with {genus} as Matrix read scope only. Relationship Matrix retrieves its own governed evidence.
          </p>
        </div>
        <Link
          to={href}
          className="inline-flex items-center gap-2 rounded-full border border-[#c9a24a]/45 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#c9a24a] transition-colors hover:bg-[#c9a24a]/10"
        >
          <Network className="h-3.5 w-3.5" />
          Inspect {genus} relationships
        </Link>
      </div>
    </div>
  );
}

export { matrixHrefForSingleGenus };
