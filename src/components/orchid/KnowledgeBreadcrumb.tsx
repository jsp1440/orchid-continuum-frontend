import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Home, Network } from 'lucide-react';
import {
  nodeToRoute,
  type ExplorationContextState,
  type ExplorationNode,
} from '@/lib/explorationContext';

interface KnowledgeBreadcrumbProps {
  breadcrumb: ExplorationNode[];
  context?: Partial<ExplorationContextState>;
  className?: string;
  homeLabel?: string;
}

const KnowledgeBreadcrumb: React.FC<KnowledgeBreadcrumbProps> = ({
  breadcrumb,
  context,
  className = '',
  homeLabel = 'Continuum',
}) => {
  const navigate = useNavigate();
  const crumbs = (breadcrumb || []).filter((node) => node?.label);

  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Knowledge graph path"
      className={`rounded-2xl border border-[#d9caa8] bg-[#fffaf0]/80 px-4 py-3 ${className}`}
    >
      <ol className="flex flex-wrap items-center gap-2 text-[#5d684c]">
        <li>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#7b6425] hover:bg-[#f8ecc8] focus:outline-none focus:ring-2 focus:ring-[#c9a84c]/60"
          >
            <Home className="h-3.5 w-3.5" />
            {homeLabel}
          </button>
        </li>

        {crumbs.map((node) => {
          const route = nodeToRoute(node, context || {});
          return (
            <React.Fragment key={node.id}>
              <li aria-hidden="true" className="text-[#b49a54]">
                <ChevronRight className="h-3.5 w-3.5" />
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate(route)}
                  className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-full border border-[#c7b27a]/50 bg-[#fff8e6] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#5b4b21] transition hover:border-[#8a6f2d] hover:bg-[#f8ecc8] focus:outline-none focus:ring-2 focus:ring-[#c9a84c]/60"
                  title={node.sourceView ? `${node.label} · ${node.sourceView}` : node.label}
                >
                  <Network className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{node.label}</span>
                </button>
              </li>
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
};

export default KnowledgeBreadcrumb;
