import React from 'react';
import {
  Sprout,
  Camera,
  BookOpen,
  Calendar,
  Droplets,
  Flower2,
  CheckCircle2,
  Activity,
  Plus,
  Lock,
} from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';

/**
 * My Collection — personal grower dashboard placeholder.
 *
 * This page is a structured shell for the future grower platform:
 * inventory, photo timeline, journal, calendar, care events, bloom
 * history, verification status, and forward-link to OACS.
 *
 * No personal data is rendered — backend authentication and the
 * /api/collection/* surface are required before this becomes live.
 */

interface ModuleCard {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  endpoint: string;
  status: 'planned' | 'beta' | 'placeholder';
}

const MODULES: ModuleCard[] = [
  {
    icon: Sprout,
    title: 'Plant inventory',
    body: 'Every orchid in your care, with verified taxonomy, source, and acquisition date.',
    endpoint: 'GET /api/collection/plants',
    status: 'planned',
  },
  {
    icon: Camera,
    title: 'Photo timeline',
    body: 'Chronological photo history per plant — growth, blooms, repots, recoveries.',
    endpoint: 'GET /api/collection/plants/{id}/photos',
    status: 'planned',
  },
  {
    icon: BookOpen,
    title: 'Journal',
    body: 'Free-form notes anchored to plants and dates, searchable across your collection.',
    endpoint: 'GET /api/collection/journal',
    status: 'planned',
  },
  {
    icon: Calendar,
    title: 'Care calendar',
    body: 'Watering, fertilizing, repotting, and seasonal task scheduling.',
    endpoint: 'GET /api/collection/calendar',
    status: 'planned',
  },
  {
    icon: Droplets,
    title: 'Care events',
    body: 'A first-class log of every water, feed, treatment — the substrate of grower analytics.',
    endpoint: 'POST /api/collection/events',
    status: 'planned',
  },
  {
    icon: Flower2,
    title: 'Bloom history',
    body: 'Spike emergence, bloom dates, count, longevity. Phenology you can graph.',
    endpoint: 'GET /api/collection/blooms',
    status: 'planned',
  },
  {
    icon: CheckCircle2,
    title: 'Verification status',
    body: 'Per-plant ID confidence — self-asserted, expert-reviewed, or DNA-confirmed.',
    endpoint: 'GET /api/collection/verification',
    status: 'planned',
  },
  {
    icon: Activity,
    title: 'OACS linkage',
    body: 'Bind plants to greenhouse zones to compare habitat conditions to your environment.',
    endpoint: 'GET /api/oacs/zones · /api/collection/links',
    status: 'planned',
  },
];

const MyCollection: React.FC = () => {
  return (
    <PageShell
      eyebrow="Personal stewardship"
      title="My Collection"
      titleAccent="every orchid, every season."
      intro="A first-class grower workspace: track plants, photos, blooms, and care events — and link them directly to greenhouse environments through OACS."
      heroAside={
        <div className="rounded-2xl border border-white/10 bg-[#142a1f] p-5">
          <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-300/70 mb-3 flex items-center gap-2">
            <Lock className="h-3 w-3" /> Account required
          </div>
          <p className="text-xs text-white/60 leading-relaxed">
            The collection workspace is gated behind authenticated grower
            accounts. Sign-in flows are part of the upcoming auth integration.
          </p>
          <button
            type="button"
            disabled
            className="mt-4 w-full px-4 py-2 rounded-full border border-white/15 text-xs tracking-[0.2em] uppercase text-white/40 cursor-not-allowed"
          >
            Sign-in coming soon
          </button>
        </div>
      }
    >
      {/* Inventory placeholder hero */}
      <section className="py-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="rounded-2xl border border-white/10 bg-[#142a1f] p-8 md:p-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-300/70 mb-2">
                  Mock preview · no live data
                </div>
                <h2 className="font-serif text-3xl">Your inventory</h2>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-300/40 text-emerald-200 text-sm hover:bg-emerald-300/10 transition-colors"
              >
                <Plus className="h-4 w-4" /> Add plant
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/10 bg-[#0d1f17] aspect-[3/4] flex flex-col items-center justify-center text-white/30 text-[10px] tracking-[0.2em] uppercase"
                >
                  <Sprout className="h-5 w-5 mb-2" />
                  Plant slot
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Module cards */}
      <section className="pb-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/70 mb-3">
            Workspace modules
          </div>
          <h2 className="font-serif text-3xl md:text-4xl max-w-2xl mb-10">
            Eight surfaces, one grower workspace.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {MODULES.map(m => {
              const Icon = m.icon;
              return (
                <div
                  key={m.title}
                  className="rounded-2xl border border-white/10 bg-[#142a1f] p-5 flex flex-col"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-lg bg-emerald-300/10 border border-emerald-300/20 flex items-center justify-center text-emerald-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-[9px] tracking-[0.2em] uppercase text-amber-200/80 px-2 py-0.5 rounded-full border border-amber-300/30">
                      {m.status}
                    </span>
                  </div>
                  <div className="font-serif text-lg mb-2">{m.title}</div>
                  <p className="text-xs text-white/60 leading-relaxed flex-1">
                    {m.body}
                  </p>
                  <code className="block text-[10px] text-white/35 mt-4 truncate">
                    {m.endpoint}
                  </code>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </PageShell>
  );
};

export default MyCollection;
