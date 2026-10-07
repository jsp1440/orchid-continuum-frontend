import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  Sprout,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  createFieldDraft,
  readFieldDrafts,
  transitionFieldDraftSync,
  writeFieldDrafts,
  type FieldCoordinates,
  type FieldDraft,
  type FieldLocalityVisibility,
  type FieldMediaDescriptor,
  type FieldSyncStatus,
} from "@/lib/fieldDrafts";
import {
  deleteFieldMediaForDraft,
  listFieldMedia,
  saveFieldMedia,
} from "@/lib/fieldMediaStore";
import {
  buildDraftsManifest,
  buildObservationBundle,
  observationExportFilename,
  serializeObservationBundle,
} from "@/lib/fieldExport";
import { syncDraftWithTaxonomy } from "@/lib/fieldSync";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Lance Field Kit v0.1 — Field Journal.
 *
 * Offline-first observation capture for iPad field work. Draft records live
 * in localStorage, original photos/videos live in IndexedDB, and nothing
 * leaves the device until the observer explicitly exports a bundle. The sync
 * status of every draft is always visible: SAVED LOCALLY / SYNC PENDING /
 * SYNCED / SYNC ERROR.
 */

const STEPS = [
  { key: "photos", label: "Photos" },
  { key: "location", label: "Location" },
  { key: "identification", label: "Identification" },
  { key: "habitat", label: "Habitat & ecology" },
  { key: "relationships", label: "Relationships" },
  { key: "notes", label: "Notes & save" },
] as const;

const syncLabels: Record<FieldSyncStatus, string> = {
  local_saved: "Saved locally",
  sync_pending: "Sync pending",
  synced: "Synced",
  sync_error: "Sync error",
};

const syncBadgeClasses: Record<FieldSyncStatus, string> = {
  local_saved: "bg-secondary text-ink",
  sync_pending: "bg-[#fdf3d8] text-[#8a6418]",
  synced: "bg-[#e2f0e5] text-forest",
  sync_error: "bg-destructive/10 text-destructive",
};

const localityLabels: Record<FieldLocalityVisibility, string> = {
  private: "Private",
  research_restricted: "Research Restricted",
  public: "Public",
};

const GROWTH_HABITS = ["Epiphytic", "Terrestrial", "Lithophytic", "Climbing", "Unknown"] as const;
const OBSERVER_KEY = "orchid-continuum.field-observer";

