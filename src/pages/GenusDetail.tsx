import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Leaf,
  Mountain,
  Bug,
  Sprout,
  MapPin,
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
  lookupGenus,
  fetchGenusImagesWithSource,
  fetchValidatedSpecies,
  buildImageMap,
  binomialOf,
  buildValidatedSet,
  isValidatedName,
  buildLocalNarrative,
  warmBackends,
  type GenusEntry,
  type GenusImage,
  type ImageSource,
} from '@/lib/genusData';


/**
 * GenusDetail — dedicated /genus/:name page.
 *
 * Hero (name, family, tribe, species count, description) over a deep-green
 * field, a static distribution map, a grid of species plates, and an ecology
 * panel. Cross-platform navigation to the wider Continuum.
 */

const PLATFORM_LINKS: { label: string; to: string }[] = [
  { label: 'Atlas', to: '/atlas' },
  { label: 'Conservatory', to: '/zoo' },
  { label: 'Field Station', to: '/ecosystems' },
  { label: 'Deception Lab', to: '/pollinators' },
];

// Approximate label coordinates (percent of the SVG viewport) for regions.
const REGION_DOTS: Record<string, { x: number; y: number }> = {
  Ecuador: { x: 27, y: 58 },
  Colombia: { x: 28, y: 53 },
  Peru: { x: 29, y: 62 },
  Bolivia: { x: 31, y: 66 },
  Brazil: { x: 35, y: 64 },
  Venezuela: { x: 30, y: 50 },
  'Central America': { x: 22, y: 48 },
  Mesoamerica: { x: 20, y: 46 },
  Caribbean: { x: 28, y: 45 },
  Himalaya: { x: 68, y: 42 },
  'SE Asia': { x: 76, y: 54 },
  Australia: { x: 84, y: 74 },
  'Pacific Islands': { x: 92, y: 60 },
  'New Guinea': { x: 86, y: 62 },
  Africa: { x: 53, y: 60 },
};

const DistributionMap: React.FC<{ regions: string[] }> = ({ regions }) => (
  <div className="rounded-2xl overflow-hidden border border-[#2f3b21]/15 bg-[#eef3e3]">
    <div className="relative w-full" style={{ aspectRatio: '2 / 1' }}>
      <svg viewBox="0 0 100 50" className="absolute inset-0 w-full h-full">
        {/* Stylised land masses (decorative) */}
        <g fill="#cdd9b8" stroke="#b9c9a0" strokeWidth="0.2">
          <path d="M8,14 Q14,8 24,12 Q30,18 26,26 Q20,34 16,30 Q9,24 8,14 Z" />
          <path d="M24,30 Q30,28 30,38 Q28,46 24,46 Q21,40 24,30 Z" />
          <path d="M44,12 Q54,8 60,14 Q60,24 54,30 Q48,34 46,26 Q42,18 44,12 Z" />
          <path d="M62,12 Q76,8 86,16 Q90,24 84,30 Q74,30 68,24 Q62,18 62,12 Z" />
          <path d="M80,34 Q88,32 90,38 Q88,42 82,40 Q79,37 80,34 Z" />
        </g>
        {regions.map((r) => {
          const dot = REGION_DOTS[r];
          if (!dot) return null;
          const cx = (dot.x / 100) * 100;
          const cy = (dot.y / 100) * 50;
          return (
            <g key={r}>
              <circle cx={cx} cy={cy} r="2.4" fill="#c9a24a" opacity="0.25" />
              <circle cx={cx} cy={cy} r="1.1" fill="#b08a1e" stroke="#fff" strokeWidth="0.3" />
            </g>
          );
        })}
      </svg>
    </div>
    <div className="flex flex-wrap gap-2 p-4 border-t border-[#2f3b21]/10 bg-[#f5f0e8]">
      {regions.map((r) => (
        <span
          key={r}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#2f3b21]/[0.06] font-mono text-[10px] tracking-[0.14em] uppercase text-[#3a4630]"
        >
          <MapPin className="h-3 w-3 text-[#b08a1e]" />
          {r}
        </span>
      ))}
    </div>
  </div>
);

const EcologyRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <div className="flex items-start gap-3 py-3 border-b border-[#2f3b21]/10 last:border-0">
    <span className="mt-0.5 text-[#5a6b3f]">{icon}</span>
    <div>
      <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-[#8a8062]">{label}</div>
      <div className="text-[14px] text-[#3a4630] leading-snug">{value}</div>
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


  const heroAttribution = useMemo(() => {
    const first = images[0];
    return [first?.scientific_name, first?.image_source, first?.image_license]
      .filter(Boolean)
      .join(' · ');
  }, [images]);



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

  // Fetch the AI genus narrative (Claude Sonnet via the genus-narrative edge fn).
  // If the edge function is unavailable / returns nothing, fall back to a warm,
  // science-grounded narrative composed locally from the curated ecology data
  // so the Field Note block ALWAYS renders a real summary rather than an empty
  // box.
  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    setNarrative('');
    setFailedSpecies(new Set()); // reset per-genus failed-image tracking
    setNarrativeLoading(true);
    const fallback = buildLocalNarrative(entry);
    supabase.functions
      .invoke('genus-narrative', { body: { genus: entry.genus } })
      .then(({ data, error }) => {
        if (cancelled) return;
        const text = (data as { narrative?: string } | null)?.narrative;
        setNarrative(!error && text ? text : fallback);
      })
      .catch(() => {
        if (!cancelled) setNarrative(fallback);
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

  // When the backbone is non-empty, hide plates whose species isn't confirmed.
  // When it's empty (endpoint unpopulated), keep all plates but flag them.
  // In both cases, drop plates whose every image URL failed to load AND — once
  // the image fetch has completed — drop plates the backend supplied NO image
  // for at all (these are the "empty" IMAGE PENDING cards the request wants
  // removed from the grid entirely).
  const unverifiedMode = validationLoaded && validatedSet.size === 0;
  const visiblePlates = useMemo(() => {
    if (!entry) return [];
    const base =
      validatedSet.size === 0
        ? entry.plates
        : entry.plates.filter((p) => isValidatedName(p.species, validatedSet));
    return base.filter((p) => {
      // Skip plates whose every candidate image failed to load.
      if (failedSpecies.has(p.species)) return false;
      // Once images have loaded, skip plates with NO candidate image at all.
      if (!imagesLoading) {
        const trusted = imageMap.get(binomialOf(p.species));
        const hasUrl =
          (trusted?.image_urls?.length ?? 0) > 0 || Boolean(trusted?.image_url) || Boolean(p.image);
        if (!hasUrl) return false;
      }
      return true;
    });
  }, [entry, validatedSet, failedSpecies, imageMap, imagesLoading]);


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
              {entry.family} · {entry.tribe} · {entry.speciesCount} species
            </div>
            <p
              className="mt-5 max-w-3xl text-[#d8e0c8] leading-relaxed"
              style={{ fontFamily: '"Cormorant Garamond",Georgia,serif', fontSize: 'clamp(1.1rem,1.6vw,1.35rem)' }}
            >
              {entry.description}
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
                    <span className="truncate" title={heroAttribution}>{heroAttribution}</span>
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
                  Field Note · AI summary
                </div>
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
              <GenusOccurrenceMap genus={entry.genus} regions={entry.regions} />
              {/* Static label-map kept as a compact legend strip below the globe. */}
              <div className="mt-4">
                <DistributionMap regions={entry.regions} />
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a] mb-3">
                Ecology
              </div>
              <div className="rounded-2xl bg-[#f5f0e8] text-[#2f3b21] border border-[#2f3b21]/12 p-6">
                <EcologyRow
                  icon={<Bug className="h-4 w-4" />}
                  label="Pollinator guild"
                  value={entry.ecology.pollinatorGuild}
                />
                <EcologyRow
                  icon={<Sprout className="h-4 w-4" />}
                  label="Mycorrhizal partners"
                  value={entry.ecology.mycorrhizal}
                />
                <EcologyRow
                  icon={<Mountain className="h-4 w-4" />}
                  label="Elevation range"
                  value={entry.ecology.elevation}
                />
                <EcologyRow
                  icon={<Trees className="h-4 w-4" />}
                  label="Habitat type"
                  value={entry.ecology.habitat}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {visiblePlates.map((plate) => {
                // Match a trusted, backbone-validated image to this plate by
                // its binomial (genus + epithet). When a match exists the real
                // photograph replaces the "Image pending" leaf placeholder.
                const trusted = imageMap.get(binomialOf(plate.species));
                // All candidate URLs (trusted fallbacks + any legacy plate img)
                // so a broken first URL advances to the next instead of the
                // "Image pending" placeholder.
                const urls = [
                  ...(trusted?.image_urls ?? (trusted?.image_url ? [trusted.image_url] : [])),
                  ...(plate.image ? [plate.image] : []),
                ].filter((u, i, a) => u && a.indexOf(u) === i);
                const image = urls[0];
                const attribution = [trusted?.image_source, trusted?.image_license]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Link
                    key={plate.species}
                    to={`/species/${encodeURIComponent(plate.species)}`}
                    className="group rounded-2xl overflow-hidden bg-[#f5f0e8] text-[#2f3b21] border border-[#2f3b21]/12 hover:border-[#c9a24a]/60 transition-colors flex flex-col"
                  >
                    <div className="relative aspect-[4/3] bg-[#eae3d2]">
                      {urls.length > 0 ? (
                        <FallbackImage
                          urls={urls}
                          alt={plate.species}
                          onSettled={(ok) => handlePlateSettled(plate.species, ok)}
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
                      {/* Verification badge.
                          A plate backed by an image from v_orchid_images_trusted
                          (i.e. `trusted` matched) is a reviewed, backbone-joined
                          record → show a GREEN "Verified" badge. Only plates with
                          NO trusted image, while the backbone endpoint is
                          unpopulated, carry the orange "Unverified" badge. */}
                      {trusted ? (
                        <span
                          className="absolute top-2 left-2 inline-flex items-center gap-1 rounded bg-[#0c2a16]/80 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em] uppercase text-[#7ee0a0] backdrop-blur-sm"
                          title="Reviewed image from the trusted Orchid Continuum library (v_orchid_images_trusted)"
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
                          isFavorite(plate.species)
                            ? `Remove ${plate.species} from favorites`
                            : `Save ${plate.species} to favorites`
                        }
                        aria-pressed={isFavorite(plate.species)}
                        title={isFavorite(plate.species) ? 'Saved to favorites' : 'Save to favorites'}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFavorite(plate.species);
                        }}
                        className="absolute top-2 right-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#10160d]/65 backdrop-blur-sm border border-white/15 hover:bg-[#10160d]/85 transition-colors"
                      >
                        <Heart
                          className={`h-4 w-4 transition-colors ${
                            isFavorite(plate.species)
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
                      >
                        {plate.species}
                      </div>
                      <div className="mt-1.5 font-mono text-[15px] tracking-[0.04em] uppercase text-[#7b724f]">
                        {plate.distribution} · {plate.elevation}
                      </div>
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


            <div className="mt-8">
              <Link
                to={`/species?genus=${encodeURIComponent(entry.genus)}`}
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
              {PLATFORM_LINKS.map((p) => (
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
