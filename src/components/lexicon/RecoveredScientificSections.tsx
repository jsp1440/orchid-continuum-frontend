import React from 'react';
import type { ExplanatoryBlock, LexiconEntry } from '@/data/types';
import { CertaintyChip, PendingNote, SectionHeading } from './ui';

const BlockGrid: React.FC<{ blocks?: ExplanatoryBlock[]; pending: string }> = ({ blocks, pending }) => {
  if (!blocks?.length) return <PendingNote label={pending} />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {blocks.map((block) => (
        <article key={block.id} className="rounded-sm border border-stone-200 bg-[#FDFBF6] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-medium text-stone-900">{block.heading}</h3>
            {block.certainty ? <CertaintyChip level={block.certainty} /> : null}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-stone-700">{block.body}</p>
          {block.note ? <p className="mt-3 border-t border-stone-200 pt-2 text-xs leading-relaxed text-stone-500">{block.note}</p> : null}
        </article>
      ))}
    </div>
  );
};

export const RecoveredScientificSections: React.FC<{ entry: LexiconEntry }> = ({ entry }) => {
  const migrationSource = entry.source_system?.toLocaleLowerCase().includes('famous');
  return (
    <div className="space-y-10">
      {migrationSource ? (
        <p className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          These extended sections are preserved from the uploaded Famous Lexicon export as a draft migration record. They do not carry canonical review status unless and until the Concept Registry supplies reviewed equivalents.
        </p>
      ) : null}

      <section className="rounded-sm border border-stone-200 bg-white p-6">
        <SectionHeading eyebrow="Significance" title="Why this concept matters" />
        <div className="mt-5">
          <BlockGrid blocks={entry.significance_blocks} pending="Functional significance awaiting canonical enrichment" />
        </div>
      </section>

      <section className="rounded-sm border border-stone-200 bg-white p-6">
        <SectionHeading eyebrow="Evolution" title="Evolutionary interpretation" />
        <div className="mt-5 space-y-5">
          <BlockGrid blocks={entry.evolution_blocks} pending="Evolutionary interpretation awaiting canonical enrichment" />
          {entry.variation_notes ? (
            <div className="rounded-sm border-l-2 border-[#6B3FA0] bg-[#F8F4FB] px-4 py-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#6B3FA0]">Variation</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone-700">{entry.variation_notes}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-sm border border-stone-200 bg-white p-6">
        <SectionHeading eyebrow="Conservation" title="Recording and conservation guidance" />
        <div className="mt-5 space-y-5">
          {entry.conservation?.why_it_matters ? <p className="text-sm leading-relaxed text-stone-700">{entry.conservation.why_it_matters}</p> : null}
          {entry.conservation?.what_to_record?.length ? (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#4A7C59]">What to record</h3>
              <ul className="mt-2 space-y-1 text-sm text-stone-700">
                {entry.conservation.what_to_record.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          ) : null}
          {entry.conservation?.do_not_infer_from?.length ? (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-amber-800">Do not infer from</h3>
              <ul className="mt-2 space-y-1 text-sm text-stone-700">
                {entry.conservation.do_not_infer_from.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          ) : null}
          {!entry.conservation ? <PendingNote label="Conservation guidance awaiting canonical enrichment" /> : null}
        </div>
      </section>

      {entry.funding?.funding_source || entry.funding?.acknowledgment_text ? (
        <section className="rounded-sm border border-stone-200 bg-[#F6F2EA] p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#4A7C59]">Funding & recognition</h2>
          {entry.funding.funding_source ? <p className="mt-3 text-sm font-medium text-stone-800">{entry.funding.funding_source}</p> : null}
          {entry.funding.grant_program ? <p className="mt-1 text-sm text-stone-600">{entry.funding.grant_program}</p> : null}
          {entry.funding.acknowledgment_text ? <p className="mt-3 text-sm leading-relaxed text-stone-600">{entry.funding.acknowledgment_text}</p> : null}
        </section>
      ) : null}
    </div>
  );
};
