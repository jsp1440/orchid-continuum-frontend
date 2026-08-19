import React from 'react';
import type { LexiconEntry, Relationship } from '@/data/types';
import { PendingNote, SectionHeading } from './ui';

const RELATIONSHIP_LABELS: Partial<Record<Relationship['predicate'], string>> = {
  defined_by: 'Defined by',
  illustrated_by: 'Illustrated by',
  demonstrated_by: 'Demonstrated by',
  contrasts_with: 'Contrasts with',
  occurs_in: 'Occurs in',
  used_to_diagnose: 'Used to diagnose',
  supported_by: 'Supported by',
  related_to: 'Related to',
  part_of: 'Part of',
  connects_to: 'Connects to',
};

export const ConnectedKnowledge: React.FC<{ entry: LexiconEntry; onOpen: (slug: string) => void }> = ({ entry, onOpen }) => {
  const relationships = entry.relationships ?? [];
  const taxa = entry.example_taxa ?? [];
  const states = entry.character_states ?? [];
  const related = entry.related_terminology ?? [];
  const hasConnections = relationships.length || taxa.length || states.length || related.length || entry.broader_concept || entry.narrower_concepts?.length;

  return (
    <section className="rounded-sm border border-stone-200 bg-[#F8F4FB] p-6">
      <SectionHeading
        eyebrow="Connected knowledge"
        title="How this concept connects across Orchid Continuum"
        lead="Connections are rendered from the active record. Canonical records do not inherit unreviewed migration relationships."
      />

      {!hasConnections ? (
        <div className="mt-5"><PendingNote label="Connected knowledge awaiting canonical enrichment" /></div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            {entry.broader_concept ? (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#4A7C59]">Broader concept</h3>
                <p className="mt-2 text-sm text-stone-700">
                  {entry.broader_concept.slug ? (
                    <button type="button" onClick={() => onOpen(entry.broader_concept!.slug!)} className="font-medium text-[#6B3FA0] underline underline-offset-2">
                      {entry.broader_concept.label}
                    </button>
                  ) : entry.broader_concept.label}
                </p>
              </div>
            ) : null}

            {entry.narrower_concepts?.length ? (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#4A7C59]">Narrower concepts</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {entry.narrower_concepts.map((item) => item.slug ? (
                    <button key={item.label} type="button" onClick={() => onOpen(item.slug!)} className="rounded-full border border-[#6B3FA0]/25 bg-white px-3 py-1 text-xs text-[#6B3FA0] hover:border-[#6B3FA0]">
                      {item.label}
                    </button>
                  ) : <span key={item.label} className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs text-stone-600">{item.label}</span>)}
                </div>
              </div>
            ) : null}

            {related.length ? (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#4A7C59]">Related terminology</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {related.map((item) => <span key={item} className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs text-stone-600">{item}</span>)}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-5">
            {relationships.length ? (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#4A7C59]">Stored relationships</h3>
                <ul className="mt-2 space-y-2">
                  {relationships.map((relationship, index) => (
                    <li key={`${relationship.predicate}-${relationship.target}-${index}`} className="rounded-sm border border-stone-200 bg-white p-3 text-sm text-stone-700">
                      <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-stone-500">{RELATIONSHIP_LABELS[relationship.predicate] ?? relationship.predicate}</span>
                      <div className="mt-1">
                        {relationship.target_slug ? (
                          <button type="button" onClick={() => onOpen(relationship.target_slug!)} className="font-medium text-[#6B3FA0] underline underline-offset-2">{relationship.target}</button>
                        ) : <span className="font-medium text-stone-900">{relationship.target}</span>}
                        {relationship.target_kind ? <span className="ml-2 text-xs text-stone-500">{relationship.target_kind}</span> : null}
                      </div>
                      {relationship.note ? <p className="mt-1 text-xs leading-relaxed text-stone-500">{relationship.note}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {taxa.length ? (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#4A7C59]">Example taxa</h3>
                <ul className="mt-2 space-y-2 text-sm text-stone-700">
                  {taxa.map((taxon) => <li key={`${taxon.name}-${taxon.rank ?? ''}`}><span className="font-medium text-stone-900">{taxon.name}</span>{taxon.rank ? <span className="ml-2 text-xs text-stone-500">{taxon.rank}</span> : null}{taxon.note ? <span className="mt-0.5 block text-xs text-stone-500">{taxon.note}</span> : null}</li>)}
                </ul>
              </div>
            ) : null}

            {states.length ? (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#4A7C59]">Identification character states</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{states.map((state) => state.label).join(' · ')}</p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
};
