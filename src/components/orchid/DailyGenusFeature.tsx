import React from 'react';
import { Link } from 'react-router-dom';
import DailyGenusFeatureContinuum from './DailyGenusFeatureContinuum';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import { featuredTaxonResearchHref } from '@/lib/featuredTaxonNavigation';

/**
 * Mounted homepage Genus-of-the-Day entrypoint.
 *
 * DailyGenusFeatureContinuum owns the evidence-rich featured-genus surface.
 * This wrapper adds the canonical continuation into Research Station using the
 * same bounded featured-taxon navigation contract already consumed by Research.
 * Only genus identity crosses this boundary; coordinates, locality,
 * occurrence ids, collectors, catalogue numbers, and other Atlas-level record
 * detail have no channel here and the incoming Research context is explicitly
 * non-evidentiary by contract.
 */
const DailyGenusFeature: React.FC = () => {
  const { genus } = useDailyGenus();
  const researchHref = featuredTaxonResearchHref(genus);

  return (
    <>
      <DailyGenusFeatureContinuum />
      <section className="bg-[#f3ead4] px-4 pb-10 sm:px-6 lg:px-8" aria-label="Featured genus research continuation">
        <div className="mx-auto max-w-6xl rounded-xl border border-[#d1bd8e] bg-[#fffaf0] px-5 py-4 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#806c39]">
              Continue the investigation
            </p>
            <p className="mt-1 text-sm leading-6 text-[#526046]">
              Carry {genus} into Research Station as bounded navigation context, not scientific evidence.
            </p>
          </div>
          <Link
            to={researchHref}
            className="mt-3 inline-flex shrink-0 items-center rounded-lg border border-[#b59a58] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#665321] hover:bg-[#fff7df] sm:mt-0"
          >
            Continue in Research Station
          </Link>
        </div>
      </section>
    </>
  );
};

export default DailyGenusFeature;
