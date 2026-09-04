import React from 'react';
import { Link } from 'react-router-dom';
import {
  Beaker,
  BookOpen,
  Database,
  GraduationCap,
  Leaf,
  Microscope,
  Network,
  ShieldCheck,
} from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';

const researchAreas = [
  {
    icon: Database,
    title: 'Biodiversity informatics',
    body: 'Integrating orchid taxonomy, images, geography, ecology, literature, and conservation data into a provenance-aware research platform.',
  },
  {
    icon: Network,
    title: 'Ecological interactions',
    body: 'Investigating pollination biology, mycorrhizal associations, habitat context, and interaction networks across Orchidaceae.',
  },
  {
    icon: BookOpen,
    title: 'Scientific literature synthesis',
    body: 'Connecting reviewable source evidence to research questions, methods, observations, hypotheses, and conservation decisions.',
  },
  {
    icon: Leaf,
    title: 'Conservation research',
    body: 'Developing tools that make fragmented orchid biodiversity evidence more accessible for conservation assessment and stewardship.',
  },
] as const;

const ResearchStationPublic: React.FC = () => (
  <PageShell
    eyebrow="Orchid Continuum Research Station"
    title="Scientific research for a family of extraordinary plants."
    titleAccent="Led by Jeffery Scott Parham, M.S."
    intro="The Orchid Continuum Research Station is the public scientific research program of Orchid Continuum, an independent orchid biodiversity initiative integrating taxonomy, ecology, conservation, literature, images, and data systems into a provenance-aware research environment."
    heroAside={
      <div className="rounded-2xl border border-emerald-300/30 bg-emerald-300/5 p-5">
        <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-emerald-300/80">
          <Microscope className="h-3 w-3" /> Scientific lead
        </div>
        <p className="font-serif text-xl text-white">Jeffery Scott Parham, M.S.</p>
        <p className="mt-1 text-sm text-white/65">Founder & Scientific Lead · PI-equivalent research lead</p>
        <p className="mt-4 text-xs leading-6 text-white/60">
          Plant scientist and educator with graduate training in plant pathology and biology, prior university teaching, USDA research experience, and long-term orchid research and cultivation work.
        </p>
      </div>
    }
  >
    <section className="py-14">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 lg:grid-cols-[1.25fr_0.75fr] lg:px-10">
        <div className="rounded-2xl border border-white/10 bg-[#142a1f] p-6 md:p-8">
          <div className="mb-3 text-[10px] uppercase tracking-[0.25em] text-emerald-300/70">About Orchid Continuum</div>
          <h2 className="font-serif text-3xl md:text-4xl">A connected research environment for Orchidaceae.</h2>
          <p className="mt-5 text-sm leading-7 text-white/65">
            Orchid Continuum is an independent biodiversity research, conservation, and education initiative focused on Orchidaceae. The platform is being built to connect taxonomic identity, morphology, distribution, ecological interactions, scientific literature, conservation evidence, cultivation knowledge, and image-derived data so that researchers, educators, conservation practitioners, and orchid communities can work from traceable evidence rather than disconnected sources.
          </p>
          <p className="mt-4 text-sm leading-7 text-white/65">
            The Research Station is the investigative layer of that system: a place to frame questions, assemble evidence, preserve provenance, identify disagreement and uncertainty, and move from observations toward reviewable scientific synthesis without treating generated interpretation as canonical biological truth.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0d1f17] p-6 md:p-8">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-emerald-300/70">
            <GraduationCap className="h-4 w-4" /> Scientific background
          </div>
          <ul className="space-y-3 text-sm leading-6 text-white/65">
            <li>M.S. Plant Pathology — University of California, Riverside</li>
            <li>M.A. Biology (Biotechnology) — California State University, Fresno</li>
            <li>B.A. Biology — California State University, Fresno</li>
            <li>Training in plant pathology, mycology, virology, molecular biology, ecology, and botany</li>
            <li>Prior teaching in botany, plant physiology, plant pathology, and biology</li>
            <li>USDA research experience in postharvest citrus pathology</li>
            <li>Orchid research experience including asymbiotic germination, tissue culture, and experimental propagation</li>
          </ul>
        </div>
      </div>
    </section>

    <section className="pb-14">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="mb-8">
          <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-emerald-300/70">Research program</div>
          <h2 className="font-serif text-3xl md:text-4xl">Current areas of investigation and infrastructure.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {researchAreas.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-[#142a1f] p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-serif text-xl">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/60">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="border-y border-white/5 bg-[#0a1812] py-14">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="mb-8 flex items-center gap-3">
          <Beaker className="h-5 w-5 text-emerald-200" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-emerald-300/70">Research & grant projects</div>
            <h2 className="font-serif text-3xl md:text-4xl">Projects in development.</h2>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-white/10 bg-[#142a1f] p-6 md:p-7">
            <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-amber-200/80">Grant proposal in development · 12-month project</div>
            <h3 className="font-serif text-2xl">Developing an Image-Based Data Integration Framework to Support Orchid Conservation</h3>
            <p className="mt-4 text-sm leading-7 text-white/65">
              This proposal develops a framework for linking orchid images with taxonomic, geographic, and ecological data so that large volumes of unstructured image records can contribute to organized biodiversity datasets and future conservation research.
            </p>
            <p className="mt-3 text-sm leading-7 text-white/65">
              Planned work includes image-dataset compilation, workflows linking imagery to taxonomy and geography, metadata organization, biodiversity-dataset integration, and structured retrieval within Orchid Continuum. The current proposal requests $10,000 and is framed as research-infrastructure development rather than hypothesis-driven biological analysis.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-[#142a1f] p-6 md:p-7">
            <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-amber-200/80">2026 conservation & education grant proposal</div>
            <h3 className="font-serif text-2xl">Orchid Botanical Glossary: A Free Illustrated Reference for Orchid Conservation Education</h3>
            <p className="mt-4 text-sm leading-7 text-white/65">
              This proposal would create 200 illustrated orchid botanical glossary entries covering morphology, growth habits, root types, inflorescence forms, and habitat terminology. The completed entries are intended for free publication through Orchid Continuum, downloadable offline use, and Creative Commons Attribution redistribution.
            </p>
            <p className="mt-3 text-sm leading-7 text-white/65">
              The proposal requests $1,000 from the New Hampshire Orchid Society. Funds would support scientific-illustration and AI-assisted prompt-generation platforms together with curation, botanical accuracy review, glossary integration, and PDF production. Ecologistics, Inc. is identified in the application as fiscal sponsor and administrator of grant funds for the Orchid Continuum initiative.
            </p>
          </article>
        </div>
      </div>
    </section>

    <section className="py-14">
      <div className="mx-auto grid max-w-7xl gap-6 px-6 lg:grid-cols-2 lg:px-10">
        <div className="rounded-2xl border border-white/10 bg-[#142a1f] p-6 md:p-8">
          <div className="mb-3 text-[10px] uppercase tracking-[0.25em] text-emerald-300/70">Research practice</div>
          <h2 className="font-serif text-2xl md:text-3xl">Evidence first, with explicit uncertainty.</h2>
          <p className="mt-4 text-sm leading-7 text-white/65">
            Orchid Continuum is designed to keep source evidence, derived interpretation, candidate knowledge, and canonical scientific state distinct. Missing evidence is not treated as biological absence; generated synthesis is not treated as publication; and high-consequence scientific or locality-sensitive actions remain review-gated.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.05] p-6 md:p-8">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-emerald-300/75">
            <ShieldCheck className="h-4 w-4" /> Public research identity
          </div>
          <p className="text-sm leading-7 text-white/70">
            Jeffery Scott Parham serves as Founder & Scientific Lead of the Orchid Continuum Research Station and leads its scientific direction, research-platform development, conservation-data integration, and educational research initiatives.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/research" className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-xs text-emerald-100 hover:bg-emerald-300/15">
              Enter the Research Center
            </Link>
            <Link to="/about" className="rounded-full border border-white/15 px-4 py-2 text-xs text-white/70 hover:border-white/30">
              About Orchid Continuum
            </Link>
          </div>
        </div>
      </div>
    </section>
  </PageShell>
);

export default ResearchStationPublic;
