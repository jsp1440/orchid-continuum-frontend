import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bug,
  Camera,
  Database,
  Globe2,
  Gauge,
  Leaf,
  Microscope,
  Mountain,
  Network,
  Shield,
  Sprout,
  Trees,
} from 'lucide-react';
import type {
  EcologicalNeighborhoodCard as Card,
  EcologicalNeighborType,
} from '@/lib/ecologicalNeighborhood';
import { ecologicalTypeLabel } from '@/lib/ecologicalNeighborhood';
import { isEcologicalCardPending, navigationTargetForCard } from '@/lib/ecologicalNavigation';
import DailyGenusRelationshipChips from '@/components/orchid/DailyGenusRelationshipChips';

const ICONS: Record<EcologicalNeighborType, React.ReactNode> = {
  species: <Camera className="h-4 w-4" />,
  geography: <Globe2 className="h-4 w-4" />,
  habitat: <Mountain className="h-4 w-4" />,
  pollinator: <Bug className="h-4 w-4" />,
  fungus: <Microscope className="h-4 w-4" />,
  fungal_dependency: <Sprout className="h-4 w-4" />,
  knowledge: <Network className="h-4 w-4" />,
  co_occurring_orchid: <Leaf className="h-4 w-4" />,
  host_tree: <Trees className="h-4 w-4" />,
  conservation: <Shield className="h-4 w-4" />,
  ecological_partner: <Network className="h-4 w-4" />,
  missing: <Leaf className="h-4 w-4" />,
};

const PlaceholderTile: React.FC<{ type: EcologicalNeighborType }> = ({ type }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#17321f] text-[#c9a24a]">
    <div className="rounded-full border border-[#c9a24a]/35 p-3">
      {ICONS[type]}
    </div>
    <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.24em] text-[#c9a24a]/80">
      Relationship card
    </div>
  </div>
);

const ScientificName: React.FC<{ name?: string }> = ({ name }) => {
  if (!name) return null;
  return <span className="italic normal-case">{name}</span>;
};

interface Props {
  card: Card;
}

