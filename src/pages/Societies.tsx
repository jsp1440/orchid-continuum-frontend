import React from 'react';
import {
  Users,
  CalendarHeart,
  Mail,
  Trophy,
  Newspaper,
  Sparkles,
} from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';
import OrganizationCard from '@/components/orchid/OrganizationCard';
import RoleBadge from '@/components/orchid/RoleBadge';

/**
 * Societies
 * ---------
 * The hub for orchid societies: local chapters, regional federations,
 * and judging communities. Conceptual UI only — society profiles,
 * events, and member rosters wait on `/api/societies/*`.
 */

const demoSocieties = [
  {
    slug: 'pacific-rim-orchid-society',
    name: 'Pacific Rim Orchid Society',
    kind: 'Orchid Society',
    region: 'Pacific Northwest, USA',
    description:
      'Monthly meetings, a juried spring show, and a culture group focused on cool-growing Pleurothallidinae. Welcomes hobbyists and community-college botany students.',
    memberCount: 412,
    projectCount: 3,
    focus: ['Show judging', 'Pleurothallid culture', 'Education'],
  },
  {
    slug: 'east-anglia-orchid-circle',
    name: 'East Anglia Orchid Circle',
    kind: 'Orchid Society',
    region: 'United Kingdom',
    description:
      'A 60-year-old society with a long history of native British orchid conservation walks and a quarterly print bulletin. Newsletter goes to 800 members.',
    memberCount: 812,
    projectCount: 2,
    focus: ['Native species walks', 'Newsletter', 'Conservation outreach'],
  },
  {
    slug: 'sociedad-orquidologica-andina',
    name: 'Sociedad Orquidológica Andina',
    kind: 'Orchid Society',
    region: 'Bogotá, Colombia',
    description:
      'Members from Colombia and Ecuador meet bilingually, host an annual exhibition, and partner with the Andean Orchid Trust for community nursery training.',
    memberCount: 268,
    projectCount: 4,
    focus: ['Exhibition', 'Bilingual education', 'Community nurseries'],
  },
];

const tools = [
  {
    Icon: CalendarHeart,
    title: 'Event management',
    body: 'Meetings, shows, lectures, plant sales, and field trips — published once, syndicated to every member.',
  },
  {
    Icon: Users,
    title: 'Member rosters',
    body: 'Roles for officers, judges, education leads, and volunteers. Renewals and dues stay inside the society.',
  },
  {
    Icon: Mail,
    title: 'Newsletter composer',
    body: 'Compose a chapter newsletter that pulls in Continuum content — Orchid of the Day, species snapshots, conservation updates.',
  },
  {
    Icon: Trophy,
    title: 'Show judging tools',
    body: 'AOS-style scoring sheets, ribbon tracking, and a permanent show record published to the society profile.',
  },
  {
    Icon: Newspaper,
    title: 'Educational tools',
    body: 'Lecture archives, guest-speaker bookings, and library of culture sheets — searchable by genus and growing condition.',
  },
  {
    Icon: Sparkles,
    title: 'Embeddable widgets',
    body: 'Drop the Species Snapshot or Atlas Teaser into your chapter site to keep members connected to the wider Continuum.',
  },
];

const Societies: React.FC = () => {
  return (
    <PageShell
      eyebrow="Orchid Societies"
      title="The pulse of orchid culture,"
      titleAccent="kept by its societies"
      intro="Local and regional orchid societies are where horticultural knowledge lives — passed between generations of growers, judges, and educators. The Continuum gives every society an online home, and connects them to the wider scientific commons."
      heroAside={
        <div className="rounded-xl border border-rose-300/30 bg-rose-300/[0.06] p-5">
          <div className="text-[10px] tracking-[0.25em] uppercase text-rose-200/90 mb-2">
            For societies
          </div>
          <p className="text-sm text-white/85 leading-relaxed">
            One platform for events, members, newsletters, and judging — with
            embeddable widgets that bring living Continuum data into your
            chapter site.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <RoleBadge role="society" size="sm" />
            <RoleBadge role="grower" size="sm" />
            <RoleBadge role="public" size="sm" />
          </div>
        </div>
      }
    >
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-16">
        <div className="text-[10px] tracking-[0.3em] uppercase text-emerald-200/80 mb-3">
          Featured societies
        </div>
        <h2 className="font-serif text-3xl md:text-4xl text-white mb-8">
          Chapters and communities
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {demoSocieties.map(s => (
            <OrganizationCard key={s.slug} {...s} demo />
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-20">
        <div className="text-[10px] tracking-[0.3em] uppercase text-emerald-200/80 mb-3">
          Society toolkit
        </div>
        <h2 className="font-serif text-3xl md:text-4xl text-white mb-10">
          Everything a chapter needs, in one place
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tools.map(t => (
            <div
              key={t.title}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:border-rose-300/30 transition-colors"
            >
              <t.Icon className="h-5 w-5 text-rose-200 mb-3" />
              <h3 className="font-serif text-lg text-white mb-2 leading-snug">
                {t.title}
              </h3>
              <p className="text-[13px] text-white/65 leading-relaxed font-light">
                {t.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 lg:px-10 pb-24">
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.04] p-10 text-center">
          <h3 className="font-serif text-2xl md:text-3xl text-white max-w-2xl mx-auto leading-snug">
            From the windowsill grower to the founding hybridiser, every
            society shapes how the next generation meets orchids.
          </h3>
          <p className="text-sm text-white/65 mt-4 max-w-xl mx-auto">
            To register your society or claim an existing profile, use the
            steward channel from Get Involved.
          </p>
        </div>
      </section>
    </PageShell>
  );
};

export default Societies;
