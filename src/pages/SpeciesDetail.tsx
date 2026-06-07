import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Leaf,
  Loader2,
  ShieldCheck,
  BookOpen,
  Globe2,
  Mountain,
  Database,
  CircleDashed,
  Sparkles,
} from 'lucide-react';
import { fetchSpeciesById, type Species } from '@/lib/species';
import {
  INTERACTION_PANELS,
  INTERACTION_PLACEHOLDER_MESSAGE,
} from '@/lib/interactions';
import EcologicalInteractionPanel from '@/components/interactions/EcologicalInteractionPanel';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';


const SpeciesDetail: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [species, setSpecies] = useState<Species | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchSpeciesById(decodeURIComponent(slug), controller.signal)
      .then(r => {
        setSpecies(r.data);
        setError(r.error);
        setUnconfigured(r.unconfigured);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [slug]);

  return (
    <div
      className="min-h-screen bg-[#0d1f17] text-white antialiased"
      style={{ fontFamily: '"Inter", system-ui, -apple-system, sans-serif' }}
    >
      <style>{`
        .font-serif { font-family: 'Cormorant Garamond', 'Playfair Display', Georgia, serif; font-weight: 500; letter-spacing: -0.01em; }
      `}</style>
      <Navbar />

      {loading && (
        <div className="min-h-screen flex items-center justify-center text-white/70">
          <Loader2 className="h-5 w-5 animate-spin mr-3" />
          Loading specimen record…
        </div>
      )}

      {!loading && unconfigured && (
        <DetailEmptyState
          title="Species data layer initializing"
          body="The Orchid Continuum API base URL is not configured for this deployment. Detailed species records will appear here as soon as the data layer comes online."
        />
      )}

      {!loading && !unconfigured && (error || !species) && (
        <DetailEmptyState
          title="Specimen record unavailable"
          body={
            error ||
            'No record was returned for this taxonomy identifier. The curatorial team may still be ingesting it.'
          }
        />
      )}

      {!loading && !error && species && (
        <main>
          {/* Hero */}
          <section className="relative pt-24 pb-16 overflow-hidden">
            <div className="absolute inset-0">
              {species.image_url && (
                <img
                  src={species.image_url}
                  className="w-full h-full object-cover opacity-40"
                  alt=""
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-[#0d1f17]/80 via-[#0d1f17]/85 to-[#0d1f17]" />
            </div>
            <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
              <Link
                to="/#species"
                className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-emerald-200 transition-colors mb-10"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Species Explorer
              </Link>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-end">
                <div className="lg:col-span-7">
                  <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 mb-4">
                    {[species.family, species.subfamily, species.tribe]
                      .filter(Boolean)
                      .join(' · ') || 'Orchidaceae'}
                  </div>
                  <h1 className="font-serif text-5xl md:text-7xl leading-[1.05]">
                    {species.genus}{' '}
                    <span className="italic text-emerald-200/95">
                      {species.epithet}
                    </span>
                  </h1>
                  {species.authority && (
                    <div className="text-sm text-white/55 mt-2">
                      {species.authority}
                    </div>
                  )}
                  {species.common_name && (
                    <div className="text-lg text-white/75 mt-3">
                      {species.common_name}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 mt-6">
                    <Chip icon={<Leaf className="h-3 w-3" />}>
                      {species.habitat}
                    </Chip>
                    <Chip icon={<ShieldCheck className="h-3 w-3" />}>
                      {species.conservation_status}
                      {species.iucn_code && (
                        <span className="text-white/40 ml-1">
                          · {species.iucn_code}
                        </span>
                      )}
                    </Chip>
                    {species.region && (
                      <Chip icon={<MapPin className="h-3 w-3" />}>
                        {species.region}
                      </Chip>
                    )}
                    {species.confidence_label && (
                      <Chip
                        tone="emerald"
                        icon={<Sparkles className="h-3 w-3" />}
                      >
                        confidence: {species.confidence_label}
                      </Chip>
                    )}
                    {species.knowledge_label && (
                      <Chip
                        tone="emerald"
                        icon={<Database className="h-3 w-3" />}
                      >
                        knowledge: {species.knowledge_label}
                      </Chip>
                    )}
                  </div>
                </div>
                <div className="lg:col-span-5">
                  <div className="rounded-2xl overflow-hidden border border-white/10 aspect-[4/3] bg-[#142a1f] flex items-center justify-center">
                    {species.image_url ? (
                      <img
                        src={species.image_url}
                        alt={`${species.genus} ${species.epithet}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-white/40 text-xs tracking-[0.25em] uppercase">
                        Image pending review
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Body */}
          <section className="py-16 border-t border-white/5">
            <div className="max-w-7xl mx-auto px-6 lg:px-10 grid grid-cols-1 lg:grid-cols-12 gap-12">
              {/* Main */}
              <div className="lg:col-span-7 space-y-12">
                <Block label="Overview" empty="Overview prose pending curatorial review.">
                  {species.description}
                </Block>

                <Block label="Ecology" empty="Ecology summary not yet ingested for this taxon.">
                  {species.ecology}
                </Block>

                {/* Composite ecological interaction panel — live API */}
                <EcologicalInteractionPanel taxonomyId={species.taxonomy_id} />

                {/* Per-kind reference cards (kept for taxonomic depth) */}
                <div>
                  <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 mb-4">
                    Interaction kinds we track
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {INTERACTION_PANELS.map(p => (
                      <div
                        key={p.kind}
                        className="rounded-xl border border-white/10 bg-[#142a1f] p-5"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-serif text-lg">{p.label}</div>
                          <CircleDashed className="h-4 w-4 text-emerald-300/70" />
                        </div>
                        <p className="text-xs text-white/55 leading-relaxed">
                          {p.description}
                        </p>
                        <div className="mt-3 text-[10px] tracking-[0.2em] uppercase text-emerald-300/70">
                          {INTERACTION_PLACEHOLDER_MESSAGE}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>


                {/* References */}
                {species.references_list?.length > 0 && (
                  <div>
                    <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 mb-4 flex items-center gap-2">
                      <BookOpen className="h-3.5 w-3.5" /> References
                    </div>
                    <ul className="space-y-2">
                      {species.references_list.map((r, i) => (
                        <li key={i} className="text-sm text-white/70">
                          <a
                            href={r.url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-emerald-200 underline-offset-4 hover:underline"
                          >
                            {r.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Missing data prompts */}
                {species.missing_fields && species.missing_fields.length > 0 && (
                  <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-5">
                    <div className="text-[10px] tracking-[0.25em] uppercase text-emerald-200/80 mb-2">
                      Knowledge gaps for this taxon
                    </div>
                    <p className="text-sm text-white/75 leading-relaxed">
                      The following fields are not yet populated and are
                      transparently surfaced rather than fabricated:
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {species.missing_fields.map(f => (
                        <span
                          key={f}
                          className="text-[10px] tracking-[0.2em] uppercase px-2 py-1 rounded-full border border-emerald-300/30 text-emerald-100/80"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <aside className="lg:col-span-5 space-y-6">
                {/* Occurrence summary */}
                <SidebarCard
                  icon={<Globe2 className="h-3.5 w-3.5" />}
                  label="Occurrence Summary"
                >
                  {species.occurrence_summary ? (
                    <dl className="divide-y divide-white/10">
                      <Row k="Total records" v={species.occurrence_summary.total} />
                      <Row k="Countries" v={species.occurrence_summary.countries} />
                      <Row
                        k="First record"
                        v={species.occurrence_summary.first_year}
                      />
                      <Row
                        k="Most recent"
                        v={species.occurrence_summary.last_year}
                      />
                    </dl>
                  ) : (
                    <Placeholder>
                      Occurrence aggregation not yet computed for this taxon.
                    </Placeholder>
                  )}
                  {species.countries?.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-1.5">
                      {species.countries.map(c => (
                        <span
                          key={c}
                          className="text-[10px] tracking-[0.2em] uppercase px-2 py-1 rounded-full border border-white/15 text-white/60"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </SidebarCard>

                {/* Environmental */}
                <SidebarCard
                  icon={<Mountain className="h-3.5 w-3.5" />}
                  label="Environmental Envelope"
                >
                  {species.environmental ? (
                    <dl className="divide-y divide-white/10">
                      {(species.environmental.elevation_min_m != null ||
                        species.environmental.elevation_max_m != null) && (
                        <Row
                          k="Elevation"
                          v={`${species.environmental.elevation_min_m ?? '—'} – ${
                            species.environmental.elevation_max_m ?? '—'
                          } m`}
                        />
                      )}
                      {species.environmental.temperature_c && (
                        <Row
                          k="Temperature"
                          v={`${
                            species.environmental.temperature_c.min ?? '—'
                          } – ${species.environmental.temperature_c.max ?? '—'} °C`}
                        />
                      )}
                      {species.environmental.precipitation_mm && (
                        <Row
                          k="Precipitation"
                          v={`${
                            species.environmental.precipitation_mm.min ?? '—'
                          } – ${species.environmental.precipitation_mm.max ?? '—'} mm`}
                        />
                      )}
                      {species.environmental.biomes &&
                        species.environmental.biomes.length > 0 && (
                          <Row
                            k="Biomes"
                            v={species.environmental.biomes.join(', ')}
                          />
                        )}
                    </dl>
                  ) : (
                    <Placeholder>
                      Environmental envelope not yet derived from occurrence data.
                    </Placeholder>
                  )}
                </SidebarCard>

                {/* Traits */}
                <SidebarCard
                  icon={<Leaf className="h-3.5 w-3.5" />}
                  label="Traits"
                >
                  {species.traits && Object.keys(species.traits).length > 0 ? (
                    <dl className="divide-y divide-white/10">
                      {Object.entries(species.traits).map(([k, v]) => (
                        <div
                          key={k}
                          className="py-2.5 flex justify-between gap-4 text-sm"
                        >
                          <dt className="text-white/55 capitalize">
                            {k.replace(/_/g, ' ')}
                          </dt>
                          <dd className="text-white/85 text-right">
                            {Array.isArray(v) ? v.join('–') : String(v)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <Placeholder>
                      Trait matrix has not been published for this taxon.
                    </Placeholder>
                  )}
                </SidebarCard>

                {/* Provenance */}
                <SidebarCard
                  icon={<Database className="h-3.5 w-3.5" />}
                  label="Provenance"
                >
                  {species.provenance ? (
                    <dl className="divide-y divide-white/10">
                      {species.provenance.sources &&
                        species.provenance.sources.length > 0 && (
                          <Row
                            k="Sources"
                            v={species.provenance.sources.join(', ')}
                          />
                        )}
                      {species.provenance.last_synced && (
                        <Row k="Last synced" v={species.provenance.last_synced} />
                      )}
                      {species.provenance.license && (
                        <Row k="License" v={species.provenance.license} />
                      )}
                    </dl>
                  ) : (
                    <Placeholder>
                      Provenance metadata is being attached at the API layer.
                    </Placeholder>
                  )}
                </SidebarCard>

                {/* Completeness */}
                {species.completeness_score != null && (
                  <SidebarCard
                    icon={<Sparkles className="h-3.5 w-3.5" />}
                    label="Record Completeness"
                  >
                    <div className="text-3xl font-serif text-emerald-100">
                      {Math.round((species.completeness_score ?? 0) * 100)}%
                    </div>
                    {species.knowledge_label && (
                      <div className="text-xs text-white/55 mt-1 capitalize">
                        {species.knowledge_label}
                      </div>
                    )}
                    <div className="mt-4 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-emerald-300"
                        style={{
                          width: `${Math.round(
                            (species.completeness_score ?? 0) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  </SidebarCard>
                )}
              </aside>
            </div>
          </section>
        </main>
      )}

      <Footer />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

const Chip: React.FC<{
  children: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'emerald';
}> = ({ children, icon, tone = 'default' }) => (
  <span
    className={
      'text-xs px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 ' +
      (tone === 'emerald'
        ? 'bg-emerald-300/10 border border-emerald-300/40 text-emerald-100'
        : 'bg-white/5 border border-white/15 text-white/80')
    }
  >
    {icon}
    {children}
  </span>
);

const Block: React.FC<{
  label: string;
  empty: string;
  children?: React.ReactNode;
}> = ({ label, empty, children }) => (
  <div>
    <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 mb-4">
      {label}
    </div>
    {children ? (
      <p className="text-base text-white/80 leading-relaxed">{children}</p>
    ) : (
      <Placeholder>{empty}</Placeholder>
    )}
  </div>
);

const Placeholder: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-4 text-sm text-white/55 leading-relaxed">
    {children}
  </div>
);

const SidebarCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}> = ({ icon, label, children }) => (
  <div className="rounded-2xl border border-white/10 bg-[#142a1f] p-6">
    <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/80 mb-4 flex items-center gap-2">
      {icon}
      {label}
    </div>
    {children}
  </div>
);

const Row: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) =>
  v == null || v === '' ? null : (
    <div className="py-2.5 flex justify-between gap-4 text-sm">
      <dt className="text-white/55">{k}</dt>
      <dd className="text-white/85 text-right">{v}</dd>
    </div>
  );

const DetailEmptyState: React.FC<{ title: string; body: string }> = ({
  title,
  body,
}) => (
  <div className="min-h-screen flex items-center justify-center px-6">
    <div className="max-w-xl rounded-2xl border border-white/10 bg-[#142a1f] p-10 text-center">
      <div className="text-xs tracking-[0.25em] uppercase text-emerald-300/70 mb-3">
        Transparent empty state
      </div>
      <div className="font-serif text-3xl text-white mb-4">{title}</div>
      <p className="text-sm text-white/65 leading-relaxed">{body}</p>
      <Link
        to="/#species"
        className="inline-flex items-center gap-2 mt-6 text-sm text-emerald-300 hover:text-emerald-200"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Species Explorer
      </Link>
    </div>
  </div>
);

export default SpeciesDetail;
