import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import { ECUADOR_EMBED_BASE_URL } from '@/lib/backendConfig';

/**
 * Ecuador Cloud Forest Expedition
 * -------------------------------
 * The map itself is rendered by an EXTERNAL service and embedded here as a
 * full-width iframe. This page only provides:
 *   - the normal site header / navigation
 *   - a full-bleed iframe container for the embedded Atlas map
 *   - a warm cream overlay panel (title, description, genus filters) that
 *     floats ABOVE the iframe.
 *
 * No map is constructed in this file. The genus filter buttons simply append
 * a `?genus=` query parameter to the embed URL so the external page can react
 * to it (and reset via "Show All").
 */

// ---------------------------------------------------------------------------
// External embed URL — derived from the single backend config so a host change
// is a one-line edit in src/lib/backendConfig.ts.
// ---------------------------------------------------------------------------
const EMBED_BASE_URL = ECUADOR_EMBED_BASE_URL;

const GENERA = ['Masdevallia', 'Dracula', 'Epidendrum'] as const;
type Genus = (typeof GENERA)[number] | null;

const EcuadorExpedition: React.FC = () => {
  const [genus, setGenus] = useState<Genus>(null);

  // Build the iframe src, passing the active genus as a query param so the
  // embedded map can filter (no map logic lives here).
  const iframeSrc = useMemo(() => {
    if (!genus) return EMBED_BASE_URL;
    const sep = EMBED_BASE_URL.includes('?') ? '&' : '?';
    return `${EMBED_BASE_URL}${sep}genus=${encodeURIComponent(genus)}`;
  }, [genus]);

  return (
    <div className="min-h-screen bg-[#f5efe2] text-[#4a3a22]">
      <Navbar />

      {/* MAIN CONTENT AREA — full-width iframe with overlay panel */}
      <main className="relative w-full" style={{ height: 'calc(100vh - 5rem)', marginTop: '5rem' }}>
        {/* The external Atlas map */}
        <iframe
          key={iframeSrc}
          src={iframeSrc}
          title="Ecuador Cloud Forest Expedition — Orchid Atlas"
          className="absolute inset-0 h-full w-full border-0 bg-[#f5efe2]"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allow="geolocation; fullscreen"
        />

        {/* LEFT OVERLAY PANEL — warm cream, floats above the iframe */}
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="pointer-events-auto absolute top-6 left-6 w-[min(360px,calc(100%-3rem))]">
            <div className="rounded-2xl border border-[#d8c9a8] bg-[#fbf6ec]/95 backdrop-blur-md p-6 shadow-[0_10px_40px_-12px_rgba(90,70,40,0.35)]">
              <Link
                to="/atlas"
                className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.3em] text-[#a8895a] hover:text-[#8a6418]"
              >
                <ArrowLeft className="h-3 w-3" /> Orchid Continuum · Atlas
              </Link>

              <h1
                className="mt-3 leading-[1.05] text-[#4a3a22]"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '1.7rem' }}
              >
                Ecuador Cloud Forest Expedition
              </h1>
              <p className="mt-1.5 text-[13px] tracking-wide text-[#8a6418]">
                552 verified orchid occurrences
              </p>

              <p className="mt-4 text-[13.5px] leading-relaxed text-[#6f5e44]">
                Ecuador contains more orchid species per square kilometer than
                almost anywhere on Earth. This expedition traces cloud forests
                from Pichincha to Zamora Chinchipe.
              </p>

              {/* Genus filter */}
              <div className="mt-6">
                <div className="text-[10px] uppercase tracking-[0.28em] text-[#a8895a] mb-2.5">
                  Filter by genus
                </div>
                <div className="flex flex-wrap gap-2">
                  {GENERA.map((g) => {
                    const active = genus === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGenus(active ? null : g)}
                        className={[
                          'rounded-full px-3.5 py-1.5 text-[12px] tracking-wide border transition-colors',
                          active
                            ? 'bg-[#c8861a] border-[#c8861a] text-[#fff7e6]'
                            : 'bg-transparent border-[#d8c9a8] text-[#6f5e44] hover:border-[#c8861a] hover:text-[#8a6418]',
                        ].join(' ')}
                      >
                        {g}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setGenus(null)}
                    className={[
                      'rounded-full px-3.5 py-1.5 text-[12px] tracking-wide border transition-colors',
                      genus === null
                        ? 'bg-[#4a3a22] border-[#4a3a22] text-[#fff7e6]'
                        : 'bg-transparent border-[#d8c9a8] text-[#6f5e44] hover:border-[#4a3a22]',
                    ].join(' ')}
                  >
                    Show All
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default EcuadorExpedition;
