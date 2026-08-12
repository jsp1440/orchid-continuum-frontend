import React from 'react';
import type { LexiconEntry } from '@/data/types';
import { ResupinationSequence } from './Schematics';
import { AssetKindLabel, CertaintyChip, PendingNote, ReviewStateChip } from './ui';

export type Depth = 'basic' | 'deeper' | 'scientific';

export const DEPTHS: { key: Depth; label: string; hint: string }[] = [
  { key: 'basic', label: 'Quick', hint: 'Definition, pronunciation, illustration and related terms' },
  { key: 'deeper', label: 'Learn', hint: 'Anatomy, development, function, evolution and identification' },
  { key: 'scientific', label: 'Scientific', hint: 'Literature, evidence states, provenance, validation, Calyx and research questions' },
];

const SummaryPoints: React.FC<{ entry: LexiconEntry; onJump: (id: string) => void }> = ({ entry, onJump }) => {
  const items = [
    {
      id: 'definition',
      title: 'What it is',
      body: entry.subcategory
        ? `A ${entry.subcategory.toLowerCase()} concept in the orchid lexicon.`
        : 'A defined botanical concept with a concise definition.',
    },
    {
      id: 'how',
      title: 'How it is expressed',
      body: entry.mechanism_blocks?.length
        ? `${entry.mechanism_blocks.length} linked explanatory perspectives are available.`
        : 'Mechanism and expression await canonical enrichment.',
    },
    {
      id: 'why',
      title: 'Why it matters',
      body: entry.significance_blocks?.length
        ? 'Functional or biological significance is available in the record.'
        : 'Functional significance awaits canonical enrichment.',
    },
    {
      id: 'identification',
      title: 'Identification',
      body: entry.identification_significance
        ? 'A recordable character that should be interpreted with supporting evidence.'
        : 'Identification guidance has not yet been linked canonically.',
    },
  ];

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onJump(item.id)}
            className="h-full w-full rounded-sm border border-[#E4DCCB] bg-white/80 p-4 text-left transition-colors hover:border-[#6B3FA0]/40 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3FA0]"
          >
            <span className="block font-serif text-[15px] text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              {item.title}
            </span>
            <span className="mt-1 block text-[13px] leading-relaxed text-stone-600">{item.body}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};

export const DepthSelector: React.FC<{ depth: Depth; onChange: (depth: Depth) => void }> = ({ depth, onChange }) => (
  <div className="rounded-sm border border-[#E4DCCB] bg-[#FDFBF6]/80 p-3">
    <p id="lexicon-depth-label" className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4A7C59]">
      Choose your depth
    </p>
    <div role="group" aria-labelledby="lexicon-depth-label" className="mt-2 flex flex-wrap gap-2">
      {DEPTHS.map((option) => {
        const active = depth === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            aria-pressed={active}
            className={`rounded-sm border px-3 py-1.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3FA0] ${
              active
                ? 'border-[#6B3FA0] bg-[#6B3FA0] text-white'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
    <p className="mt-2 text-[12px] leading-relaxed text-stone-600">
      {DEPTHS.find((option) => option.key === depth)?.hint}. This changes the presentation emphasis, not the underlying record.
    </p>
  </div>
);

export const EntryHero: React.FC<{
  entry: LexiconEntry;
  depth: Depth;
  onDepth: (depth: Depth) => void;
  onBrowse: () => void;
  onJump: (id: string) => void;
}> = ({ entry, depth, onDepth, onBrowse, onJump }) => {
  const resupinationAsset = entry.assets?.find((asset) => asset.schematic === 'resupination-sequence');
  const primaryAsset = resupinationAsset ?? entry.assets?.find((asset) => Boolean(asset.url)) ?? entry.assets?.[0];

  return (
    <header className="relative overflow-hidden border-b border-[#E4DCCB] bg-[#F7F2E7]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 10% 12%, rgba(107,63,160,.13), transparent 46%), radial-gradient(circle at 92% 6%, rgba(74,124,89,.14), transparent 48%), radial-gradient(circle at 60% 110%, rgba(184,140,63,.11), transparent 55%)',
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="text-xs text-stone-500">
          <button
            type="button"
            onClick={onBrowse}
            className="underline decoration-stone-300 underline-offset-2 hover:text-[#6B3FA0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3FA0]"
          >
            A–Z Lexicon
          </button>
          <span aria-hidden className="mx-2">/</span>
          <span>{entry.category ?? 'Uncategorised'}</span>
        </nav>

        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr),minmax(0,1.05fr)] lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-sm bg-[#4A7C59]/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#2F5A3D]">
                {entry.category ?? 'Category awaiting assignment'}
              </span>
              {entry.subcategory ? <span className="text-[11px] uppercase tracking-wide text-stone-500">{entry.subcategory}</span> : null}
            </div>

            <h1 className="mt-3 font-serif text-4xl leading-[1.08] text-stone-900 sm:text-5xl" style={{ fontFamily: 'Georgia, serif' }}>
              {entry.preferred_term}
            </h1>
            {entry.pronunciation ? (
              <p className="mt-2 font-serif text-lg italic text-stone-600" style={{ fontFamily: 'Georgia, serif' }}>
                /{entry.pronunciation}/
              </p>
            ) : null}

            {entry.quick_definition ? (
              <p className="mt-5 border-l-2 border-[#6B3FA0] pl-5 font-serif text-xl leading-relaxed text-stone-800 sm:text-[22px]" style={{ fontFamily: 'Georgia, serif' }}>
                {entry.quick_definition}
              </p>
            ) : (
              <div className="mt-5"><PendingNote label="Definition awaiting canonical enrichment" /></div>
            )}

            {entry.synonyms?.length ? (
              <p className="mt-4 text-sm leading-relaxed text-stone-600">
                <strong className="text-stone-800">Also:</strong> {entry.synonyms.join(', ')}
              </p>
            ) : null}

            <div className="mt-6"><SummaryPoints entry={entry} onJump={onJump} /></div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <ReviewStateChip state={entry.review_state} />
              {entry.certainty_summary ? <CertaintyChip level={entry.certainty_summary} /> : null}
            </div>

            <div className="mt-5"><DepthSelector depth={depth} onChange={onDepth} /></div>
          </div>

          <figure className="rounded-sm border border-[#E4DCCB] bg-white/85 p-4 sm:p-5">
            <figcaption className="mb-3 flex flex-wrap items-center gap-2">
              {primaryAsset ? <AssetKindLabel kind={primaryAsset.kind} /> : null}
              <span className="text-xs text-stone-600">{primaryAsset?.title ?? 'Illustration in development'}</span>
            </figcaption>
            {resupinationAsset ? (
              <ResupinationSequence />
            ) : primaryAsset?.url ? (
              <img src={primaryAsset.url} alt={primaryAsset.alt_text ?? primaryAsset.title ?? entry.preferred_term} className="mx-auto max-h-[520px] w-auto max-w-full object-contain" />
            ) : (
              <PendingNote label="Illustration in development" detail="A labelled teaching figure for this concept has not yet been migrated or produced." />
            )}
            <p className="mt-4 border-t border-[#EDE6D8] pt-3 text-[12px] leading-relaxed text-stone-500">
              Visuals are teaching or source assets with explicit provenance; they are not treated as specimen evidence unless the record says so.
            </p>
          </figure>
        </div>
      </div>
    </header>
  );
};
