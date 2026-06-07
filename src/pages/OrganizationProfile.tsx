import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapPin, Globe2, Mail, Users2, FolderGit2 } from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';
import ProjectWorkspaceCard from '@/components/orchid/ProjectWorkspaceCard';
import RoleBadge from '@/components/orchid/RoleBadge';

/**
 * OrganizationProfile
 * -------------------
 * Public profile for a single organization. Shell only — populates from
 * `/api/organizations/:slug` once the backend is wired. Demo content
 * surfaces the organizational pattern so design review can proceed.
 */

const OrganizationProfile: React.FC = () => {
  const { slug = 'andean-orchid-trust' } = useParams();
  const display =
    slug
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || 'Organization';

  return (
    <PageShell
      eyebrow="Organizational profile"
      title={display}
      intro="A scientific organization within the Orchid Continuum. Below is the demo shell — the live profile loads from /api/organizations/:slug once the backend is connected."
      heroAside={
        <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/[0.05] p-5">
          <div className="text-[10px] tracking-[0.22em] uppercase text-emerald-200/90 mb-2">
            Profile status
          </div>
          <p className="text-sm text-white/85 leading-relaxed">
            Demo placeholder · awaiting{' '}
            <code className="text-emerald-200">/api/organizations/{slug}</code>
          </p>
          <div className="mt-3">
            <RoleBadge role="organization" size="sm" />
          </div>
        </div>
      }
    >
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <aside className="lg:col-span-4 space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7">
              <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-200/80 mb-3">
                About
              </div>
              <p className="text-sm text-white/75 leading-relaxed font-light">
                A field-active conservation organization focused on Andean
                cloud forest orchids and their pollinator communities. Works
                in partnership with eight reserve managers and two regional
                herbaria.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 space-y-3 text-sm">
              <div className="flex items-center gap-3 text-white/75">
                <MapPin className="h-4 w-4 text-emerald-300" /> Quito, Ecuador
              </div>
              <div className="flex items-center gap-3 text-white/75">
                <Globe2 className="h-4 w-4 text-emerald-300" />{' '}
                orchidcontinuum.org/org/{slug}
              </div>
              <div className="flex items-center gap-3 text-white/75">
                <Mail className="h-4 w-4 text-emerald-300" />{' '}
                steward@orchidcontinuum.org
              </div>
              <div className="flex items-center gap-3 text-white/75">
                <Users2 className="h-4 w-4 text-emerald-300" /> 412 members
              </div>
              <div className="flex items-center gap-3 text-white/75">
                <FolderGit2 className="h-4 w-4 text-emerald-300" /> 7 active
                projects
              </div>
            </div>

            <Link
              to="/conservation"
              className="block text-center text-sm text-emerald-200 hover:text-emerald-100 border border-emerald-300/30 rounded-full py-2.5"
            >
              Back to Conservation Hub
            </Link>
          </aside>

          <div className="lg:col-span-8 space-y-10">
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-emerald-200/80 mb-3">
                Active projects
              </div>
              <h2 className="font-serif text-2xl md:text-3xl text-white mb-6">
                Investigations led by this organization
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <ProjectWorkspaceCard
                  slug="high-andean-pollinator-pulse"
                  title="High-Andean Pollinator Pulse"
                  organization={display}
                  region="Cajamarca, Peru"
                  summary="Year-round monitoring of hummingbird and euglossine visitation at twelve Telipogon sites, paired with micro-climate loggers."
                  phase="Active fieldwork"
                  contributors={18}
                  lastActivity={new Date(
                    Date.now() - 86_400_000 * 2,
                  ).toISOString()}
                  openTo={['public', 'researcher']}
                  demo
                />
                <ProjectWorkspaceCard
                  slug="cloud-forest-corridor-atlas"
                  title="Cloud Forest Corridor Atlas"
                  organization={display}
                  region="Eastern Andes"
                  summary="Mapping forest fragmentation against orchid sighting density to identify priority reconnection zones."
                  phase="Analysis"
                  contributors={9}
                  lastActivity={new Date(
                    Date.now() - 86_400_000 * 6,
                  ).toISOString()}
                  openTo={['researcher', 'organization']}
                  demo
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
              <div className="text-[10px] tracking-[0.3em] uppercase text-emerald-200/80 mb-3">
                Team
              </div>
              <h2 className="font-serif text-2xl text-white mb-5">
                Roster placeholder
              </h2>
              <p className="text-sm text-white/70 leading-relaxed mb-4">
                Roles for principal investigators, field coordinators,
                volunteers, and data stewards will surface here when the
                organization endpoint comes online. Each role is described in
                plain language — never as raw permission strings.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <RoleBadge role="organization" size="sm" />
                <RoleBadge role="researcher" size="sm" />
                <RoleBadge role="public" size="sm" />
                <RoleBadge role="admin" size="sm" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
};

export default OrganizationProfile;
