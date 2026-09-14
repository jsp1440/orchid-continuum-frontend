import React from 'react';
import { Trees, ScrollText, HandHeart, Network, Workflow } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import PageShell from '@/components/orchid/PageShell';
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

const boundedGenus = (value: string | null): string | null => {
  const genus = value?.trim() ?? '';
  if (!genus || genus.length > 80) return null;
  return /^[A-Za-z][A-Za-z .'-]*$/.test(genus) ? genus : null;
};

const ConservationHub: React.FC = () => {
  const [searchParams] = useSearchParams();
  const genus = boundedGenus(searchParams.get('genus'));
  const fromAtlasEvidence = searchParams.get('origin') === 'atlas-next-occurrence-evidence';

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
      {fromAtlasEvidence && genus && (
        <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-10">
          <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.06] p-5 md:p-6">
            <div className="text-[10px] tracking-[0.28em] uppercase text-emerald-200/80">
              Atlas evidence handoff
            </div>
            <h2 className="mt-2 font-serif text-2xl text-white">
              Conservation context for <span className="italic text-emerald-200">{genus}</span>
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/70">
              You arrived from a selected Atlas occurrence. This workspace carries forward only the genus-level context; precise coordinates, locality, and occurrence identifiers remain in Atlas.
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/60">
              Use the organization, project, and protocol surfaces below to continue the conservation investigation without treating an incomplete record as evidence of absence.
            </p>
          </div>
        </section>
      )}

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
        <div
          data-testid="organization-directory-unavailable"
          className="rounded-2xl border border-white/10 bg-white/[0.02] p-8"
        >
          <h3 className="font-serif text-2xl text-white">
            No verified member organizations are published yet
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/70">
            Organization identities, locations, contacts, membership counts,
            agreements, and projects remain hidden until a governed backend
            record explicitly authorizes public display.
          </p>
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
        <div
          data-testid="project-directory-unavailable"
          className="rounded-2xl border border-white/10 bg-white/[0.02] p-8"
        >
          <h3 className="font-serif text-2xl text-white">
            No verified project workspaces are published yet
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/70">
            Project names, participants, locations, activity, and scientific
            claims appear only when supplied by a verified organization record
            with public-display authorization.
          </p>
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
                The Continuum can surface verified organizations working on
                adjacent geographies, taxa, or methods when their governed
                records explicitly permit public discovery.
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
