import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  GraduationCap,
  Microscope,
  Network,
} from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';

const education = [
  {
    degree: 'M.S., Plant Pathology',
    institution: 'University of California, Riverside',
  },
  {
    degree: 'M.A., Biology (Biotechnology)',
    institution: 'California State University, Fresno',
  },
  {
    degree: 'B.A., Biology',
    institution: 'California State University, Fresno',
  },
];

const researchAreas = [
  'Orchidaceae biodiversity informatics',
  'Plant pathology, mycology, and plant–microbe interactions',
  'Pollination and mycorrhizal ecology',
  'Species occurrence, habitat, climate, and conservation intelligence',
  'Scientific literature integration and evidence provenance',
  'Living collections, cultivation records, and field observations',
];

const ResearcherJefferyParham: React.FC = () => {
  useEffect(() => {
    const previousTitle = document.title;
    const description =
      'Jeffery Parham — plant scientist, educator, and Founder & Scientific Lead of the Orchid Continuum biodiversity and conservation initiative.';

    document.title = 'Jeffery Parham — Researcher | Orchid Continuum';

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = meta?.content ?? null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = description;

    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== null) meta.content = previousDescription;
    };
  }, []);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Jeffery Scott Parham',
    alternateName: 'Jeff Parham',
    jobTitle: 'Founder & Scientific Lead',
    affiliation: {
      '@type': 'Organization',
      name: 'Orchid Continuum',
      url: 'https://orchidcontinuum.org',
    },
    alumniOf: [
      {
        '@type': 'CollegeOrUniversity',
        name: 'University of California, Riverside',
      },
      {
        '@type': 'CollegeOrUniversity',
        name: 'California State University, Fresno',
      },
    ],
    knowsAbout: researchAreas,
    sameAs: [
      'https://orchidcontinuum.org',
      'https://ecologistics.org/fiscal-sponsorship/sponsored-organizations/',
    ],
  };

  return (
    <div
      className="min-h-screen bg-[#04050d] text-[#f5f0e8]"
      style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <style>{`
        .font-display { font-family: 'Playfair Display','Cormorant Garamond',Georgia,serif; }
        .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
      `}</style>

      <Navbar />

      <main className="pt-28 pb-20">
        <section className="max-w-[980px] mx-auto px-6 lg:px-10">
          <Link
            to="/about"
            className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase text-[#cfc8b8]/55 hover:text-[#c9a24a] transition-colors mb-8"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> About the Continuum
          </Link>

          <div className="font-mono text-[10px] tracking-[0.36em] uppercase text-[#c9a24a]/85 mb-3">
            Researcher profile
          </div>
          <h1
            className="font-display leading-[0.95] tracking-[-0.012em]"
            style={{ fontSize: 'clamp(2.4rem, 6vw, 4.6rem)' }}
          >
            Jeffery <span className="italic text-[#c9a24a]">Parham</span>
          </h1>
          <p className="mt-4 font-mono text-[11px] tracking-[0.18em] uppercase text-[#cfc8b8]/65">
            Founder & Scientific Lead · Orchid Continuum
          </p>

          <div className="mt-8 max-w-3xl space-y-4 text-[15px] leading-relaxed text-[#d8d1c2]/82">
            <p>
              Jeffery Parham is a plant scientist, biology educator, and founder of the Orchid Continuum,
              an independent biodiversity and conservation initiative focused on Orchidaceae and the ecological
              relationships that sustain orchid populations.
            </p>
            <p>
              His academic training spans biology, biotechnology, and plant pathology. His research background
              includes plant pathology, mycology, virology, postharvest citrus pathology research with the U.S.
              Department of Agriculture, and graduate research on transposon mutagenesis of
              <em> Pseudomonas cepacia</em> and the pyrrolnitrin antifungal pathway. He presented research at a
              plant pathology congress in Montreal in 1994.
            </p>
            <p>
              He has taught biology and plant sciences, including botany, plant physiology, and plant pathology,
              at university and other educational levels. His current work applies that background to biodiversity
              informatics, orchid ecology, conservation, scientific evidence integration, living collections, and
              field documentation through the Orchid Continuum.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-5">
            <section className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-6">
              <div className="flex items-center gap-3 mb-5">
                <GraduationCap className="h-6 w-6 text-[#c9a24a]" />
                <h2 className="font-display text-xl text-[#faf7f2]">Education</h2>
              </div>
              <div className="space-y-5">
                {education.map((item) => (
                  <div key={item.degree}>
                    <div className="text-[14px] font-medium text-[#f4efe6]">{item.degree}</div>
                    <div className="mt-1 text-[13px] leading-relaxed text-[#cfc8b8]/68">
                      {item.institution}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-6">
              <div className="flex items-center gap-3 mb-5">
                <Microscope className="h-6 w-6 text-[#c9a24a]" />
                <h2 className="font-display text-xl text-[#faf7f2]">Research focus</h2>
              </div>
              <ul className="space-y-2.5 text-[13px] leading-relaxed text-[#cfc8b8]/74">
                {researchAreas.map((area) => (
                  <li key={area} className="flex gap-3">
                    <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-[#c9a24a]" />
                    <span>{area}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="mt-5 rounded-2xl border border-white/[0.08] bg-[#0a0d1c]/70 p-6 md:p-8">
            <div className="flex items-center gap-3 mb-4">
              <Network className="h-6 w-6 text-[#c9a24a]" />
              <h2 className="font-display text-xl text-[#faf7f2]">Current scientific work</h2>
            </div>
            <p className="max-w-3xl text-[14px] leading-relaxed text-[#cfc8b8]/76">
              The Orchid Continuum is being developed as a connected research and conservation system spanning
              orchid taxonomy, species occurrences, habitat and climate, pollinators, mycorrhizal fungi,
              conservation evidence, scientific literature, images, living collections, and field observations.
              Current components include the Living Atlas, Research Station, Conservatory, and Calyx scientific
              reasoning layer.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="https://orchidcontinuum.org"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-[#c9a24a]/40 px-4 py-2 text-[12px] text-[#e7d39a] hover:border-[#c9a24a]/70 hover:bg-[#c9a24a]/5 transition-colors"
              >
                <BookOpen className="h-4 w-4" /> Orchid Continuum <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href="https://ecologistics.org/fiscal-sponsorship/sponsored-organizations/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] px-4 py-2 text-[12px] text-[#cfc8b8]/80 hover:border-white/[0.24] hover:text-[#f5f0e8] transition-colors"
              >
                Ecologistics fiscal sponsorship <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </section>

          <p className="mt-10 max-w-3xl text-[12px] leading-relaxed text-[#8f897c]">
            The Orchid Continuum is an independent biodiversity and conservation initiative fiscally sponsored by
            Ecologistics, a 501(c)(3) nonprofit organization.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default ResearcherJefferyParham;
