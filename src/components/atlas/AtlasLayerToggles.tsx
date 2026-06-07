import React from 'react';
import {
  Globe2,
  Layers,
  Bug,
  Network as NetworkIcon,
  CloudRain,
  Clock,
} from 'lucide-react';
import type { AtlasLayerKind } from '@/lib/atlas';

export interface LayerToggleDef {
  kind: AtlasLayerKind;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
}

export const LAYER_TOGGLES: LayerToggleDef[] = [
  {
    kind: 'occurrence',
    label: 'Occurrences',
    icon: Globe2,
    hint: 'harvester2 /atlas/occurrences',
  },
  {
    kind: 'genus',
    label: 'Genus map',
    icon: Layers,
    hint: '/api/atlas/genus/{genus}/map',
  },
  {
    kind: 'pollination',
    label: 'Pollination',
    icon: Bug,
    hint: '/api/atlas/overlays/pollination',
  },
  {
    kind: 'mycorrhizal',
    label: 'Mycorrhizal',
    icon: NetworkIcon,
    hint: '/api/atlas/overlays/mycorrhizal',
  },
  {
    kind: 'climate',
    label: 'Climate',
    icon: CloudRain,
    hint: '/api/atlas/overlays/climate',
  },
  {
    kind: 'temporal',
    label: 'Temporal',
    icon: Clock,
    hint: '/api/atlas/temporal',
  },
];

interface Props {
  active: Set<AtlasLayerKind>;
  onToggle: (kind: AtlasLayerKind) => void;
}

const AtlasLayerToggles: React.FC<Props> = ({ active, onToggle }) => {
  return (
    <div className="flex flex-wrap gap-2">
      {LAYER_TOGGLES.map(t => {
        const Icon = t.icon;
        const on = active.has(t.kind);
        return (
          <button
            key={t.kind}
            type="button"
            onClick={() => onToggle(t.kind)}
            title={t.hint}
            className={[
              'inline-flex items-center gap-2 px-3.5 py-2 rounded-full border text-xs tracking-[0.15em] uppercase transition-colors',
              on
                ? 'bg-emerald-300/15 border-emerald-300/60 text-emerald-100'
                : 'bg-transparent border-white/15 text-white/60 hover:text-white hover:border-white/35',
            ].join(' ')}
            aria-pressed={on}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
};

export default AtlasLayerToggles;
