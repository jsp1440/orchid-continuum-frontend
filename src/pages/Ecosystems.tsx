import React from 'react';
import {
  Compass,
  Sprout,
  GraduationCap,
  Presentation,
  Microscope,
  Trees,
  Users,
} from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';
import EcosystemCard from '@/components/orchid/EcosystemCard';

/**
 * Ecosystems
 * ----------
 * "Who is the Continuum for?"
 *
 * The conceptual entry point that lets every visitor recognize
 * themselves in the platform. Each card opens onto the appropriate
 * module — but the *framing* is the contribution: a single living
 * platform that supports public exploration, growers, students,
 * teachers, researchers, conservation organizations, and societies
 * as a community of practice.
 */
const Ecosystems: React.FC = () => {
  return (
    <PageShell
      eyebrow="Communities of practice"
      title="One living platform,"
      titleAccent="seven ways to belong"
      intro="The Orchid Continuum is more than a database — it is a shared scientific commons. Whether you are tending a single Phalaenopsis on a windowsill or coordinating a transboundary conservation initiative, there is a doorway here that opens onto your work."
    >
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <EcosystemCard
            role="public"
            Icon={Compass}
            headline="The curious explorer"
            description="Wander the Atlas, follow the Orchid of the Day, and trace species across continents. No login required — the living catalogue is open."
            capabilities={[
              'Atlas of documented sightings',
              'Galleries by country, genus, habitat, pollinator',
              'Conservation stories and short videos',
              'Plain-language species profiles',
            ]}
            route="/explore"
            secondaryRoute={{ label: 'Open the Atlas', route: '/atlas' }}
          />

          <EcosystemCard
            role="grower"
            Icon={Sprout}
            headline="The orchid grower"
            description="Keep a living record of every plant in your care — bloom timelines, photo journals, climate readings, and cultivation notes — supported by the OACS environmental dashboard."
            capabilities={[
              'Personal plant inventory and photo timeline',
              'Bloom history, journals, and care calendar',
              'OACS environmental intelligence and alerts',
              'Diagnostic guidance and grow-space profiles',
            ]}
            route="/collection"
            secondaryRoute={{ label: 'Explore OACS', route: '/oacs' }}
          />

          <EcosystemCard
            role="student"
            Icon={GraduationCap}
            headline="The student"
            description="Walk through real scientific inquiry — formulate questions, design observations, build evidence, and present findings — using the Continuum's living catalogue as your laboratory."
            capabilities={[
              'Orchid University guided investigations',
              'Science-fair workspaces and rubrics',
              'Glossary tooltips on every page',
              'Hypothesis → method → evidence templates',
            ]}
            route="/university"
            secondaryRoute={{ label: 'Open the glossary', route: '/education' }}
          />

          <EcosystemCard
            role="teacher"
            Icon={Presentation}
            headline="The teacher"
            description="Run real biology investigations from your classroom. Assign Atlas explorations, track student progress, and export materials aligned with your curriculum."
            capabilities={[
              'Classroom dashboards and rosters',
              'Assignable investigations and rubrics',
              'Student project tracking',
              'Exportable lesson and assessment materials',
            ]}
            route="/classroom"
            secondaryRoute={{
              label: 'Visit Orchid University',
              route: '/university',
            }}
          />

          <EcosystemCard
            role="researcher"
            Icon={Microscope}
            headline="The researcher"
            description="Pose ecological questions across the entire Continuum. Build queries, analyse traits, traverse ecological networks, and export reproducible datasets with full provenance."
            capabilities={[
              'Trait explorer and query builder',
              'Ecological interaction networks',
              'Citable, reproducible exports (DOI-ready)',
              'Literature and evidence linking',
            ]}
            route="/research"
            secondaryRoute={{ label: 'Browse Species', route: '/species' }}
          />

          <EcosystemCard
            role="organization"
            Icon={Trees}
            headline="The conservation organization"
            description="Coordinate landscape-scale work. Stand up project workspaces, share field protocols, recruit volunteers, and surface your impact through your organizational profile."
            capabilities={[
              'Project workspaces and field protocols',
              'Volunteer coordination and role assignment',
              'Organizational profile and impact reporting',
              'Cross-organization collaboration matching',
            ]}
            route="/conservation"
            secondaryRoute={{ label: 'See partners', route: '/partners' }}
          />

          <EcosystemCard
            role="society"
            Icon={Users}
            headline="The orchid society"
            description="Bring your members together around shared knowledge. Run events, publish newsletters, organize show judging, and connect your community to the wider Continuum."
            capabilities={[
              'Event management and member rosters',
              'Newsletter and announcement composer',
              'Show judging and exhibition tools',
              'Embeddable Continuum widgets for chapter sites',
            ]}
            route="/societies"
            secondaryRoute={{ label: 'Browse widgets', route: '/widgets' }}
          />
        </div>

        <div className="mt-20 rounded-2xl border border-white/10 bg-white/[0.02] p-8 md:p-10">
          <div className="text-[10px] tracking-[0.3em] uppercase text-emerald-200/80 mb-3">
            Role-aware, never role-locked
          </div>
          <h3 className="font-serif text-2xl md:text-3xl text-white leading-snug max-w-3xl">
            One person can wear many hats — a teacher who is also a grower, a
            researcher who volunteers with a society. The Continuum recognizes
            that, and lets each role illuminate a different facet of the
            same living catalogue.
          </h3>
        </div>
      </section>
    </PageShell>
  );
};

export default Ecosystems;