function nextDraftIdentity() {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `field-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    now: new Date().toISOString(),
  };
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function CalyxField() {
  const { user } = useAuth();
  const accountId = user?.id ?? "";
  const [drafts, setDrafts] = useState<FieldDraft[]>(() =>
    readFieldDrafts(window.localStorage, accountId),
  );

  // Wizard state
  const [step, setStep] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [coordinates, setCoordinates] = useState<FieldCoordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "requesting" | "captured" | "denied">("idle");
  const [taxonLabel, setTaxonLabel] = useState("");
  const [localityVisibility, setLocalityVisibility] = useState<FieldLocalityVisibility>("private");
  const [growthHabit, setGrowthHabit] = useState("");
  const [substrate, setSubstrate] = useState("");
  const [habitat, setHabitat] = useState("");
  const [surroundingVegetation, setSurroundingVegetation] = useState("");
  const [plantDescription, setPlantDescription] = useState("");
  const [pollinatorInteraction, setPollinatorInteraction] = useState("");
  const [mycorrhizalObservation, setMycorrhizalObservation] = useState("");
  const [otherRelationships, setOtherRelationships] = useState("");
  const [note, setNote] = useState("");
  const [observerName, setObserverName] = useState(
    () => window.localStorage.getItem(OBSERVER_KEY) ?? "",
  );
  const [provenance, setProvenance] = useState("");
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState("");
  const [unidentifiedOnly, setUnidentifiedOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncingIds, setSyncingIds] = useState<ReadonlySet<string>>(new Set());
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const thumbnailsRef = useRef<Record<string, string>>({});
  const draftsRef = useRef<FieldDraft[]>(drafts);
  draftsRef.current = drafts;

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Revoke thumbnail object URLs on unmount.
  useEffect(() => () => {
    Object.values(thumbnailsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const filteredDrafts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return drafts.filter((draft) => {
      if (unidentifiedOnly && draft.taxonLabel) return false;
      if (!normalizedQuery) return true;
      return `${draft.note} ${draft.taxonLabel ?? ""} ${draft.ecology.habitat ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [drafts, query, unidentifiedOnly]);

  function persist(next: FieldDraft[]) {
    writeFieldDrafts(window.localStorage, next, accountId);
    setDrafts(next);
  }

  function selectMedia(files: FileList | null) {
    if (!files) return;
    setPendingFiles(Array.from(files).slice(0, 20));
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
      (position) => {
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          elevationMeters:
            typeof position.coords.altitude === "number" && Number.isFinite(position.coords.altitude)
              ? position.coords.altitude
              : null,
        });
        setLocationStatus("captured");
      },
      () => {
        setLocationStatus("denied");
        setError("Location was not captured. You can still save the observation.");
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 },
    );
  }

  function resetForm() {
    setPendingFiles([]);
    setCoordinates(null);
    setLocationStatus("idle");
    setTaxonLabel("");
    setLocalityVisibility("private");
    setGrowthHabit("");
    setSubstrate("");
    setHabitat("");
    setSurroundingVegetation("");
    setPlantDescription("");
    setPollinatorInteraction("");
    setMycorrhizalObservation("");
    setOtherRelationships("");
    setNote("");
    setProvenance("");
    setStep(0);
  }

  async function saveDraft() {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const identity = nextDraftIdentity();
      let media: FieldMediaDescriptor[] = [];
      if (pendingFiles.length > 0) {
        // Originals go to IndexedDB first — if this throws, no draft is
        // written and nothing is silently lost.
        media = await saveFieldMedia(identity.id, pendingFiles, identity.now);
      }
      const draft = createFieldDraft(
        {
          note,
          taxonLabel,
          localityVisibility,
          coordinates,
          ecology: { growthHabit, substrate, habitat, surroundingVegetation, plantDescription },
          relationships: { pollinatorInteraction, mycorrhizalObservation, otherRelationships },
          observerName,
          provenance,
          media,
        },
        identity,
      );
      persist([draft, ...drafts]);
      if (observerName.trim()) {
        window.localStorage.setItem(OBSERVER_KEY, observerName.trim());
      }
      resetForm();
      setNotice("Observation saved on this device. Originals preserved offline.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The observation could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function discardDraft(draft: FieldDraft) {
    setError(null);
    try {
      await deleteFieldMediaForDraft(draft.id);
      persist(drafts.filter((item) => item.id !== draft.id));
    } catch {
      setError("The draft could not be removed from this device.");
    }
  }

  async function exportDraft(draft: FieldDraft) {
    setError(null);
    setNotice(null);
    try {
      const mediaRecords = await listFieldMedia(draft.id);
      const bundle = await buildObservationBundle(draft, mediaRecords, new Date().toISOString());
      downloadTextFile(observationExportFilename(draft), serializeObservationBundle(bundle));
      setNotice(`Exported ${observationExportFilename(draft)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Export failed.");
    }
  }

  function exportManifest() {
    downloadTextFile(
      `field-observations-index-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(buildDraftsManifest(drafts, new Date().toISOString()), null, 2),
    );
  }

  async function syncOne(draft: FieldDraft) {
    setSyncingIds((current) => new Set(current).add(draft.id));
    setError(null);
    try {
      const outcome = await syncDraftWithTaxonomy(draft);
      persist(draftsRef.current.map((item) => (item.id === draft.id ? outcome.draft : item)));
      if (outcome.confirmed) {
        setNotice(`Synced to Orchid Continuum (${outcome.backendObservationId ?? "confirmed"}). Originals stay on this device.`);
      } else {
        setError(outcome.draft.syncError ?? "Sync failed. The observation is safe on this device.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sync failed. The observation is safe on this device.");
    } finally {
      setSyncingIds((current) => {
        const next = new Set(current);
        next.delete(draft.id);
        return next;
      });
    }
  }

  async function syncAll() {
    const targets = draftsRef.current.filter((draft) => draft.syncStatus !== "synced");
    for (const draft of targets) {
      // Sequential: one observation at a time is gentler on field bandwidth
      // and each failure is isolated to its own record.
      // eslint-disable-next-line no-await-in-loop
      await syncOne(draft);
    }
  }

  // Connectivity returned: push everything still waiting. The backend dedupes
  // per (observer, client_draft_id), so re-sending is always safe.
  useEffect(() => {
    if (!online) return;
    const waiting = draftsRef.current.filter(
      (draft) => draft.syncStatus === "sync_pending" || draft.syncStatus === "sync_error",
    );
    if (waiting.length === 0) return;
    void (async () => {
      for (const draft of waiting) {
        // eslint-disable-next-line no-await-in-loop
        await syncOne(draft);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  function queueForSync(draft: FieldDraft) {
    try {
      persist(
        drafts.map((item) =>
          item.id === draft.id
            ? transitionFieldDraftSync(item, "sync_pending", new Date().toISOString())
            : item,
        ),
      );
      if (navigator.onLine) {
        void syncOne({ ...draft, syncStatus: "sync_pending" });
      } else {
        setNotice("Queued for sync. It will upload automatically when connectivity returns — export remains available as backup.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not queue the draft.");
    }
  }

  function showThumbnails(draft: FieldDraft) {
    if (thumbnails[draft.id] !== undefined || draft.media.length === 0) return;
    listFieldMedia(draft.id)
      .then((records) => {
        const first = records[0];
        if (!first) return;
        const url = URL.createObjectURL(first.blob);
        thumbnailsRef.current[draft.id] = url;
        setThumbnails((current) => ({ ...current, [draft.id]: url }));
      })
      .catch(() => undefined);
  }

  const inputClass = "mt-2 w-full rounded-md border bg-white px-4 py-3 text-base";
  const labelClass = "mt-5 block text-sm font-semibold";

  return (
    <main className="min-h-screen bg-cream text-ink">
      <header className="border-b border-quiet bg-ink px-4 py-8 text-white sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="label-eyebrow">Calyx Field · Lance Field Kit v0.1</p>
            <h1 className="mt-2 text-4xl">Field Journal</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/75">
              Capture first. Synchronize second. Observations and original photos stay on this
              iPad until you export them — nothing is ever discarded because the network is down.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2.5 text-sm">
            {online ? <Wifi aria-hidden="true" className="h-5 w-5" /> : <WifiOff aria-hidden="true" className="h-5 w-5" />}
            {online ? "Online" : "Offline — capture still works"}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1.1fr_0.9fr] sm:px-8">
        <section aria-labelledby="new-observation-heading" className="rounded-xl border border-quiet bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <Sprout aria-hidden="true" className="h-6 w-6 text-forest" />
            <h2 id="new-observation-heading" className="text-2xl">New observation</h2>
          </div>

          {/* Step indicator — large touch targets */}
          <ol className="mt-5 flex flex-wrap gap-2" aria-label="Observation steps">
            {STEPS.map((item, index) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => setStep(index)}
                  aria-current={step === index ? "step" : undefined}
                  className={[
                    "rounded-full px-4 py-2.5 text-sm border transition-colors",
                    step === index
                      ? "bg-primary border-primary text-primary-foreground font-semibold"
                      : "bg-white border-quiet text-muted-foreground hover:border-forest",
                  ].join(" ")}
                >
                  {index + 1}. {item.label}
                </button>
              </li>
            ))}
          </ol>

          <div className="mt-6 min-h-64">
            {step === 0 ? (
              <div>
                <p className="text-sm text-muted-foreground">
                  Take or add photos and video first — you can identify the plant later, or never.
                  Originals are preserved exactly as captured.
                </p>
                <label className="mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-quiet px-4 py-8 text-center hover:border-forest">
                  <Camera aria-hidden="true" className="h-10 w-10 text-forest" />
                  <span className="text-base font-semibold">Take photos / video or choose files</span>
                  <span className="text-xs text-muted-foreground">Up to 20 files per observation</span>
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={(event) => selectMedia(event.target.files)}
                  />
                </label>
                {pendingFiles.length ? (
                  <ul className="mt-4 space-y-2">
                    {pendingFiles.map((file) => (
                      <li key={`${file.name}-${file.size}`} className="flex items-center justify-between rounded-md bg-secondary px-3 py-2.5 text-sm">
                        <span className="truncate">{file.name}</span>
                        <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                          {(file.size / 1_048_576).toFixed(1)} MB · {file.type.startsWith("video") ? "video" : "photo"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {step === 1 ? (
              <div>
                <p className="text-sm text-muted-foreground">
                  Coordinates are stored in the protected observation record on this device. If the
                  observation is ever marked public, the stored fix is automatically coarsened —
                  exact localities never leave through the public path.
                </p>
                <button
                  type="button"
                  onClick={captureLocation}
                  disabled={locationStatus === "requesting"}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border px-4 py-4 text-base hover:bg-secondary disabled:opacity-60"
                >
                  <LocateFixed aria-hidden="true" className="h-5 w-5" />
                  {locationStatus === "requesting" ? "Requesting GPS…" : "Capture GPS location"}
                </button>
                {locationStatus === "captured" && coordinates ? (
                  <p className="mt-3 rounded-md bg-secondary p-3 text-sm">
                    <MapPin aria-hidden="true" className="mr-1 inline h-4 w-4" />
                    Fix captured
                    {coordinates.accuracyMeters !== null ? ` (±${Math.round(coordinates.accuracyMeters)} m)` : ""}
                    {coordinates.elevationMeters !== null ? ` · elevation ${Math.round(coordinates.elevationMeters)} m` : ""}.
                    Precise values stay in the protected record.
                  </p>
                ) : null}
                <label className={labelClass} htmlFor="field-locality">Locality visibility</label>
                <select
                  id="field-locality"
                  value={localityVisibility}
                  onChange={(event) => setLocalityVisibility(event.target.value as FieldLocalityVisibility)}
                  className={inputClass}
                >
                  <option value="private">Private — precise coordinates protected</option>
                  <option value="research_restricted">Research Restricted — precise coordinates protected</option>
                  <option value="public">Public — coordinates coarsened automatically</option>
                </select>
              </div>
            ) : null}

            {step === 2 ? (
              <div>
                <p className="text-sm text-muted-foreground">
                  Optional. Leave blank to save as <strong>UNKNOWN / UNIDENTIFIED</strong>. A field
                  label is always tentative — it is never treated as a verified determination.
                </p>
                <label className={labelClass} htmlFor="field-taxon">Tentative taxon label</label>
                <input
                  id="field-taxon"
                  value={taxonLabel}
                  onChange={(event) => setTaxonLabel(event.target.value)}
                  className={inputClass}
                  placeholder="e.g. Phragmipedium cf. kovachii — or leave blank"
                />
                <label className={labelClass} htmlFor="field-plant-description">Flower / plant description</label>
                <textarea
                  id="field-plant-description"
                  value={plantDescription}
                  onChange={(event) => setPlantDescription(event.target.value)}
                  className={`${inputClass} min-h-28`}
                  placeholder="Colour, size, number of flowers, condition…"
                />
              </div>
            ) : null}

            {step === 3 ? (
              <div>
                <span className={labelClass}>Growth habit</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {GROWTH_HABITS.map((habit) => (
                    <button
                      key={habit}
                      type="button"
                      aria-pressed={growthHabit === habit}
                      onClick={() => setGrowthHabit(growthHabit === habit ? "" : habit)}
                      className={[
                        "rounded-full px-4 py-2.5 text-sm border transition-colors",
                        growthHabit === habit
                          ? "bg-primary border-primary text-primary-foreground font-semibold"
                          : "bg-white border-quiet hover:border-forest",
                      ].join(" ")}
                    >
                      {habit}
                    </button>
                  ))}
                </div>
                <label className={labelClass} htmlFor="field-substrate">Substrate</label>
                <input id="field-substrate" value={substrate} onChange={(event) => setSubstrate(event.target.value)} className={inputClass} placeholder="e.g. mossy branch, leaf litter, rock face" />
                <label className={labelClass} htmlFor="field-habitat">Habitat</label>
                <input id="field-habitat" value={habitat} onChange={(event) => setHabitat(event.target.value)} className={inputClass} placeholder="e.g. cloud forest edge, 2,900 m" />
                <label className={labelClass} htmlFor="field-vegetation">Surrounding vegetation</label>
                <textarea id="field-vegetation" value={surroundingVegetation} onChange={(event) => setSurroundingVegetation(event.target.value)} className={`${inputClass} min-h-24`} placeholder="Nearby trees, shrubs, other orchids…" />
              </div>
            ) : null}

            {step === 4 ? (
              <div>
                <p className="text-sm text-muted-foreground">
                  Record only what you actually observed. Sharing a photograph is not evidence of an
                  ecological relationship.
                </p>
                <label className={labelClass} htmlFor="field-pollinator">Pollinator / animal interaction</label>
                <textarea id="field-pollinator" value={pollinatorInteraction} onChange={(event) => setPollinatorInteraction(event.target.value)} className={`${inputClass} min-h-24`} placeholder="e.g. bee entered flower, 14:20, visited twice" />
                <label className={labelClass} htmlFor="field-mycorrhizal">Fungal / mycorrhizal observation</label>
                <textarea id="field-mycorrhizal" value={mycorrhizalObservation} onChange={(event) => setMycorrhizalObservation(event.target.value)} className={`${inputClass} min-h-24`} placeholder="e.g. white mycelium on roots" />
                <label className={labelClass} htmlFor="field-other-rel">Other ecological relationships</label>
                <textarea id="field-other-rel" value={otherRelationships} onChange={(event) => setOtherRelationships(event.target.value)} className={`${inputClass} min-h-24`} placeholder="Ants, moss associations, host tree…" />
              </div>
            ) : null}

            {step === 5 ? (
              <div>
                <label className="block text-sm font-semibold" htmlFor="field-note">Field notes</label>
                <textarea
                  id="field-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className={`${inputClass} min-h-36`}
                  placeholder="What did you observe? (dictation works with the iPad keyboard microphone)"
                  maxLength={5000}
                />
                <label className={labelClass} htmlFor="field-observer">Observer</label>
                <input id="field-observer" value={observerName} onChange={(event) => setObserverName(event.target.value)} className={inputClass} placeholder="e.g. Lance Peck" />
                <label className={labelClass} htmlFor="field-provenance">Provenance / source</label>
                <input id="field-provenance" value={provenance} onChange={(event) => setProvenance(event.target.value)} className={inputClass} placeholder="e.g. personal observation, Peru expedition 2026" />
              </div>
            ) : null}
          </div>

          {error ? <p role="alert" className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="flex items-center justify-center gap-1 rounded-md border px-5 py-3.5 text-base disabled:opacity-40"
            >
              <ChevronLeft aria-hidden="true" className="h-5 w-5" /> Back
            </button>
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-5 py-3.5 text-base font-semibold text-primary-foreground"
              >
                Next <ChevronRight aria-hidden="true" className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={saveDraft}
                disabled={saving}
                className="flex-1 rounded-md bg-primary px-5 py-3.5 text-base font-semibold text-primary-foreground disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save observation on this device"}
              </button>
            )}
          </div>
        </section>

        <section aria-labelledby="drafts-heading">
          <div className="flex items-end justify-between gap-3">
            <div><p className="label-eyebrow">On this device</p><h2 id="drafts-heading" className="mt-1 text-2xl">Observations</h2></div>
            <span className="text-sm text-muted-foreground">{drafts.length} saved</span>
          </div>
          {notice ? <p className="mt-3 rounded-md bg-[#e2f0e5] p-3 text-sm text-forest">{notice}</p> : null}
          <div className="mt-4 flex gap-2">
            <label className="relative flex-1">
              <span className="sr-only">Search observations</span>
              <Search aria-hidden="true" className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-md border bg-white py-3 pl-9 pr-3" placeholder="Search observations" />
            </label>
            <button type="button" aria-pressed={unidentifiedOnly} onClick={() => setUnidentifiedOnly((value) => !value)} className="rounded-md border bg-white px-3 text-xs">
              {unidentifiedOnly ? "All" : "Unidentified"}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" onClick={exportManifest} className="flex w-full items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm hover:bg-secondary">
              <Download aria-hidden="true" className="h-4 w-4" /> Export index
            </button>
            <button
              type="button"
              onClick={() => void syncAll()}
              disabled={!online || drafts.every((draft) => draft.syncStatus === "synced")}
              className="flex w-full items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm hover:bg-secondary disabled:opacity-40"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" /> Sync all now
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {filteredDrafts.map((draft) => (
              <article key={draft.id} className="rounded-xl border border-quiet bg-white p-4" onMouseEnter={() => showThumbnails(draft)} onFocus={() => showThumbnails(draft)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{draft.taxonLabel ?? "Unidentified orchid"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(draft.createdAt).toLocaleString()} · {localityLabels[draft.localityVisibility]}
                      {draft.coordinates ? " · GPS" : ""}
                      {draft.observerName ? ` · ${draft.observerName}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${syncBadgeClasses[draft.syncStatus]}`}>
                    {syncLabels[draft.syncStatus]}
                  </span>
                </div>
                {thumbnails[draft.id] ? (
                  <img src={thumbnails[draft.id]} alt="First attachment" className="mt-3 h-32 w-full rounded-md object-cover" />
                ) : null}
                {draft.note ? <p className="mt-3 text-sm">{draft.note}</p> : null}
                {draft.syncStatus === "sync_error" && draft.syncError ? (
                  <p className="mt-3 rounded-md bg-destructive/5 p-2 text-xs text-destructive">Last sync error: {draft.syncError}</p>
                ) : null}
                {!draft.taxonLabel ? (
                  <p className="mt-3 rounded-md bg-secondary p-2 text-xs">
                    <strong>Unidentified.</strong> Any future identification is a suggestion, not a verified determination.
                  </p>
                ) : null}
                {draft.media.length ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {draft.media.length} original file{draft.media.length === 1 ? "" : "s"} preserved on this device.
                  </p>
                ) : null}
                {draft.taxonomyMatch ? (
                  <p className="mt-3 rounded-md bg-[#e2f0e5] p-2 text-xs text-forest">
                    Canonical match: <em>{draft.taxonomyMatch.canonicalName}</em>
                    {draft.taxonomyMatch.taxonomyId ? ` (${draft.taxonomyMatch.taxonomyId})` : ""} — the observer's label stays tentative.
                  </p>
                ) : null}
                {draft.backendObservationId ? (
                  <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">Backend record {draft.backendObservationId}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => exportDraft(draft)} className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs hover:bg-secondary">
                    <Download aria-hidden="true" className="h-3.5 w-3.5" /> Export bundle
                  </button>
                  {draft.syncStatus !== "synced" ? (
                    <button
                      type="button"
                      onClick={() => (online ? void syncOne(draft) : queueForSync(draft))}
                      disabled={syncingIds.has(draft.id)}
                      className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50"
                    >
                      <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${syncingIds.has(draft.id) ? "animate-spin" : ""}`} />
                      {syncingIds.has(draft.id) ? "Syncing…" : online ? "Sync now" : "Queue for sync"}
                    </button>
                  ) : null}
                  <button type="button" aria-label="Discard observation" onClick={() => discardDraft(draft)} className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs text-destructive hover:bg-destructive/5">
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" /> Discard
                  </button>
                </div>
              </article>
            ))}
            {!filteredDrafts.length ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No matching observations on this device.</p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
