import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  fetchTaxonImages,
  type GalleryCounts,
  type GalleryImage,
  type GalleryResponse,
} from './api';

/**
 * SpeciesPhotoGallery — the licence-cleared photos of one backbone taxon.
 *
 * One photo: that photo, large, with its credit and licence. More than one: the primary photo large,
 * then "See all photos", a paged grid whose thumbnails open a larger view.
 *
 * What is shown about a photo is a closed list: the rights-holder credit and the licence exactly as the
 * API gives them (with the licence deed linked when given), the sanitised source label and the
 * identification status in plain words. No observer, place, coordinate or date is rendered, whatever the
 * payload holds. No photo is offered for download or saving: no image is wrapped in a link to its file.
 *
 * States: loading; route off (404) -> nothing; nothing linked -> nothing; linked but none cleared ->
 * "No licence-cleared photos yet"; a failed or partial read -> "Photos are unavailable right now"
 * (a gap, not an absence).
 */

export interface SpeciesPhotoGalleryProps {
  /** World Plants backbone taxon id (the `<id>` of a graph key `taxon:<id>`), never a /species/:slug id. */
  taxonId: string;
  /** Accepted name, used for alt text. */
  speciesName: string;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; body: GalleryResponse };

const GAP_STATES = new Set(['NO_ANSWERING_LINK_RUN', 'NO_IMAGE_SUMMARY_BUILD', 'COUNTS_UNAVAILABLE']);

const VERIFICATION_WORDS: Record<string, string> = {
  source_name: 'named by the source',
  identified_by_grower: 'identified by a grower',
  unverified_needs_expert_verification: 'not yet verified by an expert',
};

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

function countLine(counts: GalleryCounts): string {
  return `${plural(counts.displayable, 'photo', 'photos')} we can show of ${counts.linked.toLocaleString('en-US')} linked`;
}

function verificationWords(photo: GalleryImage): string | null {
  const id = photo.identification;
  if (!id) return null;
  if (id.verification && VERIFICATION_WORDS[id.verification]) return VERIFICATION_WORDS[id.verification];
  return id.verification_label || null;
}

function licenceLabel(photo: GalleryImage): string | null {
  return photo.licence_name || photo.licence || null;
}

function dedupe(photos: Array<GalleryImage | null | undefined>): GalleryImage[] {
  const seen = new Set<number>();
  const out: GalleryImage[] = [];
  for (const p of photos) {
    if (!p || !p.url || seen.has(p.image_id)) continue;
    seen.add(p.image_id);
    out.push(p);
  }
  return out;
}

/** Credit, licence, source and identification of one photo — and nothing else. */
function PhotoCredit({ photo, compact = false }: { photo: GalleryImage; compact?: boolean }) {
  const licence = licenceLabel(photo);
  const verification = verificationWords(photo);
  const nonCommercial = photo.licence_class === 'noncommercial' || photo.commercial_use === false;
  const text = compact ? 'text-[11px]' : 'text-[12px]';
  return (
    <div data-testid="photo-credit" className={`mt-2 font-body ${text} text-[#cfc8b8]/80 leading-snug space-y-0.5`}>
      {photo.attribution && (
        <div>
          <span className="text-[#cfc8b8]/55">Credit: </span>
          <span>{photo.attribution}</span>
        </div>
      )}
      {licence && (
        <div>
          <span className="text-[#cfc8b8]/55">Licence: </span>
          {photo.licence_url ? (
            <a
              href={photo.licence_url}
              target="_blank"
              rel="noreferrer license"
              className="text-[#c9a24a] hover:text-[#deb866] underline underline-offset-2"
            >
              {licence}
            </a>
          ) : (
            <span>{licence}</span>
          )}
        </div>
      )}
      {!compact && photo.source_label && (
        <div>
          <span className="text-[#cfc8b8]/55">Source: </span>
          <span>{photo.source_label}</span>
        </div>
      )}
      {verification && (
        <div>
          <span className="text-[#cfc8b8]/55">Identification: </span>
          <span>{verification}</span>
        </div>
      )}
      {!compact && nonCommercial && (
        <div className="text-[#cfc8b8]/55">Non-commercial licence: shown here with credit, not for download or reuse.</div>
      )}
      {!compact && photo.unmodified_only && (
        <div className="text-[#cfc8b8]/55">Shown unmodified, as the licence requires.</div>
      )}
    </div>
  );
}

