import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Map as MapIcon,
  ShieldAlert,
  GitBranch,
  Leaf,
  Network,
  ImageOff,
  FileCheck2,
  FlaskConical,
} from 'lucide-react';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import {
  fetchSpeciesById,
  fetchMycorrhizal,
  type SpeciesDossierData,
  type MycorrhizalPartner,
} from '@/lib/ocBackend';
import {
  fetchSpeciesDossier,
  sectionMessage,
  type SpeciesDossierEnvelope,
  type DossierSection,
  type EvidenceReceipt,
  type EvidenceState,
} from '@/lib/speciesDossier';
import { speciesDossierMatrixHref } from '@/lib/speciesDossierMatrixNavigation';
import { speciesDossierResearchHref } from '@/lib/speciesDossierResearchNavigation';

const EVIDENCE_STATE_LABEL: Record<EvidenceState, string> = {
  available: 'Available',
  provisional: 'Provisional',
  conflicting: 'Conflicting',
  modeled: 'Modeled',
  inferred: 'Inferred',
  unavailable: 'Unavailable',
};

// Sections rendered generically from the dossier envelope. Three sections are
// intentionally excluded here because they are merged into their own
// dedicated blocks instead, so the evidence appears once, next to the
// concept it backs, rather than duplicated in a separate generic list:
//   - `mycorrhizae`  -> "Mycorrhizal partners" (fetchMycorrhizal-backed, with
//                       its own graceful "data coming soon" degrade)
//   - `conservation` -> "Conservation status" (fetchSpeciesById-backed)
//   - `distribution` -> "Native range & habitat" (fetchSpeciesById-backed)
const DOSSIER_SECTIONS: Array<{ key: keyof SpeciesDossierEnvelope; label: string }> = [
  { key: 'nomenclature', label: 'Nomenclature' },
  { key: 'protologue', label: 'Protologue' },
  { key: 'type_material', label: 'Type material' },
  { key: 'historical_media', label: 'Historical media' },
  { key: 'living_media', label: 'Living media' },
  { key: 'morphology', label: 'Morphology' },
  { key: 'ecology', label: 'Ecology' },
  { key: 'phenology', label: 'Phenology' },
  { key: 'pollinators', label: 'Pollinators' },
  { key: 'literature', label: 'Literature' },
  { key: 'cultivation', label: 'Cultivation' },
  { key: 'knowledge_graph', label: 'Knowledge graph' },
  { key: 'calyx_narrative', label: 'Calyx narrative' },
  { key: 'research_gaps', label: 'Research gaps' },
];

function formatConfidence(confidence: number | null): string {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
    return 'confidence not supplied';
  }
  return confidence.toFixed(2);
}

/**
 * SpeciesDossier — detail page for a single orchid species.
 *
 * Route: /species/:slug  (slug = taxonomy_id)
 *
 * Shows full taxonomy, conservation status, native range / habitat notes,
 * a "View on Atlas" action (opens the Atlas filtered to this species), and a
 * "Mycorrhizal Partners" section that gracefully degrades to "Data coming
 * soon" when the backend returns 404 / no records.
 */

