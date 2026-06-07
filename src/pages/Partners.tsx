import React from 'react';
import {
  ExternalLink,
  Camera,
  GraduationCap,
  Cpu,
  Database,
  ShieldCheck,
  Mail,
  ArrowRight,
} from 'lucide-react';
import PageShell from '@/components/orchid/PageShell';
import PhotoDonationForm from '@/components/orchid/PhotoDonationForm';


/**
 * Partners & Acknowledgements
 *
 * Recognizes the individual advisers, supporters, photograph donors,
 * technology partners, linked data resources, and the fiscal sponsor
 * that make the Orchid Continuum possible.
 *
 * Design system:
 *   hero ground   forest green  #1a2e1a
 *   card sections navy          #0d2535
 *   accent / head gold          #C9A84C
 *   body text     parchment     #f5f0e8  (>= 17px, line-height 1.75)
 */

const GOLD = '#C9A84C';
const PARCHMENT = '#f5f0e8';
const NAVY = '#0d2535';

interface Person {
  name: string;
  role: string;
  description?: string;
}

const PEOPLE: Person[] = [
  {
    name: 'Jen Hammock',
    role: 'Adviser · Encyclopedia of Life / Smithsonian Institution',
    description:
      'Expert guidance on biodiversity informatics and open knowledge infrastructure.',
  },
  {
    name: 'Dr. Karen Kolba',
    role: 'Scientific adviser and supporter',
  },
  {
    name: 'Gary Yong Gee',
    role: 'Photograph donor and taxonomy contributor · Australia',
    description:
      'Donated orchid photographs and taxonomic expertise directly enriching the Orchid Continuum image library.',
  },
  {
    name: 'Roberta Fox',
    role: 'Adviser and orchid photograph donor',
    description:
      'Contributed verified species images to the Orchid Continuum approved image library.',
  },
  {
    name: 'Michelle Ralston',
    role: 'Adviser and supporter',
  },
  {
    name: 'Dr. Michael Hassler',
    role: 'Taxonomy resource · WorldPlants',
    description:
      'Source of authoritative orchid taxonomy integrated into the Orchid Continuum backbone.',
  },
  {
    name: 'Stacy Hunt',
    role: 'COO · Ecologistics',
    description:
      'Guidance and support through the fiscal sponsorship relationship.',
  },
];

const bodyStyle: React.CSSProperties = {
  color: PARCHMENT,
  fontSize: '17px',
  lineHeight: 1.75,
};

const headingStyle: React.CSSProperties = {
  color: GOLD,
  fontSize: '32px',
  fontWeight: 700,
  lineHeight: 1.2,
};

const PersonCard: React.FC<{ person: Person }> = ({ person }) => (
  <div
    className="rounded-2xl p-6 border transition-colors hover:border-[#C9A84C]/60"
    style={{ backgroundColor: NAVY, borderColor: 'rgba(201,168,76,0.2)' }}
  >
    <div className="flex items-start gap-3">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{
          backgroundColor: 'rgba(201,168,76,0.12)',
          border: '1px solid rgba(201,168,76,0.3)',
          color: GOLD,
        }}
      >
        <GraduationCap className="h-5 w-5" />
      </div>
      <div>
        <div
          className="font-serif"
          style={{ color: PARCHMENT, fontSize: '22px', fontWeight: 600 }}
        >
          {person.name}
        </div>
        <div
          className="mt-1"
          style={{ color: GOLD, fontSize: '14px', lineHeight: 1.5 }}
        >
          {person.role}
        </div>
      </div>
    </div>
    {person.description && (
      <p className="mt-4" style={bodyStyle}>
        {person.description}
      </p>
    )}
  </div>
);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="font-mono mb-4"
    style={{
      color: GOLD,
      fontSize: '11px',
      letterSpacing: '0.25em',
      textTransform: 'uppercase',
    }}
  >
    {children}
  </div>
);

