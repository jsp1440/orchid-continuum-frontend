import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bug, Database, Globe2, ImageOff, MessageCircle, Sprout } from 'lucide-react';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import type { ContinuumDomainState } from '@/lib/featuredTaxonContinuum';
import {
  featuredTaxonAtlasHref,
  featuredTaxonCalyxHref,
  featuredTaxonGenusProfileHref,
} from '@/lib/featuredTaxonNavigation';
import type { WebNodeData } from '@/lib/ocBackend';
import {
  authoredScientificName,
  deriveEcologicalEvidence,
  displayScientificName,
  normalizedMediaKey,
  normalizedTaxonKey,
  selectRepresentativeMedia,
  EVIDENCE_STATE_LABEL,
  type EcologicalEvidence,
} from '@/lib/genusProfileDataQuality';
import type { GenusMediaItem } from '@/lib/genusMediaResolver';

const DOMAIN_LABELS: Record<ContinuumDomainState['domain'], string> = {
  taxonomy: 'Taxonomy',
  media: 'Media',
  occurrences: 'Occurrences',
  traits: 'Traits',
  literature: 'Literature',
  pollinators: 'Pollinators',
  conservation: 'Conservation',
};

function EvidenceBadge({ item }: { item: ContinuumDomainState }) {
  const detail = item.nodes == null || item.edges == null
    ? 'Continuum unavailable'
    : item.state === 'known'
      ? `${item.nodes} nodes · ${item.edges} relationships`
      : 'No linked evidence in the current Continuum graph';

  return (
    <div className="rounded-lg border border-[#d9caa8] bg-[#fffaf0]/95 p-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#8a8062]">
        {DOMAIN_LABELS[item.domain]}
      </p>
      <p className="mt-1 text-sm font-medium text-[#24321f]">
        {item.state === 'known' ? 'Documented' : item.state === 'unknown' ? 'Not yet linked' : 'Unavailable'}
      </p>
      <p className="mt-1 text-xs leading-5 text-[#5d684c]">{detail}</p>
    </div>
  );
}

const EVIDENCE_BADGE_STYLE: Record<EcologicalEvidence['state'], string> = {
  available: 'border-[#3c6b45] bg-[#eaf4ea] text-[#2f5c38]',
  provisional: 'border-[#b59a58] bg-[#fbf3df] text-[#7b5c12]',
  unavailable: 'border-[#c3bda9] bg-[#f4f1e7] text-[#6b6a5c]',
};

/**
 * An ecological relationship card carrying an explicit evidence state.
 *
 * The three states are the only claims this card is allowed to make:
 *   available   — the Continuum relationship service returned linked evidence;
 *   provisional — something is known at genus scope but is not linked evidence;
 *   unavailable — nothing is claimed. `unavailable` is never a zero, and the
 *                 reason distinguishes "no link recorded yet" from "the
 *                 evidence service did not answer".
 */
function RelationshipCard({
  label,
  question,
  node,
  icon,
  serviceAnswered,
}: {
  label: string;
  question: string;
  node: WebNodeData | null | undefined;
  icon: React.ReactNode;
  serviceAnswered: boolean;
}) {
  const evidence = deriveEcologicalEvidence({
    serviceAnswered,
    hasLinkedEvidence: Boolean(node?.hasData),
    linkedSummary: node?.summary ?? null,
  });
  const showItems = evidence.state === 'available' && Boolean(node?.items?.length);

  return (
    <article className="rounded-xl border border-[#d1bd8e] bg-[#fffaf0] p-5">
      <div className="flex flex-wrap items-center gap-2 text-[#755f29]">
        {icon}
        <p className="font-mono text-[9px] uppercase tracking-[0.2em]">{label}</p>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] ${EVIDENCE_BADGE_STYLE[evidence.state]}`}
        >
          {EVIDENCE_STATE_LABEL[evidence.state]}
        </span>
      </div>
      <h3 className="mt-2 font-serif text-2xl leading-tight text-[#24321f]">{question}</h3>
      <p className="mt-3 text-sm font-medium text-[#3d4936]">{evidence.detail}</p>
      {showItems ? (
        <ul className="mt-3 space-y-1 text-sm leading-6 text-[#5d684c]">
          {node?.items?.slice(0, 3).map((item) => <li key={item}>• {item}</li>)}
        </ul>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-[#747d68]">
        {evidence.state === 'available'
          ? 'Shown only because the Continuum relationship endpoint returned linked evidence for this featured genus. It describes the genus, not every species within it.'
          : evidence.reason === 'service-unavailable'
            ? 'No fallback relationship claim is substituted while the evidence service is unreachable.'
            : 'This is a knowledge gap, not evidence that the relationship is biologically absent.'}
      </p>
    </article>
  );
}

/**
 * A Continuum photograph that fails gracefully.
 *
 * A broken media URL must never leave a browser broken-image icon on the
 * public page: the tile reports the failure and an honest "photograph could
 * not be loaded" state is shown instead. No substitute image is fetched.
 */
function ContinuumPhotograph({
  item,
  className,
  onUnavailable,
}: {
  item: GenusMediaItem;
  className?: string;
  onUnavailable?: (mediaKey: string) => void;
}) {
  const [failed, setFailed] = React.useState(false);
  const displayName = displayScientificName(item.scientific_name);

  React.useEffect(() => {
    setFailed(false);
  }, [item.image_url]);

  if (failed) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-[#f4efe1] p-4 text-center text-[#657057] ${className ?? ''}`}>
        <ImageOff className="h-6 w-6" />
        <p className="text-xs leading-5">
          This approved photograph could not be loaded. No substitute image is shown.
        </p>
      </div>
    );
  }

  return (
    <img
      src={item.image_url}
      alt={`${displayName} photograph supplied by ${item.source_name}`}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => {
        setFailed(true);
        onUnavailable?.(normalizedMediaKey(item.image_url));
      }}
    />
  );
}

