/**
 * SourceBadges
 * ------------
 * Reusable scientific-credibility primitives — used on every species
 * card, atlas point card, gallery image, and habitat journey to make
 * the project's data provenance visible at all times.
 *
 * No fabricated badges: every prop maps to a real database field.
 */

import React from 'react';
import {
  CheckCircle2,
  ShieldAlert,
  Database,
  ExternalLink,
  CircleHelp,
  BookOpen,
  Globe2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Verification + completeness chips
// ---------------------------------------------------------------------------

export const VerifiedBadge: React.FC<{ verified: boolean }> = ({ verified }) => {
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-400/40 bg-emerald-400/[0.08] font-mono text-[9px] tracking-[0.20em] uppercase text-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-400/40 bg-amber-400/[0.06] font-mono text-[9px] tracking-[0.20em] uppercase text-amber-200/85">
      <CircleHelp className="h-3 w-3" /> Inferred
    </span>
  );
};

export const ConfidenceBadge: React.FC<{ level: 'verified' | 'inferred' | 'awaiting' }> = ({ level }) => {
  if (level === 'verified') return <VerifiedBadge verified />;
  if (level === 'inferred') return <VerifiedBadge verified={false} />;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/15 bg-white/[0.02] font-mono text-[9px] tracking-[0.20em] uppercase text-[#7a7466]">
      Awaiting linkage
    </span>
  );
};

// ---------------------------------------------------------------------------
// Source citation — links out to GBIF, POWO, iNat, herbarium, etc.
// ---------------------------------------------------------------------------

export const SourceCitation: React.FC<{
  dataset?: string;
  sourceRecordId?: string;
  occurrenceId?: string;
}> = ({ dataset, sourceRecordId, occurrenceId }) => {
  if (!dataset) return null;
  let href: string | undefined;
  let label = dataset;

  const ds = dataset.toLowerCase();
  if (ds.includes('gbif')) {
    if (sourceRecordId) href = `https://www.gbif.org/occurrence/${sourceRecordId}`;
    label = `GBIF · ${sourceRecordId ?? 'record'}`;
  } else if (ds.includes('inat')) {
    if (sourceRecordId) href = `https://www.inaturalist.org/observations/${sourceRecordId}`;
    label = `iNaturalist · ${sourceRecordId ?? 'observation'}`;
  } else if (ds.includes('powo')) {
    href = 'https://powo.science.kew.org';
    label = `POWO · ${sourceRecordId ?? 'taxon'}`;
  } else if (ds.includes('herbarium')) {
    label = `Herbarium · ${sourceRecordId ?? 'specimen'}`;
  } else if (ds.includes('continuum')) {
    label = `Orchid Continuum · ${occurrenceId ?? sourceRecordId ?? 'record'}`;
  }

  const inner = (
    <span className="inline-flex items-center gap-1.5">
      <Database className="h-3 w-3" />
      <span className="truncate">{label}</span>
      {href && <ExternalLink className="h-2.5 w-2.5 opacity-70" />}
    </span>
  );

  const classes =
    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#c9a24a]/30 bg-[#c9a24a]/[0.06] font-mono text-[9px] tracking-[0.20em] uppercase text-[#c9a24a]/90 max-w-full hover:bg-[#c9a24a]/15 transition-colors';

  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
      {inner}
    </a>
  ) : (
    <span className={classes}>{inner}</span>
  );
};

// ---------------------------------------------------------------------------
// Conservation chip
// ---------------------------------------------------------------------------

const IUCN_COLORS: Record<string, string> = {
  EX: 'border-red-500/60 text-red-300 bg-red-500/10',
  EW: 'border-red-400/60 text-red-200 bg-red-500/10',
  CR: 'border-orange-500/60 text-orange-200 bg-orange-500/10',
  EN: 'border-amber-500/60 text-amber-200 bg-amber-500/10',
  VU: 'border-yellow-400/50 text-yellow-200 bg-yellow-500/10',
  NT: 'border-emerald-400/40 text-emerald-200 bg-emerald-500/[0.05]',
  LC: 'border-emerald-400/40 text-emerald-200 bg-emerald-500/[0.05]',
  DD: 'border-white/20 text-white/70 bg-white/[0.04]',
  NE: 'border-white/15 text-white/55 bg-white/[0.02]',
};

