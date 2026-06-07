/**
 * /gallery — the Orchid Continuum image archive.
 *
 * Every image carries back-references: species, occurrence, habitat,
 * country, conservation status, source. Filters here are SYNCHRONIZED
 * with the global Atlas filter context — changing genus/country/iucn
 * on the Atlas also filters the gallery.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Image as ImageIcon, Loader2, MapPin, X } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import {
  ConservationChip,
  SourceCitation,
  VerifiedBadge,
} from '@/components/orchid/SourceBadges';
import { useAtlasFilters } from '@/contexts/AtlasFilterContext';
import {
  fetchOrchidImageLibrary,
  type OrchidImageAsset,
} from '@/lib/orchidContinuum';

const Gallery: React.FC = () => {
  const { filters, isActive, toggleArrayFilter, resetFilters, activeFilterCount } = useAtlasFilters();
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState<OrchidImageAsset[]>([]);
  const [selected, setSelected] = useState<OrchidImageAsset | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchOrchidImageLibrary().then((rows) => {
      if (!cancelled) {
        setImages(rows);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    return images.filter((img) => {
      if (filters.genera?.length && (!img.genus || !filters.genera.includes(img.genus))) return false;
      if (filters.countries?.length && (!img.country || !filters.countries.includes(img.country))) return false;
      if (filters.habitats?.length && (!img.habitat || !filters.habitats.includes(img.habitat))) return false;
      if (filters.iucnCodes?.length && (!img.iucnCode || !filters.iucnCodes.includes(img.iucnCode))) return false;
      if (filters.datasets?.length && !filters.datasets.includes(img.source)) return false;
      if (filters.verifiedOnly && !img.verified) return false;
      return true;
    });
  }, [images, filters]);

  const genera = useMemo(
    () => Array.from(new Set(images.map((i) => i.genus).filter(Boolean) as string[])).sort(),
    [images],
  );
  const countries = useMemo(
    () => Array.from(new Set(images.map((i) => i.country).filter(Boolean) as string[])).sort(),
    [images],
  );
  const sources = useMemo(
    () => Array.from(new Set(images.map((i) => i.source))).sort(),
    [images],
  );

  return (
    <div className="min-h-screen bg-[#04050d] text-[#f5f0e8]" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      <style>{`
        .font-display { font-family: 'Playfair Display', Georgia, serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>
      <Navbar />
      <main className="pt-20">
        <section className="border-b border-white/[0.05]">
          <div className="max-w-[1500px] mx-auto px-6 lg:px-10 py-10">
            <Link to="/atlas" className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase text-[#cfc8b8]/55 hover:text-[#c9a24a] mb-5">
              <ArrowLeft className="h-3.5 w-3.5" /> Atlas
            </Link>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className="font-mono text-[10px] tracking-[0.36em] uppercase text-[#c9a24a]/85 mb-3">
                  Image archive · linked imagery
                </div>
                <h1 className="font-display leading-[0.95]" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.4rem)' }}>
                  The Continuum <span className="italic text-[#c9a24a]">Gallery</span>
                </h1>
                <p className="mt-3 max-w-2xl text-[14px] text-[#cfc8b8]/80 leading-relaxed">
                  Every image is linked to a real species record, occurrence, habitat, and source.
                  No AI-generated imagery is ever included.
                </p>
              </div>
              <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[#cfc8b8]/70">
                {filtered.length.toLocaleString()} of {images.length.toLocaleString()} images
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-[1500px] mx-auto px-6 lg:px-10 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <aside className="lg:col-span-3">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-5 lg:sticky lg:top-24">
              <div className="flex items-center justify-between mb-4">
                <div className="font-mono text-[10px] tracking-[0.26em] uppercase text-[#faf7f2]">Filters</div>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} className="font-mono text-[9px] tracking-[0.22em] uppercase text-[#cfc8b8]/55 hover:text-[#c9a24a]">
                    Reset · {activeFilterCount}
                  </button>
                )}
              </div>

              <FilterSection title="Genus" values={genera} field="genera" isActive={isActive} toggle={toggleArrayFilter} />
              <FilterSection title="Country" values={countries} field="countries" isActive={isActive} toggle={toggleArrayFilter} />
              <FilterSection title="Source" values={sources} field="datasets" isActive={isActive} toggle={toggleArrayFilter} />
            </div>
          </aside>

          <div className="lg:col-span-9">
            {loading ? (
              <div className="min-h-[40vh] flex items-center justify-center">
                <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[#cfc8b8]/70 inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading image library…
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-10 text-center">
                <ImageIcon className="h-9 w-9 text-[#c9a24a]/40 mx-auto mb-3" strokeWidth={1.2} />
                <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#7a7466]">
                  Awaiting Orchid Continuum Record · adjust filters
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filtered.slice(0, 200).map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setSelected(img)}
                    className="group relative aspect-square rounded-lg overflow-hidden border border-white/[0.08] bg-[#06091a] hover:border-[#c9a24a]/50 transition-colors"
                  >
                    <img src={img.imageUrl} alt={img.scientificName} className="w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 text-left">
                      <div className="font-display italic text-[12px] text-white truncate">{img.scientificName}</div>
                      <div className="font-mono text-[8.5px] tracking-[0.16em] uppercase text-[#c9a24a]/90 truncate">
                        {img.country ?? 'awaiting'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="relative max-w-4xl w-full bg-[#0a1224] border border-white/10 rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/40 border border-white/20 flex items-center justify-center text-white">
              <X className="h-4 w-4" />
            </button>
            <img src={selected.imageUrl} alt={selected.scientificName} className="w-full h-full object-cover max-h-[80vh]" />
            <div className="p-6">
              <div className="font-display italic text-2xl text-[#faf7f2] mb-3">{selected.scientificName}</div>
              <div className="space-y-2 font-body text-[13px] text-[#cfc8b8]/85">
                {selected.habitat && (
                  <div><span className="font-mono text-[9px] tracking-[0.18em] uppercase text-[#7a7466] mr-2">Habitat</span>{selected.habitat}</div>
                )}
                {selected.country && (
                  <div className="inline-flex items-center gap-2"><MapPin className="h-3 w-3 text-[#c9a24a]" />{selected.country}{selected.region ? ` · ${selected.region}` : ''}</div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 items-center">
                <ConservationChip status={selected.conservationStatus} iucnCode={selected.iucnCode} />
                <VerifiedBadge verified={selected.verified} />
                <SourceCitation dataset={selected.source} sourceRecordId={selected.sourceRecordId} occurrenceId={selected.occurrenceId} />
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  to={`/species/${encodeURIComponent(selected.speciesSlug)}`}
                  className="font-mono text-[10px] tracking-[0.22em] uppercase px-4 py-2 rounded-full bg-[#c9a24a] text-[#14140a] hover:bg-[#deb866]"
                >
                  Open species
                </Link>
                {selected.occurrenceId && (
                  <Link
                    to={`/atlas?occurrence=${encodeURIComponent(selected.occurrenceId)}`}
                    className="font-mono text-[10px] tracking-[0.22em] uppercase px-4 py-2 rounded-full border border-white/20 text-[#faf7f2] hover:border-[#c9a24a]/60"
                  >
                    View in Atlas
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

const FilterSection: React.FC<{
  title: string;
  values: string[];
  field: 'genera' | 'countries' | 'datasets' | 'habitats';
  isActive: (f: string, v: string) => boolean;
  toggle: (f: string, v: string) => void;
}> = ({ title, values, field, isActive, toggle }) => (
  <div className="mb-4 border-t border-white/[0.06] pt-4 first:border-t-0 first:pt-0">
    <div className="font-mono text-[10px] tracking-[0.26em] uppercase text-[#c9a24a] mb-2.5">{title}</div>
    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
      {values.map((v) => (
        <button
          key={v}
          onClick={() => toggle(field, v)}
          className={[
            'px-2 py-0.5 rounded-full text-[9px] tracking-[0.14em] uppercase border transition-colors',
            isActive(field, v)
              ? 'bg-[#c9a24a]/15 border-[#c9a24a]/60 text-[#faf7f2]'
              : 'bg-white/[0.02] border-white/10 text-[#cfc8b8]/70 hover:border-[#c9a24a]/40',
          ].join(' ')}
        >
          {v}
        </button>
      ))}
    </div>
  </div>
);

export default Gallery;
