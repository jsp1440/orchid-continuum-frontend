import React from 'react';
import {
  Bug,
  Camera,
  Globe2,
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
  missing: <Leaf className="h-4 w-4" />,
};

function isPending(card: Card): boolean {
  const text = `${card.title} ${card.relationship} ${card.evidenceValue ?? ''}`.toLowerCase();
  return card.type === 'missing' || text.includes('not yet linked') || text.includes('needed') || text.includes('awaiting');
}

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

const EcologicalNeighborhoodCard: React.FC<Props> = ({ card }) => {
  const pending = isPending(card);

  return (
    <article
      className={[
        'group overflow-hidden rounded-2xl border bg-[#13291a] transition-colors',
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

        {(card.evidenceLabel || card.evidenceValue !== undefined || card.sourceView) && (
          <div className="mt-5 rounded-xl border border-[#c9a24a]/15 bg-black/15 p-3">
            {card.evidenceLabel && (
              <div className="font-mono text-[8.5px] uppercase tracking-[0.22em] text-[#c9a24a]/75">
                {card.evidenceLabel}
              </div>
            )}
            {card.evidenceValue !== undefined && (
              <div className="mt-1 text-sm text-[#faf7f2]">
                {String(card.evidenceValue)}
              </div>
            )}
            {card.sourceView && (
              <div className="mt-2 break-all font-mono text-[8px] uppercase tracking-[0.12em] text-[#7d7567]">
                {card.sourceView}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
};

export default EcologicalNeighborhoodCard;
