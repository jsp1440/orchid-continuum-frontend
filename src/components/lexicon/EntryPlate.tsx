import React from 'react';
import { LexiconEntry } from '@/data/types';
import { FlowerSchematic } from './Schematics';
import { CertaintyChip, MaturityBadges } from './ui';

export type EntryTier = 'basic' | 'enriched' | 'illustrated' | 'featured';
export const TIER_LABEL: Record<EntryTier, string> = { basic: 'Basic record', enriched: 'Scientifically enriched', illustrated: 'Illustrated concept', featured: 'Fully developed concept' };

export function entryTier(entry: LexiconEntry): EntryTier {
  const m = entry.maturity ?? [];
  const illustrated = m.includes('illustrated') || !!entry.assets?.length;
  const enriched = m.includes('scientifically_enriched') || !!entry.mechanism_blocks?.length;
  const developed = illustrated && enriched && (m.includes('identification_linked') || !!entry.character_states?.length);
  if (developed) return 'featured'; if (illustrated) return 'illustrated'; if (enriched) return 'enriched'; return 'basic';
}

export function developedLayers(entry: LexiconEntry): number {
  return [!!entry.quick_definition,!!entry.expanded_definition,!!entry.mechanism_blocks?.length,!!entry.significance_blocks?.length,!!entry.etymology?.segments?.length,!!entry.assets?.length,!!entry.character_states?.length,!!entry.example_taxa?.length,!!entry.identification_significance,!!entry.relationships?.length].filter(Boolean).length;
}

const TierRibbon: React.FC<{ tier: EntryTier }> = ({ tier }) => <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${tier === 'featured' ? 'bg-[#6B3FA0]/12 text-[#4A2A70]' : tier === 'illustrated' ? 'bg-[#4A7C59]/12 text-[#2F5A3D]' : 'border border-stone-300 text-stone-500'}`}><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tier === 'featured' ? 'bg-[#6B3FA0]' : tier === 'illustrated' ? 'bg-[#4A7C59]' : 'bg-stone-400'}`} />{TIER_LABEL[tier]}</span>;

const TileVisual: React.FC<{ entry: LexiconEntry; tier: EntryTier; tall?: boolean }> = ({ entry, tier, tall }) => {
  const hasFigure = tier === 'featured' || tier === 'illustrated'; const flip = entry.slug === 'non-resupination';
  return <div className={`relative flex items-center justify-center overflow-hidden ${tall ? 'h-56 sm:h-64' : 'h-36'}`} style={{ background: 'radial-gradient(circle at 30% 20%, rgba(107,63,160,.16), transparent 60%), radial-gradient(circle at 80% 90%, rgba(74,124,89,.18), transparent 62%), #f7f2e8' }}><span aria-hidden className="absolute inset-0 opacity-60" />{hasFigure ? <FlowerSchematic flip={flip} className={`relative ${tall ? 'h-48' : 'h-28'} w-auto`} /> : <span aria-hidden className="relative font-serif text-6xl text-[#6B3FA0]/35" style={{ fontFamily: 'Georgia, serif' }}>{entry.preferred_term[0]}</span>}{hasFigure && <span className="absolute bottom-2 left-2 rounded-sm bg-stone-900/85 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white">Conceptual schematic</span>}</div>;
};

export const EntryPlate: React.FC<{ entry: LexiconEntry; onOpen: (slug: string) => void; scale?: 'auto' | 'compact' }> = ({ entry, onOpen, scale = 'auto' }) => {
  const tier = entryTier(entry); const large = scale === 'auto' && (tier === 'featured' || tier === 'illustrated');
  return <article className={`specimen-tile group flex h-full flex-col rounded-sm border border-stone-200 bg-white ${large ? 'sm:col-span-2' : ''}`}>{large && <TileVisual entry={entry} tier={tier} tall />}<div className={`flex flex-1 flex-col ${large ? 'p-6' : 'p-5'}`}><div className="flex flex-wrap items-center gap-2"><TierRibbon tier={tier} /><span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4A7C59]">{entry.category ?? 'Category not assigned'}</span></div><h3 className={`mt-3 font-serif leading-tight text-stone-900 ${large ? 'text-[1.9rem]' : 'text-xl'}`} style={{ fontFamily: 'Georgia, serif' }}><button type="button" onClick={() => onOpen(entry.slug)} className="text-left underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3FA0] focus-visible:ring-offset-2">{entry.preferred_term}</button></h3>{entry.pronunciation && <p className="mt-1 font-serif text-sm italic text-stone-500" style={{ fontFamily: 'Georgia, serif' }}>/{entry.pronunciation}/</p>}<p className={`mt-3 flex-1 leading-relaxed text-stone-700 ${large ? 'text-[16px]' : 'text-sm'}`}>{entry.quick_definition ?? <span className="italic text-stone-500">Definition awaiting scientific enrichment.</span>}</p>{large && entry.synonyms?.length ? <p className="mt-3 text-[13px] text-stone-500"><span className="font-medium text-stone-600">Also: </span>{entry.synonyms.join(', ')}</p> : null}<div className="mt-4 space-y-2 border-t border-stone-100 pt-3">{large ? <MaturityBadges flags={entry.maturity ?? []} max={4} /> : <p className="text-[11px] text-stone-500">{developedLayers(entry)} of 10 record layers present</p>}{entry.certainty_summary && <CertaintyChip level={entry.certainty_summary} />}</div><button type="button" onClick={() => onOpen(entry.slug)} className="mt-4 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-[#6B3FA0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3FA0] focus-visible:ring-offset-2">{tier === 'basic' ? 'Open basic record' : 'Open the entry'}<svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button></div></article>;
};

export const PlateGallery: React.FC<{ entries: LexiconEntry[]; onOpen: (slug: string) => void; scale?: 'auto' | 'compact' }> = ({ entries, onOpen, scale = 'auto' }) => <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{entries.map((e) => <EntryPlate key={e.slug} entry={e} onOpen={onOpen} scale={scale} />)}</div>;