const DailyGenusFeatureContinuum: React.FC<{ continuation?: React.ReactNode }> = ({ continuation }) => {
  const { genus, continuum, continuumStatus } = useDailyGenus();
  const media = React.useMemo(() => continuum?.media.items ?? [], [continuum]);

  // Photographs whose URL failed to load in this session. They are excluded
  // from later selection so a dead URL cannot occupy a gallery slot.
  const [brokenMedia, setBrokenMedia] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    setBrokenMedia(new Set());
  }, [genus]);
  const markBroken = React.useCallback((mediaKey: string) => {
    setBrokenMedia((previous) => {
      if (!mediaKey || previous.has(mediaKey)) return previous;
      const next = new Set(previous);
      next.add(mediaKey);
      return next;
    });
  }, []);

  // The hero is the first approved photograph that has not already failed.
  const hero = React.useMemo(
    () => media.find((item) => !brokenMedia.has(normalizedMediaKey(item.image_url))) ?? null,
    [media, brokenMedia],
  );

  /**
   * Representative species strip: one tile per species, one tile per
   * photograph, hero photograph excluded. A genus whose approved media is
   * dominated by a single well-photographed species therefore cannot fill the
   * gallery with repeats of it.
   */
  const representativeMedia = React.useMemo(
    () =>
      selectRepresentativeMedia(media, {
        limit: 6,
        maxPerTaxon: 1,
        exclude: [
          ...brokenMedia,
          ...(hero ? [normalizedMediaKey(hero.image_url)] : []),
        ],
        // The hero species is already on screen; the strip shows other species.
        excludeTaxa: hero ? [normalizedTaxonKey(hero.scientific_name)] : [],
      }),
    [media, hero, brokenMedia],
  );

  const heroDisplayName = hero ? displayScientificName(hero.scientific_name) : '';
  const heroAuthoredName = hero ? authoredScientificName(hero.scientific_name) : '';
  const relationships = continuum?.relationships ?? null;
  // `unavailable` must never be rendered as a knowledge gap: it means the
  // service did not answer, so no claim may be made in either direction.
  const relationshipServiceAnswered = continuumStatus === 'ready' && relationships !== null;
  const atlasHref = featuredTaxonAtlasHref(genus);
  const calyxHref = featuredTaxonCalyxHref(genus);
  const genusProfileHref = featuredTaxonGenusProfileHref(genus);

  return (
    <section className="bg-[#f3ead4] px-4 py-10 sm:px-6 lg:px-8" aria-labelledby="featured-genus-title">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#806c39]">Genus of the Day · Continuum evidence</p>
            <h2 id="featured-genus-title" className="mt-2 font-serif text-4xl italic text-[#24321f] sm:text-5xl">
              {genus}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#526046]">
              Follow this orchid outward through the evidence the Orchid Continuum actually links. Missing relationships remain visible instead of being filled with generic scientific claims.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 self-start md:self-auto">
            <Link
              to={atlasHref}
              className="inline-flex items-center gap-2 rounded-lg border border-[#b59a58] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#665321] hover:bg-[#fff7df]"
            >
              Explore in Atlas <Globe2 className="h-3.5 w-3.5" />
            </Link>
            <Link
              to={calyxHref}
              className="inline-flex items-center gap-2 rounded-lg border border-[#b59a58] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#665321] hover:bg-[#fff7df]"
            >
              Ask Calyx <MessageCircle className="h-3.5 w-3.5" />
            </Link>
            <Link
              to={genusProfileHref}
              className="inline-flex items-center gap-2 rounded-lg border border-[#b59a58] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#665321] hover:bg-[#fff7df]"
            >
              Research profile <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-xl border border-[#d1bd8e] bg-[#fffaf0]">
            {hero ? (
              <figure>
                <ContinuumPhotograph
                  item={hero}
                  className="aspect-[4/3] w-full object-cover"
                  onUnavailable={markBroken}
                />
                <figcaption className="border-t border-[#e4d8bb] p-4">
                  {/* Display name is genus + specific epithet; the authored
                      name is preserved below as provenance. */}
                  <p className="font-serif text-xl italic text-[#24321f]">{heroDisplayName}</p>
                  {heroAuthoredName !== heroDisplayName && (
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8a8062]">
                      Recorded as {heroAuthoredName}
                    </p>
                  )}
                  <p className="mt-2 text-xs leading-5 text-[#5d684c]">
                    Source: {hero.source_name}
                    {hero.license ? ` · ${hero.license}` : ''}
                    {hero.attribution ? ` · ${hero.attribution}` : ' · photographer attribution not supplied by source'}
                  </p>
                </figcaption>
              </figure>
            ) : (
              <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 p-8 text-center text-[#657057]">
                <ImageOff className="h-8 w-8" />
                <p className="font-serif text-xl text-[#24321f]">No approved Continuum photograph available</p>
                <p className="max-w-md text-sm leading-6">
                  The page will not substitute an uncontrolled third-party image. Media remains an explicit evidence gap until an approved record is returned.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#d1bd8e] bg-[#f8f0dc] p-5">
            <div className="flex items-center gap-2 text-[#6f5c2a]">
              <Database className="h-4 w-4" />
              <p className="font-mono text-[10px] uppercase tracking-[0.2em]">Knowledge graph coverage</p>
            </div>

            {continuumStatus === 'loading' && (
              <p className="mt-4 text-sm leading-6 text-[#5d684c]">Loading the connected Continuum evidence…</p>
            )}
            {continuumStatus === 'unavailable' && (
              <p className="mt-4 text-sm leading-6 text-[#5d684c]">
                The Continuum evidence service is temporarily unavailable. Scientific fallback claims are intentionally not substituted.
              </p>
            )}
            {continuum && (
              <>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {continuum.domains.map((item) => <EvidenceBadge key={item.domain} item={item} />)}
                </div>
                {continuum.gaps.length > 0 && (
                  <div className="mt-4 rounded-lg border border-dashed border-[#bca56e] bg-[#fffaf0] p-4">
                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#806c39]">What we do not know yet</p>
                    <p className="mt-2 text-sm leading-6 text-[#4d5944]">
                      Current graph gaps: {continuum.gaps.map((domain) => DOMAIN_LABELS[domain]).join(', ')}. These mean “not linked in the current Continuum evidence,” not biological absence.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Representative species — deduplicated by taxon identity and by
            photograph, so neither a repeated species nor a repeated image can
            dominate the strip. */}
        {representativeMedia.length > 0 && (
          <div className="mt-5 rounded-xl border border-[#d1bd8e] bg-[#fffaf0] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#806c39]">
              Representative species · approved Continuum media
            </p>
            <p className="mt-2 text-xs leading-5 text-[#747d68]">
              One photograph per species from the approved media the Continuum returned for {genus}.
              This is a sample of what is documented, not a complete species list.
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {representativeMedia.map((item) => {
                const displayName = displayScientificName(item.scientific_name);
                const authoredName = authoredScientificName(item.scientific_name);
                return (
                  <li key={item.media_id || item.image_url} className="overflow-hidden rounded-lg border border-[#e4d8bb] bg-[#fffdf7]">
                    <ContinuumPhotograph
                      item={item}
                      className="aspect-square w-full object-cover"
                      onUnavailable={markBroken}
                    />
                    <div className="p-2">
                      <p className="font-serif text-sm italic leading-tight text-[#24321f]" title={authoredName}>
                        {displayName}
                      </p>
                      <p className="mt-1 font-mono text-[8px] uppercase leading-4 tracking-[0.1em] text-[#8a8062]">
                        {item.source_name}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RelationshipCard
            label="Pollination"
            question="Who is linked to its pollination story?"
            node={relationships?.pollinators}
            icon={<Bug className="h-4 w-4" />}
            serviceAnswered={relationshipServiceAnswered}
          />
          <RelationshipCard
            label="Mycorrhizae"
            question="Which fungal partnerships are documented?"
            node={relationships?.fungi}
            icon={<Sprout className="h-4 w-4" />}
            serviceAnswered={relationshipServiceAnswered}
          />
          <RelationshipCard
            label="Place"
            question="Where has the Continuum recorded it?"
            node={relationships?.geography}
            icon={<Globe2 className="h-4 w-4" />}
            serviceAnswered={relationshipServiceAnswered}
          />
        </div>

        {/* The continuation actions belong to this panel, not to a second band
            beneath it. Two adjacent cream cards read as two separate offers of
            the same genus; one card with a footer reads as one. It is passed in
            rather than built here so each handoff keeps its own governed
            producer and its own tests. */}
        {continuation ? (
          <div className="mt-6 border-t border-[#d1bd8e] pt-5" data-testid="featured-genus-continuation">
            {continuation}
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default DailyGenusFeatureContinuum;