function text(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function displayValue(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return text(v);
}

function genusOf(name?: string): string | undefined {
  const genus = (name || '').trim().split(/\s+/)[0];
  if (!genus) return undefined;
  return genus.charAt(0).toUpperCase() + genus.slice(1).toLowerCase();
}

function cardValue(card: Card): string | undefined {
  return displayValue(card.evidenceValue) || text(card.title) || text(card.subtitle);
}

function cardChipProps(card: Card): {
  species?: string;
  genus?: string;
  habitat?: string;
  geography?: string;
  pollinator?: string;
  fungus?: string;
  conservation?: string;
} {
  const value = cardValue(card);
  const species = card.scientificName;
  const genus = genusOf(species || card.title);

  switch (card.type) {
    case 'species':
    case 'co_occurring_orchid':
      return { species: species || card.title, genus };
    case 'habitat':
    case 'host_tree':
      return { species, genus, habitat: value };
    case 'geography':
      return { species, genus, geography: value };
    case 'pollinator':
      return { species, genus, pollinator: value };
    case 'fungus':
    case 'fungal_dependency':
      return { species, genus, fungus: value };
    case 'conservation':
      return { species, genus, conservation: value };
    case 'knowledge':
    case 'ecological_partner':
    case 'missing':
    default:
      return { species, genus };
  }
}

type Metric = {
  label: string;
  value: string;
  icon: React.ReactNode;
};

function confidenceFromPriority(card: Card): string | undefined {
  if (card.type === 'missing') return undefined;
  if (typeof card.confidenceClass === 'string' && card.confidenceClass.trim()) {
    return card.confidenceClass.trim();
  }
  if (typeof card.priority === 'number') {
    if (card.priority < 25) return 'high';
    if (card.priority < 70) return 'moderate';
    return 'emerging';
  }
  return undefined;
}

function metricsForCard(card: Card): Metric[] {
  const metrics: Metric[] = [];
  const source = text(card.sourceView);
  const evidenceLabel = text(card.evidenceLabel);
  const evidenceValue = displayValue(card.evidenceValue);
  const confidence = confidenceFromPriority(card);

  if (evidenceLabel && evidenceValue) {
    metrics.push({
      label: evidenceLabel,
      value: evidenceValue,
      icon: <BarChart3 className="h-3.5 w-3.5" />,
    });
  } else if (evidenceValue) {
    metrics.push({
      label: 'Evidence',
      value: evidenceValue,
      icon: <BarChart3 className="h-3.5 w-3.5" />,
    });
  }

  if (confidence) {
    metrics.push({
      label: 'Confidence',
      value: confidence,
      icon: <Gauge className="h-3.5 w-3.5" />,
    });
  }

  if (source) {
    metrics.push({
      label: 'Source',
      value: source.replace(/^src\.lib\./, '').replace(/^oc_api\./, ''),
      icon: <Database className="h-3.5 w-3.5" />,
    });
  }

  return metrics.slice(0, 4);
}

const MetricPill: React.FC<{ metric: Metric }> = ({ metric }) => (
  <div className="rounded-xl border border-[#c9a24a]/15 bg-black/20 px-3 py-2">
    <div className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.18em] text-[#c9a24a]/75">
      {metric.icon}
      {metric.label}
    </div>
    <div className="mt-1 line-clamp-2 text-[12px] leading-snug text-[#faf7f2]">
      {metric.value}
    </div>
  </div>
);

const EcologicalNeighborhoodCard: React.FC<Props> = ({ card }) => {
  const navigate = useNavigate();
  const pending = isEcologicalCardPending(card);
  const target = navigationTargetForCard(card);
  const clickable = Boolean(target);
  const chipProps = cardChipProps(card);
  const metrics = metricsForCard(card);

  const handleClick = () => {
    if (target) navigate(target.href);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLElement> = (event) => {
    if (!target) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigate(target.href);
    }
  };

  const stopCardNavigation: React.MouseEventHandler<HTMLDivElement> = (event) => {
    event.stopPropagation();
  };

  return (
    <article
      role={clickable ? 'link' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${target?.label}: ${card.title}` : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={[
        'group overflow-hidden rounded-2xl border bg-[#13291a] transition-colors',
        clickable ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#e0bd57]/70' : '',
        pending
          ? 'border-[#c9a24a]/20 opacity-90'
          : 'border-[#c9a24a]/35 hover:border-[#e0bd57]',
      ].join(' ')}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-[#17321f]">
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <PlaceholderTile type={card.type} />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1a10] via-[#0b1a10]/20 to-transparent" />

        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-[#c9a24a]/35 bg-[#092135]/85 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.22em] text-[#c9a24a] backdrop-blur">
          {ICONS[card.type]}
          {ecologicalTypeLabel(card.type)}
        </div>

        {pending && (
          <div className="absolute right-3 top-3 rounded-md border border-white/10 bg-black/35 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.18em] text-[#cfc8b8]/75">
            Data needed
          </div>
        )}
      </div>

      <div className="p-5">
        <h3
          className="text-[#faf7f2] leading-tight"
          style={{
            fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
            fontSize: 'clamp(1.25rem, 2vw, 1.65rem)',
          }}
        >
          {card.scientificName ? <ScientificName name={card.scientificName} /> : card.title}
        </h3>

        {card.scientificName && card.title !== card.scientificName && (
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[#c9a24a]/70">
            {card.title}
          </div>
        )}

        {card.subtitle && (
          <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#cfc8b8]/55">
            {card.subtitle}
          </div>
        )}

        <p className="mt-4 text-[13.5px] leading-7 text-[#d8d1c2]/85">
          {card.relationship}
        </p>

        {metrics.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {metrics.map((metric) => (
              <MetricPill key={`${metric.label}:${metric.value}`} metric={metric} />
            ))}
          </div>
        )}

        <div
          className="mt-4 rounded-xl border border-[#c9a24a]/15 bg-[#f6f0df]/95 p-3"
          onClick={stopCardNavigation}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DailyGenusRelationshipChips
            {...chipProps}
            sourceView={card.sourceView}
            className="mt-0"
          />
        </div>

        {target && (
          <div className="mt-5 inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.24em] text-[#e0bd57] transition-transform group-hover:translate-x-1">
            {target.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
    </article>
  );
};

export default EcologicalNeighborhoodCard;
