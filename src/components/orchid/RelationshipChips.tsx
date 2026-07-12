import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bug, Camera, Globe2, Leaf, Microscope, Mountain, Network, Shield, Sprout } from 'lucide-react';
import {
  nodeToRoute,
  type ExplorationContextState,
  type ExplorationNode,
  type ExplorationNodeType,
} from '@/lib/explorationContext';

const ICONS: Partial<Record<ExplorationNodeType, React.ReactNode>> = {
  species: <Leaf className="h-3.5 w-3.5" />,
  genus: <Leaf className="h-3.5 w-3.5" />,
  habitat: <Mountain className="h-3.5 w-3.5" />,
  geography: <Globe2 className="h-3.5 w-3.5" />,
  pollinator: <Bug className="h-3.5 w-3.5" />,
  fungus: <Microscope className="h-3.5 w-3.5" />,
  conservation: <Shield className="h-3.5 w-3.5" />,
  elevation: <Sprout className="h-3.5 w-3.5" />,
  atlas: <Globe2 className="h-3.5 w-3.5" />,
  image: <Camera className="h-3.5 w-3.5" />,
  literature: <Network className="h-3.5 w-3.5" />,
  knowledge: <Network className="h-3.5 w-3.5" />,
};

interface RelationshipChipsProps {
  nodes: ExplorationNode[];
  context?: Partial<ExplorationContextState>;
  max?: number;
  className?: string;
  label?: string;
}

const RelationshipChips: React.FC<RelationshipChipsProps> = ({
  nodes,
  context,
  max = 12,
  className = '',
  label = 'Connected relationships',
}) => {
  const navigate = useNavigate();
  const visible = (nodes || []).filter((node) => node?.label).slice(0, max);

  if (visible.length === 0) return null;

  return (
    <div className={className} aria-label={label}>
      <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.22em] text-[#8a8062]">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {visible.map((node) => {
          const route = nodeToRoute(node, context || {});
          const icon = ICONS[node.type] || <Network className="h-3.5 w-3.5" />;
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => navigate(route)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#c7b27a]/70 bg-[#fff8e6] px-3 py-1.5 text-left font-mono text-[9px] uppercase tracking-[0.14em] text-[#5b4b21] transition hover:border-[#8a6f2d] hover:bg-[#f8ecc8] focus:outline-none focus:ring-2 focus:ring-[#c9a84c]/60"
              title={node.sourceView ? `${node.label} · ${node.sourceView}` : node.label}
            >
              {icon}
              <span className="max-w-[12rem] truncate">{node.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RelationshipChips;
