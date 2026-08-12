import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Search, ShieldCheck } from "lucide-react";

import {
  deriveRegistryConceptMappings,
  getRegistryVersion,
  listReviewableRegistries,
  searchApprovedLexiconConcepts,
  type ApprovedLexiconConcept,
  type RegistryCharacter,
  type RegistrySummary,
  type RegistryVersion,
} from "@/lib/matrixRegistryReview";

type MappingSelection = {
  concept_id: string;
  preferred_term: string;
};

function registryKey(item: RegistrySummary): string {
  return `${item.registry_id}:${item.version}`;
}

export default function MatrixRegistryConceptReview() {
  const [registries, setRegistries] = useState<RegistrySummary[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [registry, setRegistry] = useState<RegistryVersion | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<RegistryCharacter | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApprovedLexiconConcept[]>([]);
  const [mappings, setMappings] = useState<Record<string, MappingSelection>>({});
  const [newVersion, setNewVersion] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "working" | "error">("loading");
  const [message, setMessage] = useState("Loading immutable Matrix registry versions…");
  const [receipt, setReceipt] = useState<string>("");

  const selectedSummary = useMemo(
    () => registries.find((item) => registryKey(item) === selectedKey) ?? null,
    [registries, selectedKey],
  );

  useEffect(() => {
    void listReviewableRegistries()
      .then((items) => {
        setRegistries(items);
        setSelectedKey(items[0] ? registryKey(items[0]) : "");
        setStatus("ready");
        setMessage(items.length ? "Choose a source registry version to review." : "No Matrix registry versions are available.");
      })
      .catch((error) => {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Unable to load Matrix registries.");
      });
  }, []);

  useEffect(() => {
    if (!selectedSummary) {
      setRegistry(null);
      return;
    }
    setStatus("working");
    setMessage("Loading exact source registry and character bindings…");
    setMappings({});
    setSelectedCharacter(null);
    setResults([]);
    setReceipt("");
    void getRegistryVersion(selectedSummary.registry_id, selectedSummary.version)
      .then((record) => {
        setRegistry(record);
        setStatus("ready");
        setMessage("Source registry loaded. Select a character and explicitly review its canonical concept mapping.");
      })
      .catch((error) => {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Unable to load source registry.");
      });
  }, [selectedSummary]);

  function chooseCharacter(character: RegistryCharacter): void {
    setSelectedCharacter(character);
    setQuery(character.label);
    setResults([]);
    setMessage("Search approved canonical Lexicon entries, then explicitly choose one mapping if appropriate.");
  }

  async function searchConcepts(): Promise<void> {
    if (!query.trim()) return;
    setStatus("working");
    setMessage("Searching ACTIVE + APPROVED canonical Lexicon concepts…");
    try {
      const found = await searchApprovedLexiconConcepts(query);
      setResults(found);
      setStatus("ready");
      setMessage(found.length ? "Review the results. Nothing is mapped until you explicitly select a concept." : "No approved canonical concepts matched this search.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Canonical Lexicon search failed.");
    }
  }

  function selectConcept(concept: ApprovedLexiconConcept): void {
    if (!selectedCharacter) return;
    setMappings((current) => ({
      ...current,
      [selectedCharacter.character]: {
        concept_id: concept.concept_id,
        preferred_term: concept.preferred_term,
      },
    }));
    setMessage(`Selected ${concept.preferred_term} for ${selectedCharacter.label}. This remains a pending review decision until a new registry version is created.`);
  }

  async function derive(): Promise<void> {
    if (!registry || !newVersion.trim() || !Object.keys(mappings).length) return;
    setStatus("working");
    setMessage("Validating approved concepts and deriving a new immutable registry version…");
    try {
      const result = await deriveRegistryConceptMappings(
        registry.registry_id,
        registry.version,
        newVersion.trim(),
        Object.entries(mappings).map(([character, mapping]) => ({
          character,
          concept_id: mapping.concept_id,
        })),
        reviewNote.trim() || undefined,
      );
      setReceipt(`${result.new_registry.registry_id} · ${result.new_registry.version} · ${result.new_registry.checksum_sha256}`);
      setStatus("ready");
      setMessage(`Created immutable registry version ${result.new_registry.version} with ${result.mapping_count} reviewed concept mapping${result.mapping_count === 1 ? "" : "s"}. It remains review-required and is not automatically published.`);
      const refreshed = await listReviewableRegistries();
      setRegistries(refreshed);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to derive reviewed registry version.");
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-3xl border bg-card p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <ShieldCheck className="mt-1 h-7 w-7 text-emerald-700" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Calyx Matrix · Registry Review</p>
              <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Review morphology concept bindings without changing the science.</h1>
              <p className="mt-4 max-w-4xl text-sm leading-6 text-muted-foreground">
                This workspace derives a new immutable Matrix registry version from explicit reviewer decisions. It never guesses concept mappings, never changes candidate states or diagnostic weights, and never publishes automatically.
              </p>
            </div>
          </div>
        </header>

        <div className="mt-5 flex flex-wrap items-center gap-3" aria-live="polite">
          <span className="rounded-full border px-3 py-1 text-xs font-semibold uppercase">{status}</span>
          <span className="text-sm text-muted-foreground">{message}</span>
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-3xl border bg-card p-6">
            <h2 className="text-xl font-semibold">1 · Immutable source registry</h2>
            <select
              value={selectedKey}
              onChange={(event) => setSelectedKey(event.target.value)}
              className="mt-4 w-full rounded-xl border bg-background px-4 py-3"
            >
              {registries.map((item) => (
                <option key={registryKey(item)} value={registryKey(item)}>
                  {item.title || item.registry_id} · {item.version}
                </option>
              ))}
            </select>
            {registry && (
              <div className="mt-5 space-y-2 text-xs text-muted-foreground">
                <p>Registry: <span className="font-medium text-foreground">{registry.registry_id}</span></p>
                <p>Version: <span className="font-medium text-foreground">{registry.version}</span></p>
                <p className="break-all">Checksum: {registry.checksum_sha256 ?? "—"}</p>
                <p>{registry.characters.length} characters · {registry.candidate_count ?? registry.candidates?.length ?? "—"} candidates</p>
              </div>
            )}
          </div>

          <div className="rounded-3xl border bg-card p-6">
            <h2 className="text-xl font-semibold">2 · Diagnostic characters</h2>
            <p className="mt-2 text-sm text-muted-foreground">Existing concept IDs are preserved unless you explicitly replace them in the derived version.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(registry?.characters ?? []).map((character) => {
                const pending = mappings[character.character];
                return (
                  <button
                    type="button"
                    key={character.character}
                    onClick={() => chooseCharacter(character)}
                    className="rounded-2xl border p-4 text-left hover:bg-muted/30"
                  >
                    <p className="font-semibold">{character.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{character.character} · weight {character.weight ?? 1}</p>
                    <p className="mt-2 break-all text-xs text-muted-foreground">
                      {pending
                        ? `Pending: ${pending.preferred_term} · ${pending.concept_id}`
                        : character.concept_id
                          ? `Existing concept: ${character.concept_id}`
                          : "No reviewed concept binding"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {selectedCharacter && (
          <section className="mt-6 rounded-3xl border bg-card p-6 sm:p-8">
            <h2 className="text-xl font-semibold">3 · Review a canonical concept for {selectedCharacter.label}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Search is discovery only. You must explicitly choose the concept that correctly represents this Matrix character.</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void searchConcepts(); }}
                className="min-w-0 flex-1 rounded-xl border bg-background px-4 py-3"
                placeholder="Search reviewed canonical Lexicon"
              />
              <button type="button" onClick={() => void searchConcepts()} className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-medium">
                <Search className="h-4 w-4" /> Search approved concepts
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {results.map((concept) => (
                <article key={concept.concept_id} className="rounded-2xl border p-4">
                  <p className="text-lg font-semibold">{concept.preferred_term}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{concept.quick_definition || concept.expanded_definition || "Approved concept has no public definition text yet."}</p>
                  <p className="mt-3 break-all text-xs text-muted-foreground">{concept.concept_id}</p>
                  <button type="button" onClick={() => selectConcept(concept)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
                    <CheckCircle2 className="h-4 w-4" /> Select this reviewed mapping
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="mt-6 rounded-3xl border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold">4 · Derive the reviewed version</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              New immutable version
              <input value={newVersion} onChange={(event) => setNewVersion(event.target.value)} className="mt-2 w-full rounded-xl border bg-background px-4 py-3" placeholder="e.g. 1.1-reviewed" />
            </label>
            <label className="text-sm font-medium">
              Review note
              <input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className="mt-2 w-full rounded-xl border bg-background px-4 py-3" placeholder="What evidence or review supported these mappings?" />
            </label>
          </div>
          <div className="mt-5 rounded-2xl border bg-background p-4 text-sm">
            <p className="font-semibold">Pending explicit mappings: {Object.keys(mappings).length}</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {Object.entries(mappings).map(([character, mapping]) => (
                <li key={character}>{character} → {mapping.preferred_term} · {mapping.concept_id}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => void derive()}
            disabled={!registry || !newVersion.trim() || !Object.keys(mappings).length || status === "working"}
            className="mt-5 rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            Create reviewed immutable registry version
          </button>
          {receipt && <p className="mt-4 break-all text-xs text-muted-foreground">Receipt: {receipt}</p>}
        </section>
      </div>
    </main>
  );
}
