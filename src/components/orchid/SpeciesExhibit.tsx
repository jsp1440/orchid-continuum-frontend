import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Database, ImageOff, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  fetchSpeciesExhibit,
  type SpeciesExhibitCard,
  type SpeciesExhibitFetchResult,
} from '@/lib/speciesExhibit';

type SpeciesExhibitProps = {
  genus: string;
  onCountChange?: (count: number) => void;
};

function confidenceLabel(card: SpeciesExhibitCard): string {
  if (card.confidence.state !== 'available' || card.confidence.score == null) {
    return 'Confidence unavailable';
  }
  const score = Math.round(card.confidence.score * 100);
  return card.confidence.label ? `${card.confidence.label} · ${score}%` : `${score}%`;
}

function EvidenceBadge({ state }: { state: SpeciesExhibitCard['evidence_state'] }) {
  return (
    <span className="rounded-full border border-[#c7b27a] bg-[#fff8e6] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#6a5928]">
      {state}
    </span>
  );
}

function UnavailablePanel({ genus, status }: { genus: string; status: SpeciesExhibitFetchResult['status'] }) {
  const invalid = status === 'invalid_genus';
  return (
    <section
      aria-live="polite"
      className="rounded-lg border border-[#d9caa8] bg-[#fffaf0]/95 p-5 shadow-[0_10px_24px_rgba(30,40,20,0.06)]"
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#8a8062]">Species Exhibit</p>
      <h3 className="mt-1 font-serif text-3xl leading-tight text-[#24321f]">
        {invalid ? 'Species request unavailable' : `${genus} species evidence is unavailable`}
      </h3>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d684c]">
        No species-specific evidence packet can be displayed right now. The Continuum will not substitute
        genus-level narrative, cached captions, or invented scientific claims.
      </p>
    </section>
  );
}

