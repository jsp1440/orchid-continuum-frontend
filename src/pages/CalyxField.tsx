import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Edit3,
  Download,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  Sprout,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  applyFieldObservationEdit,
  canEditFieldObservation,
  createFieldObservation,
  fieldObservationStatusLabel,
  mediaKindFromType,
  newFieldJournalId,
  nowIso,
  queueFieldObservation,
  sha256Hex,
  type FieldCertainty,
  type FieldLocalityVisibility,
  type FieldMedia,
  type FieldObservation,
  type FieldSyncStatus,
  type PrivateCaptureLocation,
} from "@/lib/fieldJournal";
import {
  listFieldObservations,
  saveFieldObservation,
} from "@/lib/fieldJournalStore";
import { fieldJournalMetadataExport } from "@/lib/fieldJournalExport";
import { discardSavedFieldObservation, editSavedFieldObservation, recoverSavedFieldObservation, syncSavedFieldObservation } from "@/lib/fieldJournalCoordinator";

const localityLabels: Record<FieldLocalityVisibility, string> = {
  private: "Private",
  research_restricted: "Research Restricted",
  public: "Public",
};

const certaintyLabels: Record<FieldCertainty, string> = {
  CONFIRMED: "Confirmed by observer",
  PROBABLE: "Probable",
  POSSIBLE: "Possible",
  UNCERTAIN: "Uncertain / unresolved",
};

function statusClasses(status: FieldSyncStatus): string {
  switch (status) {
    case "synchronized": return "border-emerald-300 bg-emerald-50 text-emerald-800";
    case "syncing": return "border-sky-300 bg-sky-50 text-sky-800";
    case "queued": return "border-amber-300 bg-amber-50 text-amber-800";
    case "failed": return "border-red-300 bg-red-50 text-red-800";
    case "local_only": return "border-slate-300 bg-slate-50 text-slate-700";
  }
}

function toDatetimeLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function splitOrganisms(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export default function CalyxField() {
  const { user } = useAuth();
  const accountId = user?.id ?? "";
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [observations, setObservations] = useState<FieldObservation[]>([]);
  const [storeReady, setStoreReady] = useState(false);
  const [query, setQuery] = useState("");
  const [unidentifiedOnly, setUnidentifiedOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [includePrivateExportLocation, setIncludePrivateExportLocation] = useState(false);
  const [note, setNote] = useState("");
  const [taxonLabel, setTaxonLabel] = useState("");
  const [certainty, setCertainty] = useState<FieldCertainty>("POSSIBLE");
  const [localityVisibility, setLocalityVisibility] = useState<FieldLocalityVisibility>("private");
  const [observedAtLocal, setObservedAtLocal] = useState("");
  const [habitat, setHabitat] = useState("");
  const [substrate, setSubstrate] = useState("");
  const [ecologicalNotes, setEcologicalNotes] = useState("");
  const [associatedOrganisms, setAssociatedOrganisms] = useState("");
  const [pollinatorObservations, setPollinatorObservations] = useState("");
  const [mycorrhizalObservations, setMycorrhizalObservations] = useState("");
  const [phenology, setPhenology] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [privateLocation, setPrivateLocation] = useState<PrivateCaptureLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "requesting" | "captured" | "denied">("idle");

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!accountId) {
      setObservations([]);
      setStoreReady(false);
      return;
    }
    setStoreReady(false);
    const refresh = () => {
      void listFieldObservations(accountId)
      .then((rows) => Promise.all(rows.map(recoverSavedFieldObservation)))
      .then((rows) => {
        if (!cancelled) {
          setObservations(rows);
          setStoreReady(true);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Offline field storage is unavailable.");
          setStoreReady(false);
        }
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [accountId]);

  const mediaUrls = useMemo(() => {
    const urls = new Map<string, string>();
    for (const observation of observations) {
      for (const media of observation.media) {
        if (!urls.has(media.id)) urls.set(media.id, URL.createObjectURL(media.blob));
      }
    }
    return urls;
  }, [observations]);

  useEffect(() => {
    return () => {
      mediaUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [mediaUrls]);

  const filteredObservations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return observations.filter((observation) => {
      if (unidentifiedOnly && observation.taxonLabel) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        observation.note,
        observation.taxonLabel ?? "",
        observation.habitat ?? "",
        observation.substrate ?? "",
        observation.associatedOrganisms.join(" "),
      ].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [observations, query, unidentifiedOnly]);

  function resetForm() {
    setEditingId(null);
    setNote("");
    setTaxonLabel("");
    setCertainty("POSSIBLE");
    setLocalityVisibility("private");
    setObservedAtLocal("");
    setHabitat("");
    setSubstrate("");
    setEcologicalNotes("");
    setAssociatedOrganisms("");
    setPollinatorObservations("");
    setMycorrhizalObservations("");
    setPhenology("");
    setSelectedFiles([]);
    setPrivateLocation(null);
    setLocationStatus("idle");
  }

  function captureLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setLocationStatus("denied");
      setError("This browser does not provide geolocation. The observation can still be saved without a private capture point.");
      return;
    }
    setLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPrivateLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          elevationM: Number.isFinite(position.coords.altitude ?? NaN) ? position.coords.altitude : null,
          capturedAt: new Date(position.timestamp).toISOString(),
          localityNotes: privateLocation?.localityNotes ?? null,
        });
        setLocationStatus("captured");
      },
      () => {
        setLocationStatus("denied");
        setError("Location was not captured. You can still save the observation without coordinates.");
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
  }

  function updateLocalityNotes(value: string) {
    setPrivateLocation((current) => current ? { ...current, localityNotes: value || null } : current);
  }

  function selectMedia(files: FileList | null, input: HTMLInputElement) {
    if (!files) return;
    const chosen = Array.from(files).slice(0, 20);
    try {
      chosen.forEach((file) => mediaKindFromType(file.type));
      setSelectedFiles(chosen);
      setError(null);
    } catch (caught) {
      setSelectedFiles([]);
      setError(caught instanceof Error ? caught.message : "Only photos and video can be attached.");
    } finally {
      input.value = "";
    }
  }

  async function filesToMedia(files: File[]): Promise<FieldMedia[]> {
    const capturedAt = nowIso();
    return Promise.all(files.map(async (file) => ({
      id: newFieldJournalId(),
      name: file.name || "field-media",
      size: file.size,
      type: file.type || "application/octet-stream",
      kind: mediaKindFromType(file.type),
      blob: file,
      capturedAt,
      sha256: await sha256Hex(file),
      storageKey: null,
      serverMediaId: null,
      uploadedAt: null,
    })));
  }

  async function saveObservation() {
    setError(null);
    setNotice(null);
    try {
      const now = nowIso();
      const newMedia = await filesToMedia(selectedFiles);
      const existing = editingId ? observations.find((item) => item.id === editingId) ?? null : null;
      if (editingId && !existing) throw new Error("The draft being edited is no longer on this device.");
      if (existing && !canEditFieldObservation(existing)) {
        throw new Error("Synchronized records are read-only in this MVP; create a new observation for a correction.");
      }

      const input = {
        note,
        taxonLabel,
        certainty,
        localityVisibility,
        observedAt: observedAtLocal ? new Date(observedAtLocal).toISOString() : existing?.observedAt ?? now,
        privateLocation: privateLocation ?? existing?.privateLocation ?? null,
        habitat,
        substrate,
        ecologicalNotes,
        associatedOrganisms: splitOrganisms(associatedOrganisms),
        pollinatorObservations,
        mycorrhizalObservations,
        phenology,
        media: [...(existing?.media ?? []), ...newMedia],
      };

      let observation = existing
        ? applyFieldObservationEdit(existing, input, now)
        : createFieldObservation({ ...input, accountId }, { id: newFieldJournalId(), now });

      if (navigator.onLine) observation = queueFieldObservation(observation);
      const saved = existing
        ? await editSavedFieldObservation(existing, observation)
        : await saveFieldObservation(observation);
      setObservations((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
      resetForm();
      setNotice(navigator.onLine ? "Observation saved and queued for sync." : "Observation saved offline on this iPad.");
      if (navigator.onLine) void syncOne(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The observation could not be saved.");
    }
  }

  function startEdit(observation: FieldObservation) {
    if (!canEditFieldObservation(observation)) {
      setError("Only observations not yet accepted by the server can be edited. Retry incomplete uploads to preserve the accepted record.");
      return;
    }
    setError(null);
    setNotice(null);
    setEditingId(observation.id);
    setNote(observation.note);
    setTaxonLabel(observation.taxonLabel ?? "");
    setCertainty(observation.certainty);
    setLocalityVisibility(observation.localityVisibility);
    setObservedAtLocal(toDatetimeLocal(observation.observedAt));
    setHabitat(observation.habitat ?? "");
    setSubstrate(observation.substrate ?? "");
    setEcologicalNotes(observation.ecologicalNotes ?? "");
    setAssociatedOrganisms(observation.associatedOrganisms.join(", "));
    setPollinatorObservations(observation.pollinatorObservations ?? "");
    setMycorrhizalObservations(observation.mycorrhizalObservations ?? "");
    setPhenology(observation.phenology ?? "");
    setPrivateLocation(observation.privateLocation);
    setSelectedFiles([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function discard(observation: FieldObservation) {
    if (observation.syncStatus === "syncing") return;
    if (observation.syncStatus === "synchronized") {
      setError("A synchronized observation is not deleted locally merely because sync succeeded. Discard is disabled for synced records in this MVP.");
      return;
    }
    try {
      await discardSavedFieldObservation(observation);
      setObservations((current) => current.filter((item) => item.id !== observation.id));
      if (editingId === observation.id) resetForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The observation could not be removed from this device.");
    }
  }

  async function syncOne(observation: FieldObservation) {
    if (syncingIds.has(observation.id)) return;
    setError(null);
    setNotice(null);
    setSyncingIds((current) => new Set(current).add(observation.id));
    try {
      const synced = await syncSavedFieldObservation(observation, (progress) => {
        setObservations((current) => current.map((row) => row.id === progress.id ? progress : row));
      });
      setNotice(synced
        ? `Observation ${synced.serverId} synchronized. The original media remain on this iPad.`
        : "This observation is already syncing in another tab. Return here after it finishes.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sync could not complete. Local originals are retained.");
    } finally {
      setSyncingIds((current) => {
        const next = new Set(current);
        next.delete(observation.id);
        return next;
      });
    }
  }

  function exportMetadata(rows: FieldObservation[]) {
    const mode = includePrivateExportLocation ? "private_backup" : "metadata";
    const payload = fieldJournalMetadataExport(rows, nowIso(), mode);
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `field-journal-${mode}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give iPad Safari time to start the download before releasing its URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setNotice("Metadata download requested. Original photos and videos remain on this device; this is not a media backup.");
  }

  async function syncAll() {
    for (const observation of observations) {
      if (observation.syncStatus !== "synchronized" && observation.syncStatus !== "syncing") {
        await syncOne(observation);
      }
    }
  }

  return (
    <main className="min-h-screen bg-cream text-ink">
      <header className="border-b border-quiet bg-ink px-4 py-8 text-white sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="label-eyebrow">Calyx Field · Lance pilot</p>
            <h1 className="mt-2 text-4xl">Field Journal</h1>
            <p className="mt-2 max-w-3xl text-sm text-white/75">
              Offline-first field capture: originals and exact private capture coordinates stay on this iPad until you choose to sync. The backend receives the governed observation record and original media provenance — never exact coordinates in this MVP.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-xs">
              {online ? <Wifi aria-hidden="true" className="h-4 w-4" /> : <WifiOff aria-hidden="true" className="h-4 w-4" />}
              {online ? "Online" : "Offline — capture still works"}
            </span>
            <button type="button" onClick={() => void syncAll()} disabled={!online || syncingIds.size > 0} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-ink disabled:opacity-50">
              <RefreshCw aria-hidden="true" className="h-4 w-4" /> Sync all
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1.15fr_0.85fr] sm:px-8">
        <section aria-labelledby="new-observation-heading" className="rounded-xl border border-quiet bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Sprout aria-hidden="true" className="h-6 w-6 text-forest" />
            <div>
              <h2 id="new-observation-heading" className="text-2xl">{editingId ? "Edit unsynchronized observation" : "New observation"}</h2>
              <p className="mt-1 text-xs text-muted-foreground">Photos → Location → Identification → Habitat & Ecology → Relationships → Notes & Save</p>
            </div>
          </div>

          <ol className="mt-6 space-y-6">
            <li className="rounded-lg border border-quiet p-4">
              <h3 className="font-semibold">1. Photos and video</h3>
              <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-sm hover:bg-secondary">
                <Camera aria-hidden="true" className="h-4 w-4" />
                Choose original photos or video
                <input className="sr-only" type="file" accept="image/*,video/*" multiple onChange={(event) => selectMedia(event.target.files, event.currentTarget)} />
              </label>
              {selectedFiles.length ? <p className="mt-2 text-xs text-muted-foreground">{selectedFiles.length} new original{selectedFiles.length === 1 ? "" : "s"} will be preserved byte-for-byte in offline storage.</p> : null}
            </li>

            <li className="rounded-lg border border-quiet p-4">
              <h3 className="font-semibold">2. Location</h3>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={captureLocation} disabled={locationStatus === "requesting"} className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-secondary disabled:opacity-60">
                  <LocateFixed aria-hidden="true" className="h-4 w-4" />
                  {locationStatus === "requesting" ? "Requesting…" : privateLocation ? "Recapture private location" : "Capture private location"}
                </button>
                <select value={localityVisibility} onChange={(event) => setLocalityVisibility(event.target.value as FieldLocalityVisibility)} className="rounded-md border bg-white px-3 py-2 text-sm" aria-label="Locality visibility">
                  <option value="private">Private</option>
                  <option value="research_restricted">Research Restricted</option>
                  <option value="public">Public</option>
                </select>
              </div>
              {privateLocation ? (
                <div className="mt-3 space-y-3">
                  <p className="rounded-md bg-secondary p-3 text-xs">
                    <MapPin aria-hidden="true" className="mr-1 inline h-4 w-4" />
                    Private capture saved on this device{privateLocation.accuracyM ? ` · accuracy ±${Math.round(privateLocation.accuracyM)} m` : ""}. Sync sends only the visibility class above; exact coordinates and locality notes are not uploaded by this MVP.
                  </p>
                  <label className="block text-sm font-semibold" htmlFor="field-locality-notes">
                    Private locality notes <span className="font-normal text-muted-foreground">(device-local only)</span>
                    <textarea
                      id="field-locality-notes"
                      value={privateLocation.localityNotes ?? ""}
                      onChange={(event) => updateLocalityNotes(event.target.value)}
                      className="mt-2 min-h-16 w-full rounded-md border bg-white px-3 py-2 font-normal"
                      placeholder="Access notes, landmarks, or cautions that must not be published"
                      maxLength={1000}
                    />
                  </label>
                </div>
              ) : <p className="mt-3 text-xs text-muted-foreground">Optional. If skipped, the observation still saves with time, notes, ecology and media. Capture a private point first if you need device-local locality notes.</p>}
            </li>

            <li className="rounded-lg border border-quiet p-4">
              <h3 className="font-semibold">3. Identification</h3>
              <label className="mt-3 block text-sm font-semibold" htmlFor="field-taxon">Plant or tag text <span className="font-normal text-muted-foreground">(optional — unresolved is allowed)</span></label>
              <input id="field-taxon" value={taxonLabel} onChange={(event) => setTaxonLabel(event.target.value)} className="mt-2 w-full rounded-md border bg-white px-3 py-2" placeholder="Leave blank if unidentified" />
              <label className="mt-3 block text-sm font-semibold" htmlFor="field-certainty">Observer confidence</label>
              <select id="field-certainty" value={certainty} onChange={(event) => setCertainty(event.target.value as FieldCertainty)} className="mt-2 w-full rounded-md border bg-white px-3 py-2">
                {Object.entries(certaintyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </li>

            <li className="rounded-lg border border-quiet p-4">
              <h3 className="font-semibold">4. Habitat and ecology</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input value={habitat} onChange={(event) => setHabitat(event.target.value)} className="rounded-md border bg-white px-3 py-2" placeholder="Habitat (e.g. cloud forest edge)" />
                <input value={substrate} onChange={(event) => setSubstrate(event.target.value)} className="rounded-md border bg-white px-3 py-2" placeholder="Substrate (e.g. mossy branch)" />
                <input value={phenology} onChange={(event) => setPhenology(event.target.value)} className="rounded-md border bg-white px-3 py-2" placeholder="Phenology (e.g. one open flower)" />
                <input value={observedAtLocal} onChange={(event) => setObservedAtLocal(event.target.value)} type="datetime-local" className="rounded-md border bg-white px-3 py-2" aria-label="Observation date and time" />
              </div>
              <textarea value={ecologicalNotes} onChange={(event) => setEcologicalNotes(event.target.value)} className="mt-3 min-h-20 w-full rounded-md border bg-white px-3 py-2" placeholder="Ecological notes" maxLength={3000} />
            </li>

            <li className="rounded-lg border border-quiet p-4">
              <h3 className="font-semibold">5. Relationships</h3>
              <input value={associatedOrganisms} onChange={(event) => setAssociatedOrganisms(event.target.value)} className="mt-3 w-full rounded-md border bg-white px-3 py-2" placeholder="Associated organisms, comma separated" />
              <textarea value={pollinatorObservations} onChange={(event) => setPollinatorObservations(event.target.value)} className="mt-3 min-h-16 w-full rounded-md border bg-white px-3 py-2" placeholder="Pollinator observations" maxLength={2000} />
              <textarea value={mycorrhizalObservations} onChange={(event) => setMycorrhizalObservations(event.target.value)} className="mt-3 min-h-16 w-full rounded-md border bg-white px-3 py-2" placeholder="Mycorrhizal / fungal observations" maxLength={2000} />
            </li>

            <li className="rounded-lg border border-quiet p-4">
              <h3 className="font-semibold">6. Notes and save</h3>
              <textarea id="field-note" value={note} onChange={(event) => setNote(event.target.value)} className="mt-3 min-h-32 w-full rounded-md border bg-white px-3 py-2" placeholder="What did you observe?" maxLength={5000} />
              {error ? <p role="alert" className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"><AlertTriangle aria-hidden="true" className="mr-1 inline h-4 w-4" />{error}</p> : null}
              {notice ? <p role="status" className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 aria-hidden="true" className="mr-1 inline h-4 w-4" />{notice}</p> : null}
              <div className="mt-4 flex gap-3">
                <button type="button" onClick={() => void saveObservation()} className="flex-1 rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground">
                  {editingId ? "Save edit on this device" : "Save observation"}
                </button>
                {editingId ? <button type="button" onClick={resetForm} className="rounded-md border px-4 py-3">Cancel</button> : null}
              </div>
            </li>
          </ol>
        </section>

        <section aria-labelledby="drafts-heading">
          <div className="flex items-end justify-between gap-3">
            <div><p className="label-eyebrow">On this device</p><h2 id="drafts-heading" className="mt-1 text-2xl">Observations</h2></div>
            <span className="text-sm text-muted-foreground">{storeReady ? `${observations.length} saved` : "opening storage…"}</span>
          </div>
          <div className="mt-4 rounded-md border bg-secondary p-3">
            <p className="text-xs">Download a private working copy of observation and media metadata. Captured GPS and locality notes are excluded by default. Free-text notes and filenames may still be sensitive; this is not a public-safe export. Original photo/video bytes and EXIF are not included or changed.</p>
            <label className="mt-3 flex items-start gap-2 text-xs">
              <input type="checkbox" checked={includePrivateExportLocation} onChange={(event) => setIncludePrivateExportLocation(event.target.checked)} />
              Include private capture GPS and locality notes in this metadata backup
            </label>
            <button type="button" onClick={() => exportMetadata(observations)} disabled={!storeReady || observations.length === 0} className="mt-3 flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">
              <Download aria-hidden="true" className="h-3.5 w-3.5" /> Export all saved metadata
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <label className="relative flex-1"><span className="sr-only">Search observations</span><Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-md border bg-white py-2 pl-9 pr-3" placeholder="Search observations" /></label>
            <button type="button" aria-pressed={unidentifiedOnly} onClick={() => setUnidentifiedOnly((value) => !value)} className="rounded-md border bg-white px-3 text-xs">{unidentifiedOnly ? "All" : "Unidentified"}</button>
          </div>

          <div className="mt-4 space-y-3">
            {filteredObservations.map((observation) => (
              <article key={observation.id} className="rounded-xl border border-quiet bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{observation.taxonLabel ?? "Unidentified orchid"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(observation.observedAt).toLocaleString()} · {localityLabels[observation.localityVisibility]}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Local UUID {observation.id}{observation.serverId ? ` · Server ${observation.serverId}` : ""}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${statusClasses(observation.syncStatus)}`}>{fieldObservationStatusLabel(observation.syncStatus)}</span>
                </div>

                <p className="mt-3 text-sm">{observation.note}</p>
                {observation.habitat ? <p className="mt-2 text-xs text-muted-foreground">Habitat: {observation.habitat}{observation.substrate ? ` · Substrate: ${observation.substrate}` : ""}</p> : null}
                {observation.associatedOrganisms.length ? <p className="mt-1 text-xs text-muted-foreground">Associated: {observation.associatedOrganisms.join(", ")}</p> : null}
                {observation.privateLocation ? <p className="mt-2 rounded-md bg-secondary p-2 text-xs">Private capture point stored on this device{observation.privateLocation.accuracyM ? ` (±${Math.round(observation.privateLocation.accuracyM)} m)` : ""}; not uploaded by the current sync payload.</p> : null}
                {observation.syncError ? <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{observation.syncError}</p> : null}

                {observation.media.length ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {observation.media.map((media) => {
                      const url = mediaUrls.get(media.id);
                      return (
                        <figure key={media.id} className="overflow-hidden rounded-md border bg-secondary">
                          {url && media.kind === "photo" ? <img src={url} alt={media.name} className="h-20 w-full object-cover" /> : null}
                          {url && media.kind === "video" ? <video src={url} controls className="h-20 w-full object-cover" /> : null}
                          <figcaption className="truncate px-2 py-1 text-[10px] text-muted-foreground">{media.name}{media.uploadedAt ? " · uploaded" : " · original local"}</figcaption>
                        </figure>
                      );
                    })}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {observation.syncStatus !== "synchronized" ? (
                    <button type="button" onClick={() => void syncOne(observation)} disabled={!online || observation.syncStatus === "syncing"} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold disabled:opacity-50">
                      <Upload aria-hidden="true" className="h-3.5 w-3.5" />
                      {observation.syncStatus === "failed" ? "Retry sync" : "Sync"}
                    </button>
                  ) : <span className="text-xs text-emerald-700">Server accepted exactly once; local original retained.</span>}
                  <button type="button" onClick={() => startEdit(observation)} disabled={!canEditFieldObservation(observation)} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs disabled:opacity-50">
                    <Edit3 aria-hidden="true" className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button type="button" onClick={() => exportMetadata([observation])} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
                    <Download aria-hidden="true" className="h-3.5 w-3.5" /> Export metadata
                  </button>
                  {observation.syncStatus !== "synchronized" ? (
                    <button type="button" aria-label="Discard observation" onClick={() => void discard(observation)} disabled={observation.syncStatus === "syncing"} className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-destructive disabled:opacity-50">
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {!filteredObservations.length ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{storeReady ? "No matching observations on this device." : "Offline storage is not ready yet."}</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
