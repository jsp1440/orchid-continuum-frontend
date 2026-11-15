import { useEffect, useState } from "react";
import {
  downloadPaperBotanicaPackage,
  fetchPaperBotanicaCollection,
  fetchPaperBotanicaProfile,
  PaperBotanicaCollection,
  PaperBotanicaProfile,
  PaperBotanicaSpecies,
  paperBotanicaUrl,
} from "./api";
import { PaperBotanicaModel } from "./PaperBotanicaModel";
import "./paperbotanica.css";

const VIEWS = ["front", "side", "rear", "oblique"] as const;

export default function PaperBotanicaPage() {
  const [collection, setCollection] = useState<PaperBotanicaCollection | null>(null);
  const [selected, setSelected] = useState<PaperBotanicaSpecies | null>(null);
  const [profile, setProfile] = useState<PaperBotanicaProfile | null>(null);
  const [error, setError] = useState("");
  const [downloadState, setDownloadState] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetchPaperBotanicaCollection(controller.signal)
      .then((payload) => {
        setCollection(payload);
        setSelected(payload.species[0] ?? null);
        if (!payload.species.length) setError("No reviewed PaperBotanica draft profiles are available.");
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "PaperBotanica is unavailable.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setProfile(null);
    setDownloadState("");
    void fetchPaperBotanicaProfile(selected.species_id, controller.signal)
      .then(setProfile)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Species evidence could not be loaded.");
      });
    return () => controller.abort();
  }, [selected]);

  async function download() {
    if (!selected) return;
    setDownloadState("Generating all three editions…");
    try {
      await downloadPaperBotanicaPackage(selected);
      setDownloadState("Draft package downloaded. Botanical and physical review remain required.");
    } catch (reason) {
      setDownloadState(reason instanceof Error ? reason.message : "Package generation failed.");
    }
  }

  return (
    <main className="paperbotanica-page">
      <header className="paperbotanica-hero">
        <p className="paperbotanica-kicker">CALYX PAPERBOTANICA · SNOW ORCHIDS</p>
        <h1>Botanical reconstruction,<br />made to unfold.</h1>
        <p className="paperbotanica-intro">
          Original parametric orchid models and printable paper components. Each draft package contains full-color,
          color-your-own, and botanical-anatomy editions built from identical construction geometry.
        </p>
        <div className="paperbotanica-review-banner">
          <strong>REQUIRES BOTANICAL REVIEW</strong>
          <span>Inferred geometry · not a measured scan · not physically validated</span>
        </div>
      </header>

      {error && <p className="paperbotanica-error" role="alert">{error}</p>}
      {!collection && !error && <p className="paperbotanica-loading">Loading draft collection…</p>}

      {collection && (
        <div className="paperbotanica-workspace">
          <nav className="paperbotanica-species-nav" aria-label="Snow Orchid draft models">
            <p>Five draft species</p>
            {collection.species.map((species, index) => (
              <button
                type="button"
                key={species.species_id}
                className={selected?.species_id === species.species_id ? "is-selected" : ""}
                onClick={() => { setSelected(species); setError(""); }}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{species.story_name || species.common_name}</strong>
                <em>{species.scientific_name}</em>
              </button>
            ))}
          </nav>

          {selected && (
            <section className="paperbotanica-detail" aria-live="polite">
              <div className="paperbotanica-heading">
                <div>
                  <p>{selected.common_name}</p>
                  <h2>{selected.story_name || selected.common_name}</h2>
                  <h3>{selected.scientific_name}</h3>
                  {selected.accepted_name !== selected.scientific_name && <p className="paperbotanica-accepted">Accepted name: <em>{selected.accepted_name}</em></p>}
                </div>
                <button type="button" className="paperbotanica-download" onClick={() => void download()}>Download draft package</button>
              </div>
              {downloadState && <p className="paperbotanica-download-state">{downloadState}</p>}

              <div className="paperbotanica-reconstruction">
                <PaperBotanicaModel url={selected.links.paperbotanica_model} speciesName={selected.scientific_name} />
                <aside>
                  <p className="paperbotanica-label">Construction evidence</p>
                  <dl>
                    <div><dt>Readiness</dt><dd>{selected.readiness}</dd></div>
                    <div><dt>Organs</dt><dd>{selected.organ_count} parametric components</dd></div>
                    <div><dt>Evidence</dt><dd>{selected.organ_evidence_classes.join(" · ")}</dd></div>
                  </dl>
                  <p className="paperbotanica-label">Missing photographic evidence</p>
                  <ul className="paperbotanica-missing">
                    {selected.missing_evidence_views.map((view) => <li key={view}>{view.replaceAll("_", " ")}</li>)}
                  </ul>
                  <p className="paperbotanica-note">No missing photographic view has been invented. Renderings below are inferred reconstructions.</p>
                </aside>
              </div>

              <details className="paperbotanica-views">
                <summary>Inspect four generated orthographic views</summary>
                <div>
                  {VIEWS.map((view) => (
                    <figure key={view}>
                      <img src={paperBotanicaUrl(`/api/paperbotanica/species/${selected.species_id}/views/${view}.png`)} alt={`${view} inferred 3D reconstruction of ${selected.scientific_name}`} loading="lazy" />
                      <figcaption>{view} · inferred reconstruction</figcaption>
                    </figure>
                  ))}
                </div>
              </details>

              {profile && (
                <div className="paperbotanica-evidence-grid">
                  <section>
                    <p className="paperbotanica-label">Botanical context</p>
                    <p>{profile.botanical_fact}</p>
                    <p><strong>Habitat.</strong> {profile.habitat}</p>
                    <p><strong>Distribution.</strong> {profile.distribution}</p>
                  </section>
                  <section>
                    <p className="paperbotanica-label">Organ evidence</p>
                    <ul className="paperbotanica-organs">
                      {profile.organs.map((organ) => (
                        <li key={organ.organ_id}><span>{organ.label}</span><strong>{organ.evidence_class}</strong></li>
                      ))}
                    </ul>
                  </section>
                  <section className="paperbotanica-sources">
                    <p className="paperbotanica-label">Sources and reuse boundaries</p>
                    {profile.sources.map((source) => (
                      <article key={source.source_id}>
                        <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                        <p>{source.creator} · {source.source_type} · License: {source.license}</p>
                        {source.notes && <p>{source.notes}</p>}
                      </article>
                    ))}
                  </section>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  );
}
