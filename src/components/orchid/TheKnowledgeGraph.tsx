import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bug, Globe2, Leaf, Network, ShieldCheck, Sprout } from 'lucide-react';
import { useHomepageRelationships, type HomepageRelationship } from '@/lib/homepageRelationshipContext';

const ICONS: Record<HomepageRelationship['id'], React.ReactNode> = {
  habitat: <Leaf className="h-5 w-5" />,
  pollinator: <Bug className="h-5 w-5" />,
  fungi: <Sprout className="h-5 w-5" />,
  geography: <Globe2 className="h-5 w-5" />,
  neighbors: <Network className="h-5 w-5" />,
  conservation: <ShieldCheck className="h-5 w-5" />,
};

function badge(rel: HomepageRelationship) {
  if (rel.availability === 'available') return rel.scope === 'species' ? 'Species evidence' : 'Genus context';
  if (rel.availability === 'unavailable') return 'Unavailable';
  return 'Not yet verified';
}

const TheKnowledgeGraph: React.FC = () => {
  const { subject, relationships, selectedRelationshipId, selectRelationship } = useHomepageRelationships();
  const selected = relationships.find((rel) => rel.id === selectedRelationshipId) ?? relationships.find((rel) => rel.availability === 'available') ?? relationships[0];

  return (
    <section id="the-knowledge-graph" className="relative overflow-hidden border-y border-white/[0.06] bg-[#0d2535] text-[#f5f0e8]">
      <div className="mx-auto max-w-[1400px] px-6 py-12 lg:px-10 lg:py-16">
        <div className="max-w-3xl">
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#d4b34a]">Living relationships</div>
          <h2 className="mt-4 font-serif text-4xl leading-tight text-[#fffaf0] sm:text-5xl">{subject} is part of a larger living system.</h2>
          <p className="mt-4 text-base leading-7 text-[#d8cfbd]/82">Follow only the relationships the current homepage evidence can support. Genus-level context stays labeled as genus-level; missing contracts stay visibly unresolved.</p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {relationships.map((rel) => (
            <button key={rel.id} type="button" onClick={() => selectRelationship(rel.id)} className={`rounded-2xl border p-4 text-left transition-colors ${selected?.id === rel.id ? 'border-[#d4b34a]/70 bg-[#d4b34a]/10' : 'border-white/10 bg-white/[0.035] hover:border-[#d4b34a]/35'}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[#d4b34a]">{ICONS[rel.id]}<span className="font-serif text-xl text-[#fffaf0]">{rel.label}</span></span>
                <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#c9bfa9]">{badge(rel)}</span>
              </div>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#d8cfbd]/78">{rel.value || rel.caveat || 'No homepage evidence is exposed for this relationship yet.'}</p>
            </button>
          ))}
        </div>

        {selected && (
          <div className="mt-6 rounded-2xl border border-[#d4b34a]/20 bg-black/15 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#d4b34a]">{selected.label} · {badge(selected)}</p>
                <p className="mt-2 text-base leading-7 text-[#f1eadc]">{selected.value || 'This relationship is not yet verified through the current homepage contract.'}</p>
              </div>
              <Link to="/research-station" className="inline-flex items-center gap-2 rounded-full border border-[#d4b34a]/40 px-4 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#f5f0e8] hover:bg-[#d4b34a]/10">Explore the evidence <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            {selected.caveat && <p className="mt-3 text-xs leading-5 text-[#c9bfa9]/78">{selected.caveat}</p>}
            {selected.provenance.length > 0 && <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#9da89b]">Source: {selected.provenance.join(' · ')}</p>}
          </div>
        )}

        <p className="mt-5 max-w-3xl text-xs leading-5 text-[#aeb6ad]/70">A missing relationship here does not establish biological absence. It may instead mean the relevant evidence has not yet been exposed through the public homepage contract.</p>
      </div>
    </section>
  );
};

export default TheKnowledgeGraph;
