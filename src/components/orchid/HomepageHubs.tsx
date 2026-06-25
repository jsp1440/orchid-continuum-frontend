import React from 'react';
import { ArrowRight, BookOpen, FlaskConical, Leaf, Map } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { homepageHubs, type HomepageHub, type HomepageHubStatus } from '@/lib/homepageHubMap';

const iconByHub: Record<HomepageHub['id'], React.ReactNode> = {
  observatory: <Map className="h-5 w-5" strokeWidth={1.5} />,
  conservatory: <Leaf className="h-5 w-5" strokeWidth={1.5} />,
  'science-station': <FlaskConical className="h-5 w-5" strokeWidth={1.5} />,
  university: <BookOpen className="h-5 w-5" strokeWidth={1.5} />,
};

const statusLabel: Record<HomepageHubStatus, string> = {
  live: 'Live',
  preview: 'Preview',
  'needs-wiring': 'Wiring',
  'coming-soon': 'Soon',
};

const statusClass: Record<HomepageHubStatus, string> = {
  live: 'border-[#4f6f3f]/35 bg-[#edf4e7] text-[#2e4a23]',
  preview: 'border-[#c9a84c]/40 bg-[#fff7df] text-[#7a5b12]',
  'needs-wiring': 'border-[#9b8a72]/35 bg-[#f2eee6] text-[#62533c]',
  'coming-soon': 'border-[#8b96a8]/35 bg-[#eef1f5] text-[#4b5565]',
};

const HubCard: React.FC<{ hub: HomepageHub }> = ({ hub }) => {
  const navigate = useNavigate();

  return (
    <article className="group flex h-full flex-col rounded-[1.75rem] border border-[#d9caa8] bg-[#fffaf0] p-5 shadow-[0_16px_36px_rgba(38,45,28,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(38,45,28,0.13)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#c9a84c]/45 bg-[#f6f0df] text-[#5d4b1d]">
          {iconByHub[hub.id]}
        </div>
        <span className="rounded-full border border-[#c9a84c]/40 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#806420]">
          {hub.shortTitle}
        </span>
      </div>

      <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#8a8062]">
        {hub.eyebrow}
      </p>
      <h3 className="mt-2 font-serif text-2xl leading-tight text-[#24321f]">
        {hub.title}
      </h3>
      <p className="mt-3 text-sm leading-6 text-[#5d684c]">
        {hub.summary}
      </p>
      <p className="mt-4 border-l border-[#d9caa8] pl-4 font-serif text-[1rem] leading-7 text-[#33412a]">
        {hub.story}
      </p>

      <div className="mt-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8a8062]">Live now</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {hub.liveNow.map((item) => (
            <span key={item} className="rounded-full bg-[#f0e8d1] px-2.5 py-1 text-xs text-[#4f553f]">
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8a8062]">Connected routes</p>
        <div className="mt-2 space-y-1.5">
          {hub.links.map((link) => (
            <button
              key={`${hub.id}-${link.route}`}
              onClick={() => navigate(link.route)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#e2d1a2] bg-[#fffdf7] px-3 py-2 text-left transition hover:border-[#c9a84c] hover:bg-[#fff7df]"
            >
              <span className="font-body text-sm text-[#2f3a28]">{link.label}</span>
              <span className={`rounded-full border px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] ${statusClass[link.status]}`}>
                {statusLabel[link.status]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => navigate(hub.primaryRoute)}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-full border border-[#c7b27a] bg-[#24321f] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#fffaf0] transition hover:bg-[#152015]"
      >
        {hub.primaryCta}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </article>
  );
};

const HomepageHubs: React.FC = () => {
  return (
    <section className="relative overflow-hidden bg-[#f6f0df] px-6 py-20 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#8a8062]">
              The Continuum has four doors
            </p>
            <h2 className="mt-3 font-serif text-4xl leading-tight text-[#24321f] md:text-5xl">
              One orchid knowledge system, organized into four connected hubs.
            </h2>
          </div>
          <p className="font-body text-base leading-8 text-[#4f5b44] md:text-lg">
            The Orchid Continuum is not just a website or a database. It is a connected system for observing orchids, documenting cultivated collections, doing orchid science, and teaching the discoveries back to the public.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {homepageHubs.map((hub) => (
            <HubCard key={hub.id} hub={hub} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default HomepageHubs;
