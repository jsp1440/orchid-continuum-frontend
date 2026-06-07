import React from 'react';
import { Radio, HardDrive, Server, Leaf, ImageOff, type LucideIcon } from 'lucide-react';
import type { ImageSource } from '@/lib/genusData';

/**
 * ImageSourceIndicator — a small, non-intrusive badge that tells users and
 * admins exactly where the genus photos on screen came from, so image-source
 * health is visible at a glance:
 *
 *   • live        — fetched directly from the live harvester this request.
 *   • cache       — served instantly from this browser's local day cache.
 *   • proxy       — served from the shared server-side cache / proxy.
 *   • inaturalist — FALLBACK: a Plantae-only photo pulled straight from
 *                   iNaturalist because the trusted OC library had nothing.
 *                   Rendered as a DISTINCT amber "review" badge so curators can
 *                   instantly tell this photo did NOT come from the vetted OC
 *                   library and may need manual review / replacement.
 *   • pending     — no source returned anything; the "Image pending" placeholder.
 *
 * Renders nothing while the source is still resolving (null), so it never
 * flashes during the initial load.
 */

interface SourceMeta {
  label: string;
  detail: string;
  icon: LucideIcon;
  /** Tailwind/inline color tokens for the dot + text. */
  dot: string;
  text: string;
  /** When true, the badge gets a stronger "needs review" treatment. */
  review?: boolean;
}

const META: Record<ImageSource, SourceMeta> = {
  live: {
    label: 'Live harvester',
    detail: 'Photos fetched directly from the live image harvester just now.',
    icon: Radio,
    dot: '#16a34a',
    text: '#3f6b2b',
  },
  cache: {
    label: 'Browser cache',
    detail: 'Photos served instantly from this browser’s local day cache.',
    icon: HardDrive,
    dot: '#0ea5e9',
    text: '#2c6f8a',
  },
  proxy: {
    label: 'Server cache',
    detail: 'Photos served from the shared server-side cache / proxy.',
    icon: Server,
    dot: '#8b5cf6',
    text: '#6d4fb0',
  },
  inaturalist: {
    label: 'iNaturalist fallback',
    detail:
      'FALLBACK SOURCE — this photo came directly from iNaturalist because the trusted Orchid Continuum library had no image. It is NOT from the vetted OC library and may need curator review.',
    icon: Leaf,
    dot: '#d97706',
    text: '#b45309',
    review: true,
  },
  pending: {
    label: 'Image pending',
    detail: 'No image source is currently reachable — showing placeholders.',
    icon: ImageOff,
    dot: '#a8a29e',
    text: '#8a8062',
  },
};


const ImageSourceIndicator: React.FC<{
  source: ImageSource | null;
  className?: string;
}> = ({ source, className = '' }) => {
  if (!source) return null;
  const m = META[source];
  const Icon = m.icon;
  return (
    <span

      title={m.detail}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] tracking-[0.16em] uppercase backdrop-blur-sm ${
        m.review
          ? 'border-amber-400/60 bg-amber-50/90 font-semibold ring-1 ring-amber-300/50'
          : 'border-current/20 bg-white/70'
      } ${className}`}
      style={{ color: m.text }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: m.dot,
          boxShadow:
            source === 'live' || m.review ? `0 0 0 3px ${m.dot}33` : undefined,
        }}
      />
      <Icon className="h-3 w-3" strokeWidth={1.75} />
      {m.label}
    </span>

  );
};

export default ImageSourceIndicator;
