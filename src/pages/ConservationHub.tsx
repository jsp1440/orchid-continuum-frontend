import React from 'react';
import { Trees, ScrollText, HandHeart, Network, Workflow } from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';
import OrganizationCard from '@/components/orchid/OrganizationCard';
import ProjectWorkspaceCard from '@/components/orchid/ProjectWorkspaceCard';
import EducationalOverlay from '@/components/orchid/EducationalOverlay';
import GlossaryTerm from '@/components/orchid/GlossaryTerm';
import RoleBadge from '@/components/orchid/RoleBadge';

/**
 * ConservationHub
 * ---------------
 * The collaborative center for conservation organizations, NGOs, and
 * landscape-scale initiatives working with orchids and their habitats.
 *
 * This page is *conceptual UI architecture* only — every list rendered
 * here is demo-flagged and waits on `/api/organizations`,
 * `/api/projects`, `/api/protocols`, and `/api/volunteer-opportunities`.
 *
 * Frontend never queries the database directly; data flows exclusively
 * through the typed API client (see src/lib/api.ts).
 */

const demoOrgs = [
  {
    slug: 'andean-orchid-trust',
    name: 'Andean Orchid Trust',
    kind: 'Conservation Organization',
    region: 'Ecuador & Peru',
    description:
      'Field conservation across cloud forest corridors of the eastern Andes. Coordinates ranger patrols, community nurseries, and pollinator monitoring with eight partner reserves.',
    memberCount: 412,
    projectCount: 7,
    focus: ['Cloud forest', 'Pollinator monitoring', 'Community nurseries'],
  },
  {
    slug: 'south-asia-orchidaceae-network',
    name: 'South Asia Orchidaceae Network',
    kind: 'Research Consortium',
    region: 'India · Bhutan · Nepal',
    description:
      'A consortium linking ten herbaria and four protected-area authorities to share documented sightings, voucher images, and habitat assessments across the eastern Himalaya.',
    memberCount: 86,
    projectCount: 4,
    focus: ['Herbarium digitisation', 'Habitat assessment'],
  },
  {
    slug: 'borneo-canopy-initiative',
    name: 'Borneo Canopy Initiative',
    kind: 'Conservation Organization',
    region: 'Sabah, Malaysia',
    description:
      'Lowland and montane epiphytic orchid surveys with Indigenous land stewards. Builds bilingual species guides and trains community paraecologists.',
    memberCount: 138,
    projectCount: 5,
    focus: ['Epiphyte surveys', 'Indigenous stewardship', 'Paraecology'],
  },
];

const demoProjects = [
  {
    slug: 'high-andean-pollinator-pulse',
    title: 'High-Andean Pollinator Pulse',
    organization: 'Andean Orchid Trust',
    region: 'Cajamarca, Peru · 2,800–3,400 m',
    summary:
      'Year-round monitoring of hummingbird and euglossine visitation at twelve Telipogon sites, paired with micro-climate loggers and AI-assisted image triage.',
    phase: 'Active fieldwork' as const,
    contributors: 18,
    lastActivity: new Date(Date.now() - 86_400_000 * 2).toISOString(),
    openTo: ['public', 'researcher', 'organization'] as const,
  },
  {
    slug: 'himalayan-herbarium-bridge',
    title: 'Himalayan Herbarium Bridge',
    organization: 'South Asia Orchidaceae Network',
    region: 'Sikkim · Bhutan',
    summary:
      'Cross-walk of 14,000 voucher specimens against the Continuum taxonomy. Documents historical range shifts and nomenclatural revisions since 1890.',
    phase: 'Analysis' as const,
    contributors: 9,
    lastActivity: new Date(Date.now() - 86_400_000 * 9).toISOString(),
    openTo: ['researcher', 'organization'] as const,
  },
  {
    slug: 'kinabalu-canopy-paraecology',
    title: 'Kinabalu Canopy Paraecology',
    organization: 'Borneo Canopy Initiative',
    region: 'Sabah, Malaysia',
    summary:
      'Community paraecologists document epiphytic orchid assemblages along an elevational gradient. Photo-vouchered with mycorrhizal soil sampling at fruiting events.',
    phase: 'Planning' as const,
    contributors: 6,
    lastActivity: new Date(Date.now() - 86_400_000 * 14).toISOString(),
    openTo: ['public', 'student', 'organization'] as const,
  },
  {
    slug: 'mesoamerican-fragmentation-atlas',
    title: 'Mesoamerican Fragmentation Atlas',
    organization: 'Continuum Cross-Network',
    region: 'Guatemala · Honduras · Mexico',
    summary:
      'Spatial overlay of orchid sightings against deforestation chronologies. Surfaces priority corridors where remaining cloud forest could be reconnected.',
    phase: 'Reporting' as const,
    contributors: 22,
    lastActivity: new Date(Date.now() - 86_400_000 * 4).toISOString(),
    openTo: ['researcher', 'organization', 'admin'] as const,
  },
];

const protocols = [
  {
    title: 'Pollinator visitation transect',
    blurb:
      'Standardised 20-minute observation windows along a 50 m transect at peak floral display.',
    tier: 'Field protocol',
  },
  {
    title: 'Mycorrhizal soil sampling',
    blurb:
      'Sterile-tube collection at the rhizosphere, with chain-of-custody for downstream ITS sequencing.',
    tier: 'Laboratory protocol',
  },
  {
    title: 'Photo-voucher minimum standard',
    blurb:
      'Required views (habit, flower face, lateral, lip detail), scale, and EXIF retention for verifiable sightings.',
    tier: 'Documentation standard',
  },
  {
    title: 'Volunteer onboarding & safety',
    blurb:
      'Cloud-forest field readiness: altitude, weather, tick protocols, and informed-consent for participatory work.',
    tier: 'Volunteer protocol',
  },
];