const Partners: React.FC = () => {
  return (
    <PageShell
      eyebrow="Partners & Acknowledgements"
      title="Partners &"
      titleAccent="Acknowledgements"
      intro="The Orchid Continuum is built on a foundation of scientific generosity — advisers, photograph donors, technology partners, and the institutions that make open biodiversity infrastructure possible."
      showDemoBanner={false}
    >
      {/* Hero ground tint */}
      <div style={{ backgroundColor: '#1a2e1a' }}>
        {/* SECTION 1 — Individual advisers & supporters */}
        <section className="py-16" style={{ backgroundColor: '#1a2e1a' }}>
          <div className="max-w-7xl mx-auto px-6 lg:px-10">
            <SectionLabel>Individual Advisers &amp; Supporters</SectionLabel>
            <h2 className="font-serif" style={headingStyle}>
              The people who made this possible.
            </h2>
            <p className="mt-4 max-w-2xl" style={bodyStyle}>
              The Orchid Continuum is built on a foundation of scientific
              generosity.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-10">
              {PEOPLE.map((p) => (
                <PersonCard key={p.name} person={p} />
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 2 — Technology partners */}
        <section className="py-16" style={{ backgroundColor: '#152515' }}>
          <div className="max-w-7xl mx-auto px-6 lg:px-10">
            <SectionLabel>Technology Partners</SectionLabel>
            <h2 className="font-serif" style={headingStyle}>
              Technology partners.
            </h2>

            <div className="mt-10 max-w-3xl">
              <div
                className="rounded-2xl p-6 border"
                style={{
                  backgroundColor: NAVY,
                  borderColor: 'rgba(201,168,76,0.2)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: 'rgba(201,168,76,0.12)',
                      border: '1px solid rgba(201,168,76,0.3)',
                      color: GOLD,
                    }}
                  >
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                    <div
                      className="font-serif"
                      style={{ color: PARCHMENT, fontSize: '22px', fontWeight: 600 }}
                    >
                      Innoquest
                    </div>
                    <p className="mt-2" style={bodyStyle}>
                      Provided a Quantum PAR light meter for integration and
                      environmental research with OASIS, the Orchid Adaptive
                      Sensing and Intelligence System.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3 — Linked data resources */}
        <section className="py-16" style={{ backgroundColor: '#1a2e1a' }}>
          <div className="max-w-7xl mx-auto px-6 lg:px-10">
            <SectionLabel>Linked Data Resources</SectionLabel>
            <h2 className="font-serif" style={headingStyle}>
              Data resources we link to and learn from.
            </h2>

            <div className="mt-10 max-w-3xl">
              <div
                className="rounded-2xl p-6 border"
                style={{
                  backgroundColor: NAVY,
                  borderColor: 'rgba(201,168,76,0.2)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: 'rgba(201,168,76,0.12)',
                      border: '1px solid rgba(201,168,76,0.3)',
                      color: GOLD,
                    }}
                  >
                    <Database className="h-5 w-5" />
                  </div>
                  <div>
                    <div
                      className="font-serif"
                      style={{ color: PARCHMENT, fontSize: '22px', fontWeight: 600 }}
                    >
                      IOSPE
                    </div>
                    <p className="mt-2" style={bodyStyle}>
                      International Orchid Species Photo Encyclopedia, maintained
                      by Jay Pfahl. A foundational reference resource for orchid
                      species photography.
                    </p>
                    <a
                      href="https://www.iospe.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-4 hover:underline"
                      style={{ color: GOLD, fontSize: '15px' }}
                    >
                      iospe.com <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4 — Fiscal sponsor */}
        <section className="py-16" style={{ backgroundColor: '#152515' }}>
          <div className="max-w-7xl mx-auto px-6 lg:px-10">
            <SectionLabel>Fiscal Sponsor</SectionLabel>
            <h2 className="font-serif" style={headingStyle}>
              Fiscal sponsor.
            </h2>

            <div className="mt-10 max-w-3xl">
              <div
                className="rounded-2xl p-6 border"
                style={{
                  backgroundColor: NAVY,
                  borderColor: 'rgba(201,168,76,0.2)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: 'rgba(201,168,76,0.12)',
                      border: '1px solid rgba(201,168,76,0.3)',
                      color: GOLD,
                    }}
                  >
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div
                      className="font-serif"
                      style={{ color: PARCHMENT, fontSize: '22px', fontWeight: 600 }}
                    >
                      Ecologistics, Inc.
                    </div>
                    <p className="mt-2" style={bodyStyle}>
                      501(c)(3) fiscal sponsor of the Orchid Continuum. All
                      charitable contributions are tax-deductible to the fullest
                      extent allowed by law.
                    </p>
                    <a
                      href="https://www.ecologistics.org"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-4 hover:underline"
                      style={{ color: GOLD, fontSize: '15px' }}
                    >
                      ecologistics.org <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5 — Contribute */}
        <section className="py-20" style={{ backgroundColor: '#1a2e1a' }}>
          <div className="max-w-4xl mx-auto px-6 lg:px-10">
            <div className="text-center">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-6"
                style={{
                  backgroundColor: 'rgba(201,168,76,0.12)',
                  border: '1px solid rgba(201,168,76,0.3)',
                  color: GOLD,
                }}
              >
                <Camera className="h-6 w-6" />
              </div>
              <h2 className="font-serif" style={headingStyle}>
                Join the continuum.
              </h2>
              <p className="mt-5 max-w-2xl mx-auto text-left" style={bodyStyle}>
                The Orchid Continuum grows through the generosity of growers,
                photographers, researchers, and institutions. Taxonomically
                documented orchid photographs are especially needed — every
                verified image strengthens the knowledge graph. Each photograph
                in the Orchid Continuum is linked to a confirmed species
                identification and a credited contributor. If you have
                photographs tied to verified taxonomy, submit them below.
              </p>
            </div>

            {/* Photograph submission form */}
            <div className="mt-10">
              <PhotoDonationForm />
            </div>

            <div className="mt-8 text-center">
              <a
                href="mailto:info@orchidcontinuum.org"
                className="inline-flex items-center gap-2 hover:underline"
                style={{ color: GOLD, fontSize: '15px' }}
              >
                <Mail className="h-4 w-4" />
                Prefer email? info@orchidcontinuum.org
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>

      </div>
    </PageShell>
  );
};

export default Partners;