function Shell({ children, headingId }: { children: React.ReactNode; headingId: string }) {
  return (
    <section
      data-testid="species-photo-gallery"
      aria-labelledby={headingId}
      className="mt-8 border-t border-white/[0.08] pt-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Camera className="h-4 w-4 text-[#c9a24a]" aria-hidden="true" />
        <h2 id={headingId} className="font-mono text-[10px] tracking-[0.26em] uppercase text-[#c9a24a]">
          Photographs
        </h2>
      </div>
      {children}
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#7a7466]">
      {children}
    </p>
  );
}

const SpeciesPhotoGallery: React.FC<SpeciesPhotoGalleryProps> = ({ taxonId, speciesName }) => {
  const headingId = useId();
  const gridId = useId();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [pages, setPages] = useState<GalleryImage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  // The thumbnail that opened the larger view: focus goes back to it when the view closes.
  const opener = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setPhase({ kind: 'loading' });
    setPages([]);
    setNextCursor(null);
    setMoreFailed(false);
    setGridOpen(false);
    setViewer(null);
    fetchTaxonImages(taxonId, null, ctrl.signal)
      .then((result) => {
        if (ctrl.signal.aborted) return;
        if (result.status === 'off') setPhase({ kind: 'off' });
        else if (result.status === 'unavailable') setPhase({ kind: 'unavailable' });
        else {
          setPhase({ kind: 'ready', body: result.body });
          setPages(result.body.images);
          setNextCursor(result.body.page?.next_cursor ?? null);
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setPhase({ kind: 'unavailable' });
      });
    return () => ctrl.abort();
  }, [taxonId]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    const result = await fetchTaxonImages(taxonId, nextCursor).catch(
      () => ({ status: 'unavailable' }) as const,
    );
    if (result.status === 'ok') {
      setPages((prev) => [...prev, ...result.body.images]);
      setNextCursor(result.body.page?.next_cursor ?? null);
    } else {
      setMoreFailed(true);
    }
    setLoadingMore(false);
  }, [nextCursor, loadingMore, taxonId]);

  if (phase.kind === 'off') return null;
  if (phase.kind === 'loading') {
    return (
      <Shell headingId={headingId}>
        <div role="status" className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] uppercase text-[#cfc8b8]/60">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Loading photos…
        </div>
      </Shell>
    );
  }
  if (phase.kind === 'unavailable') {
    return (
      <Shell headingId={headingId}>
        <Note>Photos are unavailable right now.</Note>
      </Shell>
    );
  }

  const { body } = phase;
  const counts = body.counts;
  const gallery = dedupe(pages);
  const primary = (body.primary && body.primary.url ? body.primary : null) ?? gallery[0] ?? null;

  if (!primary) {
    if (counts && counts.linked > 0) {
      return (
        <Shell headingId={headingId}>
          <Note>No licence-cleared photos yet.</Note>
        </Shell>
      );
    }
    if (!counts && GAP_STATES.has(String(body.state))) {
      return (
        <Shell headingId={headingId}>
          <Note>Photos are unavailable right now.</Note>
        </Shell>
      );
    }
    return null;
  }

  const all = dedupe([primary, ...gallery]);
  const many = all.length > 1 || Boolean(nextCursor);
  const current = viewer === null ? null : all[viewer] ?? null;

  return (
    <Shell headingId={headingId}>
      {counts && (
        <p data-testid="photo-count" className="mb-3 font-body text-[13px] text-[#cfc8b8]/80">
          {countLine(counts)}
          {counts.unverified_hidden > 0 &&
            ` · ${plural(counts.unverified_hidden, 'more awaits', 'more await')} expert verification`}
        </p>
      )}

      <figure data-testid="primary-photo">
        <div className="rounded-2xl overflow-hidden bg-[#0a0d1c] border border-white/[0.08]">
          <img
            src={primary.url ?? undefined}
            alt={speciesName}
            className="w-full max-h-[520px] object-contain bg-black/30"
            draggable={false}
          />
        </div>
        <figcaption>
          <PhotoCredit photo={primary} />
        </figcaption>
      </figure>

      {many && (
        <div className="mt-5">
          <button
            type="button"
            aria-expanded={gridOpen}
            aria-controls={gridId}
            onClick={() => setGridOpen((open) => !open)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#c9a24a]/50 bg-[#c9a24a]/[0.08] text-[#c9a24a] hover:bg-[#c9a24a]/[0.14] transition-colors font-mono text-[10px] tracking-[0.2em] uppercase"
          >
            {gridOpen ? 'Hide photos' : 'See all photos'}
          </button>

          {gridOpen && (
            <div id={gridId} className="mt-4">
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4" aria-label={`Photos of ${speciesName}`}>
                {all.map((photo, index) => (
                  <li key={photo.image_id} className="rounded-xl border border-white/[0.08] bg-[#0a0d1c]/70 p-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        opener.current = event.currentTarget;
                        setViewer(index);
                      }}
                      aria-label={`Open larger view of photo ${index + 1} of ${speciesName}`}
                      className="block w-full aspect-square overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a24a]"
                    >
                      <img
                        src={photo.url ?? undefined}
                        alt={`${speciesName}, photo ${index + 1}`}
                        loading="lazy"
                        draggable={false}
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <PhotoCredit photo={photo} compact />
                  </li>
                ))}
              </ul>
              {nextCursor && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/[0.15] text-[#cfc8b8] hover:text-[#faf7f2] font-mono text-[10px] tracking-[0.2em] uppercase disabled:opacity-50"
                >
                  {loadingMore && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                  {loadingMore ? 'Loading more photos…' : 'Show more photos'}
                </button>
              )}
              {moreFailed && (
                <div className="mt-2">
                  <Note>More photos are unavailable right now.</Note>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={current !== null} onOpenChange={(open) => !open && setViewer(null)}>
        {current && viewer !== null && (
          <DialogContent
            className="max-w-4xl bg-[#04050d] text-[#f5f0e8] border-white/[0.12]"
            onCloseAutoFocus={(event) => {
              if (opener.current) {
                event.preventDefault();
                opener.current.focus();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' && viewer < all.length - 1) setViewer(viewer + 1);
              if (event.key === 'ArrowLeft' && viewer > 0) setViewer(viewer - 1);
            }}
          >
            <DialogTitle className="font-display italic text-xl text-[#faf7f2]">
              {speciesName} — photo {viewer + 1} of {all.length}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Larger view. Use the arrow keys for the previous or next photo; Escape closes.
            </DialogDescription>
            <img
              src={current.url ?? undefined}
              alt={`${speciesName}, photo ${viewer + 1}`}
              draggable={false}
              className="w-full max-h-[70vh] object-contain bg-black/30 rounded-lg"
            />
            <PhotoCredit photo={current} />
            {all.length > 1 && (
              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setViewer(viewer - 1)}
                  disabled={viewer === 0}
                  className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.2em] uppercase text-[#c9a24a] disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
                </button>
                <button
                  type="button"
                  onClick={() => setViewer(viewer + 1)}
                  disabled={viewer >= all.length - 1}
                  className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.2em] uppercase text-[#c9a24a] disabled:opacity-30"
                >
                  Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>
    </Shell>
  );
};

export default SpeciesPhotoGallery;
