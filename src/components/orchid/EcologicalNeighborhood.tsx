import React, { useMemo } from 'react';
import { Leaf } from 'lucide-react';
import type { EcologicalNeighborhoodCard as Card } from '@/lib/ecologicalNeighborhood';
import EcologicalNeighborhoodCard from '@/components/orchid/EcologicalNeighborhoodCard';
import DailyGenusRelationshipChips from '@/components/orchid/DailyGenusRelationshipChips';

const ScientificName: React.FC<{ name?: string }> = ({ name }) => {
  if (!name) return null;
  return <span className="italic normal-case">{name}</span>;
};

interface Props {
  scientificName: string;
  cards: Card[];
  loading?: boolean;
  className?: string;
}

function firstCardValue(cards: Card[], types: Card['type'][]): string | undefined {
  const hit = cards.find((card) => types.includes(card.type));
  if (!hit) return undefined;
  return String(hit.evidenceValue || hit.subtitle || hit.title || '').trim() || undefined;
}

function genusOf(scientificName: string): string | undefined {
  const genus = scientificName.trim().split(/\s+/)[0];
  if (!genus) return undefined;
  return genus.charAt(0).toUpperCase() + genus.slice(1).toLowerCase();
}

const EcologicalNeighborhood: React.FC<Props> = ({
  scientificName,
  cards,
  loading = false,
  className = '',
}) => {
  const sortedCards = [...cards].sort((a, b) => a.priority - b.priority);
  const chipValues = useMemo(
    () => ({
      genus: genusOf(scientificName),
      habitat: firstCardValue(cards, ['habitat', 'host_tree']),
      geography: firstCardValue(cards, ['geography']),
      pollinator: firstCardValue(cards, ['pollinator']),
      fungus: firstCardValue(cards, ['fungus', 'fungal_dependency']),
      conservation: firstCardValue(cards, ['conservation']),
    }),
    [cards, scientificName],
  );

  return (
    <section
      className={[
        'relative bg-[#07130c] text-[#f5f0e8] border-t border-white/[0.06]',
        className,
      ].join(' ')}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 20% 0%, rgba(40,86,68,0.28) 0%, rgba(7,19,12,0) 55%),' +
            'radial-gradient(ellipse at 90% 100%, rgba(120,90,40,0.13) 0%, rgba(7,19,12,0) 60%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1400px] px-6 py-16 lg:px-10 lg:py-20">
        <div className="mb-8">
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.34em] text-[#c9a24a]">
            <span className="h-px w-8 bg-[#c9a24a]/55" />
            Ecological Neighborhood
          </div>

          <h2
            className="mt-4 max-w-4xl leading-tight text-[#faf7f2]"
            style={{
              fontFamily: '"Playfair Display","Cormorant Garamond",Georgia,serif',
              fontSize: 'clamp(2rem, 4vw, 3.5rem)',
            }}
          >
            Relationships around <ScientificName name={scientificName} />.
          </h2>

          <p className="mt-4 max-w-3xl text-[15px] leading-7 text-[#d8d1c2]/80">
            These cards are centered on the active species, not only the genus.
            They can include co-occurring orchids, pollinators, fungi, habitat,
            substrate, conservation pressure, geography, and knowledge-graph signals.
          </p>

          <div className="mt-5 rounded-2xl border border-[#c9a24a]/15 bg-[#13291a]/70 p-4">
            <DailyGenusRelationshipChips
              species={scientificName}
              genus={chipValues.genus}
              habitat={chipValues.habitat}
              geography={chipValues.geography}
              pollinator={chipValues.pollinator}
              fungus={chipValues.fungus}
              conservation={chipValues.conservation}
              sourceView="oc_api.species_ecological_neighborhood_v1"
              className="mt-0"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-80 animate-pulse rounded-2xl border border-[#c9a24a]/15 bg-[#13291a]"
              />
            ))}
          </div>
        ) : sortedCards.length === 0 ? (
          <div className="rounded-2xl border border-[#c9a24a]/20 bg-[#13291a] p-10 text-center">
            <Leaf className="mx-auto h-8 w-8 text-[#c9a24a]" strokeWidth={1.2} />
            <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.26em] text-[#c9a24a]">
              No ecological neighborhood cards yet
            </div>
            <p className="mt-3 text-sm text-[#d8d1c2]/70">
              The adapter returned no cards for this species.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {sortedCards.map((card) => (
              <EcologicalNeighborhoodCard key={card.id} card={card} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default EcologicalNeighborhood;
