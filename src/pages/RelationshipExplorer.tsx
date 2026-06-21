import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchRelationshipExplorerPayload,
  RelationshipExplorerPayload,
  TEST_SPECIES,
} from "@/lib/relationshipExplorer";

function valueText(value: unknown, fallback = "Not available") {
  if (value === null || value === undefined || value === "") return fallback;
  if (Array.isArray(value)) return value.length ? value.join(", ") : fallback;
  return String(value);
}

function numberText(value: unknown) {
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string" && value.trim()) return value;
  return "0";
}

function Card({
  title,
  children,
  eyebrow,
}: {
  title: string;
  children: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <section className="rounded-3xl border border-emerald-100 bg-white/90 p-6 shadow-sm">
      {eyebrow ? (
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">
          {eyebrow}
        </div>
      ) : null}
      <h2 className="mb-4 text-2xl font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
      {message}
    </div>
  );
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={
        active
          ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800"
          : "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500"
      }
    >
      {active ? "✓" : "○"} {label}
    </span>
  );
}

export default function RelationshipExplorer() {
  const { species } = useParams();
  const navigate = useNavigate();
  const initialSpecies = useMemo(
    () => decodeURIComponent(species || "Angraecum sesquipedale"),
    [species],
  );

  const [query, setQuery] = useState(initialSpecies);
  const [payload, setPayload] = useState<RelationshipExplorerPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setQuery(initialSpecies);
    setLoading(true);
    fetchRelationshipExplorerPayload(initialSpecies)
      .then((result) => {
        if (alive) setPayload(result);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [initialSpecies]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = query.trim();
    if (cleaned) navigate(`/relationship-explorer/${encodeURIComponent(cleaned)}`);
  }

  const profile = payload?.species_profile;
  const atlas = payload?.atlas_summary;
  const cards = payload?.cards;

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white px-4 py-10 text-slate-900 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-[2rem] bg-gradient-to-br from-emerald-900 via-emerald-800 to-slate-900 p-8 text-white shadow-xl">
          <div className="max-w-4xl">
            <div className="mb-3 text-sm font-semibold uppercase tracking-[0.35em] text-emerald-200">
              Orchid Continuum
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Relationship Explorer
            </h1>
            <p className="mt-4 text-lg text-emerald-50">
              Species-centered ecological intelligence: atlas signals, images, symbioses,
              evidence, and reasoning from the Continuum.
            </p>
          </div>
        </header>

        <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={submitSearch}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-h-12 flex-1 rounded-2xl border border-slate-200 px-4 text-base outline-none ring-emerald-500 transition focus:ring-2"
              placeholder="Search a species, e.g. Angraecum sesquipedale"
            />
            <button
              type="submit"
              className="rounded-2xl bg-emerald-700 px-6 py-3 font-semibold text-white transition hover:bg-emerald-800"
            >
              Explore
            </button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            {TEST_SPECIES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => navigate(`/relationship-explorer/${encodeURIComponent(name)}`)}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
              >
                {name}
              </button>
            ))}
          </div>
        </section>

        {loading ? (
          <Card title="Loading relationship profile">
            <p className="text-slate-600">Assembling Continuum relationship payload…</p>
          </Card>
        ) : null}

        {payload ? (
          <>
            <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
              <Card title={payload.scientific_name} eyebrow="Species profile">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-500">Genus</div>
                    <div className="text-lg">{valueText(profile?.genus)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-500">Species epithet</div>
                    <div className="text-lg">{valueText(profile?.species_epithet)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-500">Author</div>
                    <div className="text-lg">{valueText(profile?.author)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-500">Payload source</div>
                    <div className="text-lg capitalize">{payload.source}</div>
                  </div>
                </div>
                {profile?.description ? (
                  <p className="mt-5 text-slate-700">{profile.description}</p>
                ) : null}
              </Card>

              <Card title="MVP card status" eyebrow="Build 203A">
                <div className="flex flex-wrap gap-2">
                  <StatusPill label="Species" active={!!cards?.species_profile} />
                  <StatusPill label="Atlas" active={!!cards?.atlas_summary} />
                  <StatusPill label="Images" active={!!cards?.image_gallery} />
                  <StatusPill label="Interactions" active={!!cards?.interaction_summary} />
                  <StatusPill label="Reasoning" active={!!cards?.reasoning} />
                  <StatusPill label="Mycorrhiza" active={!!cards?.mycorrhiza_claims} />
                  <StatusPill label="Fungal dependency" active={!!cards?.fungal_dependency} />
                </div>
              </Card>
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
              <Card title="Atlas / Habitat" eyebrow="Distribution signal">
                {atlas ? (
                  <div className="space-y-4">
                    <div className="text-4xl font-bold text-emerald-800">
                      {numberText(atlas.occurrence_count)}
                    </div>
                    <div className="text-sm text-slate-500">occurrence records</div>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Readiness</dt>
                        <dd className="font-medium">{valueText(atlas.atlas_readiness)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Confidence</dt>
                        <dd className="font-medium">{valueText(atlas.atlas_confidence_score)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Countries</dt>
                        <dd className="font-medium">{valueText(atlas.countries)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-500">Elevation</dt>
                        <dd className="font-medium">{valueText(atlas.elevation_range)}</dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <EmptyState message="No atlas summary is available yet for this species." />
                )}
              </Card>

              <Card title="Interactions" eyebrow="Pollinator / partner panel">
                {payload.interaction_summary?.length ? (
                  <div className="space-y-3">
                    {payload.interaction_summary.map((item, index) => (
                      <div key={index} className="rounded-2xl bg-slate-50 p-3 text-sm">
                        <div className="font-semibold">{valueText(item.partner, "Unknown partner")}</div>
                        <div className="text-slate-600">{valueText(item.interaction_type, "Interaction")}</div>
                        <div className="text-xs text-slate-500">{valueText(item.source, "No source listed")}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState message="No display-ready interaction records yet. This card is wired and ready for GloBI/pollinator enrichment." />
                )}
              </Card>

              <Card title="Relationship network" eyebrow="Preview">
                <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 text-center">
                  <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-700 p-4 text-sm font-semibold text-white shadow-md">
                    {payload.scientific_name}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-emerald-900">
                    <div className="rounded-full bg-white px-3 py-2">Atlas</div>
                    <div className="rounded-full bg-white px-3 py-2">Images</div>
                    <div className="rounded-full bg-white px-3 py-2">Mycorrhiza</div>
                    <div className="rounded-full bg-white px-3 py-2">Reasoning</div>
                  </div>
                </div>
              </Card>
            </section>

            <Card title="Image gallery" eyebrow="Visual evidence">
              {payload.image_gallery?.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {payload.image_gallery.map((image, index) => (
                    <figure key={`${image.url}-${index}`} className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                      <img
                        src={image.url}
                        alt={image.caption || payload.scientific_name}
                        className="h-48 w-full object-cover"
                        loading="lazy"
                      />
                      <figcaption className="space-y-1 p-3 text-xs text-slate-600">
                        <div className="font-medium text-slate-800">{image.caption || payload.scientific_name}</div>
                        <div>{image.credit || "Credit retained at source"}</div>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <EmptyState message="No images are available through this MVP payload yet." />
              )}
            </Card>

            <section className="grid gap-6 lg:grid-cols-2">
              <Card title="Mycorrhiza / symbiosis" eyebrow="Fungal relationship evidence">
                {payload.mycorrhiza_claims?.length ? (
                  <div className="space-y-3">
                    {payload.mycorrhiza_claims.map((claim, index) => (
                      <div key={index} className="rounded-2xl bg-slate-50 p-4 text-sm">
                        <div className="font-semibold">{valueText(claim.relationship_type, "Mycorrhizal association")}</div>
                        <div className="mt-1 text-slate-700">{valueText(claim.fungal_taxon, "Fungal partner candidate")}</div>
                        <div className="mt-2 text-slate-600">{valueText(claim.evidence, "Evidence summary pending")}</div>
                        <div className="mt-2 text-xs text-slate-500">{valueText(claim.source, "Source pending")}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState message="No mycorrhizal evidence claims are attached yet." />
                )}
                {payload.fungal_dependency ? (
                  <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
                    <div className="font-semibold">Dependency: {valueText(payload.fungal_dependency.dependency_level)}</div>
                    <div className="mt-1">{valueText(payload.fungal_dependency.notes)}</div>
                  </div>
                ) : null}
              </Card>

              <Card title="Reasoning" eyebrow="Continuum inference layer">
                {payload.reasoning?.length ? (
                  <div className="space-y-3">
                    {payload.reasoning.map((item, index) => (
                      <div key={index} className="rounded-2xl bg-slate-50 p-4 text-sm">
                        <div className="font-semibold text-slate-900">{item.statement}</div>
                        <div className="mt-2 text-slate-600">Basis: {valueText(item.basis)}</div>
                        <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                          Confidence: {valueText(item.confidence)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState message="No reasoning profile is available yet. This card will populate as OREP, OAO, and the reasoning layer expand." />
                )}
              </Card>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