const SpeciesExhibit: React.FC<SpeciesExhibitProps> = ({ genus, onCountChange }) => {
  const [result, setResult] = useState<SpeciesExhibitFetchResult>({
    status: 'unavailable',
    response: null,
    items: [],
  });
  const [loading, setLoading] = useState(true);
  const [selectedTaxonId, setSelectedTaxonId] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailedImages(new Set());
    void fetchSpeciesExhibit(genus, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setResult(next);
        const firstTaxon = next.items[0]?.taxon_id ?? null;
        setSelectedTaxonId(firstTaxon);
        onCountChange?.(next.items.length);
      })
      .catch((error) => {
        if ((error as Error)?.name === 'AbortError') return;
        setResult({ status: 'service_error', response: null, items: [] });
        setSelectedTaxonId(null);
        onCountChange?.(0);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [genus, onCountChange]);

  const selected = useMemo(
    () => result.items.find((item) => item.taxon_id === selectedTaxonId) ?? result.items[0] ?? null,
    [result.items, selectedTaxonId],
  );

  if (loading) {
    return (
      <section
        aria-busy="true"
        className="rounded-lg border border-[#d9caa8] bg-[#f6f0df]/95 p-5 shadow-[0_10px_24px_rgba(30,40,20,0.06)]"
      >
        <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#8a8062]">Species Exhibit</p>
        <p className="mt-2 text-sm text-[#5d684c]">Loading evidence-grounded species cards…</p>
      </section>
    );
  }

  if (result.status !== 'ok' || !selected) {
    return <UnavailablePanel genus={genus} status={result.status} />;
  }

  return (
    <section className="rounded-lg border border-[#d9caa8] bg-[#f6f0df]/95 p-5 shadow-[0_10px_24px_rgba(30,40,20,0.06)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#8a8062]">Species Exhibit</p>
          <h3 className="mt-1 font-serif text-3xl leading-tight text-[#24321f]">
            Nine evidence-grounded species stories
          </h3>
          <p className="mt-2 text-sm leading-6 text-[#5d684c]">
            Every card is a distinct canonical species. Captions, facts, confidence, and caveats come from
            the server-owned evidence packet; unavailable evidence stays unavailable.
          </p>
        </div>
        <Link
          to={`/genus/${encodeURIComponent(genus)}`}
          className="inline-flex items-center gap-2 rounded-lg border border-[#c7b27a] bg-[#fff8e6] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#5b4b21] hover:bg-[#f8ecc8]"
        >
          Genus research profile <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {result.items.map((item) => {
          const selectedCard = item.taxon_id === selected.taxon_id;
          const media = item.representative_media;
          const imageFailed = !!media && failedImages.has(media.url);
          return (
            <button
              key={item.taxon_id}
              type="button"
              onClick={() => setSelectedTaxonId(item.taxon_id)}
              aria-pressed={selectedCard}
              className={`overflow-hidden rounded-lg border bg-[#fffaf0] text-left transition focus:outline-none focus:ring-2 focus:ring-[#8a6f2d] ${
                selectedCard ? 'border-[#8a6f2d] shadow-md' : 'border-[#dfd1ad] hover:border-[#b89b52]'
              }`}
            >
              {media && !imageFailed ? (
                <img
                  src={media.url}
                  alt={`Representative source image for ${item.display_name}`}
                  className="h-44 w-full object-cover"
                  loading="lazy"
                  onError={() => {
                    setFailedImages((current) => {
                      const next = new Set(current);
                      next.add(media.url);
                      return next;
                    });
                  }}
                />
              ) : (
                <div className="flex h-44 items-center justify-center gap-2 bg-[#efe7d2] px-4 text-center text-xs text-[#6c715e]">
                  <ImageOff className="h-4 w-4" />
                  <span>Representative image unavailable</span>
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-serif text-xl italic leading-tight text-[#24321f]">
                      {item.display_name}
                    </h4>
                    {item.authorship && (
                      <p className="mt-1 text-xs not-italic leading-5 text-[#747866]">{item.authorship}</p>
                    )}
                  </div>
                  <EvidenceBadge state={item.evidence_state} />
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#3f4936]">
                  {item.caption ?? 'Species-specific narrative unavailable from connected evidence.'}
                </p>
                <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8a8062]">
                  {confidenceLabel(item)}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <article className="mt-5 rounded-lg border border-[#cdbd95] bg-[#fffaf0] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8a6f2d]">Selected species</p>
            <h4 className="mt-1 font-serif text-3xl italic leading-tight text-[#24321f]">
              {selected.display_name}
            </h4>
            {selected.authorship && (
              <p className="mt-1 text-sm not-italic text-[#686e5a]">{selected.authorship}</p>
            )}
            <p className="mt-4 text-base leading-7 text-[#34402d]">
              {selected.caption ?? 'Species-specific narrative unavailable from connected evidence.'}
            </p>
            {selected.distinguishing_fact && (
              <p className="mt-3 text-sm leading-6 text-[#5d684c]">
                <strong>Evidence-backed fact:</strong> {selected.distinguishing_fact}
              </p>
            )}
          </div>
          <div className="min-w-[210px] rounded-lg border border-[#dfd1ad] bg-[#f6f0df] p-4">
            <div className="flex items-center gap-2 text-[#6d5a27]">
              <ShieldCheck className="h-4 w-4" />
              <span className="font-mono text-[9px] uppercase tracking-[0.16em]">Evidence state</span>
            </div>
            <p className="mt-2 text-sm text-[#34402d]">{selected.evidence_state}</p>
            <p className="mt-2 text-xs leading-5 text-[#686e5a]">{confidenceLabel(selected)}</p>
          </div>
        </div>

        {selected.caveats.length > 0 && (
          <div className="mt-4 rounded-lg border border-[#e0cf9d] bg-[#fff8e6] p-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#7b6425]">Caveats</p>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-[#5d684c]">
              {selected.caveats.map((caveat) => <li key={caveat}>• {caveat}</li>)}
            </ul>
          </div>
        )}

        <details className="mt-4 rounded-lg border border-[#dfd1ad] bg-white/60 p-4">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.16em] text-[#6d5a27]">
            Provenance and unavailable evidence
          </summary>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 text-[#6d5a27]">
                <Database className="h-4 w-4" />
                <p className="font-mono text-[9px] uppercase tracking-[0.16em]">Provenance</p>
              </div>
              <ul className="mt-2 space-y-2 text-xs leading-5 text-[#5d684c]">
                {selected.provenance.map((anchor, index) => (
                  <li key={`${anchor.kind}-${anchor.source}-${anchor.record_id}-${index}`}>
                    {anchor.kind}: {anchor.source ?? 'source unavailable'}
                    {anchor.record_id != null ? ` · ${anchor.record_id}` : ''}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#6d5a27]">
                Unavailable domains
              </p>
              <p className="mt-2 text-xs leading-5 text-[#5d684c]">
                {selected.unavailable_domains.length > 0
                  ? selected.unavailable_domains.join(', ')
                  : 'None reported by this packet.'}
              </p>
              {selected.contradictions.length > 0 && (
                <p className="mt-3 text-xs leading-5 text-[#7a4e32]">
                  {selected.contradictions.length} contradiction marker(s) are preserved in the evidence packet.
                </p>
              )}
            </div>
          </div>
        </details>
      </article>
    </section>
  );
};

export default SpeciesExhibit;
