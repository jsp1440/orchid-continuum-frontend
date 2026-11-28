import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Camera,
  ChevronDown,
  ChevronUp,
  Leaf,
  Mountain,
  Network,
  ShieldCheck,
} from 'lucide-react';
import {
  FEATURED_GENUS_PROFILE_CONTRACT,
  fetchFeaturedGenusProfile,
  type FeaturedGenusDomainRecord,
  type FeaturedGenusEvidenceState,
  type FeaturedGenusProfile,
} from '@/lib/featuredGenusProfile';
import { normalizeFeaturedTaxonGenus } from '@/lib/featuredTaxonContinuum';
import {
  genusProfileAtlasHref,
  genusProfileResearchHref,
  genusProfileSpeciesHref,
} from '@/lib/genusProfileNavigation';
import { featuredTaxonMatrixHref } from '@/lib/featuredTaxonNavigation';

/**
 * GenusScientificProfile — the canonical featured-genus-profile/v1 exhibit.
 *
 * Mounted on the dedicated Genus Profile page, this section renders the
 * composed scientific record exactly as the Calyx backend attests it:
 *
 *   known       → "Documented"     (a canonical source returned linked evidence)
 *   unknown     → "Not yet linked" (a knowledge gap — never absence, never 0)
 *   unavailable → "Unavailable"    (the service did not answer; no fallback claim)
 *
 * The component fails closed: a non-canonical genus name, an unaccepted
 * genus, or a payload that does not satisfy the versioned contract renders
 * nothing rather than a partially trusted scientific claim. Photographs are
 * never sourced here — this exhibit carries the scientific record only, so
 * no unrelated species image can ever be presented as the genus.
 */

const EVIDENCE_BADGE: Record<FeaturedGenusEvidenceState, { label: string; className: string }> = {
  known: {
    label: 'Documented',
    className: 'border-[#7ee0a0]/40 bg-[#2f6b3f]/25 text-[#7ee0a0]',
  },
  unknown: {
    label: 'Not yet linked',
    className: 'border-[#c9a24a]/40 bg-[#c9a24a]/10 text-[#e3c77f]',
  },
  unavailable: {
    label: 'Unavailable',
    className: 'border-white/15 bg-white/[0.05] text-[#a9b896]',
  },
};

const EvidenceBadge: React.FC<{ state: FeaturedGenusEvidenceState }> = ({ state }) => (
  <span
    className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[8px] tracking-[0.14em] uppercase ${EVIDENCE_BADGE[state].className}`}
  >
    {EVIDENCE_BADGE[state].label}
  </span>
);

const DOMAIN_LABELS: Record<string, string> = {
  taxonomy: 'Taxonomy',
  media: 'Media',
  occurrences: 'Occurrences',
  traits: 'Traits',
  literature: 'Literature',
  pollinators: 'Pollinators',
  conservation: 'Conservation',
  geography: 'Geography',
  habitat: 'Habitat',
  climate: 'Climate',
  elevation: 'Elevation',
  mycorrhiza: 'Mycorrhiza',
};

const domainLabel = (domain: string): string =>
  DOMAIN_LABELS[domain] ?? domain.replace(/_/g, ' ');

const DOMAIN_CHIP_STYLE: Record<FeaturedGenusEvidenceState, string> = {
  known: 'border-[#7ee0a0]/35 bg-[#2f6b3f]/20 text-[#b8e6c8]',
  unknown: 'border-[#c9a24a]/30 bg-[#c9a24a]/[0.07] text-[#d8c491]',
  unavailable: 'border-white/10 bg-white/[0.03] text-[#8d9480]',
};

const DomainChip: React.FC<{ domain: string; record: FeaturedGenusDomainRecord }> = ({
  domain,
  record,
}) => (
  <span
    data-testid={`genus-profile-domain-${domain}`}
    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[9px] tracking-[0.14em] uppercase ${DOMAIN_CHIP_STYLE[record.state]}`}
    title={`${domainLabel(domain)} — ${EVIDENCE_BADGE[record.state].label}`}
  >
    {domainLabel(domain)}
    {record.state === 'known' && record.linkedNodes !== null && record.linkedNodes > 0 ? (
      <span className="text-[#7ee0a0]">· {record.linkedNodes.toLocaleString()}</span>
    ) : (
      // Colour alone never carries the evidence state: every chip names it.
      <span>· {EVIDENCE_BADGE[record.state].label}</span>
    )}
  </span>
);

