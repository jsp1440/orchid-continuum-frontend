import React, { useEffect, useState } from 'react';
import {
  Database,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Sprout,
  RefreshCcw,
} from 'lucide-react';
import { fetchAtlasDebugStats, resetOrchidContinuumCaches, type AtlasDebugStats } from '@/lib/orchidContinuum';


/**
 * AtlasDebugPanel — admin / debug view of the live atlas_occurrences AND
 * species_mycorrhizal tables.
 *
 * Surfaces:
 *   - total / valid coord counts
 *   - records by continent, by genus, by country, by dataset
 *   - field completeness (imagery, elevation, habitat, year)
 *   - linkage to curated species
 *   - expected biogeographic regions coverage check
 *   - LIVE mycorrhizal table row count + distinct fungi + fungal-family
 *     distribution + atlas-points-with-mycorrhiza (so the team can verify
 *     the homepage's "Mycorrhizal linked" counter as the table fills)
 *
 * Collapsed by default; click to expand. All counts come from live tables —
 * no hard-coded numbers. A Refresh button forces a re-read of every table.
 */

const AtlasDebugPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<AtlasDebugStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchAtlasDebugStats()
      .then((s) => setStats(s))
      .catch((e) => console.warn('[AtlasDebugPanel]', e))
      .finally(() => setLoading(false));
  }, [open, nonce]);

  const refresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Drop the module-level caches in orchidContinuum.ts so the next
    // fetchAtlasDebugStats() call re-queries every backing table. Lets the
    // team verify the mycorrhizal counter lighting up in real time as
    // seed-mycorrhizal-literature fills the table.
    resetOrchidContinuumCaches();
    setStats(null);
    setNonce((n) => n + 1);
  };


  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 backdrop-blur-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Database className="h-4 w-4 text-[#c9a24a]" />
          <div className="font-mono text-[11px] tracking-[0.28em] uppercase text-[#faf7f2]">
            Debug · Ingestion Audit
          </div>
          {stats && (
            <span className="ml-2 font-mono text-[9px] tracking-[0.18em] uppercase text-[#cfc8b8]/60">
              {stats.withValidCoords.toLocaleString()} / {stats.total.toLocaleString()} records ·{' '}
              {stats.generaCount} genera · {stats.countriesCount} countries
            </span>
          )}
          {stats && (
            <span
              className={[
                'ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 border font-mono text-[9px] tracking-[0.18em] uppercase',
                stats.mycorrhizalRows > 0
                  ? 'border-[#86efac]/40 bg-[#86efac]/[0.06] text-[#86efac]'
                  : 'border-[#ff6b6b]/40 bg-[#ff6b6b]/[0.06] text-[#ff6b6b]',
              ].join(' ')}
              title="Live row count from species_mycorrhizal"
            >
              <Sprout className="h-3 w-3" />
              {stats.mycorrhizalRows.toLocaleString()} myco rows
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {open && (
            <span
              role="button"
              tabIndex={0}
              onClick={refresh}
              onKeyDown={(e) => e.key === 'Enter' && refresh(e as unknown as React.MouseEvent)}
              className="inline-flex items-center gap-1 rounded-md border border-white/[0.10] bg-white/[0.02] px-2 py-1 font-mono text-[9px] tracking-[0.18em] uppercase text-[#cfc8b8] hover:bg-white/[0.05] cursor-pointer"
              title="Re-fetch every audit table"
            >
              <RefreshCcw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </span>
          )}
          {open ? (
            <ChevronUp className="h-4 w-4 text-[#c9a24a]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[#c9a24a]" />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-white/[0.06] px-5 py-5 space-y-5">
          {loading && (
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] uppercase text-[#cfc8b8]/70">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Auditing live tables…
            </div>
          )}

          {stats && (
            <>
              {/* Top-line counts */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <StatBox label="Total rows" value={stats.total} />
                <StatBox label="Valid coords" value={stats.withValidCoords} accent />
                <StatBox label="Invalid coords" value={stats.invalidCoords} warn={stats.invalidCoords > 0} />
                <StatBox label="Georeferenced %" value={`${stats.georeferencedPercent}%`} />
                <StatBox label="Distinct taxa" value={stats.taxa} />
                <StatBox label="Genera" value={stats.generaCount} />
                <StatBox label="Countries" value={stats.countriesCount} />
                <StatBox label="Linked → curated" value={stats.linkedToCuratedSpecies} />
                <StatBox label="With imagery" value={stats.withImagery} />
                <StatBox label="With elevation" value={stats.withElevation} />
                <StatBox label="With habitat" value={stats.withHabitat} />
                <StatBox label="With year" value={stats.withYear} />
              </div>

              {/* Mycorrhizal — live verification surface */}
              <div>
                <Header>species_mycorrhizal · live counts</Header>
                {stats.mycorrhizalRows === 0 ? (
                  <div className="rounded-lg border border-[#ff6b6b]/40 bg-[#ff6b6b]/[0.06] px-3 py-2 font-mono text-[10px] tracking-[0.18em] uppercase text-[#ff6b6b]">
                    No linked data available yet. Invoke <span className="text-[#faf7f2]">seed-mycorrhizal-literature</span> to populate this table.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                      <StatBox label="Myco rows" value={stats.mycorrhizalRows} accent />
                      <StatBox label="Distinct fungi" value={stats.mycorrhizalDistinctFungi} />
                      <StatBox label="Fungal families" value={stats.mycorrhizalDistinctFungalFamilies} />
                      <StatBox label="Linked → species" value={stats.mycorrhizalLinkedToSpecies} />
                      <StatBox
                        label="Unlinked binomials"
                        value={stats.mycorrhizalUnlinkedBinomials}
                        warn={stats.mycorrhizalUnlinkedBinomials > 0}
                      />
                    </div>
                    <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-mono text-[10px] tracking-[0.16em] uppercase text-[#cfc8b8]/80">
                      Atlas points the “Mycorrhizal linked only” filter currently returns ·{' '}
                      <span className="text-[#86efac]">
                        {stats.atlasPointsWithMycorrhiza.toLocaleString()}
                      </span>
                    </div>
                    {stats.byFungalFamily.length > 0 && (
                      <div className="mt-3">
                        <DistributionList
                          title="Rows by fungal family"
                          rows={stats.byFungalFamily.map((c) => ({ label: c.family, n: c.n }))}
                          max={Math.max(...stats.byFungalFamily.map((c) => c.n), 1)}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Expected biogeographic regions coverage */}
              <div>
                <Header>Expected orchid regions · coverage</Header>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {stats.expectedRegionsCoverage.map((r) => (
                    <div
                      key={r.region}
                      className={[
                        'rounded-lg px-3 py-2 border',
                        r.ok
                          ? 'border-[#86efac]/30 bg-[#86efac]/[0.04]'
                          : 'border-[#ff6b6b]/40 bg-[#ff6b6b]/[0.06]',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-[#cfc8b8]/75">
                          {r.region}
                        </div>
                        {r.ok ? (
                          <CheckCircle2 className="h-3 w-3 text-[#86efac]" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 text-[#ff6b6b]" />
                        )}
                      </div>
                      <div className={`font-display text-lg leading-tight ${r.ok ? 'text-[#86efac]' : 'text-[#ff6b6b]'}`}>
                        {r.n.toLocaleString()}
                      </div>
                      <div className="font-mono text-[8.5px] tracking-[0.16em] uppercase text-[#7a7466]">
                        records
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Distribution rows */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <DistributionList title="Records by continent" rows={stats.byContinent.map((c) => ({ label: c.continent, n: c.n }))} max={Math.max(...stats.byContinent.map((c) => c.n), 1)} />
                <DistributionList title="Records by genus" rows={stats.byGenus.map((c) => ({ label: c.genus, n: c.n }))} max={Math.max(...stats.byGenus.map((c) => c.n), 1)} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <DistributionList
                  title="Top countries"
                  rows={stats.byCountry.map((c) => ({ label: c.country, n: c.n }))}
                  max={Math.max(...stats.byCountry.map((c) => c.n), 1)}
                  scroll
                />
                <DistributionList
                  title="Data sources"
                  rows={stats.byDataset.map((c) => ({ label: c.dataset, n: c.n }))}
                  max={Math.max(...stats.byDataset.map((c) => c.n), 1)}
                />
              </div>

              <div className="pt-3 border-t border-white/[0.05] flex flex-wrap gap-x-5 gap-y-1 font-mono text-[9px] tracking-[0.18em] uppercase text-[#7a7466]">
                <div>
                  Curated species · <span className="text-[#cfc8b8]">{stats.curatedSpecies}</span>
                </div>
                <div>
                  Curated occurrences · <span className="text-[#cfc8b8]">{stats.curatedOccurrences}</span>
                </div>
                <div>
                  Curated w/ image · <span className="text-[#cfc8b8]">{stats.curatedWithImage}</span>
                </div>
                <div>
                  Verified · <span className="text-[#cfc8b8]">{stats.verifiedCount}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

function StatBox({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={[
        'rounded-lg border px-3 py-2',
        warn
          ? 'border-[#ff6b6b]/40 bg-[#ff6b6b]/[0.06]'
          : accent
          ? 'border-[#c9a24a]/40 bg-[#c9a24a]/[0.06]'
          : 'border-white/[0.08] bg-white/[0.02]',
      ].join(' ')}
    >
      <div className={`font-display text-lg leading-tight not-italic ${warn ? 'text-[#ff6b6b]' : accent ? 'text-[#c9a24a]' : 'text-[#faf7f2]'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="font-mono text-[8.5px] tracking-[0.20em] uppercase text-[#7a7466] mt-0.5">
        {label}
      </div>
    </div>
  );
}

function DistributionList({
  title,
  rows,
  max,
  scroll,
}: {
  title: string;
  rows: { label: string; n: number }[];
  max: number;
  scroll?: boolean;
}) {
  return (
    <div>
      <Header>{title}</Header>
      <ul className={['space-y-1', scroll ? 'max-h-72 overflow-y-auto pr-1' : ''].join(' ')}>
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2.5">
            <div className="font-mono text-[10px] tracking-[0.10em] text-[#cfc8b8]/80 w-44 truncate">
              {r.label}
            </div>
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
              <div
                className="h-full bg-[#c9a24a]/70"
                style={{ width: `${(r.n / max) * 100}%` }}
              />
            </div>
            <div className="font-mono text-[10px] tracking-[0.10em] text-[#cfc8b8] w-14 text-right">
              {r.n.toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.26em] uppercase text-[#c9a24a] mb-2">
      {children}
    </div>
  );
}

export default AtlasDebugPanel;
