import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Grid3x3, Map, Network } from 'lucide-react';

const TOOLS = [
  {
    title: 'Atlas',
    body: 'Explore where orchid records occur and follow geography into deeper evidence.',
    href: '/atlas',
    icon: Map,
  },
  {
    title: 'Identification Matrix',
    body: 'Move from observable characters toward evidence-backed identification.',
    href: '/explore',
    icon: Grid3x3,
  },
  {
    title: 'Relationship Explorer',
    body: 'Follow links among orchids, habitats, pollinators, fungi, literature, and conservation.',
    href: '/relationship-explorer',
    icon: Network,
  },
  {
    title: 'Research Station',
    body: 'Go deeper into literature, taxonomy, occurrence evidence, and research questions.',
    href: '/research',
    icon: BookOpen,
  },
];

const CapabilityGrid: React.FC = () => (
  <section id="discovery-tools" className="border-b border-[#d8d0bf] bg-[#f4efe3] text-[#203025]">
    <div className="mx-auto max-w-[1280px] px-6 py-14 lg:px-10 lg:py-16">
      <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
        <div className="max-w-xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#8a6f2d]">Explore further</p>
          <h2 className="mt-3 font-serif text-4xl leading-tight text-[#203025] md:text-5xl">Four doors into the Continuum.</h2>
          <p className="mt-4 max-w-lg text-[17px] leading-7 text-[#526052]">
            The homepage introduces the relationships. These deeper spaces let you investigate them.
          </p>
        </div>

        <div className="grid gap-px overflow-hidden rounded-2xl border border-[#d8d0bf] bg-[#d8d0bf] sm:grid-cols-2">
          {TOOLS.map(({ title, body, href, icon: Icon }) => (
            <Link key={title} to={href} className="group bg-[#fffaf0] p-5 transition-colors hover:bg-[#fbf3df]">
              <div className="flex items-center justify-between gap-4">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#c9b46e] text-[#7b6425]">
                  <Icon className="h-4 w-4" />
                </span>
                <ArrowRight className="h-4 w-4 text-[#8a6f2d] transition-transform group-hover:translate-x-1" />
              </div>
              <h3 className="mt-4 font-serif text-2xl text-[#203025]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#5e695b]">{body}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default CapabilityGrid;
