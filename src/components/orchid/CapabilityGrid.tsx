import React from 'react';
import { Link } from 'react-router-dom';
import {
  Globe,
  ShieldCheck,
  Grid3x3,
  FileText,
  Sprout,
  Flower2,
  Microscope,
  GraduationCap,
  MessageCircle,
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

const CAPABILITIES: readonly Capability[] = [
  {
    icon: Globe,
    title: 'The Living Atlas',
    body: 'Explore mapped orchid records by genus, species, and region.',
    link: 'Open the Atlas',
    href: '/atlas-next',
  },
  {
    icon: ShieldCheck,
    title: 'Conservation',
    body: 'Explore conservation work and participating organizations.',
    link: 'Explore Conservation',
    href: '/conservation',
  },
  {
    icon: Grid3x3,
    title: 'Matrix Identification System',
    body: 'Compare observable characteristics in the orchid identification workspace.',
    link: 'Use the Matrix',
    href: '/orchid-identification',
  },
  {
    icon: FileText,
    title: 'Research Center',
    body: 'Sign in to explore research projects, traits, and supporting evidence.',
    link: 'Open Research',
    href: '/research',
  },
  {
    icon: Sprout,
    title: 'The Orchid Conservatory',
    body: 'Sign in to record your plants, blooms, and collection notes.',
    link: 'Open the Conservatory',
    href: '/conservatory',
  },
  {
    icon: Flower2,
    title: 'Species Dossiers',
    body: 'Find an orchid and follow its recorded taxonomy, ecology, and sources.',
    link: 'Browse Species',
    href: '/species',
  },
  {
    icon: Microscope,
    title: 'Knowledge Graph',
    body: 'Explore recorded links among orchids, fungi, pollinators, and habitats.',
    link: 'See the Connections',
    href: '/intelligence-graph',
  },
  {
    icon: GraduationCap,
    title: 'Orchid University',
    body: 'Explore orchid studies, lessons, and laboratory activities.',
    link: 'Start Learning',
    href: '/university',
  },
  {
    icon: MessageCircle,
    title: 'Calyx',
    body: 'Ask an orchid question and examine the supporting evidence.',
    link: 'Speak with Calyx',
    href: '/speak-with-calyx',
  },
];

const CapabilityCard: React.FC<{ cap: Capability }> = ({ cap }) => {
  const Icon = cap.icon;
  return (
    <Link
      to={cap.href}
      className="group block text-left rounded-2xl border border-[#d4b34a]/20 bg-[#13241a] p-6 transition-colors hover:border-[#d4b34a]/55 hover:bg-[#16291c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e6c563]"
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
    </Link>
  );
};

const CapabilityGrid: React.FC = () => {
  return (
    <section
      id="what-the-graph-makes-possible"
      aria-labelledby="homepage-capabilities-heading"
      className="border-b border-black/20"
      style={{ background: '#1a2e1a' }}
    >
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-14 lg:py-20">
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
            id="homepage-capabilities-heading"
            className="mt-6"
            style={{
              fontFamily: '"Playfair Display",Georgia,serif',
              fontSize: 'clamp(2rem, 3.6vw, 2.75rem)',
              fontWeight: 700,
              color: '#f0ebe0',
              lineHeight: 1.18,
            }}
          >
            Explore Orchid Continuum
          </h2>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((cap) => (
            <CapabilityCard key={cap.title} cap={cap} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default CapabilityGrid;
