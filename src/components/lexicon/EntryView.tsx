import React, { useEffect, useState } from 'react';
import type { LexiconEntry } from '@/data/types';
import { AskCalyx } from './AskCalyx';
import { EntryHero, type Depth } from './EntryHero';
import { ResupinateComparison, ResupinationSequence } from './Schematics';
import { RecoveredScientificSections } from './RecoveredScientificSections';
import { Disclosure, MaturityChecklist, PendingNote, SectionHeading } from './ui';
import { getLastSource } from '@/lib/lexiconService';
import { CalyxAdaptiveWorkspace } from '@/features/calyx-workspace/CalyxAdaptiveWorkspace';
import { recordCalyxSurfaceContext } from '@/features/calyx-workspace/sessionContext';

const TextOrPending: React.FC<{ value?: string; label: string }> = ({ value, label }) =>
  value ? <p className="text-[15px] leading-relaxed text-stone-700">{value}</p> : <PendingNote label={`${label} awaiting enrichment`} />;

const jumpTo = (id: string) => {
  if (typeof document === 'undefined') return;
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export const EntryView: React.FC<{ entry: LexiconEntry; onOpen: (slug: string) => void; onBrowse: () => void }> = ({ entry, onOpen, onBrowse }) => {
  const isResupination = entry.slug === 'resupination';
  const [depth, setDepth] = useState<Depth>('basic');

  useEffect(() => {
    setDepth('basic');
    recordCalyxSurfaceContext({
      surface: 'lexicon-entry',
      module: 'illustrated-orchid-lexicon',
      object_type: 'lexicon_concept',
      object_id: entry.slug,
      label: entry.preferred_term,
      path: typeof window === 'undefined' ? undefined : window.location.pathname,
      metadata: {
        category: entry.category ?? null,
        source_system: entry.source_system ?? null,
        review_state: entry.review_state ?? null,
        certainty_summary: entry.certainty_summary ?? null,
      },
    });
  }, [entry.slug, entry.preferred_term, entry.category, entry.source_system, entry.review_state, entry.certainty_summary]);

  const changeDepth = (next: Depth) => {
    setDepth(next);
    window.requestAnimationFrame(() => jumpTo(next === 'basic' ? 'definition' : next === 'deeper' ? 'how' : 'evidence'));
  };

  return (
    <div>
      <EntryHero entry={entry} depth={depth} onDepth={changeDepth} onBrowse={onBrowse} onJump={jumpTo} />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-[12px] text-stone-500">
          Displayed from: {entry.source_system ?? getLastSource()} · canonical records supersede migration fallback by slug.
        </p>

        <section className="py-10">
          <SectionHeading eyebrow="Record maturity" title="What this concept record currently carries" />
          <div className="mt-5"><MaturityChecklist flags={entry.maturity ?? []} /></div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.45fr),minmax(280px,.55fr)]">
          <div className="space-y-10">
            <section id="definition" className="scroll-mt-24 rounded-sm border border-stone-200 bg-white p-6">
              <SectionHeading eyebrow="Definition" title="Scientific scope" />
              <div className="mt-5 space-y-5">
                <TextOrPending value={entry.expanded_definition} label="Expanded definition" />
                {entry.scope_note ? (
                  <div className="border-l-2 border-[#4A7C59] pl-4">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#4A7C59]">Scope note</h3>
                    <p className="mt-1 text-sm leading-relaxed text-stone-700">{entry.scope_note}</p>
                  </div>
                ) : null}
              </div>
            </section>

            {isResupination ? (
              <section className="rounded-sm border border-stone-200 bg-white p-6">
                <SectionHeading eyebrow="Development" title="Visual sequence" lead="Preserved from the Famous source export as a conceptual explanatory schematic." />
                <div className="mt-6"><ResupinationSequence /></div>
                <div className="mt-8"><ResupinateComparison /></div>
              </section>
            ) : null}

            <section id="how" className="scroll-mt-24 rounded-sm border border-stone-200 bg-white p-6">
              <SectionHeading eyebrow="Morphology & development" title="How the concept is expressed" />
              <div className="mt-5 space-y-4">
                <TextOrPending value={entry.anatomical_context} label="Anatomical context" />
                <TextOrPending value={entry.morphological_context} label="Morphological context" />
                {entry.mechanism_blocks?.length ? entry.mechanism_blocks.map((block) => (
                  <Disclosure key={block.id} summary={block.heading}>
                    <p>{block.body}</p>
                    {block.note ? <p className="mt-2 text-sm text-stone-500">{block.note}</p> : null}
                  </Disclosure>
                )) : <PendingNote label="Mechanism evidence awaiting enrichment" />}
              </div>
            </section>

            <section id="identification" className="scroll-mt-24 rounded-sm border border-stone-200 bg-white p-6">
              <SectionHeading eyebrow="Identification" title="Characters and cautions" />
              <div className="mt-5 space-y-5">
                <TextOrPending value={entry.identification_significance} label="Identification significance" />
                {entry.character_states?.length ? (
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#4A7C59]">Character states</h3>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      {entry.character_states.map((state) => (
                        <article key={state.label} className="rounded-sm border border-stone-200 bg-[#FDFBF6] p-4">
                          <h4 className="font-medium text-stone-900">{state.label}</h4>
                          {state.description ? <p className="mt-1 text-sm leading-relaxed text-stone-600">{state.description}</p> : null}
                          {state.notes ? <p className="mt-2 text-xs text-stone-500">{state.notes}</p> : null}
                        </article>
                      ))}
                    </div>
                  </div>
                ) : <PendingNote label="Character states awaiting enrichment" />}
                {entry.identification_cautions?.length ? (
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-amber-800">Do not infer</h3>
                    <ul className="mt-2 space-y-2 text-sm text-stone-700">
                      {entry.identification_cautions.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>

            <div id="why" className="scroll-mt-24"><RecoveredScientificSections entry={entry} /></div>

            <section id="evidence" className="scroll-mt-24 rounded-sm border border-stone-200 bg-white p-6">
              <SectionHeading eyebrow="Evidence" title="Literature and provenance" />
              <div className="mt-5 space-y-5">
                {entry.literature?.length ? (
                  <ul className="space-y-3">
                    {entry.literature.map((record) => (
                      <li key={record.id} className="rounded-sm border border-stone-200 p-4">
                        <p className="font-medium text-stone-900">{record.title ?? 'Untitled literature record'}</p>
                        {record.authors?.length ? <p className="mt-1 text-sm text-stone-600">{record.authors.join(', ')}{record.year ? ` (${record.year})` : ''}</p> : null}
                        {record.summary ? <p className="mt-2 text-sm leading-relaxed text-stone-600">{record.summary}</p> : null}
                      </li>
                    ))}
                  </ul>
                ) : <PendingNote label={entry.literature_status ?? 'Verified literature links awaiting enrichment'} />}
                <div className="rounded-sm bg-stone-50 p-4 text-sm text-stone-600">
                  <strong className="text-stone-800">Provenance:</strong> {entry.provenance?.source ?? entry.source_system ?? 'No provenance statement supplied yet.'}
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-sm border border-stone-200 bg-white p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#4A7C59]">Terminology</h2>
              {entry.broader_concept ? <p className="mt-3 text-sm text-stone-700"><strong>Broader:</strong> {entry.broader_concept.label}</p> : null}
              {entry.narrower_concepts?.length ? (
                <div className="mt-3"><strong className="text-sm text-stone-700">Narrower:</strong><ul className="mt-1 space-y-1 text-sm">{entry.narrower_concepts.map((item) => <li key={item.label}>{item.slug ? <button type="button" onClick={() => onOpen(item.slug!)} className="text-[#6B3FA0] underline underline-offset-2">{item.label}</button> : item.label}</li>)}</ul></div>
              ) : null}
              {entry.related_terminology?.length ? (
                <div className="mt-4"><strong className="text-sm text-stone-700">Related:</strong><div className="mt-2 flex flex-wrap gap-1">{entry.related_terminology.map((item) => <span key={item} className="rounded-full border border-stone-300 bg-stone-50 px-2 py-1 text-xs text-stone-600">{item}</span>)}</div></div>
              ) : null}
            </section>

            <section className="rounded-sm border border-stone-200 bg-white p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#4A7C59]">Botanical language</h2>
              {entry.etymology?.segments?.length ? (
                <div className="mt-3 space-y-3">
                  {entry.etymology.segments.map((segment, index) => (
                    <div key={`${segment.form}-${index}`}>
                      <p className="font-serif text-lg text-stone-900">{segment.form}</p>
                      <p className="text-xs text-stone-500">{segment.language ?? 'Language pending'} · {segment.role ?? 'element'}</p>
                      {segment.gloss ? <p className="mt-1 text-sm text-stone-700">{segment.gloss}</p> : null}
                    </div>
                  ))}
                  {entry.etymology.botanical_latin_notes ? <p className="border-t border-stone-200 pt-3 text-sm leading-relaxed text-stone-600">{entry.etymology.botanical_latin_notes}</p> : null}
                </div>
              ) : <PendingNote label="Botanical Latin / word roots awaiting canonical enrichment" />}
            </section>

            <section className="rounded-sm border border-stone-200 bg-white p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#4A7C59]">Vision Lab</h2>
              <p className="mt-3 text-sm leading-relaxed text-stone-600">{entry.vision_lab_notes ?? 'Vision-Lexicon analysis, image regions, reference sets and measurement rules can be attached through the canonical Vision service.'}</p>
            </section>
          </aside>
        </div>

        <div className="mt-12 scroll-mt-24" id="calyx">
          <CalyxAdaptiveWorkspace entry={entry}>
            <AskCalyx concept={entry.slug} conceptLabel={entry.preferred_term} />
          </CalyxAdaptiveWorkspace>
        </div>
      </div>
    </div>
  );
};
