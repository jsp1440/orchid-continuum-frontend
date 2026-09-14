import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Dna,
  GraduationCap,
  Leaf,
  Microscope,
  Network,
  Sprout,
} from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';

const researchAreas = [
  {
    icon: Leaf,
    title: 'Orchid biology and conservation',
    body: 'Orchid ecology, cultivation, conservation practice, phenology, and the biological requirements connecting wild and cultivated plants.',
  },
  {
    icon: Dna,
    title: 'Taxonomy and biodiversity informatics',
    body: 'Canonical orchid identity, nomenclature, provenance, and integration of distributed biodiversity evidence into research-ready records.',
  },
  {
    icon: Sprout,
    title: 'Pollination and mycorrhizal ecology',
    body: 'Orchid pollination systems, reproductive biology, and the fungal relationships supporting orchid germination and persistence.',
  },
  {
    icon: Network,
    title: 'Evidence-grounded AI for science',
    body: 'Research tools that preserve sources, uncertainty, counterevidence, and human-review boundaries while helping researchers synthesize orchid evidence.',
  },
];

const ResearcherJefferyParham = () => {
  useEffect(() => {
    const previousTitle = document.title;
    const description =
      'Official Orchid Research Station profile for Jeffery Scott Parham, botanist, orchid researcher, Founder and Principal Developer of Orchid Continuum, and President of the Five Cities Orchid Society.';

    document.title =
      'Jeffery Scott Parham — Botanist & Orchid Researcher | Orchid Research Station';

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = meta?.getAttribute('content') ?? null;
    const createdMeta = !meta;

    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = description;

    const structuredData = document.createElement('script');
    structuredData.type = 'application/ld+json';
    structuredData.dataset.researcherProfile = 'jeffery-scott-parham';
    structuredData.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Jeffery Scott Parham',
      alternateName: 'Jeff Parham',
      jobTitle: 'Botanist and Orchid Researcher',
      description:
        'Founder and Principal Developer of Orchid Continuum and President of the Five Cities Orchid Society, working on orchid biology, conservation, taxonomy, pollination ecology, mycorrhizal associations, and biodiversity informatics.',
      affiliation: [
        { '@type': 'Organization', name: 'Orchid Continuum' },
        { '@type': 'Organization', name: 'Five Cities Orchid Society' },
      ],
      alumniOf: [
        { '@type': 'CollegeOrUniversity', name: 'University of California, Riverside' },
      ],
    });
    document.head.appendChild(structuredData);

    return () => {
      document.title = previousTitle;
      structuredData.remove();
      if (createdMeta) {
        meta?.remove();
      } else if (meta && previousDescription !== null) {
        meta.content = previousDescription;
      }
    };
  }, []);

  return (
    <div
      className="min-h-screen bg-[#04050d] text-[#f5f0e8]"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <style>{`
        .researcher-display { font-family: 'Playfair Display','Cormorant Garamond',Georgia,serif; }
        .researcher-mono { font-family: 'JetBrains Mono',ui-monospace,monospace; }
      `}</style>
      <Navbar />

      <main className="pt-28 pb-20">
        <section className="max-w-[1080px] mx-auto px-6 lg:px-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 researcher-mono text-[10px] tracking-[0.24em] uppercase text-[#cfc8b8]/55 hover:text-[#c9a24a] transition-colors mb-8"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Return to Continuum
          </Link>

          <div className="rounded-3xl border border-white/[0.08] bg-[#0a0d1c]/85 overflow-hidden">
            <div className="px-7 sm:px-10 lg:px-12 py-12 sm:py-16 border-b border-white/[0.08] bg-gradient-to-br from-[#10261b] via-[#0a1515] to-[#0a0d1c]">
              <div className="inline-flex items-center gap-2 researcher-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a] mb-6">
                <Microscope className="h-3.5 w-3.5" /> Orchid Research Station · Researcher Profile
              </div>
              <h1 className="researcher-display text-4xl sm:text-5xl lg:text-6xl leading-[1.02] tracking-[-0.015em] text-[#faf7f2]">
                Jeffery Scott Parham
              </h1>
              <p className="researcher-display mt-4 text-xl sm:text-2xl text-[#c9a24a]">
                Botanist · Orchid Researcher
              </p>
              <p className="mt-6 max-w-3xl text-[16px] sm:text-[17px] leading-8 text-[#cfc8b8]/82">
                Founder and Principal Developer of Orchid Continuum and President of the Five Cities Orchid Society. His work brings botanical training, orchid horticulture, conservation science, and biodiversity informatics together in a research environment designed specifically for Orchidaceae.
              </p>
              <div className="mt-7 inline-flex items-center rounded-full border border-[#c9a24a]/30 bg-[#c9a24a]/10 px-3 py-1.5 researcher-mono text-[9px] tracking-[0.16em] uppercase text-[#e5c56f]">
                Official Orchid Continuum Research Station profile
              </div>
            </div>

            <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-0">
              <article className="p-7 sm:p-10 lg:p-12 lg:border-r border-white/[0.08]">
                <div className="flex items-center gap-3 mb-6">
                  <BookOpen className="h-5 w-5 text-[#c9a24a]" />
                  <h2 className="researcher-display text-2xl text-[#faf7f2]">Research profile</h2>
                </div>
                <div className="space-y-5 text-[14px] sm:text-[15px] leading-7 text-[#cfc8b8]/78">
                  <p>
                    Parham’s work focuses on making orchid knowledge more usable without separating it from its evidence. Within Orchid Continuum, he is developing a connected scientific environment in which taxonomy, literature, occurrences, ecological relationships, images, living-collection records, and conservation evidence can be examined together rather than as isolated databases.
                  </p>
                  <p>
                    The Orchid Research Station is the research workspace for that effort. It supports source-preserving analysis, project records, evidence retrieval, and research workflows, while Calyx provides the evidence-grounded intelligence layer used across the wider Orchid Continuum.
                  </p>
                  <p>
                    Current work includes orchid ecology and cultivation questions, pollination and reproductive biology, orchid–fungal relationships, taxonomy and provenance, conservation intelligence, and methods for applying artificial intelligence to biodiversity research while retaining uncertainty, counterevidence, and human review.
                  </p>
                </div>
              </article>

              <aside className="p-7 sm:p-10 lg:p-12 bg-white/[0.015]">
                <div className="flex items-center gap-3 mb-6">
                  <GraduationCap className="h-5 w-5 text-[#c9a24a]" />
                  <h2 className="researcher-display text-2xl text-[#faf7f2]">Education & background</h2>
                </div>
                <dl className="space-y-6 text-[14px]">
                  <div>
                    <dt className="researcher-mono text-[9px] tracking-[0.2em] uppercase text-[#c9a24a]">Education</dt>
                    <dd className="mt-2 leading-7 text-[#f5f0e8]/90">
                      B.S., Biology<br />
                      M.A., Biology (Botany)<br />
                      M.S., Plant Pathology — University of California, Riverside
                    </dd>
                  </div>
                  <div>
                    <dt className="researcher-mono text-[9px] tracking-[0.2em] uppercase text-[#c9a24a]">Research experience</dt>
                    <dd className="mt-2 leading-6 text-[#cfc8b8]/75">
                      Previous research experience with the USDA Horticultural Crops Research Laboratory.
                    </dd>
                  </div>
                  <div>
                    <dt className="researcher-mono text-[9px] tracking-[0.2em] uppercase text-[#c9a24a]">Teaching</dt>
                    <dd className="mt-2 leading-6 text-[#cfc8b8]/75">
                      Previous teaching experience at National University and Fresno City College.
                    </dd>
                  </div>
                </dl>
              </aside>
            </div>
          </div>
        </section>

        <section className="max-w-[1080px] mx-auto px-6 lg:px-10 mt-12">
          <div className="researcher-mono text-[10px] tracking-[0.28em] uppercase text-[#c9a24a] mb-3">Research interests</div>
          <h2 className="researcher-display text-3xl sm:text-4xl text-[#faf7f2]">Current areas of investigation</h2>
          <div className="mt-8 grid sm:grid-cols-2 gap-5">
            {researchAreas.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-6">
                <div className="h-10 w-10 rounded-xl border border-white/[0.1] bg-white/[0.025] flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5 text-[#c9a24a]" />
                </div>
                <h3 className="researcher-display text-lg text-[#faf7f2]">{title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-[#cfc8b8]/72">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-[1080px] mx-auto px-6 lg:px-10 mt-12 grid md:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-7">
            <Building2 className="h-5 w-5 text-[#c9a24a] mb-4" />
            <h2 className="researcher-display text-xl text-[#faf7f2]">Orchid Continuum</h2>
            <p className="mt-3 text-[13px] leading-6 text-[#cfc8b8]/72">
              Orchid Continuum is a biodiversity-intelligence initiative for Orchidaceae that connects scientific evidence, conservation information, research workflows, and orchid-focused digital tools. The project operates with nonprofit fiscal sponsorship through Ecologistics, Inc.
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-7">
            <Microscope className="h-5 w-5 text-[#c9a24a] mb-4" />
            <h2 className="researcher-display text-xl text-[#faf7f2]">Orchid Research Station</h2>
            <p className="mt-3 text-[13px] leading-6 text-[#cfc8b8]/72">
              The Research Station is the Continuum’s scientific workspace for research projects, source archives, evidence synthesis, and analysis. Its member research workspace remains authenticated while this researcher profile is intentionally public.
            </p>
            <Link
              to="/research"
              className="mt-5 inline-flex researcher-mono text-[9px] tracking-[0.18em] uppercase text-[#c9a24a] hover:text-[#e5c56f]"
            >
              Research Station workspace →
            </Link>
          </div>
        </section>

        <section className="max-w-[1080px] mx-auto px-6 lg:px-10 mt-10">
          <div className="rounded-2xl border border-[#c9a24a]/20 bg-[#c9a24a]/[0.045] p-6 sm:p-7">
            <div className="researcher-mono text-[9px] tracking-[0.2em] uppercase text-[#c9a24a] mb-2">Verification note</div>
            <p className="max-w-4xl text-[12px] sm:text-[13px] leading-6 text-[#cfc8b8]/67">
              This page is maintained by Orchid Continuum as the official Research Station profile for Jeffery Scott Parham. It describes educational background, prior professional experience, current project roles, and research interests; it does not claim institutional appointments, publications, grants, or researcher identifiers that are not explicitly documented here.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default ResearcherJefferyParham;
