import React, { useEffect } from 'react';
import type { LexiconEntry } from '@/data/types';
import { AskCalyx } from './AskCalyx';
import { FlowerSchematic, ResupinateComparison, ResupinationSequence } from './Schematics';
import { RecoveredScientificSections } from './RecoveredScientificSections';
import { CertaintyChip, Disclosure, MaturityChecklist, PendingNote, ReviewStateChip, SectionHeading } from './ui';
import { getLastSource } from '@/lib/lexiconService';
import { CalyxAdaptiveWorkspace } from '@/features/calyx-workspace/CalyxAdaptiveWorkspace';
import { recordCalyxSurfaceContext } from '@/features/calyx-workspace/sessionContext';

const TextOrPending: React.FC<{value?:string;label:string}>=({value,label})=>value?<p className="text-[15px] leading-relaxed text-stone-700">{value}</p>:<PendingNote label={`${label} awaiting enrichment`}/>;

export const EntryView:React.FC<{entry:LexiconEntry;onOpen:(slug:string)=>void;onBrowse:()=>void}>=({entry,onOpen,onBrowse})=>{
  const isResupination=entry.slug==='resupination';
  useEffect(()=>{
    recordCalyxSurfaceContext({
      surface:'lexicon-entry',
      module:'illustrated-orchid-lexicon',
      object_type:'lexicon_concept',
      object_id:entry.slug,
      label:entry.preferred_term,
      path:typeof window==='undefined'?undefined:window.location.pathname,
      metadata:{
        category:entry.category??null,
        source_system:entry.source_system??null,
        review_state:entry.review_state??null,
        certainty_summary:entry.certainty_summary??null,
      },
    });
  },[entry.slug,entry.preferred_term,entry.category,entry.source_system,entry.review_state,entry.certainty_summary]);
  return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
    <nav aria-label="Breadcrumb" className="text-sm text-stone-500"><button type="button" onClick={onBrowse} className="underline underline-offset-2 hover:text-[#6B3FA0]">A–Z Lexicon</button><span aria-hidden className="px-2">/</span><span className="text-stone-700">{entry.preferred_term}</span></nav>
    <header className="mt-7 grid gap-8 border-b border-stone-200 pb-10 lg:grid-cols-[1fr,320px] lg:items-start"><div><div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-semibold uppercase tracking-[.18em] text-[#4A7C59]">{entry.category??'Category awaiting assignment'}</span>{entry.review_state&&<ReviewStateChip state={entry.review_state}/>} {entry.certainty_summary&&<CertaintyChip level={entry.certainty_summary}/>}</div><h1 className="mt-3 font-serif text-4xl leading-tight text-stone-900 sm:text-5xl" style={{fontFamily:'Georgia, serif'}}>{entry.preferred_term}</h1>{entry.pronunciation&&<p className="mt-2 font-serif text-base italic text-stone-500">/{entry.pronunciation}/</p>}<div className="mt-5 max-w-3xl text-lg leading-relaxed text-stone-800"><TextOrPending value={entry.quick_definition} label="Definition"/></div>{entry.synonyms?.length?<p className="mt-4 text-sm text-stone-600"><strong>Also:</strong> {entry.synonyms.join(', ')}</p>:null}<p className="mt-4 text-[12px] text-stone-500">Displayed from: {entry.source_system??getLastSource()} · canonical records supersede migration fallback by slug.</p></div><aside className="rounded-sm border border-stone-200 bg-[#F6F2EA] p-4"><FlowerSchematic flip={entry.slug==='non-resupination'} className="mx-auto h-56 w-auto"/><p className="mt-2 text-center text-[11px] uppercase tracking-[.12em] text-stone-500">Conceptual schematic · not specimen evidence</p></aside></header>

    <section className="py-10"><SectionHeading eyebrow="Record maturity" title="What this concept record currently carries"/><div className="mt-5"><MaturityChecklist flags={entry.maturity??[]}/></div></section>

    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.45fr),minmax(280px,.55fr)]"><div className="space-y-10">
      <section className="rounded-sm border border-stone-200 bg-white p-6"><SectionHeading eyebrow="Definition" title="Scientific scope"/><div className="mt-5 space-y-5"><TextOrPending value={entry.expanded_definition} label="Expanded definition"/>{entry.scope_note&&<div className="border-l-2 border-[#4A7C59] pl-4"><h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#4A7C59]">Scope note</h3><p className="mt-1 text-sm leading-relaxed text-stone-700">{entry.scope_note}</p></div>}</div></section>
      {isResupination&&<section className="rounded-sm border border-stone-200 bg-white p-6"><SectionHeading eyebrow="Development" title="Visual sequence" lead="Preserved from the Famous AI build as a conceptual explanatory schematic."/><div className="mt-6"><ResupinationSequence/></div><div className="mt-8"><ResupinateComparison/></div></section>}
      <section className="rounded-sm border border-stone-200 bg-white p-6"><SectionHeading eyebrow="Morphology & development" title="How the concept is expressed"/><div className="mt-5 space-y-4"><TextOrPending value={entry.anatomical_context} label="Anatomical context"/><TextOrPending value={entry.morphological_context} label="Morphological context"/>{entry.mechanism_blocks?.length?entry.mechanism_blocks.map((b)=><Disclosure key={b.id} summary={b.heading}><p>{b.body}</p>{b.note&&<p className="mt-2 text-sm text-stone-500">{b.note}</p>}</Disclosure>):<PendingNote label="Mechanism evidence awaiting enrichment"/>}</div></section>
      <section className="rounded-sm border border-stone-200 bg-white p-6"><SectionHeading eyebrow="Identification" title="Characters and cautions"/><div className="mt-5 space-y-5"><TextOrPending value={entry.identification_significance} label="Identification significance"/>{entry.character_states?.length?<div><h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#4A7C59]">Character states</h3><div className="mt-2 grid gap-3 sm:grid-cols-2">{entry.character_states.map((state)=><article key={state.label} className="rounded-sm border border-stone-200 bg-[#FDFBF6] p-4"><h4 className="font-medium text-stone-900">{state.label}</h4>{state.description&&<p className="mt-1 text-sm leading-relaxed text-stone-600">{state.description}</p>}{state.notes&&<p className="mt-2 text-xs text-stone-500">{state.notes}</p>}</article>)}</div></div>:<PendingNote label="Character states awaiting enrichment"/>}{entry.identification_cautions?.length?<div><h3 className="text-[11px] font-semibold uppercase tracking-[.14em] text-amber-800">Do not infer</h3><ul className="mt-2 space-y-2 text-sm text-stone-700">{entry.identification_cautions.map((item)=><li key={item}>• {item}</li>)}</ul></div>:null}</div></section>
      <RecoveredScientificSections entry={entry}/>
      <section className="rounded-sm border border-stone-200 bg-white p-6"><SectionHeading eyebrow="Evidence" title="Literature and provenance"/><div className="mt-5 space-y-5">{entry.literature?.length?<ul className="space-y-3">{entry.literature.map((record)=><li key={record.id} className="rounded-sm border border-stone-200 p-4"><p className="font-medium text-stone-900">{record.title??'Untitled literature record'}</p>{record.authors?.length?<p className="mt-1 text-sm text-stone-600">{record.authors.join(', ')}{record.year?` (${record.year})`:''}</p>:null}{record.summary&&<p className="mt-2 text-sm leading-relaxed text-stone-600">{record.summary}</p>}</li>)}</ul>:<PendingNote label={entry.literature_status??'Verified literature links awaiting enrichment'}/>}<div className="rounded-sm bg-stone-50 p-4 text-sm text-stone-600"><strong className="text-stone-800">Provenance:</strong> {entry.provenance?.source??entry.source_system??'No provenance statement supplied yet.'}</div></div></section>
    </div>
    <aside className="space-y-5"><section className="rounded-sm border border-stone-200 bg-white p-5"><h2 className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#4A7C59]">Terminology</h2>{entry.broader_concept&&<p className="mt-3 text-sm text-stone-700"><strong>Broader:</strong> {entry.broader_concept.label}</p>}{entry.narrower_concepts?.length?<div className="mt-3"><strong className="text-sm text-stone-700">Narrower:</strong><ul className="mt-1 space-y-1 text-sm">{entry.narrower_concepts.map((x)=><li key={x.label}>{x.slug?<button type="button" onClick={()=>onOpen(x.slug!)} className="text-[#6B3FA0] underline underline-offset-2">{x.label}</button>:x.label}</li>)}</ul></div>:null}{entry.related_terminology?.length?<div className="mt-4"><strong className="text-sm text-stone-700">Related:</strong><div className="mt-2 flex flex-wrap gap-1">{entry.related_terminology.map((x)=><span key={x} className="rounded-full border border-stone-300 bg-stone-50 px-2 py-1 text-xs text-stone-600">{x}</span>)}</div></div>:null}</section>
      <section className="rounded-sm border border-stone-200 bg-white p-5"><h2 className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#4A7C59]">Botanical language</h2>{entry.etymology?.segments?.length?<div className="mt-3 space-y-3">{entry.etymology.segments.map((segment,index)=><div key={`${segment.form}-${index}`}><p className="font-serif text-lg text-stone-900">{segment.form}</p><p className="text-xs text-stone-500">{segment.language??'Language pending'} · {segment.role??'element'}</p>{segment.gloss&&<p className="mt-1 text-sm text-stone-700">{segment.gloss}</p>}</div>)}{entry.etymology.botanical_latin_notes&&<p className="border-t border-stone-200 pt-3 text-sm leading-relaxed text-stone-600">{entry.etymology.botanical_latin_notes}</p>}</div>:<PendingNote label="Botanical Latin / word roots awaiting canonical enrichment"/>}</section>
      <section className="rounded-sm border border-stone-200 bg-white p-5"><h2 className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#4A7C59]">Vision Lab</h2><p className="mt-3 text-sm leading-relaxed text-stone-600">{entry.vision_lab_notes??'Vision-Lexicon analysis, image regions, reference sets and measurement rules can be attached through the canonical Vision service.'}</p></section>
    </aside></div>

    <div className="mt-12">
      <CalyxAdaptiveWorkspace entry={entry}>
        <AskCalyx concept={entry.slug} conceptLabel={entry.preferred_term}/>
      </CalyxAdaptiveWorkspace>
    </div>
  </div>;
};
