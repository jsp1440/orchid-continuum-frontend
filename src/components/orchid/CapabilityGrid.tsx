import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe,
  Network,
  Grid3x3,
  FileText,
  Sprout,
  Dna,
  Microscope,
  GraduationCap,
  ShieldCheck,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';

/**
 * ACT 4 — WHAT THE KNOWLEDGE GRAPH MAKES POSSIBLE.
 *
 * Capability cards in a dark forest-green grid. Each card has a gold icon,
 * bold cream title, a description, and a gold link that routes into the
 * relevant area of the platform.
 */

interface Capability {
  icon: LucideIcon;
  title: string;
  body: string;
  link: string;
  href: string;
}

const CAPABILITIES: Capability[] = [
  {
    icon: Globe,
    title: 'The Living Atlas',
    body: '580,000+ verified occurrence records mapped in real time. Filter by taxonomy, conservation status, pollinator guild, and climate zone to see exactly where each orchid lives on Earth.',
    link: 'Open the Atlas',
    href: '/atlas',
  },
  {
    icon: Network,
    title: 'OASIS Conservation Intelligence',
    body: 'An AI-assisted system that weaves cultivation records, occurrence data, ecological relationships, and climate data into one coherent conservation record for every species.',
    link: 'Explore OASIS',
    href: '/oacs',
  },
  {
    icon: ShieldCheck,
    title: 'Admin Center',
    body: 'The control panel for database diagnostics, image resolver audits, relationship harvest status, Atlas health, OASIS operations, and future AI agent runs.',
    link: 'Open Control Panel',
    href: '/admin',
  },
  {
    icon: Grid3x3,
    title: 'Matrix Identification System',
    body: 'A modern replacement for the traditional dichotomous key — only possible because the knowledge graph holds morphological data across all 30,000 species simultaneously. Identify any orchid from observable characteristics.',
    link: 'Use the Matrix',
    href: '/explore',
  },
  {
    icon: FileText,
    title: 'The Literature Pipeline',
    body: 'Scientific papers transformed into machine-readable ecological relationships through the Orchid Relationship Extraction Pipeline (OREP). Every published finding becomes part of the living knowledge graph.',
    link: 'Explore the Literature',
    href: '/research',
  },
  {
    icon: Sprout,
    title: 'The Orchid Conservatory',
    body: 'Personal collection management with OASIS intelligence behind every care recommendation. Track your plants, document blooms, and connect your collection to the global knowledge graph.',
    link: 'Open the Conservatory',
    href: '/collection',
  },
  {
    icon: Dna,
    title: 'Breeding Assistance',
    body: 'Cross-compatibility prediction and hybrid lineage tracking — only possible because the knowledge graph links parentage, ploidy, and bloom records across the family. Plan crosses with the weight of recorded evidence behind them.',
    link: 'Plan a Cross',
    href: '/collection',
  },
  {
    icon: Microscope,
    title: 'Ecological Intelligence',
    body: 'Mycorrhizal partnerships, pollinator guilds, and climate envelopes connected into one ecological picture. Understand not just what an orchid is, but everything it depends on to survive.',
    link: 'See the Connections',
    href: '/intelligence-graph',
  },
  {
    icon: GraduationCap,
    title: 'Orchid University',
    body: 'Open educational pathways built directly on the knowledge graph, from first bloom to field botany. Learn orchids the way they actually live — as a web of relationships, not a list of names.',
    link: 'Start Learning',
    href: '/education',
  },
];

const CapabilityCard: React.FC<{ cap: Capability }> = ({ cap }) => {
  const navigate = useNavigate();
  const Icon = cap.icon;
  return (
    <button
      type="button"
      onClick={() => navigate(cap.href)}
      className="group text-left rounded-2xl border border-[#d4b34a]/20 bg-[#13241a] p-7 lg:p-8 transition-all hover:border-[#d4b34a]/55 hover:bg-[#16291c]"
    >
      <span className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-[#d4b34a]/12 text-[#e6c563]">
        <Icon className="h-6 w-6" strokeWidth={1.6} />
      </span>
      <h3
        className="mt-5"
        style={{
          fontFamily: '"Playfair Display",Georgia,serif',
          fontSize: 'clamp(1.25rem, 1.7vw, 1.45rem)',
          fontWeight: 700,
          color: '#f0ebe0',
          lineHeight: 1.25,
        }}
      >
        {cap.title}
      </h3>
      <p
        className="mt-3"
        style={{
          color: '#dfe4d6',
          fontSize: 16,
          fontWeight: 400,
          lineHeight: 1.7,
        }}
      >
        {cap.body}
      </p>
      <span className="mt-5 inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] uppercase text-[#e6c563] group-hover:text-[#f4d97a]">
        {cap.link}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </span>
    </button>
  );
};

const CapabilityGrid: React.FC = () => {
  return (
    <section
      id="what-the-graph-makes-possible"
      className="border-b border-black/20"
      style={{ background: '#1a2e1a' }}
    >
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-20 lg:py-28">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3">
            <span className="inline-block w-8 h-px" style={{ background: 'rgba(212,179,74,0.6)' }} />
            <span
              className="font-mono uppercase"
              style={{ fontSize: 13, letterSpacing: '0.34em', color: '#d4b34a', fontWeight: 600 }}
            >
              What Becomes Possible
            </span>
          </div>
          <h2
            className="mt-6"
            style={{
              fontFamily: '"Playfair Display",Georgia,serif',
              fontSize: 'clamp(2rem, 3.6vw, 2.75rem)',
              fontWeight: 700,
              color: '#f0ebe0',
              lineHeight: 1.18,
            }}
          >
            Nine ways the knowledge graph changes what we can know — and manage — about orchids.
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6">
          {CAPABILITIES.map((cap) => (
            <CapabilityCard key={cap.title} cap={cap} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default CapabilityGrid;
