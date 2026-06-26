import React, { useEffect, useMemo, useState } from 'react';
import { Bug, MapPin, Sprout } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  fetchContinuumGraph,
  fetchGenusOccurrences,
  type ContinuumGraphData,
  type OccurrencePoint,
  type WebNodeData,
} from '@/lib/ocBackend';
import { useDailyGenus } from '@/lib/dailyGenusContext';

type EvidenceKind = 'pollinator' | 'mycorrhiza' | 'habitat';

interface EvidenceCard {
  kind: EvidenceKind;
  title: string;
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  node: WebNodeData | null;
  fallbackItems?: string[];
  fallbackSummary?: string;
}

function uniqueCountries(points: OccurrencePoint[]): string[] {
  return Array.from(
    new Set(points.map((p) => p.country).filter((c): c is string => Boolean(c))),
  ).slice(0, 4);
}

function EvidenceStatus({ node }: { node: WebNodeData | null }) {
  if (!node) {
    return <span className="text-[#9fb0a2]">Query pending</span>;
  }
  if (!node.hasData) {
    return <span className="text-[#9fb0a2]">No returned records</span>;
  }
  return <span className="text-[#d4b34a]">Live returned data</span>;
}

const FeaturedRelationshipEvidence: React.FC = () => {
  const { genus } = useDailyGenus();
  const [graph, setGraph] = useState<ContinuumGraphData | null>(null);
  const [occurrences, setOccurrences] = useState<OccurrencePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    let mounted = true;
    setLoading(true);

    Promise.all([
      fetchContinuumGraph(genus, ctrl.signal),
      fetchGenusOccurrences(genus, 250, ctrl.signal),
    ])
      .then(([g, pts]) => {
        if (!mounted) return;
        setGraph(g);
        setOccurrences(pts);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      ctrl.abort();
    };
  }, [genus]);

  const countries = useMemo(() => uniqueCountries(occurrences), [occurrences]);
  const habitatFallback = useMemo(() => {
    if (countries.length === 0) return [];
    return [
      `${occurrences.length.toLocaleString()} mapped occurrence records`,
      ...countries,
    ].slice(0, 4);
  }, [countries, occurrences.length]);

  const habitatNode: WebNodeData | null = graph?.habitat?.hasData
    ? graph.habitat
    : occurrences.length > 0
      ? {
          count: occurrences.length,
          summary: `${occurrences.length.toLocaleString()} mapped occurrence records`,
          items: habitatFallback,
          hasData: true,
        }
      : graph?.habitat ?? null;

  const cards: EvidenceCard[] = [
    {
      kind: 'pollinator',
      title: 'Pollinator evidence',
      route: '/pollinators',
      icon: Bug,
      node: graph?.pollinators ?? null,
    },
    {
      kind: 'mycorrhiza',
      title: 'Mycorrhizal evidence',
      route: '/mycorrhizae',
      icon: Sprout,
      node: graph?.fungi ?? null,
    },
    {
      kind: 'habitat',
      title: 'Habitat / geography evidence',
      route: '/atlas',
      icon: MapPin,
      node: habitatNode,
    },
  ];

  return (
    <section className="border-y border-white/[0.06] bg-[#0d2114] text-[#f5f0e8]">
      <div className="mx-auto max-w-[1400px] px-6 py-10 lg:px-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#c9a24a]">
              Live relationship check
            </div>
            <h2
              className="mt-2 text-[#faf7f2]"
              style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: 'clamp(1.7rem, 3vw, 2.5rem)' }}
            >
              What is actually connected for <span className="italic text-[#d4b34a]">{genus}</span>?
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-[#cfc8b8]/80">
            These cards query the Continuum backend for the featured genus. If the backend returns no records, the card says so instead of repeating an unsupported claim.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            const node = card.node;
            const items = node?.items ?? [];
            const hasData = Boolean(node?.hasData);

            return (
              <Link
                key={card.kind}
                to={card.route}
                className="rounded-2xl border border-[#c9a24a]/20 bg-[#102d19] p-5 transition hover:border-[#c9a24a]/55 hover:bg-[#14361f]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#c9a24a]/35 text-[#d4b34a]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#c9a24a]/80">
                        <EvidenceStatus node={node} />
                      </div>
                      <h3 className="mt-1 font-serif text-xl text-[#faf7f2]">{card.title}</h3>
                    </div>
                  </div>
                  {loading && <span className="font-mono text-[10px] text-[#9fb0a2]">…</span>}
                </div>

                <div className="mt-5 text-sm leading-6 text-[#e7dfd1]/90">
                  {hasData ? node?.summary : `No ${card.title.toLowerCase()} records returned for ${genus}.`}
                </div>

                {hasData && items.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {items.slice(0, 4).map((item, i) => (
                      <li key={`${card.kind}-${item}-${i}`} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-[#cfc8b8]">
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeaturedRelationshipEvidence;
