import { useMemo, useState } from "react";
import { Camera, LocateFixed, MapPin, Search, Sprout, Trash2, Wifi, WifiOff } from "lucide-react";
import {
  createFieldDraft,
  readFieldDrafts,
  writeFieldDrafts,
  type FieldDraft,
  type FieldLocalityVisibility,
  type FieldMediaDescriptor,
} from "@/lib/fieldDrafts";
import { useAuth } from "@/contexts/AuthContext";

function nextDraftIdentity() {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `field-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    now: new Date().toISOString(),
  };
}

const localityLabels: Record<FieldLocalityVisibility, string> = {
  private: "Private",
  research_restricted: "Research Restricted",
  public: "Public",
};

export default function CalyxField() {
  const { user } = useAuth();
  const accountId = user?.id ?? "";
  const [drafts, setDrafts] = useState<FieldDraft[]>(() =>
    readFieldDrafts(window.localStorage, accountId),
  );
  const [note, setNote] = useState("");
  const [taxonLabel, setTaxonLabel] = useState("");
  const [localityVisibility, setLocalityVisibility] = useState<FieldLocalityVisibility>("private");
  const [media, setMedia] = useState<FieldMediaDescriptor[]>([]);
  const [locationStatus, setLocationStatus] = useState<"idle" | "requesting" | "captured" | "denied">("idle");
  const [query, setQuery] = useState("");
  const [unidentifiedOnly, setUnidentifiedOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredDrafts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return drafts.filter((draft) => {
      if (unidentifiedOnly && draft.taxonLabel) return false;
      if (!normalizedQuery) return true;
      return `${draft.note} ${draft.taxonLabel ?? ""}`.toLowerCase().includes(normalizedQuery);
    });
  }, [drafts, query, unidentifiedOnly]);

  function persist(next: FieldDraft[]) {
    writeFieldDrafts(window.localStorage, next, accountId);
    setDrafts(next);
  }

  function captureLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setLocationStatus("denied");
      setError("This browser does not provide geolocation.");
      return;
    }
    setLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      () => setLocationStatus("captured"),
      () => {
        setLocationStatus("denied");
        setError("Location was not captured. You can still save the observation.");
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  }

  function selectMedia(files: FileList | null) {
    if (!files) return;
    setMedia(
      Array.from(files)
        .slice(0, 20)
        .map((file) => ({ name: file.name, size: file.size, type: file.type })),
    );
  }

  function saveDraft() {
    setError(null);
    try {
      const draft = createFieldDraft(
        { note, taxonLabel, localityVisibility, media },
        nextDraftIdentity(),
      );
      persist([draft, ...drafts]);
      setNote("");
      setTaxonLabel("");
      setMedia([]);
      setLocationStatus("idle");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The draft could not be saved.");
    }
  }

  return (
    <main className="min-h-screen bg-cream text-ink">
      <header className="border-b border-quiet bg-ink px-4 py-8 text-white sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="label-eyebrow">Calyx Field · Lance pilot</p>
            <h1 className="mt-2 text-4xl">Field Journal</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/75">
              Capture a simple observation now. Draft text and media metadata stay on this device until the governed backend upload path is available.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-xs">
            {navigator.onLine ? <Wifi aria-hidden="true" className="h-4 w-4" /> : <WifiOff aria-hidden="true" className="h-4 w-4" />}
            {navigator.onLine ? "Online" : "Offline — drafts still work"}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1.1fr_0.9fr] sm:px-8">
        <section aria-labelledby="new-observation-heading" className="rounded-xl border border-quiet bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Sprout aria-hidden="true" className="h-6 w-6 text-forest" />
            <h2 id="new-observation-heading" className="text-2xl">New observation</h2>
          </div>

          <label className="mt-6 block text-sm font-semibold" htmlFor="field-taxon">Plant or tag text <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input id="field-taxon" value={taxonLabel} onChange={(event) => setTaxonLabel(event.target.value)} className="mt-2 w-full rounded-md border bg-white px-3 py-2" placeholder="e.g. Phragmipedium kovachii hybrid" />

          <label className="mt-5 block text-sm font-semibold" htmlFor="field-note">Field note</label>
          <textarea id="field-note" value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 min-h-32 w-full rounded-md border bg-white px-3 py-2" placeholder="What did you observe?" maxLength={5000} />

          <label className="mt-5 block text-sm font-semibold" htmlFor="field-locality">Locality visibility</label>
          <select id="field-locality" value={localityVisibility} onChange={(event) => setLocalityVisibility(event.target.value as FieldLocalityVisibility)} className="mt-2 w-full rounded-md border bg-white px-3 py-2">
            <option value="private">Private</option>
            <option value="research_restricted">Research Restricted</option>
            <option value="public">Public</option>
          </select>
          <p className="mt-2 text-xs text-muted-foreground">Visibility is explicit. Nothing is published automatically.</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={captureLocation} disabled={locationStatus === "requesting"} className="flex items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm hover:bg-secondary disabled:opacity-60">
              <LocateFixed aria-hidden="true" className="h-4 w-4" />
              {locationStatus === "requesting" ? "Requesting…" : "Capture location"}
            </button>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm hover:bg-secondary">
              <Camera aria-hidden="true" className="h-4 w-4" />
              Choose photos or video
              <input className="sr-only" type="file" accept="image/*,video/*" multiple onChange={(event) => selectMedia(event.target.files)} />
            </label>
          </div>

          {locationStatus === "captured" ? <p className="mt-3 rounded-md bg-secondary p-3 text-xs"><MapPin aria-hidden="true" className="mr-1 inline h-4 w-4" />Location captured for secure upload. Exact coordinates are not placed in offline browser storage.</p> : null}
          {media.length ? <p className="mt-3 text-xs text-muted-foreground">{media.length} media file{media.length === 1 ? "" : "s"} selected. File contents remain with the browser picker; only safe metadata is saved in the offline draft.</p> : null}
          {error ? <p role="alert" className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

          <button type="button" onClick={saveDraft} className="mt-6 w-full rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground">Save offline draft</button>
        </section>

        <section aria-labelledby="drafts-heading">
          <div className="flex items-end justify-between gap-3">
            <div><p className="label-eyebrow">On this device</p><h2 id="drafts-heading" className="mt-1 text-2xl">Draft observations</h2></div>
            <span className="text-sm text-muted-foreground">{drafts.length} saved</span>
          </div>
          <div className="mt-4 flex gap-2">
            <label className="relative flex-1"><span className="sr-only">Search drafts</span><Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-md border bg-white py-2 pl-9 pr-3" placeholder="Search drafts" /></label>
            <button type="button" aria-pressed={unidentifiedOnly} onClick={() => setUnidentifiedOnly((value) => !value)} className="rounded-md border bg-white px-3 text-xs">{unidentifiedOnly ? "All drafts" : "Unidentified"}</button>
          </div>

          <div className="mt-4 space-y-3">
            {filteredDrafts.map((draft) => (
              <article key={draft.id} className="rounded-xl border border-quiet bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{draft.taxonLabel ?? "Unidentified orchid"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(draft.createdAt).toLocaleString()} · {localityLabels[draft.localityVisibility]}</p>
                  </div>
                  <button type="button" aria-label="Discard draft" onClick={() => {
                    try {
                      persist(drafts.filter((item) => item.id !== draft.id));
                    } catch {
                      setError("The draft could not be removed from this device.");
                    }
                  }} className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-destructive"><Trash2 aria-hidden="true" className="h-4 w-4" /></button>
                </div>
                <p className="mt-3 text-sm">{draft.note}</p>
                {!draft.taxonLabel ? <p className="mt-3 rounded-md bg-secondary p-2 text-xs"><strong>Calyx suggestion pending.</strong> Any future identification is a suggestion, not a verified determination.</p> : null}
                {draft.media.length ? <p className="mt-3 text-xs text-muted-foreground">{draft.media.length} media attachment{draft.media.length === 1 ? "" : "s"} awaiting governed upload.</p> : null}
                <p className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">Local draft · not published</p>
              </article>
            ))}
            {!filteredDrafts.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No matching drafts on this device.</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
