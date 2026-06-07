import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Activity,
  ScrollText,
  Users2,
  CalendarDays,
  Camera,
  MessageSquare,
  Workflow,
} from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';
import RoleBadge from '@/components/orchid/RoleBadge';
import EducationalOverlay from '@/components/orchid/EducationalOverlay';
import GlossaryTerm from '@/components/orchid/GlossaryTerm';

/**
 * ProjectWorkspace
 * ----------------
 * The collaborative surface for a single conservation, research, or
 * citizen-science project. This is the conceptual UI architecture only;
 * the live workspace will be hydrated from `/api/projects/:slug` and the
 * associated `documented_sightings`, `protocols`, and `contributors`
 * endpoints.
 */

const tabs = [
  { id: 'overview', label: 'Overview', Icon: Activity },
  { id: 'sightings', label: 'Documented sightings', Icon: Camera },
  { id: 'protocols', label: 'Protocols', Icon: ScrollText },
  { id: 'team', label: 'Team', Icon: Users2 },
  { id: 'discussion', label: 'Discussion', Icon: MessageSquare },
] as const;

type TabId = (typeof tabs)[number]['id'];

const ProjectWorkspace: React.FC = () => {
  const { slug = 'high-andean-pollinator-pulse' } = useParams();
  const [tab, setTab] = useState<TabId>('overview');

  const display = slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <PageShell
      eyebrow="Project workspace"
      title={display}
      intro="A living investigation. Documented sightings, shared protocols, contributors, and a public record of what the project has learned so far."
      heroAside={
        <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/[0.05] p-5">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-emerald-200/90 mb-2">
            <Activity className="h-3 w-3" /> Active fieldwork
          </div>
          <p className="text-sm text-white/85 leading-relaxed">
            Open to public observers, researchers, and partner organizations.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <RoleBadge role="public" size="sm" />
            <RoleBadge role="researcher" size="sm" />
            <RoleBadge role="organization" size="sm" />
          </div>
        </div>
      }
    >
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-12">
        {/* Tab strip */}
        <div className="border-b border-white/10 mb-10 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {tabs.map(t => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={
                    'inline-flex items-center gap-2 px-4 py-3 text-sm tracking-wide transition-colors border-b-2 -mb-px ' +
                    (active
                      ? 'border-emerald-300 text-emerald-200'
                      : 'border-transparent text-white/65 hover:text-emerald-200')
                  }
                >
                  <t.Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
                <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-200/80 mb-3">
                  Project summary
                </div>
                <p className="text-base text-white/85 leading-relaxed font-light">
                  Year-round monitoring of hummingbird and euglossine
                  visitation at twelve Telipogon sites along the eastern
                  Andean slope. Field teams record visitation events with
                  photo-vouchering, paired with micro-climate loggers and
                  AI-assisted image triage from Orchid Zoo reviewers.
                </p>
                <p className="text-sm text-white/65 leading-relaxed mt-4">
                  Outcomes will inform site-level conservation
                  recommendations and contribute open{' '}
                  <GlossaryTerm
                    term="Documented sighting"
                    definition="An observation of an orchid in the wild — paired with a photograph, location, and date — that can be verified by another observer or curator."
                  >
                    documented sightings
                  </GlossaryTerm>{' '}
                  to the Continuum atlas.
                </p>
              </div>

              <EducationalOverlay
                defaultOpen
                title="What makes a project workspace different from a folder?"
                body={
                  <>
                    A workspace is alive. Each new sighting, protocol revision,
                    or analysis updates a public ledger of how the
                    investigation is progressing — and credit returns
                    automatically to the people doing the work.
                  </>
                }
              />
            </div>

            <aside className="lg:col-span-4 space-y-5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-200/80 mb-4">
                  At a glance
                </div>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-center justify-between text-white/75">
                    <span className="inline-flex items-center gap-2">
                      <Camera className="h-4 w-4 text-emerald-300" />
                      Documented sightings
                    </span>
                    <span className="text-white/90">412</span>
                  </li>
                  <li className="flex items-center justify-between text-white/75">
                    <span className="inline-flex items-center gap-2">
                      <Users2 className="h-4 w-4 text-emerald-300" />
                      Contributors
                    </span>
                    <span className="text-white/90">18</span>
                  </li>
                  <li className="flex items-center justify-between text-white/75">
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-emerald-300" />
                      Last activity
                    </span>
                    <span className="text-white/90">2 days ago</span>
                  </li>
                  <li className="flex items-center justify-between text-white/75">
                    <span className="inline-flex items-center gap-2">
                      <Workflow className="h-4 w-4 text-emerald-300" />
                      Protocols in use
                    </span>
                    <span className="text-white/90">4</span>
                  </li>
                </ul>
              </div>

              <Link
                to="/conservation"
                className="block text-center text-sm text-emerald-200 hover:text-emerald-100 border border-emerald-300/30 rounded-full py-2.5"
              >
                Back to Conservation Hub
              </Link>
            </aside>
          </div>
        )}

        {tab === 'sightings' && (
          <PlaceholderPanel
            title="Documented sightings will surface here"
            body="Photo-vouchered observations from the project area, queued through Orchid Zoo for citizen review and expert verification before entering the public Atlas."
          />
        )}

        {tab === 'protocols' && (
          <PlaceholderPanel
            title="Shared field & laboratory protocols"
            body="Versioned methods that travel between teams. Each protocol carries its author, license, and revision history — so reproducibility is built in, not bolted on."
          />
        )}

        {tab === 'team' && (
          <PlaceholderPanel
            title="Contributors & roles"
            body="Principal investigators, field coordinators, paraecologists, and volunteer photographers — described in plain language, not raw permission strings."
          />
        )}

        {tab === 'discussion' && (
          <PlaceholderPanel
            title="A scientific notebook in the open"
            body="Threaded discussion attached to specific sightings, protocols, or analyses. The conversation that produces a finding is part of the finding."
          />
        )}
      </section>
    </PageShell>
  );
};

const PlaceholderPanel: React.FC<{ title: string; body: string }> = ({
  title,
  body,
}) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
    <span className="inline-block text-[9px] tracking-[0.22em] uppercase text-amber-200/80 border border-amber-200/30 rounded-full px-2 py-0.5 mb-4">
      Demo · awaiting backend
    </span>
    <h3 className="font-serif text-2xl text-white max-w-2xl mx-auto leading-snug mb-3">
      {title}
    </h3>
    <p className="text-sm text-white/65 max-w-xl mx-auto leading-relaxed">
      {body}
    </p>
  </div>
);

export default ProjectWorkspace;
