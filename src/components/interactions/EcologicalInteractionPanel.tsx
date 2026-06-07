/**
 * EcologicalInteractionPanel
 * --------------------------
 * Composite species-page panel that consumes
 *   GET /api/interactions/{taxonomy_id}/panel
 *
 * Backed (server-side) by oc_api.species_page_globi_interaction_panel_v1.
 *
 * Renders:
 *   • Summary tiles (pollinators, flower visitors, partner diversity, totals)
 *   • Ecological badges
 *   • Partner table (paginated lightly)
 *   • "Data needed" empty state with citizen-science nudge
 *   • Transparent placeholder when API not yet configured
 */

import React, { useEffect, useState } from 'react';
import {
  Bug,
  Flower2,
  Users,
  Activity,
  Loader2,
  CircleDashed,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import {
  interactionsApi,
  INTERACTION_PLACEHOLDER_MESSAGE,
  INTERACTION_DATA_NEEDED_MESSAGE,
  type InteractionPanel,
  type InteractionBadge,
  type PartnerRow,
} from '@/lib/interactions';

interface Props {
  taxonomyId: string;
}

const EcologicalInteractionPanel: React.FC<Props> = ({ taxonomyId }) => {
  const [panel, setPanel] = useState<InteractionPanel | null>(null);
  const [loading, setLoading] = useState(true);
  const [unconfigured, setUnconfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taxonomyId) return;
    const c = new AbortController();
    setLoading(true);
    setError(null);
    interactionsApi.panel(taxonomyId, c.signal).then(r => {
      if (c.signal.aborted) return;
      setPanel(r.data);
      setUnconfigured(r.unconfigured);
      setError(r.error ? r.error.message : null);
      setLoading(false);
    });
    return () => c.abort();
  }, [taxonomyId]);

  const fmt = (n?: number) => (n == null ? '—' : n.toLocaleString());

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80">
          Ecological Interactions
        </div>
        <div className="text-[10px] tracking-[0.2em] uppercase text-white/40">
          {panel?.source || 'GloBI · curated'}
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-white/10 bg-[#142a1f] p-6 flex items-center gap-3 text-sm text-white/65">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading interaction panel…
        </div>
      )}

      {!loading && unconfigured && (
        <PlaceholderCard
          title="Interaction intelligence coming online"
          body="The Orchid Continuum interaction API is not yet configured for this deployment. Once /api/interactions/{taxonomy_id}/panel is reachable, GloBI-derived partner records, pollinator counts, and ecological badges will populate this panel."
        />
      )}

      {!loading && !unconfigured && error && (
        <PlaceholderCard
          title="Interaction service refreshing"
          body={error}
        />
      )}

      {!loading && !unconfigured && !error && panel && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryTile
              icon={<Bug className="h-4 w-4" />}
              label="Pollinators"
              value={fmt(panel.summary?.pollinator_count)}
            />
            <SummaryTile
              icon={<Flower2 className="h-4 w-4" />}
              label="Flower visitors"
              value={fmt(panel.summary?.flower_visitor_count)}
            />
            <SummaryTile
              icon={<Users className="h-4 w-4" />}
              label="Partner taxa"
              value={fmt(panel.partners?.length)}
            />
            <SummaryTile
              icon={<Activity className="h-4 w-4" />}
              label="Total interactions"
              value={fmt(panel.summary?.total_interactions)}
            />
          </div>

          {/* Badges */}
          {panel.badges && panel.badges.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {panel.badges.map(b => (
                <BadgePill key={b.code} badge={b} />
              ))}
            </div>
          )}

          {/* Data-needed empty state */}
          {(panel.data_needed ||
            (!panel.partners?.length &&
              !panel.summary?.total_interactions)) && (
            <div className="mt-5 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-5">
              <div className="flex items-center gap-2 text-emerald-200 text-xs tracking-[0.2em] uppercase mb-2">
                <Sparkles className="h-3.5 w-3.5" />
                Data needed
              </div>
              <p className="text-sm text-white/75 leading-relaxed">
                {panel.data_needed_reason ||
                  INTERACTION_DATA_NEEDED_MESSAGE}{' '}
                Citizen-science observations of pollinators, mycorrhizal
                associates, and floral visitors are routed through the
                Orchid Zoo review pipeline before they appear here.
              </p>
            </div>
          )}

          {/* Partner table */}
          {panel.partners && panel.partners.length > 0 && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-[#142a1f] overflow-hidden">
              <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                <div className="text-xs tracking-[0.2em] uppercase text-emerald-300/80">
                  Partner taxa
                </div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-white/45">
                  {panel.partners.length} rows
                </div>
              </div>
              <div className="divide-y divide-white/5">
                {panel.partners.slice(0, 12).map((p, i) => (
                  <PartnerRowItem key={i} row={p} />
                ))}
              </div>
              {panel.partners.length > 12 && (
                <div className="px-5 py-3 text-[10px] tracking-[0.2em] uppercase text-white/45 border-t border-white/10">
                  +{panel.partners.length - 12} more partners — full list via
                  API
                </div>
              )}
            </div>
          )}

          {/* Provenance footer */}
          <div className="mt-3 flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-white/40">
            <CircleDashed className="h-3 w-3" />
            {panel.last_updated
              ? `Last synced ${new Date(panel.last_updated).toLocaleString()}`
              : INTERACTION_PLACEHOLDER_MESSAGE}
          </div>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

const SummaryTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <div className="rounded-xl border border-white/10 bg-[#142a1f] p-4">
    <div className="flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-emerald-300/80">
      {icon}
      {label}
    </div>
    <div className="font-serif text-2xl text-emerald-100 mt-2 tabular-nums">
      {value}
    </div>
  </div>
);

const toneClasses: Record<string, string> = {
  emerald: 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100',
  amber: 'border-amber-300/40 bg-amber-300/10 text-amber-100',
  rose: 'border-rose-300/40 bg-rose-300/10 text-rose-100',
  sky: 'border-sky-300/40 bg-sky-300/10 text-sky-100',
  neutral: 'border-white/15 bg-white/5 text-white/80',
};

const BadgePill: React.FC<{ badge: InteractionBadge }> = ({ badge }) => (
  <span
    title={badge.description}
    className={
      'text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 ' +
      (toneClasses[badge.tone || 'emerald'] || toneClasses.emerald)
    }
  >
    {badge.label}
    {typeof badge.count === 'number' && (
      <span className="opacity-70">· {badge.count}</span>
    )}
  </span>
);

const PartnerRowItem: React.FC<{ row: PartnerRow }> = ({ row }) => (
  <div className="px-5 py-3 flex items-center justify-between gap-4">
    <div className="min-w-0">
      <div className="text-sm text-white/90 italic truncate">
        {row.partner_taxon}
      </div>
      <div className="text-[10px] tracking-[0.2em] uppercase text-white/45 mt-0.5">
        {[row.partner_kingdom, row.partner_family].filter(Boolean).join(' · ') ||
          'Kingdom · family pending'}
      </div>
    </div>
    <div className="flex items-center gap-3 shrink-0">
      <span className="text-[10px] tracking-[0.2em] uppercase text-emerald-300/80">
        {row.interaction_type}
      </span>
      {typeof row.interaction_count === 'number' && (
        <span className="text-xs text-white/65 tabular-nums">
          ×{row.interaction_count}
        </span>
      )}
      {row.reference_url && (
        <a
          href={row.reference_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/55 hover:text-emerald-200"
          aria-label="Open reference"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  </div>
);

const PlaceholderCard: React.FC<{ title: string; body: string }> = ({
  title,
  body,
}) => (
  <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-5">
    <div className="text-[10px] tracking-[0.2em] uppercase text-emerald-300/70 mb-2">
      Transparent empty state
    </div>
    <div className="font-serif text-lg text-white mb-1">{title}</div>
    <p className="text-sm text-white/60 leading-relaxed">{body}</p>
  </div>
);

export default EcologicalInteractionPanel;