const SummaryStat: React.FC<{ label: string; value: string; hint: string }> = ({
  label,
  value,
  hint,
}) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
    <div className="font-mono text-[8px] tracking-[0.2em] uppercase text-[#a9b896]">{label}</div>
    <div
      className="mt-1 text-[#f5f0e8] leading-tight"
      style={{ fontFamily: '"Playfair Display",Georgia,serif', fontSize: 'clamp(1.1rem,1.6vw,1.5rem)' }}
    >
      {value}
    </div>
    <div className="mt-0.5 font-mono text-[9px] tracking-[0.08em] text-[#8d9480]">{hint}</div>
  </div>
);

function elevationText(profile: FeaturedGenusProfile): string | null {
  const { minElevationM, maxElevationM } = profile.habitat;
  if (minElevationM !== null && maxElevationM !== null) {
    return `${minElevationM.toLocaleString()}–${maxElevationM.toLocaleString()} m`;
  }
  if (minElevationM !== null) return `from ${minElevationM.toLocaleString()} m`;
  if (maxElevationM !== null) return `up to ${maxElevationM.toLocaleString()} m`;
  return null;
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ok'; profile: FeaturedGenusProfile }
  | { phase: 'invalid' }
  | { phase: 'unavailable' };

const GenusScientificProfile: React.FC<{ genus: string }> = ({ genus }) => {
  // Fail closed on anything that is not a bounded canonical genus.
  const canonical = useMemo(() => {
    try {
      return normalizeFeaturedTaxonGenus(genus);
    } catch {
      return null;
    }
  }, [genus]);

  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState<LoadState>({ phase: 'loading' });

  useEffect(() => {
    if (!canonical) return;
    const ctrl = new AbortController();
    setResult({ phase: 'loading' });
    fetchFeaturedGenusProfile(canonical, ctrl.signal)
      .then((r) => {
        if (ctrl.signal.aborted) return;
        if (r.status === 'ok') setResult({ phase: 'ok', profile: r.profile });
        else if (r.status === 'invalid_genus') setResult({ phase: 'invalid' });
        else setResult({ phase: 'unavailable' });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setResult({ phase: 'unavailable' });
      });
    return () => ctrl.abort();
  }, [canonical]);

  // Non-canonical input or a genus the taxonomy backbone does not accept:
  // render nothing rather than a misleading scientific claim.
  if (!canonical || result.phase === 'invalid') return null;

  if (result.phase === 'loading') {
    return (
      <div
        data-testid="genus-scientific-profile-loading"
        aria-busy="true"
        className="rounded-2xl border border-[#c9a24a]/20 bg-[#13241a] px-6 py-8 animate-pulse"
      >
        <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]/85">
          Scientific Profile · {FEATURED_GENUS_PROFILE_CONTRACT}
        </div>
        <div className="mt-4 h-5 w-2/3 rounded bg-white/[0.06]" />
        <div className="mt-2 h-5 w-1/3 rounded bg-white/[0.06]" />
      </div>
    );
  }

  if (result.phase === 'unavailable') {
    return (
      <div
        data-testid="genus-scientific-profile-unavailable"
        className="rounded-2xl border border-white/10 bg-[#13241a] px-6 py-5"
      >
        <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#a9b896]">
          Scientific Profile · {FEATURED_GENUS_PROFILE_CONTRACT}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-[#cfc8b8]/75">
          The composed scientific profile service did not answer for{' '}
          <span className="italic">{canonical}</span>. No fallback claim is made — the
          field-guide sections on this page remain the local record.
        </p>
      </div>
    );
  }

  const { profile } = result;
  const domains = Object.entries(profile.domains);
  const documentedDomains = domains.filter(([, d]) => d.state === 'known').length;
  const elevation = elevationText(profile);
  const synonymNote =
    profile.requestedGenus !== profile.acceptedGenus
      ? `Requested as ${profile.requestedGenus} — accepted name ${profile.acceptedGenus}`
      : null;

  const continuationLinks: { label: string; to: string }[] = [
    { label: 'Atlas distribution', to: genusProfileAtlasHref(profile.acceptedGenus) },
    { label: 'Species dossiers', to: genusProfileSpeciesHref(profile.acceptedGenus) },
    { label: 'Matrix identification', to: featuredTaxonMatrixHref(profile.acceptedGenus) },
    { label: 'Research center', to: genusProfileResearchHref(profile.acceptedGenus) },
  ];

  return (
    <div
      data-testid="genus-scientific-profile"
      className="rounded-3xl border border-[#c9a24a]/25 bg-[#13241a] px-6 py-6 md:px-8"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a]/85">
            Scientific Profile · {FEATURED_GENUS_PROFILE_CONTRACT}
          </div>
          <h2
            className="mt-2 italic text-[#f5f0e8] leading-tight"
            style={{ fontFamily: '"Playfair Display",Georgia,serif', fontSize: 'clamp(1.6rem,3vw,2.2rem)' }}
          >
            {profile.acceptedGenus}
          </h2>
          {synonymNote && (
            <div className="mt-1 font-mono text-[10px] tracking-[0.08em] text-[#a9b896]">
              {synonymNote}
            </div>
          )}
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#7ee0a0]/30 bg-[#2f6b3f]/20 px-3 py-1 font-mono text-[9px] tracking-[0.16em] uppercase text-[#7ee0a0]">
          <ShieldCheck className="h-3 w-3" />
          Composed from governed sources
        </span>
      </div>

      {/* Summary — always visible */}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryStat
          label="Recorded species"
          value={
            profile.taxonomy.recordedSpeciesCount !== null
              ? profile.taxonomy.recordedSpeciesCount.toLocaleString()
              : '—'
          }
          hint={
            profile.taxonomy.recordedSpeciesCount !== null
              ? profile.taxonomy.recordedSpeciesCountScope ?? 'accepted records'
              : EVIDENCE_BADGE[profile.taxonomy.state].label
          }
        />
        <SummaryStat
          label="Graph records"
          value={
            profile.knowledgeGraph.state === 'known' && profile.knowledgeGraph.nodeCount !== null
              ? profile.knowledgeGraph.nodeCount.toLocaleString()
              : '—'
          }
          hint={
            profile.knowledgeGraph.state === 'known' && profile.knowledgeGraph.edgeCount !== null
              ? `${profile.knowledgeGraph.edgeCount.toLocaleString()} linked relationships`
              : EVIDENCE_BADGE[profile.knowledgeGraph.state].label
          }
        />
        <SummaryStat
          label="Approved photographs"
          value={
            profile.media.state === 'known' && profile.media.returnedCount !== null
              ? profile.media.returnedCount.toLocaleString()
              : '—'
          }
          hint={
            profile.media.status === 'ok'
              ? 'one per species, licensed'
              : EVIDENCE_BADGE[profile.media.state].label
          }
        />
        <SummaryStat
          label="Domains documented"
          value={`${documentedDomains} / ${domains.length}`}
          hint="research domains with linked evidence"
        />
      </div>

      {/* Continuation links — always visible */}
      <div className="mt-5 flex flex-wrap gap-2">
        {continuationLinks.map((link) => (
          <Link
            key={link.label}
            to={link.to}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#c9a24a]/40 px-4 py-1.5 font-mono text-[9px] tracking-[0.18em] uppercase text-[#f5f0e8] hover:border-[#c9a24a] hover:bg-[#c9a24a]/[0.08]"
          >
            {link.label}
            <ArrowRight className="h-3 w-3 text-[#c9a24a]" />
          </Link>
        ))}
      </div>

      {/* Expand toggle */}
      <button
        type="button"
        data-testid="genus-scientific-profile-toggle"
        aria-expanded={expanded}
        aria-controls="genus-scientific-profile-details"
        onClick={() => setExpanded((v) => !v)}
        className="mt-5 inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] uppercase text-[#c9a24a] hover:text-[#d8b35a]"
      >
        {expanded ? (
          <>
            Hide research details <ChevronUp className="h-3.5 w-3.5" />
          </>
        ) : (
          <>
            Research details <ChevronDown className="h-3.5 w-3.5" />
          </>
        )}
      </button>

      {/* Expandable research details */}
      {expanded && (
        <div id="genus-scientific-profile-details" data-testid="genus-scientific-profile-details" className="mt-5 border-t border-white/10 pt-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Taxonomy */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.2em] uppercase text-[#a9b896]">
                  <Leaf className="h-3.5 w-3.5 text-[#c9a24a]" /> Taxonomy
                </span>
                <EvidenceBadge state={profile.taxonomy.state} />
              </div>
              {profile.taxonomy.recordedSpeciesCount !== null && (
                <div className="mt-3 text-[13px] leading-relaxed text-[#d8e0c8]">
                  {profile.taxonomy.recordedSpeciesCount.toLocaleString()} recorded species
                  {profile.taxonomy.recordedSpeciesCountScope
                    ? ` — ${profile.taxonomy.recordedSpeciesCountScope}`
                    : ''}
                  .
                </div>
              )}
              {profile.taxonomy.representativeNames.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer font-mono text-[9px] tracking-[0.18em] uppercase text-[#c9a24a] hover:text-[#d8b35a]">
                    Representative names ({profile.taxonomy.representativeNames.length})
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {profile.taxonomy.representativeNames.map((name) => (
                      <li key={name} className="font-mono text-[11px] italic text-[#cfc8b8]/85">
                        {name}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            {/* Habitat & elevation */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.2em] uppercase text-[#a9b896]">
                  <Mountain className="h-3.5 w-3.5 text-[#c9a24a]" /> Habitat &amp; elevation
                </span>
                <EvidenceBadge state={profile.habitat.state} />
              </div>
              <div className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-[#d8e0c8]">
                {profile.habitat.climateTag && <div>Climate · {profile.habitat.climateTag}</div>}
                {profile.habitat.collectionTag && (
                  <div>Collection · {profile.habitat.collectionTag}</div>
                )}
                {elevation && <div>Elevation · {elevation}</div>}
                {profile.habitat.state === 'unknown' && (
                  <div className="text-[#cfc8b8]/70">
                    No habitat record is linked to this genus yet. That is a knowledge gap, not
                    evidence about where the genus grows.
                  </div>
                )}
                {profile.habitat.source && (
                  <div className="font-mono text-[10px] tracking-[0.06em] text-[#8d9480]">
                    Source · {profile.habitat.source}
                  </div>
                )}
              </div>
            </div>

            {/* Knowledge graph */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.2em] uppercase text-[#a9b896]">
                  <Network className="h-3.5 w-3.5 text-[#c9a24a]" /> Knowledge graph
                </span>
                <EvidenceBadge state={profile.knowledgeGraph.state} />
              </div>
              <div className="mt-3 text-[13px] leading-relaxed text-[#d8e0c8]">
                {profile.knowledgeGraph.state === 'known' &&
                profile.knowledgeGraph.nodeCount !== null ? (
                  <div>
                    {profile.knowledgeGraph.nodeCount.toLocaleString()} nodes ·{' '}
                    {(profile.knowledgeGraph.edgeCount ?? 0).toLocaleString()} relationships linked
                    to this genus in the Continuum graph.
                  </div>
                ) : profile.knowledgeGraph.state === 'unknown' ? (
                  <div className="text-[#cfc8b8]/70">
                    The graph answered but holds nothing linked to this genus yet — a gap in our
                    records, not a property of the genus.
                  </div>
                ) : (
                  <div className="text-[#cfc8b8]/70">
                    The knowledge-graph service did not answer; no graph claim is made.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Domain coverage */}
          {domains.length > 0 && (
            <div className="mt-5">
              <div className="font-mono text-[9px] tracking-[0.24em] uppercase text-[#a9b896]">
                Research domains
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {domains.map(([domain, record]) => (
                  <DomainChip key={domain} domain={domain} record={record} />
                ))}
              </div>
            </div>
          )}

          {/* Gaps — honest knowledge gaps, never absence */}
          {profile.gaps.length > 0 && (
            <p className="mt-4 text-[12px] leading-relaxed text-[#cfc8b8]/75">
              No linked evidence yet for{' '}
              {profile.gaps.map(domainLabel).join(', ')}. A gap means the Continuum holds no linked
              record yet — it is not evidence of absence.
            </p>
          )}

          {/* Media provenance */}
          <div className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-[#cfc8b8]/75">
            <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#c9a24a]" />
            <span>
              {profile.media.status === 'ok'
                ? `${(profile.media.returnedCount ?? 0).toLocaleString()} approved, licensed photographs are linked to this genus — at most one per species, each attributed to its own taxon.`
                : profile.media.status === 'no_approved_media'
                  ? 'No approved photographs are linked to this genus yet. No substitute image is shown in their place.'
                  : 'The media service did not answer; no photograph claim is made.'}
            </span>
          </div>

          {/* Composer notes */}
          {profile.notes.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-white/10 pt-4">
              {profile.notes.map((note) => (
                <li key={note} className="font-mono text-[10px] leading-[1.6] tracking-[0.04em] text-[#8d9480]">
                  · {note}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default GenusScientificProfile;
