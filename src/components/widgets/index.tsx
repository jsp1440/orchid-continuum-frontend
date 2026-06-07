/**
 * Orchid Continuum — Embeddable Widget System
 * --------------------------------------------
 * Six reusable, fixed-aspect widgets that other sites or partner pages
 * can drop into their layout (planned: each will compile to a tiny
 * iframe / web-component build). On the public site they live on the
 * /widgets gallery page.
 *
 * All widgets:
 *   • Consume the Continuum API exclusively (never the database)
 *   • Render a transparent fallback when the API isn't configured
 *   • Use compact, brand-consistent styling
 *
 * Widgets:
 *   1. SpeciesSnapshotWidget       — taxonomy + thumbnail + badges
 *   2. OrchidOfTheDayWidget        — featured species rotation
 *   3. AtlasTeaserWidget           — link card to the Atlas
 *   4. EcologicalInteractionCard   — partner counts + badges
 *   5. ZooReviewCardWidget         — queue depth + reviewers
 *   6. OacsGreenhouseSnapshotWidget— live (or demo) sensor snapshot
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Leaf,
  MapPin,
  Sparkles,
  Globe2,
  Bug,
  Flower2,
  ListChecks,
  Users,
  Thermometer,
  Droplets,
  Sun,
  Loader2,
  Map as MapIcon,
} from 'lucide-react';
import {
  speciesApi,
  type ApiSpeciesSummary,
  type ApiSpecies,
} from '@/lib/api';
import { interactionsApi, type InteractionPanel } from '@/lib/interactions';
import { zooApi, type ZooStatus } from '@/lib/zoo';
import {
  oacsApi,
  OACS_DEMO_SNAPSHOTS,
  OACS_DEMO_SITES,
  type SnapshotReading,
} from '@/lib/oacs';

// ---------------------------------------------------------------------------
// Shared shell
// ---------------------------------------------------------------------------

export interface WidgetProps {
  className?: string;
}

const Shell: React.FC<{
  title: string;
  href?: string;
  badge?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ title, href, badge, className = '', children }) => (
  <div
    className={
      'rounded-2xl border border-white/10 bg-[#142a1f] text-white p-5 flex flex-col h-full ' +
      className
    }
    style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
  >
    <div className="flex items-center justify-between mb-4">
      <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-300/80">
        {title}
      </div>
      {badge && (
        <span className="text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full border border-white/15 text-white/55">
          {badge}
        </span>
      )}
    </div>
    <div className="flex-1">{children}</div>
    {href && (
      <Link
        to={href}
        className="mt-4 inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200 transition-colors"
      >
        Open module <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    )}
  </div>
);

const SkeletonRow: React.FC = () => (
  <div className="flex items-center gap-2 text-white/55 text-sm">
    <Loader2 className="h-3.5 w-3.5 animate-spin" />
    Loading…
  </div>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-xs text-white/55 leading-relaxed">{children}</div>
);

// ---------------------------------------------------------------------------
// 1) SpeciesSnapshotWidget
// ---------------------------------------------------------------------------

export const SpeciesSnapshotWidget: React.FC<
  WidgetProps & { taxonomyId?: string }
> = ({ taxonomyId, className }) => {
  const [data, setData] = useState<ApiSpecies | null>(null);
  const [loading, setLoading] = useState(true);
  const [unconfigured, setUnconfigured] = useState(false);

  useEffect(() => {
    const c = new AbortController();
    const run = async () => {
      if (taxonomyId) {
        const r = await speciesApi.byId(taxonomyId, c.signal);
        if (c.signal.aborted) return;
        setData(r.data);
        setUnconfigured(r.unconfigured);
      } else {
        const r = await speciesApi.featured(c.signal);
        if (c.signal.aborted) return;
        const first = r.data?.[0];
        if (first) {
          // Treat the summary as a partial ApiSpecies for display.
          setData({
            taxonomy_id: first.taxonomy_id,
            canonical_name: first.canonical_name,
            genus: first.genus,
            specific_epithet: first.specific_epithet,
            common_name: first.common_name,
            family: first.family,
            habitat: first.habitat || undefined,
            region: first.region || undefined,
            conservation_status: first.conservation_status,
            representative_image_url: first.representative_image_url,
          });
        }
        setUnconfigured(r.unconfigured);
      }
      setLoading(false);
    };
    run();
    return () => c.abort();
  }, [taxonomyId]);

  return (
    <Shell
      title="Species Snapshot"
      href={data ? `/species/${encodeURIComponent(data.taxonomy_id)}` : '/'}
      badge="Continuum API"
      className={className}
    >
      {loading && <SkeletonRow />}
      {!loading && unconfigured && (
        <Empty>
          API not yet configured. Snapshot will populate once
          VITE_API_BASE_URL is set.
        </Empty>
      )}
      {!loading && !unconfigured && !data && (
        <Empty>No featured species available right now.</Empty>
      )}
      {!loading && data && (
        <>
          <div className="aspect-[4/3] rounded-lg overflow-hidden bg-[#0d1f17] mb-3">
            {data.representative_image_url || data.hero_image_url ? (
              <img
                src={data.representative_image_url || data.hero_image_url || ''}
                alt={data.canonical_name}
                className="w-full h-full object-cover"
                onError={e =>
                  ((e.currentTarget as HTMLImageElement).style.display = 'none')
                }
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/35 text-[10px] tracking-[0.2em] uppercase">
                Image pending
              </div>
            )}
          </div>
          <div className="font-serif text-lg leading-tight">
            {data.genus}{' '}
            <span className="italic text-emerald-200/90">
              {data.specific_epithet}
            </span>
          </div>
          {data.common_name && (
            <div className="text-xs text-white/55 mt-0.5">
              {data.common_name}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {data.habitat && <Pill icon={<Leaf className="h-3 w-3" />}>{data.habitat}</Pill>}
            {data.region && <Pill icon={<MapPin className="h-3 w-3" />}>{data.region}</Pill>}
            {data.conservation_status && (
              <Pill icon={<Sparkles className="h-3 w-3" />}>
                {data.conservation_status}
              </Pill>
            )}
          </div>
        </>
      )}
    </Shell>
  );
};

// ---------------------------------------------------------------------------
// 2) OrchidOfTheDayWidget
// ---------------------------------------------------------------------------

export const OrchidOfTheDayWidget: React.FC<WidgetProps> = ({ className }) => {
  const [pick, setPick] = useState<ApiSpeciesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [unconfigured, setUnconfigured] = useState(false);

  useEffect(() => {
    const c = new AbortController();
    speciesApi.featured(c.signal).then(r => {
      if (c.signal.aborted) return;
      if (r.data && r.data.length > 0) {
        const day = new Date();
        const idx =
          (day.getFullYear() * 1000 + day.getMonth() * 31 + day.getDate()) %
          r.data.length;
        setPick(r.data[idx]);
      }
      setUnconfigured(r.unconfigured);
      setLoading(false);
    });
    return () => c.abort();
  }, []);

  return (
    <Shell
      title="Orchid of the Day"
      href={pick ? `/species/${encodeURIComponent(pick.taxonomy_id)}` : '/'}
      badge="Daily rotation"
      className={className}
    >
      {loading && <SkeletonRow />}
      {!loading && unconfigured && (
        <Empty>
          Configure VITE_API_BASE_URL to power the daily rotation.
        </Empty>
      )}
      {!loading && pick && (
        <div className="relative h-full">
          <div className="aspect-[16/10] rounded-lg overflow-hidden bg-[#0d1f17] mb-3">
            {pick.representative_image_url ? (
              <img
                src={pick.representative_image_url}
                alt={pick.canonical_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/35 text-[10px] tracking-[0.2em] uppercase">
                Image pending
              </div>
            )}
          </div>
          <div className="font-serif text-xl leading-tight">
            {pick.canonical_name}
          </div>
          {pick.common_name && (
            <div className="text-xs text-white/60 mt-0.5">
              {pick.common_name}
            </div>
          )}
          <div className="text-[10px] tracking-[0.2em] uppercase text-emerald-300/70 mt-2">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </div>
        </div>
      )}
    </Shell>
  );
};

// ---------------------------------------------------------------------------
// 3) AtlasTeaserWidget
// ---------------------------------------------------------------------------

export const AtlasTeaserWidget: React.FC<WidgetProps> = ({ className }) => (
  <Shell title="Atlas" href="/atlas" badge="Geospatial" className={className}>
    <div className="relative h-full flex flex-col">
      <div className="rounded-lg overflow-hidden border border-white/10 bg-gradient-to-br from-emerald-500/15 via-[#0d1f17] to-sky-500/10 aspect-[16/10] mb-3 flex items-center justify-center">
        <MapIcon className="h-10 w-10 text-emerald-300/60" />
      </div>
      <div className="font-serif text-lg">A live geospatial atlas</div>
      <p className="text-xs text-white/60 mt-1 leading-relaxed">
        Occurrence, pollination, mycorrhizal, and climate overlays driven
        by a single AtlasFilters envelope. Toggle layers, scrub time,
        filter by genus or country.
      </p>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {['Occurrences', 'Genus', 'Pollination', 'Climate', 'Temporal'].map(
          l => (
            <span
              key={l}
              className="text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full border border-white/15 text-white/65"
            >
              {l}
            </span>
          ),
        )}
      </div>
    </div>
  </Shell>
);

// ---------------------------------------------------------------------------
// 4) EcologicalInteractionCard
// ---------------------------------------------------------------------------

export const EcologicalInteractionCardWidget: React.FC<
  WidgetProps & { taxonomyId: string }
> = ({ taxonomyId, className }) => {
  const [panel, setPanel] = useState<InteractionPanel | null>(null);
  const [loading, setLoading] = useState(true);
  const [unconfigured, setUnconfigured] = useState(false);

  useEffect(() => {
    const c = new AbortController();
    interactionsApi.panel(taxonomyId, c.signal).then(r => {
      if (c.signal.aborted) return;
      setPanel(r.data);
      setUnconfigured(r.unconfigured);
      setLoading(false);
    });
    return () => c.abort();
  }, [taxonomyId]);

  return (
    <Shell
      title="Ecological Interactions"
      href={`/species/${encodeURIComponent(taxonomyId)}`}
      badge="GloBI · curated"
      className={className}
    >
      {loading && <SkeletonRow />}
      {!loading && (unconfigured || !panel) && (
        <Empty>
          Interaction intelligence coming online — partner counts and
          badges will populate once /api/interactions/{'{id}'}/panel is
          live.
        </Empty>
      )}
      {!loading && panel && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Stat
              icon={<Bug className="h-3.5 w-3.5" />}
              label="Pollinators"
              value={panel.summary?.pollinator_count}
            />
            <Stat
              icon={<Flower2 className="h-3.5 w-3.5" />}
              label="Visitors"
              value={panel.summary?.flower_visitor_count}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(panel.badges || []).slice(0, 4).map(b => (
              <span
                key={b.code}
                className="text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full border border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
              >
                {b.label}
              </span>
            ))}
            {(!panel.badges || panel.badges.length === 0) && (
              <span className="text-[10px] tracking-[0.2em] uppercase text-white/45">
                No badges yet · data needed
              </span>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
};

// ---------------------------------------------------------------------------
// 5) ZooReviewCardWidget
// ---------------------------------------------------------------------------

export const ZooReviewCardWidget: React.FC<WidgetProps> = ({ className }) => {
  const [status, setStatus] = useState<ZooStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [unconfigured, setUnconfigured] = useState(false);

  useEffect(() => {
    const c = new AbortController();
    zooApi.status(c.signal).then(r => {
      if (c.signal.aborted) return;
      setStatus(r.data);
      setUnconfigured(r.unconfigured);
      setLoading(false);
    });
    return () => c.abort();
  }, []);

  return (
    <Shell
      title="Orchid Zoo"
      href="/zoo"
      badge={unconfigured ? 'Pending API' : status ? 'Live' : 'Refreshing'}
      className={className}
    >
      {loading && <SkeletonRow />}
      {!loading && (
        <div className="grid grid-cols-2 gap-2">
          <Stat
            icon={<ListChecks className="h-3.5 w-3.5" />}
            label="Queue"
            value={status?.queue_depth}
          />
          <Stat
            icon={<Users className="h-3.5 w-3.5" />}
            label="Reviewers"
            value={status?.active_reviewers}
          />
        </div>
      )}
      <p className="text-xs text-white/55 mt-3 leading-relaxed">
        Reviewer-mediated participation. Decisions flow Zooniverse → DB →
        Continuum API → here.
      </p>
    </Shell>
  );
};

// ---------------------------------------------------------------------------
// 6) OacsGreenhouseSnapshotWidget
// ---------------------------------------------------------------------------

export const OacsGreenhouseSnapshotWidget: React.FC<
  WidgetProps & { siteId?: string }
> = ({ siteId, className }) => {
  const [snap, setSnap] = useState<SnapshotReading | null>(null);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const id = siteId || OACS_DEMO_SITES[0].site_id;

  useEffect(() => {
    const c = new AbortController();
    oacsApi.snapshot(id, c.signal).then(r => {
      if (c.signal.aborted) return;
      if (r.data) {
        setSnap(r.data);
        setLive(true);
      } else {
        setSnap(OACS_DEMO_SNAPSHOTS[id] || null);
        setLive(false);
      }
      setLoading(false);
    });
    return () => c.abort();
  }, [id]);

  return (
    <Shell
      title="OACS Greenhouse"
      href="/oacs"
      badge={live ? 'Live' : 'Demo'}
      className={className}
    >
      {loading && <SkeletonRow />}
      {!loading && snap && (
        <div className="grid grid-cols-3 gap-2">
          <Stat
            icon={<Thermometer className="h-3.5 w-3.5" />}
            label="Temp °C"
            value={snap.temp_c}
          />
          <Stat
            icon={<Droplets className="h-3.5 w-3.5" />}
            label="RH %"
            value={snap.rh_pct}
          />
          <Stat
            icon={<Sun className="h-3.5 w-3.5" />}
            label="PAR"
            value={snap.par_umol}
          />
        </div>
      )}
      {!loading && !snap && (
        <Empty>Snapshot pending — /api/oacs/sites/{'{id}'}/snapshot.</Empty>
      )}
    </Shell>
  );
};

// ---------------------------------------------------------------------------
// Tiny shared parts
// ---------------------------------------------------------------------------

const Pill: React.FC<{ children: React.ReactNode; icon?: React.ReactNode }> = ({
  children,
  icon,
}) => (
  <span className="text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full border border-white/15 text-white/65 inline-flex items-center gap-1">
    {icon}
    {children}
  </span>
);

const Stat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: number;
}> = ({ icon, label, value }) => (
  <div className="rounded-lg border border-white/10 bg-[#0d1f17]/60 p-2.5">
    <div className="flex items-center gap-1.5 text-[9px] tracking-[0.2em] uppercase text-emerald-300/80">
      {icon}
      {label}
    </div>
    <div className="font-serif text-xl text-emerald-100 mt-1 tabular-nums">
      {value == null ? '—' : value.toLocaleString()}
    </div>
  </div>
);