const ConservationHub: React.FC = () => {
  return (
    <PageShell
      eyebrow="Conservation Hub"
      title="Where conservation"
      titleAccent="becomes a shared practice"
      intro="A meeting ground for the organizations, researchers, and volunteers who steward orchid habitats. Stand up a project workspace, publish a field protocol, recruit collaborators, or join an active investigation already underway."
      heroAside={
        <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/[0.05] p-5">
          <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-200/80 mb-2">
            For organizations
          </div>
          <p className="text-sm text-white/80 leading-relaxed">
            Establish your organizational profile, invite team members, and
            open your work to volunteers and partner institutions.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <RoleBadge role="organization" size="sm" />
            <RoleBadge role="researcher" size="sm" />
            <RoleBadge role="public" size="sm" />
          </div>
        </div>
      }
    >
      {/* Organizations */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-16">
        <div className="flex items-end justify-between gap-6 mb-8">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-emerald-200/80 mb-2">
              Member organizations
            </div>
            <h2 className="font-serif text-3xl md:text-4xl text-white">
              Institutions in the network
            </h2>
          </div>
          <EducationalOverlay
            compact
            title="What is an organizational profile?"
            body={
              <>
                A verifiable institutional identity inside the Continuum.
                Organizations carry team rosters, projects, and{' '}
                <GlossaryTerm
                  term="Field protocol"
                  definition="A documented, repeatable method for collecting ecological observations — written so that two field teams in different countries can produce comparable data."
                >
                  field protocols
                </GlossaryTerm>{' '}
                — and their data is attributed back to them with full
                provenance.
              </>
            }
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {demoOrgs.map(o => (
            <OrganizationCard key={o.slug} {...o} demo />
          ))}
        </div>
      </section>

      {/* Project workspaces */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-20">
        <div className="flex items-end justify-between gap-6 mb-8">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-emerald-200/80 mb-2">
              Active investigations
            </div>
            <h2 className="font-serif text-3xl md:text-4xl text-white">
              Project workspaces
            </h2>
            <p className="text-sm text-white/65 mt-3 max-w-2xl leading-relaxed">
              Each workspace is a living investigation: documented sightings,
              shared protocols, contributor roles, and a public record of
              what the project has learned so far.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {demoProjects.map(p => (
            <ProjectWorkspaceCard key={p.slug} {...p} demo />
          ))}
        </div>
      </section>

      {/* Protocols + Volunteering */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-white/[0.02] p-8">
            <div className="flex items-center gap-2 text-emerald-200 mb-3">
              <ScrollText className="h-4 w-4" />
              <span className="text-[10px] tracking-[0.3em] uppercase">
                Shared protocol library
              </span>
            </div>
            <h3 className="font-serif text-2xl text-white mb-5">
              Methods that travel between teams
            </h3>
            <ul className="space-y-4">
              {protocols.map(p => (
                <li
                  key={p.title}
                  className="flex items-start gap-4 pb-4 border-b border-white/5 last:border-0 last:pb-0"
                >
                  <Workflow className="h-4 w-4 text-emerald-300 mt-1 shrink-0" />
                  <div>
                    <div className="text-[10px] tracking-[0.22em] uppercase text-emerald-200/70 mb-1">
                      {p.tier}
                    </div>
                    <div className="text-white font-medium">{p.title}</div>
                    <p className="text-sm text-white/65 leading-relaxed mt-1">
                      {p.blurb}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
              <div className="flex items-center gap-2 text-emerald-200 mb-3">
                <HandHeart className="h-4 w-4" />
                <span className="text-[10px] tracking-[0.3em] uppercase">
                  Volunteer coordination
                </span>
              </div>
              <h3 className="font-serif text-2xl text-white mb-3">
                Open hands, open habitats
              </h3>
              <p className="text-sm text-white/70 leading-relaxed mb-4">
                Volunteers join projects through clearly described roles:
                photo-vouchering, transect walking, herbarium digitisation,
                community outreach. Every contribution is credited.
              </p>
              <div className="text-xs text-white/55 border-t border-white/5 pt-4">
                Volunteer applications open once an organization publishes a
                role. Connection lives in each project workspace.
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
              <div className="flex items-center gap-2 text-emerald-200 mb-3">
                <Network className="h-4 w-4" />
                <span className="text-[10px] tracking-[0.3em] uppercase">
                  Collaboration matching
                </span>
              </div>
              <h3 className="font-serif text-2xl text-white mb-3">
                Find your counterparts
              </h3>
              <p className="text-sm text-white/70 leading-relaxed">
                The Continuum surfaces organizations working on adjacent
                geographies, taxa, or methods — so a herbarium in Quito and a
                ranger team in Loja can recognise their shared work.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 lg:px-10 pb-24">
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.04] p-10 text-center">
          <Trees className="h-6 w-6 text-emerald-300 mx-auto mb-4" />
          <h3 className="font-serif text-2xl md:text-3xl text-white max-w-2xl mx-auto leading-snug">
            Conservation does not happen in a single place. It happens in a
            network of careful, attentive practice.
          </h3>
          <p className="text-sm text-white/65 mt-4 max-w-xl mx-auto">
            To register your organization or open a project workspace, contact
            the Continuum stewardship team via Get Involved.
          </p>
        </div>
      </section>
    </PageShell>
  );
};

export default ConservationHub;