export const ConservationChip: React.FC<{ status?: string; iucnCode?: string }> = ({ status, iucnCode }) => {
  if (!status && !iucnCode) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/15 bg-white/[0.02] font-mono text-[9px] tracking-[0.20em] uppercase text-[#7a7466]">
        IUCN · Awaiting Orchid Continuum Record
      </span>
    );
  }
  const klass = (iucnCode && IUCN_COLORS[iucnCode]) ?? 'border-[#c9a24a]/40 text-[#c9a24a]/90 bg-[#c9a24a]/[0.06]';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-mono text-[9px] tracking-[0.20em] uppercase ${klass}`}>
      <ShieldAlert className="h-3 w-3" />
      {iucnCode ?? status}
      {status && iucnCode && status !== iucnCode ? ` · ${status}` : ''}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Data provenance row — used in side cards
// ---------------------------------------------------------------------------

export const ProvenanceRow: React.FC<{
  dataset?: string;
  sourceRecordId?: string;
  verified?: boolean;
  uncertaintyM?: number;
  retrievedAt?: string;
}> = ({ dataset, sourceRecordId, verified, uncertaintyM, retrievedAt }) => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
    <div className="flex items-center gap-2 mb-3">
      <BookOpen className="h-3.5 w-3.5 text-[#c9a24a]" />
      <div className="font-mono text-[9px] tracking-[0.26em] uppercase text-[#c9a24a]">Provenance</div>
    </div>
    <div className="space-y-2 font-mono text-[10px] tracking-[0.12em] uppercase text-[#cfc8b8]/75">
      <SourceCitation dataset={dataset} sourceRecordId={sourceRecordId} />
      <div className="flex items-center gap-2">
        <ConfidenceBadge level={verified ? 'verified' : dataset ? 'inferred' : 'awaiting'} />
        {typeof uncertaintyM === 'number' && (
          <span className="text-[#7a7466]">± {uncertaintyM} m</span>
        )}
      </div>
      {retrievedAt && (
        <div className="text-[#7a7466]">Retrieved · {retrievedAt}</div>
      )}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Linked-data ring — at-a-glance which ecological layers are populated
// ---------------------------------------------------------------------------

export const LinkedDataDots: React.FC<{
  occurrence: boolean;
  image: boolean;
  pollinator: boolean;
  mycorrhizal: boolean;
  habitat: boolean;
  conservation: boolean;
}> = (p) => {
  const dot = (filled: boolean, label: string) => (
    <span
      key={label}
      title={`${label}: ${filled ? 'linked' : 'not yet linked'}`}
      className={[
        'w-1.5 h-1.5 rounded-full inline-block',
        filled ? 'bg-[#c9a24a]' : 'bg-white/15',
      ].join(' ')}
    />
  );
  return (
    <div className="inline-flex items-center gap-1.5">
      {dot(p.occurrence, 'occurrence')}
      {dot(p.image, 'image')}
      {dot(p.pollinator, 'pollinator')}
      {dot(p.mycorrhizal, 'mycorrhizal')}
      {dot(p.habitat, 'habitat')}
      {dot(p.conservation, 'conservation')}
    </div>
  );
};

// ---------------------------------------------------------------------------
// "Awaiting" placeholder — used wherever a field is null
// ---------------------------------------------------------------------------

export const Awaiting: React.FC<{ what?: string }> = ({ what }) => (
  <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#7a7466]">
    {what ? `${what} not yet linked` : 'Awaiting Orchid Continuum Record'}
  </span>
);

// ---------------------------------------------------------------------------
// World-coordinates badge
// ---------------------------------------------------------------------------

export const CoordinatesBadge: React.FC<{ lat?: number; lng?: number }> = ({ lat, lng }) => {
  if (typeof lat !== 'number' || typeof lng !== 'number') return <Awaiting what="Coordinates" />;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/15 bg-white/[0.02] font-mono text-[10px] tracking-[0.10em] text-[#cfc8b8]/85">
      <Globe2 className="h-3 w-3 text-[#c9a24a]" />
      {lat.toFixed(3)}, {lng.toFixed(3)}
    </span>
  );
};
