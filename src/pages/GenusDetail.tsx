import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Leaf,
  Mountain,
  Bug,
  Sprout,
  Trees,
  ShieldQuestion,
  ShieldCheck,
  Camera,
  Heart,
} from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import FallbackImage from '@/components/orchid/FallbackImage';
import HeroCarousel from '@/components/orchid/HeroCarousel';
import ImageSourceIndicator from '@/components/orchid/ImageSourceIndicator';
import GenusOccurrenceMap from '@/components/orchid/GenusOccurrenceMap';
import NeighborGeneraSection from '@/components/orchid/NeighborGeneraSection';
import useSpeciesFavorites from '@/hooks/useSpeciesFavorites';
import { supabase } from '@/lib/supabase';
import {
  deriveEcologicalEvidence,
  authoredScientificName,
  buildRepresentativePlates,
  displayScientificName,
  hasAuthorship,
  EVIDENCE_STATE_LABEL,
  type EcologicalEvidence,
} from '@/lib/genusProfileDataQuality';
import { fetchGenusGraphEvidence, type GenusGraphResult } from '@/lib/knowledgeGraph';
import {
  genusProfileAtlasHref,
  genusProfileCalyxHref,
  genusProfileResearchHref,
  genusProfileSpeciesHref,
} from '@/lib/genusProfileNavigation';
import {
  lookupGenus,
  fetchGenusImagesWithSource,
  fetchValidatedSpecies,
  buildImageMap,
  binomialOf,
  buildValidatedSet,
  isValidatedName,
  warmBackends,
  type GenusEntry,
  type GenusImage,
  type ImageSource,
} from '@/lib/genusData';


/**
 * GenusDetail — dedicated /genus/:name page.
 *
 * Hero (genus name, family) over a deep-green field, the live occurrence map,
 * species plates built from live backend images, and an ecology panel whose
 * rows state their evidence. The local genus index carries NO taxon facts:
 * species counts, tribe, range, elevation, habitat, pollinators, mycorrhizae
 * and conservation are only shown when a live Continuum contract supplies
 * them; otherwise the page shows an honest unavailable / empty state.
 * Cross-platform navigation to the wider Continuum.
 */

const PLATFORM_LINKS = (genus: string): { label: string; to: string }[] => [
  { label: 'Atlas', to: genusProfileAtlasHref(genus) },
  { label: 'Ask Calyx', to: genusProfileCalyxHref(genus) },
  { label: 'Research', to: genusProfileResearchHref(genus) },
  { label: 'Species', to: genusProfileSpeciesHref(genus) },
  { label: 'Conservatory', to: '/zoo' },
  { label: 'Field Station', to: '/ecosystems' },
  { label: 'Deception Lab', to: '/pollinators' },
];

const EVIDENCE_BADGE_STYLE: Record<EcologicalEvidence['state'], string> = {
  available: 'border-[#2f6b3f]/40 bg-[#2f6b3f]/10 text-[#2f6b3f]',
  provisional: 'border-[#a37a1c]/40 bg-[#c9a24a]/12 text-[#7b5c12]',
  unavailable: 'border-[#2f3b21]/25 bg-[#2f3b21]/[0.06] text-[#6a705c]',
};

/**
 * An ecological relationship row that states WHAT KIND of evidence backs it.
 *
 * `available`   — the canonical Continuum knowledge graph links records here.
 * `provisional` — only the curated genus-level field-guide summary exists. It
 *                 is genus-scope and is not verified for every species shown.
 * `unavailable` — nothing is claimed; the reason distinguishes "no linked
 *                 record yet" from "the evidence service did not answer".
 */
const EcologyEvidenceRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  evidence: EcologicalEvidence;
}> = ({ icon, label, evidence }) => (
  <div className="flex items-start gap-3 py-3 border-b border-[#2f3b21]/10 last:border-0">
    <span className="mt-0.5 text-[#5a6b3f]">{icon}</span>
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[#8a8062]">{label}</span>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[8px] tracking-[0.14em] uppercase ${EVIDENCE_BADGE_STYLE[evidence.state]}`}
        >
          {EVIDENCE_STATE_LABEL[evidence.state]}
        </span>
      </div>
      <div className="mt-1 text-[14px] text-[#3a4630] leading-snug">{evidence.detail}</div>
      {evidence.scope === 'genus' && (
        <div className="mt-1 text-[12px] leading-snug text-[#6a705c]">
          {evidence.reason === 'linked-evidence'
            ? 'Genus-scope evidence from the Continuum knowledge graph. It is not a verified claim about every species below.'
            : 'Curated genus-scope summary held in this application. It is not Continuum evidence and is not verified per species.'}
        </div>
      )}
    </div>
  </div>
);

const NotFoundGenus: React.FC<{ name: string }> = ({ name }) => (
  <section className="max-w-[900px] mx-auto px-6 lg:px-10 py-24 text-center">
    <Leaf className="h-10 w-10 text-[#c9a24a] mx-auto" strokeWidth={1.1} />
    <h1
      className="mt-4 italic text-[#faf7f2]"
      style={{ fontFamily: '"Playfair Display",Georgia,serif', fontSize: 'clamp(2rem,4vw,3rem)' }}
    >
      {name}
    </h1>
    <p className="mt-3 text-[#cfc8b8]/80">
      We don&rsquo;t yet have a detailed profile for this genus in the field guide.
    </p>
    <Link
      to="/species"
      className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#c9a24a] text-[#1a2e1a] font-mono text-[11px] tracking-[0.22em] uppercase hover:bg-[#d8b35a]"
    >
      Search the flora <ArrowRight className="h-4 w-4" />
    </Link>
  </section>
);

const GenusDetail: React.FC = () => {
  const { name = '' } = useParams();
  const entry: GenusEntry | undefined = useMemo(() => lookupGenus(name), [name]);
  // Full trusted-image list for this genus (from /images/genus/{genus}). The
  // FIRST entry feeds the large featured hero image; the whole list builds the
  // per-plate image map.
  const [images, setImages] = useState<GenusImage[]>([]);
  // Whether the trusted-image fetch for the current genus is still in flight.
  // This lets the hero distinguish "still loading" (show shimmer) from
  // "loaded, but the backend returned nothing" (show an honest empty state),
  // instead of sitting on the loading placeholder forever when images === [].
  const [imagesLoading, setImagesLoading] = useState(false);
  // Validated OC backbone binomials for this genus. Empty + loaded => the
  // backend returned nothing, so plates are shown with an "unverified" badge.
  const [validatedSet, setValidatedSet] = useState<Set<string>>(new Set());
  const [validationLoaded, setValidationLoaded] = useState(false);
  // Where the current genus images came from (for the source-health indicator).
  const [imageSource, setImageSource] = useState<ImageSource | null>(null);

  // Canonical Continuum knowledge-graph coverage for this genus. It decides
  // whether an ecological relationship is presented as `available` evidence or
  // only as a `provisional` curated summary — never as a universal claim.
  const [graphEvidence, setGraphEvidence] = useState<GenusGraphResult | null>(null);

  // Session favorites (heart / bookmark) — shared across cards & the tab.
  const { isFavorite, toggleFavorite, count: favoriteCount } = useSpeciesFavorites();

  // AI-generated narrative for the featured genus (Claude via edge function).
  const [narrative, setNarrative] = useState<string>('');
  const [narrativeLoading, setNarrativeLoading] = useState(false);

  // Species whose every candidate image URL failed to load (after fallbacks).
  // Such cards are REMOVED from the grid entirely rather than left showing the
  // "Image pending" placeholder.
  const [failedSpecies, setFailedSpecies] = useState<Set<string>>(new Set());

  // Trusted images keyed by binomial for matching to each species plate.
  const imageMap = useMemo(() => buildImageMap(images), [images]);

  // Candidate URLs for the large featured hero, in the exact priority the
  // request specifies: response.images[0].image_url first, then
  // response.images[1].image_url, then response.images[2].image_url. After
  // those three primaries we append every remaining candidate URL (each
  // record's image_urls) as deeper fallbacks, so a fully-broken first three
  // still resolves to a real photo rather than the placeholder.
  const heroUrls = useMemo(() => {
    const out: string[] = [];
    const push = (u?: string) => {
      if (u && !out.includes(u)) out.push(u);
    };
    // Primary trio — images[0..2].image_url, exactly as requested.
    push(images[0]?.image_url);
    push(images[1]?.image_url);
    push(images[2]?.image_url);
    // Deeper fallbacks: every other candidate URL across the whole response.
    for (const img of images) {
      const urls = img.image_urls?.length ? img.image_urls : img.image_url ? [img.image_url] : [];
      for (const u of urls) push(u);
    }
    return out;
  }, [images]);


  // The photograph currently painted by the hero carousel. Attribution follows
  // the visible image, so a rotating hero never reuses the first record's
  // species name and licence for a different photograph.
  const [heroActiveUrl, setHeroActiveUrl] = useState<string | null>(null);

  const heroRecordByUrl = useMemo(() => {
    const map = new Map<string, GenusImage>();
    for (const img of images) {
      const candidates = img.image_urls?.length
        ? img.image_urls
        : img.image_url
          ? [img.image_url]
          : [];
      for (const url of candidates) {
        if (url && !map.has(url)) map.set(url, img);
      }
    }
    return map;
  }, [images]);

  const heroRecord = useMemo(
    () => (heroActiveUrl ? heroRecordByUrl.get(heroActiveUrl) ?? null : null),
    [heroActiveUrl, heroRecordByUrl],
  );

  const heroDisplayName = heroRecord ? displayScientificName(heroRecord.scientific_name) : '';
  const heroAuthoredName = heroRecord ? authoredScientificName(heroRecord.scientific_name) : '';

  const heroAttribution = useMemo(() => {
    if (!heroRecord) return '';
    return [heroDisplayName, heroRecord.image_source, heroRecord.image_license]
      .filter(Boolean)
      .join(' · ');
  }, [heroRecord, heroDisplayName]);



  useEffect(() => {
    if (!entry) return;
    // Wake the cold-start-prone harvester backend before any image request.
    warmBackends();
    const ctrl = new AbortController();

    // Trusted, backbone-validated images from the OC approved library. The
    // source-reporting variant lets us show a small image-source health
    // indicator (live / cache / proxy / pending) over the featured hero.
    setImages([]);
    setImageSource(null);
    setImagesLoading(true);
    fetchGenusImagesWithSource(entry.genus, ctrl.signal, 20)
      .then(({ images: imgs, source }) => {
        if (ctrl.signal.aborted) return;
        setImages(imgs);
        setImageSource(source);
      })
      .catch(() => {
        /* keep empty list → leaf "Image pending" placeholders */
        if (!ctrl.signal.aborted) setImageSource('pending');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setImagesLoading(false);
      });


    setGraphEvidence(null);
    fetchGenusGraphEvidence(entry.genus, ctrl.signal)
      .then((result) => {
        if (!ctrl.signal.aborted) setGraphEvidence(result);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setGraphEvidence({ status: 'unavailable' });
      });

    setValidationLoaded(false);
    setValidatedSet(new Set());
    fetchValidatedSpecies(entry.genus, ctrl.signal, 60)
      .then((names) => {
        if (ctrl.signal.aborted) return;
        setValidatedSet(buildValidatedSet(names));
        setValidationLoaded(true);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setValidationLoaded(true);
      });
    return () => ctrl.abort();
  }, [entry]);

  // Fetch the genus narrative from the genus-narrative edge function. There is
  // NO local fallback text: when the service is unavailable the Field Note
  // block is simply not rendered rather than filled with unsourced claims.
  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    setNarrative('');
    setFailedSpecies(new Set()); // reset per-genus failed-image tracking
    setNarrativeLoading(true);
    supabase.functions
      .invoke('genus-narrative', { body: { genus: entry.genus } })
      .then(({ data, error }) => {
        if (cancelled) return;
        const text = (data as { narrative?: string } | null)?.narrative;
        setNarrative(!error && text ? text : '');
      })
      .catch(() => {
        if (!cancelled) setNarrative('');
      })
      .finally(() => {
        if (!cancelled) setNarrativeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entry]);


  // Mark a species as failed once every candidate image URL has been exhausted.
  const handlePlateSettled = (species: string, success: boolean) => {
    if (success) return;
    setFailedSpecies((prev) => {
      if (prev.has(species)) return prev;
      const next = new Set(prev);
      next.add(species);
      return next;
    });
  };

  // DIAGNOSTIC: print the EXACT object fetchGenusImages returned for this genus
  // right before the hero renders, so the binding can be verified against the
  // real runtime shape (array of { scientific_name, image_url, image_urls }).
  if (entry) {
    console.log(
      `[GenusDetail] fetchGenusImages("${entry.genus}") returned:`,
      images,
      '\n  → images[0]?.image_url =', images[0]?.image_url,
      '\n  → images[1]?.image_url =', images[1]?.image_url,
      '\n  → images[2]?.image_url =', images[2]?.image_url,
      '\n  → heroUrls (ordered candidates) =', heroUrls,
    );
  }

  // Species plates are built ONLY from trusted backend image records (their
  // scientific_name + image URLs + source/licence). The separately requested
  // backbone sample is limited and therefore may verify a name, but absence
  // from that sample must never reject a taxonomy-joined image record. A plate
  // never carries locally authored distribution, elevation, pollinator or
  // conservation text.
  const unverifiedMode = validationLoaded;

  /**
   * Representative species plates.
   *
   * De-duplicated by normalised taxon identity AND by photograph, so neither a
   * repeated species nor a repeated image can dominate the gallery. Each entry
   * carries its display binomial and the authored name kept for provenance.
   */
  const visiblePlates = useMemo(() => {
    if (!entry) return [];
    const withName = images.filter((img) => binomialOf(img.scientific_name || '').includes(' '));
    const plateCandidates = imageSource === 'inaturalist'
      ? validationLoaded
        ? withName.filter((img) => isValidatedName(img.scientific_name, validatedSet))
        : []
      : withName;

    const representative = buildRepresentativePlates(plateCandidates, {
      nameOf: (img) => img.scientific_name,
      urlsOf: (img) => {
        const trusted = imageMap.get(binomialOf(img.scientific_name));
        return (trusted?.image_urls?.length ? trusted.image_urls : img.image_url ? [img.image_url] : []).filter(
          (url): url is string => Boolean(url),
        );
      },
    });

    return representative.filter((plate) => {
      // Skip plates whose every candidate image failed to load.
      if (failedSpecies.has(plate.entry.scientific_name)) return false;
      // A plate exists only to show a live photograph; drop it with none left.
      if (plate.urls.length === 0) return false;
      return true;
    });
  }, [entry, images, imageSource, validationLoaded, validatedSet, failedSpecies, imageMap]);

  /**
   * Ecological relationships, expressed as evidence states rather than as
   * universal genus-wide assertions. `available` requires canonical Continuum
   * linkage; the curated field-guide text can only ever be `provisional`.
   */
  const pollinatorEvidence = useMemo(() => {
    const domain =
      graphEvidence?.status === 'ok'
        ? graphEvidence.evidence.domains.find((d) => d.domain === 'pollinators')
        : undefined;
    return deriveEcologicalEvidence({
      serviceAnswered: graphEvidence !== null && graphEvidence.status !== 'unavailable',
      hasLinkedEvidence: Boolean(domain && (domain.nodes > 0 || domain.edges > 0)),
      linkedSummary: domain
        ? `${domain.nodes} linked pollination nodes · ${domain.edges} relationships in the Continuum graph`
        : null,
    });
  }, [graphEvidence]);

  const mycorrhizalEvidence = useMemo(
    () =>
      // The knowledge-graph contract exposes no mycorrhizal domain, so no
      // canonical linkage can be claimed here yet: the row states that gap.
      deriveEcologicalEvidence({
        serviceAnswered: graphEvidence !== null && graphEvidence.status !== 'unavailable',
        hasLinkedEvidence: false,
      }),
    [graphEvidence],
  );

  // No Continuum contract currently supplies genus elevation or habitat, so
  // these rows state that gap instead of showing locally authored values.
  const unsourcedEcologyEvidence = useMemo(
    () =>
      deriveEcologicalEvidence({
        serviceAnswered: graphEvidence !== null && graphEvidence.status !== 'unavailable',
        hasLinkedEvidence: false,
      }),
    [graphEvidence],
  );


  return (
    <div
      className="min-h-screen bg-[#1a2e1a] text-[#f5f0e8]"
      style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
    >
      <style>{`
        .font-display { font-family: 'Playfair Display','Cormorant Garamond',Georgia,serif; }
        .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
      `}</style>
      <Navbar />

      {!entry ? (
        <main className="pt-28 pb-20">
          <NotFoundGenus name={name} />
          {/* Even without a curated profile, the co-occurring neighbour view
              is fully dynamic (occurrence Atlas + cache) and works for ANY
              genus name — so we still render the explorable neighbour map. */}
          {name && <NeighborGeneraSection genus={name} />}
        </main>
      ) : (
        <main className="pt-28 pb-24">
          {/* Back link */}
          <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
            <Link
              to="/"
              className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-[#c9a24a] hover:text-[#d8b35a]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Hub
            </Link>
          </div>

          {/* Hero */}
          <section className="max-w-[1200px] mx-auto px-6 lg:px-10 mt-8">
            <div className="font-mono text-[10px] tracking-[0.36em] uppercase text-[#c9a24a]/85">
              Genus Profile
            </div>
            <h1
              className="mt-3 italic leading-[0.95]"
              style={{ fontFamily: '"Playfair Display",Georgia,serif', fontSize: 'clamp(2.6rem,6vw,4.6rem)' }}
            >
              {entry.genus}
            </h1>
            <div className="mt-3 font-mono text-[11px] tracking-[0.16em] uppercase text-[#a9b896]">
              {entry.family}
            </div>
            <p
              data-testid="genus-profile-unsourced-notice"
              className="mt-5 max-w-3xl font-mono text-[11px] leading-[1.7] tracking-[0.04em] text-[#a9b896]"
            >
              Species count, tribe, native range and genus description are not shown here until they
              are available from a sourced Continuum record. Photographs, occurrence points and
              species names below come from live Orchid Continuum services.
            </p>
          </section>


          {/* Featured hero image.
              Data flow: fetchGenusImages(genus) → images[] → heroUrls (ordered
              images[0].image_url, images[1].image_url, images[2].image_url,
              then every deeper candidate). HeroCarousel preloads & VALIDATES
              every URL, paints the first one that actually decodes (so a broken
              images[0] silently yields to images[1]/[2]), and — once 2+ photos
              are confirmed — slowly crossfades through the top 5 every 3
              minutes with each image fully loaded before its transition. */}
          <section className="max-w-[1200px] mx-auto px-6 lg:px-10 mt-10">
            <div className="relative w-full overflow-hidden rounded-3xl border border-[#c9a24a]/25 bg-[#13241a]" style={{ aspectRatio: '16 / 7' }}>
              <HeroCarousel
                urls={heroUrls}
                genus={entry.genus}
                fetching={imagesLoading}
                intervalMs={180_000}
                onActiveUrlChange={setHeroActiveUrl}
              />

              {/* Small, non-intrusive image-source health indicator. */}
              <div className="absolute top-3 right-3 z-10">
                <ImageSourceIndicator source={imageSource} />
              </div>

              {/* Caption overlay */}
              <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[#0c160e]/85 via-[#0c160e]/30 to-transparent px-6 py-5">
                {heroAttribution && (
                  <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] uppercase text-[#e7dcc2]">
                    <Camera className="h-3.5 w-3.5 text-[#c9a24a]" />
                    <span
                      className="truncate"
                      title={
                        heroAuthoredName && heroAuthoredName !== heroDisplayName
                          ? `Recorded as ${heroAuthoredName}`
                          : heroAttribution
                      }
                    >
                      {heroAttribution}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* AI species narrative — Claude-generated, 2-3 sentences. Off-white
              serif text on a dark-green field with a gold left-border accent. */}
          {(narrative || narrativeLoading) && (
            <section className="max-w-[1200px] mx-auto px-6 lg:px-10 mt-8">
              <div
                className="rounded-r-xl bg-[#13241a] border-l-4 border-[#c9a24a] px-6 py-5"
                style={{ fontFamily: 'Georgia, "Cormorant Garamond", serif' }}
              >
                <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]/85 mb-2">
                  Field Note · genus-level context
                </div>
                <p className="mb-3 font-mono text-[10px] leading-[1.6] tracking-[0.06em] text-[#a9b896]">
                  This note describes <span className="italic">{entry.genus}</span> as a genus. It is
                  not a species-specific account and does not change with the photograph shown above.
                </p>
                {narrative ? (
                  <p className="text-[#f3eee2]" style={{ fontSize: '16px', lineHeight: 1.65 }}>
                    {narrative}
                  </p>
                ) : (
                  <p className="text-[#a9b896] italic" style={{ fontSize: '16px' }}>
                    Composing a field note about {entry.genus}…
                  </p>
                )}
              </div>
            </section>
          )}



          {/* Map + ecology */}
          <section className="max-w-[1200px] mx-auto px-6 lg:px-10 mt-12 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a] mb-3">
                Occurrences &amp; ecological partners
              </div>
              <GenusOccurrenceMap genus={entry.genus} />
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a] mb-3">
                Ecology
              </div>
              <div className="rounded-2xl bg-[#f5f0e8] text-[#2f3b21] border border-[#2f3b21]/12 p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-x-6">
                <EcologyEvidenceRow
                  icon={<Bug className="h-4 w-4" />}
                  label="Pollinator guild"
                  evidence={pollinatorEvidence}
                />
                <EcologyEvidenceRow
                  icon={<Sprout className="h-4 w-4" />}
                  label="Mycorrhizal partners"
                  evidence={mycorrhizalEvidence}
                />
                <EcologyEvidenceRow
                  icon={<Mountain className="h-4 w-4" />}
                  label="Elevation range"
                  evidence={unsourcedEcologyEvidence}
                />
                <EcologyEvidenceRow
                  icon={<Trees className="h-4 w-4" />}
                  label="Habitat type"
                  evidence={unsourcedEcologyEvidence}
                />
              </div>
            </div>
          </section>

          {/* Species plates */}
          <section className="max-w-[1200px] mx-auto px-6 lg:px-10 mt-14">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]">
                Species Plates
              </div>
              {favoriteCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e0556b]/40 bg-[#e0556b]/10 px-3 py-1 font-mono text-[9px] tracking-[0.16em] uppercase text-[#f0a6b3]">
                  <Heart className="h-3 w-3 fill-[#e0556b] text-[#e0556b]" />
                  {favoriteCount} saved this session
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {visiblePlates.map(({ entry: plate, urls, displayName, authoredName }) => {
                // Every plate is a live backend image record. Candidate URLs
                // already had photographs claimed by an earlier plate removed,
                // so no image can appear twice in this gallery.
                const trusted = imageMap.get(binomialOf(plate.scientific_name));
                const nameVerified =
                  validatedSet.size > 0 && isValidatedName(plate.scientific_name, validatedSet);
                const image = urls[0];
                const attribution = [trusted?.image_source, trusted?.image_license]
                  .filter(Boolean)
                  .join(' · ');
                // Authorship stays in provenance/detail; the display name is
                // the genus + specific epithet only.
                const trustedAuthoredName = trusted?.scientific_name
                  ? authoredScientificName(trusted.scientific_name)
                  : '';
                const provenanceName =
                  hasAuthorship(trustedAuthoredName) ? trustedAuthoredName : authoredName;
                return (
                  <Link
                    key={plate.scientific_name}
                    to={`/species/${encodeURIComponent(displayName)}`}
                    className="group rounded-2xl overflow-hidden bg-[#f5f0e8] text-[#2f3b21] border border-[#2f3b21]/12 hover:border-[#c9a24a]/60 transition-colors flex flex-col"
                  >
                    <div className="relative aspect-[4/3] bg-[#eae3d2]">
                      {urls.length > 0 ? (
                        <FallbackImage
                          urls={urls}
                          alt={displayName}
                          onSettled={(ok) => handlePlateSettled(plate.scientific_name, ok)}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a2e1a] text-[#C9A84C]">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#C9A84C]/40">
                            <Leaf className="h-4 w-4" strokeWidth={1.25} />
                          </span>
                          <span className="mt-2 px-3 text-center font-mono text-[8px] tracking-[0.18em] uppercase leading-[1.6] text-[#C9A84C]">
                            Image pending · Orchid
                            <br />
                            Continuum approved library
                          </span>
                        </div>
                      )}
                      {/* Name-verification badge. The plate carries only a name
                          and a photograph, so the badge covers the whole plate:
                          GREEN "Verified" when the name is confirmed against the
                          OC taxonomic backbone; orange "Unverified" when the
                          limited backbone response did not confirm it. */}
                      {nameVerified ? (
                        <span
                          className="absolute top-2 left-2 inline-flex items-center gap-1 rounded bg-[#0c2a16]/80 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em] uppercase text-[#7ee0a0] backdrop-blur-sm"
                          title="Name confirmed against the OC taxonomic backbone"
                        >
                          <ShieldCheck className="h-2.5 w-2.5" />
                          Verified
                        </span>
                      ) : unverifiedMode ? (
                        <span
                          className="absolute top-2 left-2 inline-flex items-center gap-1 rounded bg-[#10160d]/75 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em] uppercase text-[#f0c460] backdrop-blur-sm"
                          title="Not yet confirmed against the OC taxonomic backbone"
                        >
                          <ShieldQuestion className="h-2.5 w-2.5" />
                          Unverified
                        </span>
                      ) : null}
                      {/* Heart / bookmark — saves to the session favorites list. */}
                      <button
                        type="button"
                        aria-label={
                          isFavorite(displayName)
                            ? `Remove ${displayName} from favorites`
                            : `Save ${displayName} to favorites`
                        }
                        aria-pressed={isFavorite(displayName)}
                        title={isFavorite(displayName) ? 'Saved to favorites' : 'Save to favorites'}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFavorite(displayName);
                        }}
                        className="absolute top-2 right-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#10160d]/65 backdrop-blur-sm border border-white/15 hover:bg-[#10160d]/85 transition-colors"
                      >
                        <Heart
                          className={`h-4 w-4 transition-colors ${
                            isFavorite(displayName)
                              ? 'fill-[#e0556b] text-[#e0556b]'
                              : 'text-[#f5f0e8]'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="p-5">
                      <div
                        className="italic leading-tight text-[18px]"
                        style={{ fontFamily: '"Playfair Display",Georgia,serif' }}
                        title={provenanceName}
                      >
                        {displayName}
                      </div>
                      {provenanceName !== displayName && (
                        <div className="mt-1 font-mono text-[11px] leading-[1.5] tracking-[0.02em] text-[#8a8062]">
                          Recorded as {provenanceName}
                        </div>
                      )}
                      {image && attribution && (
                        <div className="mt-2 flex items-center gap-1.5 font-mono text-[15px] tracking-[0.02em] text-[#7b724f]">
                          <Camera className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate" title={attribution}>{attribution}</span>
                        </div>
                      )}
                      <div className="mt-3 inline-flex items-center gap-1 font-mono text-[12px] tracking-[0.16em] uppercase text-[#5a6b3f] group-hover:text-[#b08a1e]">
                        View dossier <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
            {!imagesLoading && visiblePlates.length === 0 && (
              <p
                data-testid="genus-plates-empty"
                className="rounded-2xl border border-dashed border-[#c9a24a]/30 px-5 py-6 font-mono text-[11px] leading-[1.7] tracking-[0.04em] text-[#a9b896]"
              >
                No species plates are available for <span className="italic">{entry.genus}</span> right now:{' '}
                {imageSource === 'pending'
                  ? 'the Orchid Continuum image services are unavailable, so their result could not be verified.'
                  : 'the Orchid Continuum image services returned no photographed species.'}{' '}
                No local substitute is shown.
              </p>
            )}


            <div className="mt-8">
              <Link
                to={genusProfileSpeciesHref(entry.genus)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#c9a24a] text-[#1a2e1a] font-mono text-[11px] tracking-[0.22em] uppercase hover:bg-[#d8b35a]"
              >
                See all {entry.genus} species <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>

          {/* Co-occurring neighbour genera — full explorable view (overlap
              map + relationship cards). Expands the homepage four-card
              preview into the complete neighbour community for this genus. */}
          <NeighborGeneraSection genus={entry.genus} />


          {/* Cross-platform nav */}
          <section className="max-w-[1200px] mx-auto px-6 lg:px-10 mt-16 pt-10 border-t border-white/10">
            <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#a9b896] mb-4">
              Continue across the Continuum
            </div>
            <div className="flex flex-wrap gap-3">
              {PLATFORM_LINKS(entry.genus).map((p) => (
                <Link
                  key={p.label}
                  to={p.to}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#c9a24a]/40 hover:border-[#c9a24a] hover:bg-[#c9a24a]/[0.08] font-mono text-[10px] tracking-[0.2em] uppercase text-[#f5f0e8]"
                >
                  {p.label}
                  <ArrowRight className="h-3.5 w-3.5 text-[#c9a24a]" />
                </Link>
              ))}
            </div>
          </section>
        </main>
      )}

      <Footer />
    </div>
  );
};

export default GenusDetail;
