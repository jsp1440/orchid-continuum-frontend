import React from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Database,
  Gauge,
  GitBranch,
  Image,
  LockKeyhole,
  Network,
  PlayCircle,
  ShieldCheck,
  Sprout,
} from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';

type StatusCard = {
  title: string;
  value: string;
  label: string;
  detail: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

type ActionCard = {
  title: string;
  description: string;
  status: string;
  href?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

const STATUS_CARDS: StatusCard[] = [
  {
    title: 'Database connection',
    value: 'Live',
    label: 'Orchid Continuum DB',
    detail: 'Homepage banner reports a live database connection. Future build will replace this shell card with direct health telemetry.',
    icon: Database,
  },
  {
    title: 'Image pipeline',
    value: '2.79M+',
    label: 'frontend image rows',
    detail: 'Image resolver must continue rejecting herbarium sheets, scans, plates, documents, and dead placeholders.',
    icon: Image,
  },
  {
    title: 'Relationship harvest',
    value: '204I-D',
    label: 'expansion pending verification',
    detail: 'Species relationship rows feed ecological neighborhood cards through oc_api.species_ecological_neighborhood_v1.',
    icon: Network,
  },
  {
    title: 'Atlas records',
    value: '580K+',
    label: 'occurrence layer',
    detail: 'Occurrence records anchor geography, co-occurrence, habitat, elevation, and climate diagnostics.',
    icon: Activity,
  },
];

const ACTIONS: ActionCard[] = [
  {
    title: 'Database diagnostics',
    description: 'Check live table/view availability, row counts, schema drift, and source readiness for the homepage, Atlas, gallery, and relationship engine.',
    status: 'Shell ready',
    href: '/diagnostics/daily-genus',
    icon: Gauge,
  },
  {
    title: 'Relationship harvest control',
    description: 'Track harvest builds, target species coverage, missing relationship classes, fungal/pollinator evidence, and species-level neighborhood output.',
    status: '204I build series',
    href: '/relationship-explorer',
    icon: Network,
  },
  {
    title: 'Image resolver audit',
    description: 'Find herbarium/specimen leakage, failed image URLs, missing living photos, bad thumbnails, and species cards still using unfiltered raw media.',
    status: 'Needs live runner',
    href: '/gallery',
    icon: Image,
  },
  {
    title: 'Harvester runs',
    description: 'Future controls for iNaturalist, GBIF, literature, relationship extraction, mycorrhiza, pollinator, and image enrichment jobs.',
    status: 'Control hooks pending',
    icon: PlayCircle,
  },
  {
    title: 'OASIS operations',
    description: 'Conservation intelligence, collection records, sensor data, cultivation history, and species care recommendations belong here.',
    status: 'OASIS link active',
    href: '/oacs',
    icon: Sprout,
  },
  {
    title: 'Build log register',
    description: 'A single place to record Constitution builds, commits, deployment status, failed scripts, and rollback notes.',
    status: 'Placeholder',
    icon: GitBranch,
  },
  {
    title: 'AI agent console',
    description: 'Future Loop Engineering control surface for scheduled knowledge-gap agents, literature checks, data quality agents, and grant monitors.',
    status: 'Planned',
    icon: Bot,
  },
  {
    title: 'Security boundary',
    description: 'This page is an entry shell. Write actions, secrets, and destructive controls must remain protected until admin authentication is enforced.',
    status: 'Read-only shell',
    icon: LockKeyhole,
  },
];

const AdminCenter: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#07140d] text-[#f5f0e8]">
      <Navbar />
      <main className="pt-24">
        <section className="relative overflow-hidden border-b border-white/[0.08]">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at 20% 0%, rgba(201,162,74,0.16) 0%, rgba(7,20,13,0) 55%),' +
                'radial-gradient(ellipse at 90% 90%, rgba(52,211,153,0.10) 0%, rgba(7,20,13,0) 55%)',
            }}
          />
          <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-16 lg:py-24">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#c9a24a]/35 bg-[#c9a24a]/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.24em] uppercase text-[#d4b34a]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin Center · Control Panel Entry Point
            </div>
            <h1
              className="mt-6 max-w-5xl leading-[0.98] text-[#faf7f2]"
              style={{
                fontFamily: "'Playfair Display', 'Cormorant Garamond', Georgia, serif",
                fontWeight: 600,
                fontSize: 'clamp(2.6rem, 6vw, 5.4rem)',
              }}
            >
              Orchid Continuum <span className="italic text-[#d4b34a]">control panel.</span>
            </h1>
            <p className="mt-6 max-w-3xl text-[15px] md:text-[17px] leading-relaxed text-[#cfc8b8]/88 font-body">
              This is the homepage-visible administrative entry point for database diagnostics, image resolver audits,
              relationship harvest monitoring, OASIS operations, Atlas health, and future AI agent controls.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/relationship-explorer"
                className="inline-flex items-center gap-2 rounded-full bg-[#d4b34a] px-5 py-3 font-mono text-[10px] tracking-[0.22em] uppercase text-[#12170d] hover:bg-[#e5c85c] transition-colors"
              >
                Open relationship explorer
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                to="/diagnostics/daily-genus"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-mono text-[10px] tracking-[0.22em] uppercase text-[#f5f0e8] hover:border-[#d4b34a]/60 hover:text-[#d4b34a] transition-colors"
              >
                Open diagnostics
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>

        <section className="max-w-[1400px] mx-auto px-6 lg:px-10 py-10 lg:py-14">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {STATUS_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.title} className="rounded-2xl border border-white/[0.08] bg-[#0d1d13]/80 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <Icon className="h-5 w-5 text-[#d4b34a]" strokeWidth={1.5} />
                    <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 font-mono text-[9px] tracking-[0.18em] uppercase text-emerald-300">
                      tracked
                    </span>
                  </div>
                  <div className="mt-5 font-mono text-[10px] tracking-[0.24em] uppercase text-[#7d6a3a]">{card.title}</div>
                  <div className="mt-2 text-3xl text-[#f5f0e8]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{card.value}</div>
                  <div className="mt-1 font-mono text-[9px] tracking-[0.18em] uppercase text-[#c9a24a]">{card.label}</div>
                  <p className="mt-4 text-[12.5px] leading-relaxed text-[#cfc8b8]/75">{card.detail}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="max-w-[1400px] mx-auto px-6 lg:px-10 pb-20 lg:pb-28">
          <div className="mb-8 flex items-end justify-between gap-5 border-t border-white/[0.07] pt-10">
            <div>
              <div className="font-mono text-[10px] tracking-[0.34em] uppercase text-[#c9a24a]">Operations</div>
              <h2 className="mt-3 text-3xl md:text-4xl text-[#faf7f2]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                Control surfaces to wire next.
              </h2>
            </div>
            <div className="hidden md:flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/8 px-3 py-2 font-mono text-[9px] tracking-[0.18em] uppercase text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" />
              read-only shell
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {ACTIONS.map((action) => {
              const Icon = action.icon;
              const body = (
                <article className="group h-full rounded-2xl border border-[#c9a24a]/18 bg-[#102816]/86 p-6 transition-all hover:border-[#c9a24a]/50 hover:bg-[#14341e]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="w-11 h-11 rounded-full border border-[#c9a24a]/35 bg-[#c9a24a]/10 flex items-center justify-center text-[#d4b34a]">
                      <Icon className="h-5 w-5" strokeWidth={1.5} />
                    </div>
                    <span className="rounded-full border border-white/10 bg-black/15 px-2 py-1 font-mono text-[8.5px] tracking-[0.16em] uppercase text-[#cfc8b8]/70">
                      {action.status}
                    </span>
                  </div>
                  <h3 className="mt-7 text-2xl leading-tight text-[#faf7f2]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                    {action.title}
                  </h3>
                  <p className="mt-4 text-[13px] leading-relaxed text-[#cfc8b8]/78">{action.description}</p>
                  <div className="mt-6 inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] uppercase text-[#d4b34a]">
                    {action.href ? 'Open' : 'Awaiting runner'}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </article>
              );

              return action.href ? (
                <Link key={action.title} to={action.href} className="block h-full">
                  {body}
                </Link>
              ) : (
                <div key={action.title}>{body}</div>
              );
            })}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default AdminCenter;
