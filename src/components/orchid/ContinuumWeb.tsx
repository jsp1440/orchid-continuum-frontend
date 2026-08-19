import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Bug,
  CloudSun,
  Flower2,
  Globe2,
  Home,
  ShieldCheck,
  Sprout,
} from 'lucide-react';
import { useDailyGenus } from '@/lib/dailyGenusContext';
import type { WebNodeData } from '@/lib/ocBackend';

type RelationshipKey =
  | 'pollinators'
  | 'fungi'
  | 'climate'
  | 'geography'
  | 'conservation'
  | 'cultivation'
  | 'knowledge';

type RelationshipNode = {
  key: RelationshipKey;
  label: string;
  question: string;
  icon: React.ComponentType<{ className?: string }>;
};

const RELATIONSHIPS: RelationshipNode[] = [
  { key: 'pollinators', label: 'Pollinators', question: 'Which pollination links are documented?', icon: Bug },
  { key: 'fungi', label: 'Fungi', question: 'Which fungal partnerships are linked?', icon: Sprout },
  { key: 'geography', label: 'Geography', question: 'Where does the Continuum have records?', icon: Globe2 },
  { key: 'climate', label: 'Climate', question: 'Which climate or elevation evidence is linked?', icon: CloudSun },
  { key: 'conservation', label: 'Conservation', question: 'Which conservation records are linked?', icon: ShieldCheck },
  { key: 'knowledge', label: 'Knowledge', question: 'Which literature or evidence records connect?', icon: BookOpen },
  { key: 'cultivation', label: 'Cultivation', question: 'Which cultivation records are linked?', icon: Home },
];

function RelationshipEvidence({ node }: { node: WebNodeData | null | undefined }) {
  if (!node?.hasData) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-white/15 bg-black/15 p-3">
        <p className="text-sm text-[#d6cfbf]">Not linked in the current Continuum view.</p>
        <p className="mt-1 text-xs leading-5 text-[#958f82]">This is a knowledge gap, not evidence of biological absence.</p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-sm font-medium text-[#f3e7bd]">{node.summary}</p>
      {node.items.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm leading-6 text-[#d6cfbf]">
          {node.items.slice(0, 4).map((item) => <li key={item}>• {item}</li>)}
        </ul>
      )}
      <p className="mt-2 text-xs leading-5 text-[#958f82]">Displayed because the canonical Continuum relationship contract returned evidence.</p>
    </div>
  );
}

const ContinuumWeb: React.FC = () => {
  const navigate = useNavigate();
  const { genus, continuum, continuumStatus } = useDailyGenus();
  const [active, setActive] = useState<RelationshipKey>('pollinators');
  const graph = continuum?.relationships ?? null;

  const activeDefinition = useMemo(
    () => RELATIONSHIPS.find((item) => item.key === active) ?? RELATIONSHIPS[0],
    [active],
  );
  const activeEvidence = graph?.[active] ?? null;

  return (
    <section id="continuum-web" className="relative overflow-hidden border-b border-white/[0.06] bg-[#16271a] text-[#f5f0e8]">
      <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10 lg:py-20">
        <div className="max-w-4xl">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#c9a24a]">Continuum relationship web</div>
          <h2 className="mt-4 font-serif text-4xl leading-tight text-[#faf7f2] md:text-5xl">
            Follow <span className="italic text-[#d4b34a]">{genus}</span> outward through documented connections.
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#d7d0c2]">
            This view no longer performs its own scientific fetch or substitutes generic relationship claims. It consumes the same canonical featured-taxon state as the hero, Genus of the Day, and Calyx context.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-white/10 bg-black/15 p-5">
            <button
              type="button"
              onClick={() => navigate(`/genus/${encodeURIComponent(genus)}`)}
              className="flex w-full items-center gap-4 rounded-xl border border-[#d4b34a]/35 bg-[#d4b34a]/10 p-4 text-left hover:bg-[#d4b34a]/15"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#d4b34a]/45 text-[#d4b34a]">
                <Flower2 className="h-6 w-6" />
              </div>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#c9a24a]">Featured taxon</p>
                <p className="mt-1 font-serif text-2xl italic text-[#fff8e7]">{genus}</p>
              </div>
            </button>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {RELATIONSHIPS.map((item) => {
                const Icon = item.icon;
                const node = graph?.[item.key];
                const hasData = Boolean(node?.hasData);
                const isActive = item.key === active;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActive(item.key)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      isActive
                        ? 'border-[#d4b34a]/70 bg-[#d4b34a]/12'
                        : 'border-white/10 bg-black/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-[#d4b34a]" />
                      <span className="font-mono text-[9px] uppercase tracking-[0.17em] text-[#e8dfce]">{item.label}</span>
                    </div>
                    <p className="mt-2 text-xs text-[#a8a193]">{hasData ? node?.summary : 'Knowledge gap'}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <article className="rounded-2xl border border-[#d4b34a]/20 bg-[#0d1d12] p-6">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#c9a24a]">Selected relationship</p>
            <h3 className="mt-3 font-serif text-3xl leading-tight text-[#fff8e7]">{activeDefinition.question}</h3>

            {continuumStatus === 'loading' && (
              <p className="mt-4 text-sm leading-6 text-[#d6cfbf]">Loading canonical Continuum evidence…</p>
            )}
            {continuumStatus === 'unavailable' && (
              <div className="mt-4 rounded-lg border border-dashed border-white/15 bg-black/15 p-4">
                <p className="text-sm text-[#d6cfbf]">Continuum evidence is unavailable.</p>
                <p className="mt-1 text-xs leading-5 text-[#958f82]">No scientific fallback has been substituted.</p>
              </div>
            )}
            {continuumStatus === 'ready' && <RelationshipEvidence node={activeEvidence} />}

            {continuum?.gaps.length ? (
              <div className="mt-6 border-t border-white/10 pt-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#c9a24a]">Visible knowledge gaps</p>
                <p className="mt-2 text-sm leading-6 text-[#b9b1a3]">{continuum.gaps.join(', ')}</p>
              </div>
            ) : null}
          </article>
        </div>
      </div>
    </section>
  );
};

export default ContinuumWeb;
