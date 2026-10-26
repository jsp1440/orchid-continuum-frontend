import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Globe2 } from 'lucide-react';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import { featuredTaxonAtlasHref, featuredTaxonCalyxHref, featuredTaxonMatrixHref } from '@/lib/featuredTaxonNavigation';
import { fetchGenusOccurrences } from '@/lib/ocBackend';
import { toPublicAtlasOccurrence } from '@/lib/atlasLocalitySafety';
import type { AtlasOccurrencePoint } from '@/lib/orchidContinuum';
import AtlasMiniMap from './AtlasMiniMap';

/** One geographic question, using the canonical public occurrence client. */
const HomeAtlasContinuum: React.FC = () => {
  const { genus, continuum } = useDailyGenus();
  const [view, setView] = useState<{ genus: string; points: AtlasOccurrencePoint[]; loading: boolean }>({ genus: '', points: [], loading: true });
  const atlasHref = featuredTaxonAtlasHref(genus);
  const calyxHref = featuredTaxonCalyxHref(genus);
  const matrixHref = featuredTaxonMatrixHref(genus);
  const geography = continuum?.relationships?.geography;

  useEffect(() => {
    const controller = new AbortController();
    setView({ genus, points: [], loading: true });
    void fetchGenusOccurrences(genus, 500, controller.signal).then((rows) => {
      if (controller.signal.aborted) return;
      const points = rows.filter((row) => row.species.split(/\s+/)[0].toLowerCase() === genus.toLowerCase()).map((row) => toPublicAtlasOccurrence({
        id: row.id, lat: row.lat, lng: row.lng, genus,
        species: row.species.split(/\s+/).slice(1).join(' '), canonicalName: row.species,
        country: row.country ?? '', countries: row.country ? [row.country] : [],
        dataset: 'Orchid Continuum', verified: false, pollinators: [],
        // This minimal public response does not attest an assessment; retain the precaution floor.
        assessmentResolved: false,
      }));
      setView({ genus, points, loading: false });
    }).catch(() => {
      if (!controller.signal.aborted) setView({ genus, points: [], loading: false });
    });
    return () => controller.abort();
  }, [genus]);

  const points = view.genus === genus ? view.points : [];
  const loading = view.genus !== genus || view.loading;
  return (
    <section id="home-atlas" className="border-y border-white/10 bg-[#102018] text-[#f5f0e8]">
      <div className="mx-auto grid max-w-[1300px] gap-7 px-6 py-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-10">
        <div>
          <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[#d4b34a]"><Globe2 className="h-4 w-4" /> Living Atlas</p>
          <h2 className="mt-3 font-serif text-3xl leading-tight sm:text-4xl">Where has <span className="italic text-[#d4b34a]">{genus}</span> been recorded?</h2>
          <p className="mt-4 max-w-lg text-base leading-7 text-[#ddd8cc]">Explore documented observations on a real map. Each mark is a record, not a claim about the genus’s complete range.</p>
          <p role="status" className="mt-4 text-sm leading-6 text-[#c4ccbd]">{loading ? 'Loading recorded observations…' : points.length ? `Showing up to 500 returned records for ${genus}. Locations may be generalized to protect sensitive sites.` : 'Occurrence records could not be displayed for this genus. This does not mean it is absent.'}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to={atlasHref} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d4b34a]/50 px-5 text-sm text-[#ead28c]">Explore {genus} in Atlas <ArrowRight className="h-4 w-4" /></Link>
            <Link to={calyxHref} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d4b34a]/50 px-5 text-sm text-[#ead28c]">Ask Calyx about {genus} <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <details className="mt-5 text-sm leading-6 text-[#c4ccbd]">
            <summary className="cursor-pointer">Sources and evidence limits</summary>
            <p className="mt-2">Map records come from the Continuum occurrence service. Graph linkage does not measure habitat breadth, climate tolerances, or association strength.</p>
            {geography?.summary && <p className="mt-2">{geography.summary}</p>}
            <p className="mt-2">Matrix and Calyx retrieve their own governed evidence; only the genus is carried forward.</p>
            <Link to={matrixHref} className="mt-2 inline-block underline">Inspect {genus} relationships</Link>
          </details>
        </div>
        <div aria-label={`${genus} occurrence map`}>
          <AtlasMiniMap points={points} title={`${genus} · recorded observations`} atlasHref={atlasHref} cap={500} />
        </div>
      </div>
    </section>
  );
};
export default HomeAtlasContinuum;
