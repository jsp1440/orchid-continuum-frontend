import React, { useId, useState } from 'react';
import { CertaintyLevel, MaturityFlag, ReviewState } from '@/data/types';

export const MATURITY_LABELS: Record<MaturityFlag, string> = {
  core_definition: 'Core Definition',
  scientifically_enriched: 'Scientifically Enriched',
  etymology_added: 'Etymology Added',
  illustrated: 'Illustrated',
  photographic_examples: 'Photographic Examples',
  literature_linked: 'Literature Linked',
  taxonomy_linked: 'Taxonomy Linked',
  identification_linked: 'Identification Linked',
  vision_enabled: 'Vision Enabled',
  calyx_connected: 'Calyx Integration Ready',
  expert_reviewed: 'Expert Reviewed',
};

export const MATURITY_ORDER: MaturityFlag[] = ['core_definition','scientifically_enriched','etymology_added','illustrated','photographic_examples','literature_linked','taxonomy_linked','identification_linked','vision_enabled','calyx_connected','expert_reviewed'];

export const MaturityBadges: React.FC<{ flags: MaturityFlag[]; max?: number; size?: 'sm' | 'md' }> = ({ flags, max, size = 'sm' }) => {
  const shown = max ? flags.slice(0, max) : flags;
  const rest = max ? flags.length - shown.length : 0;
  return <ul className="flex flex-wrap items-center gap-1.5" aria-label="Entry development indicators">
    {shown.map((f) => <li key={f} className={`inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white/70 text-stone-700 ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#4A7C59]" />{MATURITY_LABELS[f]}</li>)}
    {rest > 0 && <li className="text-[11px] text-stone-500">+{rest} more</li>}
    {flags.length === 0 && <li className="text-[11px] italic text-stone-500">Record imported — awaiting enrichment</li>}
  </ul>;
};

export const MaturityChecklist: React.FC<{ flags: MaturityFlag[] }> = ({ flags }) => <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
  {MATURITY_ORDER.map((f) => { const met = flags.includes(f); return <li key={f} className="flex items-start gap-2 text-sm"><span aria-hidden className={`mt-1 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full border ${met ? 'border-[#4A7C59] bg-[#4A7C59]' : 'border-stone-300 bg-white'}`}>{met && <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-white" fill="none"><path d="M1 5.2 3.6 8 9 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>}</span><span className={met ? 'text-stone-800' : 'text-stone-500'}>{MATURITY_LABELS[f]}<span className="sr-only">{met ? ' — present' : ' — not yet added'}</span>{!met && <span className="ml-1 text-xs italic text-stone-400">not yet added</span>}</span></li>; })}
</ul>;

export const CERTAINTY_LABELS: Record<CertaintyLevel, string> = {
  scientific_consensus: 'Scientific consensus', supported_interpretation: 'Supported interpretation', active_research_area: 'Active research area', evidence_incomplete: 'Evidence incomplete', competing_hypotheses: 'Competing hypotheses', unresolved: 'Unresolved', candidate_knowledge: 'Candidate knowledge', literature_review_pending: 'Literature review pending',
};
const CERTAINTY_STYLES: Record<CertaintyLevel, string> = {
  scientific_consensus: 'border-[#4A7C59]/40 bg-[#4A7C59]/10 text-[#2F5A3D]', supported_interpretation: 'border-sky-700/30 bg-sky-50 text-sky-900', active_research_area: 'border-amber-700/30 bg-amber-50 text-amber-900', evidence_incomplete: 'border-stone-400/50 bg-stone-100 text-stone-700', competing_hypotheses: 'border-[#6B3FA0]/30 bg-[#6B3FA0]/[0.08] text-[#4A2A70]', candidate_knowledge: 'border-dashed border-[#8A6A2F]/50 bg-[#8A6A2F]/[0.08] text-[#6B5220]', literature_review_pending: 'border-dashed border-stone-400/60 bg-stone-50 text-stone-600', unresolved: 'border-stone-500/50 bg-white text-stone-700',
};
export const CertaintyChip: React.FC<{ level: CertaintyLevel; className?: string }> = ({ level, className = '' }) => <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${CERTAINTY_STYLES[level]} ${className}`}><svg aria-hidden viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="currentColor"><circle cx="6" cy="6" r="5" opacity="0.35" /><circle cx="6" cy="6" r="2" /></svg><span className="sr-only">Scientific certainty: </span>{CERTAINTY_LABELS[level]}</span>;

export const REVIEW_LABELS: Record<ReviewState, string> = { draft: 'Draft', source_imported: 'Source imported', literature_reviewed: 'Literature reviewed', illustration_reviewed: 'Illustration reviewed', expert_reviewed: 'Expert reviewed', published: 'Published', revision_needed: 'Revision needed' };
export const ReviewStateChip: React.FC<{ state: ReviewState }> = ({ state }) => <span className="inline-flex items-center gap-1.5 rounded-sm border border-stone-300 bg-white px-2 py-0.5 text-[11px] uppercase tracking-wide text-stone-600"><span className="sr-only">Review state: </span>{REVIEW_LABELS[state]}</span>;

export const SectionHeading: React.FC<{ eyebrow?: string; title: string; lead?: string; id?: string; align?: 'left' | 'center' }> = ({ eyebrow, title, lead, id, align = 'left' }) => <header className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>{eyebrow && <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4A7C59]">{eyebrow}</p>}<h2 id={id} className="font-serif text-2xl leading-tight text-stone-900 sm:text-3xl" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>{title}</h2>{lead && <p className="mt-3 text-[15px] leading-relaxed text-stone-600">{lead}</p>}</header>;

export const Panel: React.FC<{ children: React.ReactNode; className?: string; as?: 'div' | 'article' | 'section' | 'li' }> = ({ children, className = '', as = 'div' }) => { const Tag = as as React.ElementType; return <Tag className={`rounded-sm border border-stone-200 bg-white/85 shadow-[0_1px_2px_rgba(60,50,40,0.04)] ${className}`}>{children}</Tag>; };

export const Disclosure: React.FC<{ summary: string; children: React.ReactNode; defaultOpen?: boolean; hint?: string }> = ({ summary, children, defaultOpen = false, hint }) => { const [open, setOpen] = useState(defaultOpen); const id = useId(); return <div className="border-b border-stone-200 last:border-b-0"><h3 className="m-0"><button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id} className="flex w-full items-start justify-between gap-4 px-1 py-4 text-left transition-colors hover:bg-stone-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3FA0] focus-visible:ring-offset-2"><span className="text-[15px] font-medium text-stone-800">{summary}</span><span className="flex items-center gap-2 text-stone-500">{hint && <span className="hidden text-xs italic sm:inline">{hint}</span>}<svg aria-hidden viewBox="0 0 16 16" className={`h-4 w-4 flex-none transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6l5 5 5-5" strokeLinecap="round" /></svg></span></button></h3><div id={id} hidden={!open} className="px-1 pb-5 text-[15px] leading-relaxed text-stone-700">{children}</div></div>; };

export const PendingNote: React.FC<{ label: string; detail?: string }> = ({ label, detail }) => <p className="flex items-start gap-2 rounded-sm border border-dashed border-stone-300 bg-stone-50/70 px-3 py-2 text-sm text-stone-600"><svg aria-hidden viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 flex-none text-stone-400" fill="currentColor"><circle cx="8" cy="8" r="7" opacity="0.25" /><rect x="7.2" y="4" width="1.6" height="5" rx="0.8" /><rect x="7.2" y="10.4" width="1.6" height="1.6" rx="0.8" /></svg><span><span className="font-medium text-stone-700">{label}</span>{detail && <span className="block text-stone-500">{detail}</span>}</span></p>;

export const AssetKindLabel: React.FC<{ kind: string }> = ({ kind }) => { const map: Record<string, string> = { ai_assisted_illustration: 'AI-assisted illustration', photograph: 'Photograph', annotated_photograph: 'Annotated photograph', scientific_diagram: 'Scientific diagram', conceptual_visualization: 'Conceptual visualization' }; return <span className="inline-flex items-center gap-1.5 rounded-sm bg-stone-900/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">{map[kind] ?? kind}</span>; };
