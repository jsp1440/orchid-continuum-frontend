import React from 'react';
import { Link } from 'react-router-dom';
import DailyGenusFeatureContinuum from './DailyGenusFeatureContinuum';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import {
  featuredTaxonAtlasNextHref,
  featuredTaxonCalyxHref,
  featuredTaxonResearchHref,
  featuredTaxonSpeciesHref,
} from '@/lib/featuredTaxonNavigation';

/**
 * Mounted homepage Genus-of-the-Day entrypoint.
 *
 * DailyGenusFeatureContinuum owns the evidence-rich featured-genus surface.
 * This wrapper adds canonical continuations into Atlas Next, Calyx, Research
 * Station, and the Species browser using the same bounded featured-taxon
 * navigation boundary. Only genus identity crosses these boundaries;
 * coordinates, locality, occurrence ids, collectors, catalogue numbers, and
 * other Atlas-level record detail have no channel. Calyx and Research receive
 * the explicit non-evidence declaration required by their trust boundaries.
 */
const DailyGenusFeature: React.FC = () => {
  const { genus } = useDailyGenus();
  const atlasNextHref = featuredTaxonAtlasNextHref(genus);
  const calyxHref = featuredTaxonCalyxHref(genus);
  const researchHref = featuredTaxonResearchHref(genus);
  const speciesHref = featuredTaxonSpeciesHref(genus);

  return (
    <>
      <DailyGenusFeatureContinuum />
      <section className="bg-[#f3ead4] px-4 pb-10 sm:px-6 lg:px-8" aria-label="Featured genus continuation">
        <div className="mx-auto max-w-6xl rounded-xl border border-[#d1bd8e] bg-[#fffaf0] px-5 py-4 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#806c39]">
              Continue the investigation
            </p>
            <p className="mt-1 text-sm leading-6 text-[#526046]">
              Carry {genus} into Atlas Next, Calyx, Research Station, or its Species dossiers as bounded navigation context.
            </p>
          </div>
          <div className="mt-3 flex min-w-0 flex-wrap gap-2 sm:mt-0">
            <Link
              to={atlasNextHref}
              className="inline-flex items-center rounded-lg border border-[#b59a58] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#665321] hover:bg-[#fff7df]"
            >
              Explore in Atlas Next
            </Link>
            <Link
              to={calyxHref}
              className="inline-flex items-center rounded-lg border border-[#b59a58] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#665321] hover:bg-[#fff7df]"
            >
              Ask Calyx about {genus}
            </Link>
            <Link
              to={speciesHref}
              className="inline-flex items-center rounded-lg border border-[#b59a58] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#665321] hover:bg-[#fff7df]"
            >
              Browse {genus} species
            </Link>
            <Link
              to={researchHref}
              className="inline-flex items-center rounded-lg border border-[#b59a58] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#665321] hover:bg-[#fff7df]"
            >
              Continue in Research Station
            </Link>
          </div>
        </div>
      </section>
    </>
  );
};

export default DailyGenusFeature;