const SpeciesDossier: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const taxonomyId = slug ?? '';

  const [data, setData] = useState<SpeciesDossierData | null>(null);
  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<MycorrhizalPartner[]>([]);
  const [mycoStatus, setMycoStatus] = useState<number>(0);
  const [mycoLoading, setMycoLoading] = useState(true);
  const [dossier, setDossier] = useState<SpeciesDossierEnvelope | null>(null);
  const [dossierLoading, setDossierLoading] = useState(true);
  const [dossierError, setDossierError] = useState(false);

  useEffect(() => {
    if (!taxonomyId) return;
    const ctrl = new AbortController();
    setLoading(true);
    fetchSpeciesById(taxonomyId, ctrl.signal)
      .then((d) => setData(d))
      .finally(() => setLoading(false));

    setMycoLoading(true);
    fetchMycorrhizal(taxonomyId, ctrl.signal)
      .then(({ status, partners }) => {
        setMycoStatus(status);
        setPartners(partners);
      })
      .finally(() => setMycoLoading(false));

    setDossierLoading(true);
    setDossierError(false);
    setDossier(null);
    fetchSpeciesDossier(taxonomyId, ctrl.signal)
      .then((d) => setDossier(d))
      .catch(() => setDossierError(true))
      .finally(() => setDossierLoading(false));

    return () => ctrl.abort();
  }, [taxonomyId]);

  const name =
    data?.canonical_name ||
    data?.scientific_name ||
    [data?.genus, data?.species ?? data?.specific_epithet]
      .filter(Boolean)
      .join(' ') ||
    decodeURIComponent(taxonomyId);

  const image = data?.hero_image_url || data?.representative_image_url || null;
  const atlasQuery = encodeURIComponent(
    data?.canonical_name || data?.scientific_name || taxonomyId,
  );
  // Into Research on the dossier's own subject, so the visitor does not have to
  // retype the organism they are already looking at. Genus drives the query
  // builder; the accepted binomial rides along as context only.
  const researchHref = speciesDossierResearchHref({
    genus: dossier?.identity.genus ?? data?.genus,
    taxon: dossier?.identity.accepted_name ?? dossier?.identity.full_scientific_name ?? null,
  });

  const matrixHref = dossier
    ? speciesDossierMatrixHref(dossier.matrix_url, {
        taxonId: dossier.identity.taxon_id || taxonomyId,
        taxonLabel:
          dossier.identity.accepted_name || dossier.identity.full_scientific_name || name,
      })
    : null;

  return (
    <div
      className="min-h-screen bg-[#04050d] text-[#f5f0e8]"
      style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
    >
      <style>{`
        .font-display { font-family: 'Playfair Display','Cormorant Garamond',Georgia,serif; }
        .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
      `}</style>
      <Navbar />

      <main className="pt-28 pb-20">
        <section className="max-w-[1100px] mx-auto px-6 lg:px-10">
          <Link
            to="/species"
            className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase text-[#cfc8b8]/55 hover:text-[#c9a24a] transition-colors mb-8"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to species search
          </Link>

          {loading ? (
            <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.2em] uppercase text-[#cfc8b8]/70 py-20">
              <Loader2 className="h-5 w-5 animate-spin text-[#c9a24a]" />
              Loading dossier…
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Image */}
              <div className="lg:col-span-1">
                <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-[#0a0d1c] border border-white/[0.08]">
                  {image ? (
                    <img
                      src={image}
                      alt={name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                      <ImageOff
                        className="h-9 w-9 text-[#c9a24a]/40 mb-3"
                        strokeWidth={1.2}
                      />
                      <div className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#c9a24a]/70">
                        Awaiting record imagery
                      </div>
                    </div>
                  )}
                </div>

                <Link
                  to={`/atlas?species=${atlasQuery}`}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#c9a24a] text-[#14140a] hover:bg-[#deb866] transition-colors font-mono text-[11px] tracking-[0.2em] uppercase"
                >
                  <MapIcon className="h-4 w-4" /> View on Atlas
                </Link>
                {researchHref && (
                  <Link
                    to={researchHref}
                    className="mt-3 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full border border-[#c9a24a]/50 bg-[#c9a24a]/[0.08] text-[#c9a24a] hover:bg-[#c9a24a]/[0.14] transition-colors font-mono text-[11px] tracking-[0.2em] uppercase"
                  >
                    <FlaskConical className="h-4 w-4" /> Continue in Research
                  </Link>
                )}
                {matrixHref && (
                  <Link
                    to={matrixHref}
                    className="mt-3 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full border border-[#c9a24a]/50 bg-[#c9a24a]/[0.08] text-[#c9a24a] hover:bg-[#c9a24a]/[0.14] transition-colors font-mono text-[11px] tracking-[0.2em] uppercase"
                  >
                    <FileCheck2 className="h-4 w-4" /> Continue in Matrix
                  </Link>
                )}
              </div>

              {/* Detail */}
              <div className="lg:col-span-2">
                <h1 className="font-display italic text-3xl md:text-4xl text-[#faf7f2] leading-tight">
                  {name}
                </h1>
                {data?.authority && (
                  <div className="mt-1 font-body italic text-[13px] text-[#cfc8b8]/65">
                    {data.authority}
                    {data.common_name ? ` · ${data.common_name}` : ''}
                  </div>
                )}

                {/* Taxonomy */}
                <Block icon={GitBranch} title="Taxonomy">
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Field label="Family" value={data?.family} />
                    <Field label="Tribe" value={data?.tribe} />
                    <Field label="Genus" value={data?.genus} />
                    <Field
                      label="Species"
                      value={data?.species ?? data?.specific_epithet}
                    />
                  </dl>
                </Block>

                {/* Conservation */}
                <Block icon={ShieldAlert} title="Conservation status">
                  {data?.conservation_status ? (
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#c9a24a]/40 bg-[#c9a24a]/[0.08] font-mono text-[11px] tracking-[0.16em] uppercase text-[#c9a24a]">
                      {data.conservation_status}
                      {data.iucn_code ? ` · ${data.iucn_code}` : ''}
                    </span>
                  ) : (
                    <Empty>Not yet assessed in the Continuum record.</Empty>
                  )}
                  {dossier && !dossierError && (
                    <DossierSectionBlock
                      label="Conservation evidence"
                      section={dossier.conservation}
                      className="mt-3"
                    />
                  )}
                </Block>

                {/* Range / habitat */}
                <Block icon={Leaf} title="Native range & habitat">
                  {data?.region || data?.habitat || data?.description ? (
                    <div className="space-y-2 font-body text-[14px] text-[#cfc8b8]/85 leading-relaxed">
                      {data?.region && (
                        <p>
                          <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#c9a24a] mr-2">
                            Range
                          </span>
                          {data.region}
                        </p>
                      )}
                      {data?.habitat && (
                        <p>
                          <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#c9a24a] mr-2">
                            Habitat
                          </span>
                          {data.habitat}
                        </p>
                      )}
                      {data?.description && <p>{data.description}</p>}
                    </div>
                  ) : (
                    <Empty>Range and habitat notes not yet linked.</Empty>
                  )}
                  {dossier && !dossierError && (
                    <DossierSectionBlock
                      label="Distribution"
                      section={dossier.distribution}
                      className="mt-3"
                    />
                  )}
                </Block>

                {/* Mycorrhizal partners */}
                <Block icon={Network} title="Mycorrhizal partners">
                  {mycoLoading ? (
                    <div className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] uppercase text-[#cfc8b8]/60">
                      <Loader2 className="h-3 w-3 animate-spin" /> Querying fungal
                      associations…
                    </div>
                  ) : partners.length > 0 ? (
                    <ul className="space-y-3">
                      {partners.map((p, i) => (
                        <li
                          key={i}
                          className="rounded-xl border border-white/[0.08] bg-[#0a0d1c]/70 p-4"
                        >
                          <div className="font-display italic text-[16px] text-[#faf7f2]">
                            {p.fungal_taxon ?? 'Fungal partner'}
                          </div>
                          <div className="mt-1 font-mono text-[9px] tracking-[0.16em] uppercase text-[#c9a24a]/75">
                            {[p.family, p.type].filter(Boolean).join(' · ')}
                          </div>
                          {p.note && (
                            <p className="mt-2 font-body text-[13px] text-[#cfc8b8]/75 italic">
                              {p.note}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>
                      Data coming soon
                      {mycoStatus === 404 ? ' · no record yet' : ''}.
                    </Empty>
                  )}
                </Block>

                {/* Evidence dossier — evidence_state / confidence / license / attribution */}
                <Block icon={FileCheck2} title="Evidence dossier">
                  {dossierLoading ? (
                    <div className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] uppercase text-[#cfc8b8]/60">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading evidence
                      receipts…
                    </div>
                  ) : dossierError || !dossier ? (
                    <Empty>Evidence dossier is not currently available.</Empty>
                  ) : (
                    <div className="space-y-4">
                      {DOSSIER_SECTIONS.map(({ key, label }) => (
                        <DossierSectionBlock
                          key={key}
                          label={label}
                          section={dossier[key] as DossierSection}
                        />
                      ))}
                    </div>
                  )}
                </Block>
              </div>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
};

function Block({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8 border-t border-white/[0.08] pt-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-[#c9a24a]" />
        <div className="font-mono text-[10px] tracking-[0.26em] uppercase text-[#c9a24a]">
          {title}
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="font-mono text-[9px] tracking-[0.18em] uppercase text-[#7a7466]">
        {label}
      </dt>
      <dd className="mt-1 font-body text-[14px] text-[#faf7f2]">
        {value || '—'}
      </dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#7a7466]">
      {children}
    </div>
  );
}

function EvidenceStatePill({ state }: { state: EvidenceState }) {
  const label = EVIDENCE_STATE_LABEL[state] ?? 'Unknown';
  return (
    <span
      data-testid="evidence-state"
      className="inline-flex items-center px-2 py-0.5 rounded-full border border-[#c9a24a]/40 bg-[#c9a24a]/[0.08] font-mono text-[9px] tracking-[0.16em] uppercase text-[#c9a24a]"
    >
      {label}
    </span>
  );
}

function EvidenceReceiptCard({ receipt }: { receipt: EvidenceReceipt }) {
  return (
    <li
      data-testid="evidence-receipt"
      className="rounded-lg border border-white/[0.06] bg-[#0a0d1c]/60 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-body text-[12px] text-[#faf7f2]">
          {receipt.source_name || receipt.source_id}
        </span>
        <EvidenceStatePill state={receipt.evidence_state} />
      </div>
      <div
        data-testid="evidence-confidence"
        className="mt-1 font-mono text-[9px] tracking-[0.1em] uppercase text-[#cfc8b8]/60"
      >
        Confidence: {formatConfidence(receipt.confidence)}
      </div>
      <div
        data-testid="evidence-license"
        className="mt-0.5 font-mono text-[9px] tracking-[0.1em] uppercase text-[#cfc8b8]/60"
      >
        License: {receipt.license || 'not stated'}
      </div>
      {receipt.attribution && (
        <div
          data-testid="evidence-attribution"
          className="mt-1 font-body text-[11px] italic text-[#cfc8b8]/70"
        >
          {receipt.attribution}
        </div>
      )}
      {receipt.source_url && (
        <a
          href={receipt.source_url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block font-mono text-[9px] tracking-[0.1em] uppercase text-[#c9a24a] hover:text-[#deb866]"
        >
          Source
        </a>
      )}
    </li>
  );
}

function DossierSectionBlock({
  label,
  section,
  className,
}: {
  label: string;
  section: DossierSection;
  className?: string;
}) {
  return (
    <div
      data-testid="dossier-section"
      data-section-label={label}
      className={`rounded-xl border border-white/[0.08] bg-[#0a0d1c]/40 p-4${className ? ` ${className}` : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[#cfc8b8]/80">
          {label}
        </span>
        <EvidenceStatePill state={section.state} />
      </div>
      <p
        data-testid="dossier-section-message"
        className="mt-2 font-body text-[12px] text-[#cfc8b8]/70"
      >
        {sectionMessage(section)}
      </p>
      {section.receipts.length > 0 && (
        <ul className="mt-3 space-y-2">
          {section.receipts.map((receipt, i) => (
            <EvidenceReceiptCard key={`${receipt.source_id}-${i}`} receipt={receipt} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default SpeciesDossier;
