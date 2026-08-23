import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  ConservatoryReadinessBanner,
  ConservatoryReadinessPage,
  useConservatoryReadiness,
} from "@/components/conservatory/ConservatoryReadiness";

const API_BASE = (import.meta.env.VITE_CALYX_API_URL || "").replace(/\/$/, "");

type Plant = {
  id: string;
  accession_number: string;
  display_name: string;
  accepted_scientific_name?: string | null;
  location?: string | null;
  notes?: string | null;
  qr_identifier: string;
  created_at: string;
  updated_at: string;
};

type Placement = {
  id: string;
  location_id: string | null;
  reason: string;
  note: string | null;
  recorded_at: string;
};

type PlacementView = {
  plant_id: string;
  current: Placement | null;
  history: Placement[];
};

type GrowingLocation = { id: string; name: string; kind: string; retired_at?: string | null };

/** One environmental variable, carrying how it came to be known. */
type EnvironmentVariable = {
  unit: string;
  known: boolean;
  value?: number;
  /** measured | manual | inferred | unknown — never flattened away. */
  origin: string;
  instrument?: string | null;
  observed_at?: string | null;
  is_summary?: boolean;
  summary_kind?: string | null;
  reason?: string;
};

type EnvironmentView = { location_id: string; variables: Record<string, EnvironmentVariable> };

type PlantInput = {
  display_name: string;
  accepted_scientific_name?: string;
  location?: string;
  notes?: string;
};

/**
 * A failed request, with the status kept alongside the message.
 *
 * Callers need to tell "this collection has no such plant" from "the service
 * did not answer", and those differ only by status. Without it the distinction
 * has to be recovered by pattern-matching prose, which breaks the moment the
 * wording changes.
 */
class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function useApi() {
  const { session } = useAuth();
  return useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!API_BASE) throw new Error("VITE_CALYX_API_URL is not configured.");
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...(init?.headers || {}),
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const detail = body.detail;
      // `detail` is a string on some endpoints and a {code, message} object on
      // others. Stringifying an object yields "[object Object]", so read the
      // shape rather than coercing it.
      const described =
        typeof detail === "string" ? detail
        : detail && typeof detail === "object" ? String(detail.message || detail.code || "")
        : "";
      const error = new ApiError(
        described || String(body.message || `Request failed (${response.status})`),
        response.status,
        detail && typeof detail === "object" && typeof detail.code === "string" ? detail.code : undefined,
      );
      throw error;
    }
    return response.json() as Promise<T>;
  }, [session?.access_token]);
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">
    <style>{`@media print { body * { visibility: hidden !important; } .print-zone, .print-zone * { visibility: visible !important; } .print-zone { position: absolute; inset: 0; background: white; color: black; padding: 0.25in; } .no-print { display: none !important; } .plant-label { break-inside: avoid; page-break-inside: avoid; } }`}</style>
    <header className="no-print border-b bg-card"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Orchid Continuum</p><h1 className="text-2xl font-semibold">My Conservatory</h1></div><nav className="flex flex-wrap gap-2 text-sm"><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory">Dashboard</Link><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/plants">My Plants</Link><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/labels">Print Labels</Link><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/readiness">Readiness</Link><Link className="rounded-md bg-primary px-3 py-2 text-primary-foreground" to="/conservatory/plants/new">Add Plant</Link></nav></div></header>
    <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
  </div>;
}

function Status({ loading, error }: { loading: boolean; error?: string }) {
  if (loading) return <div className="rounded-lg border p-8" role="status">Loading conservatory records…</div>;
  if (error) return <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6" role="alert"><h2 className="font-semibold">The conservatory could not be loaded</h2><p className="mt-2 text-sm">{error}</p></div>;
  return null;
}

function usePlants() {
  const request = useApi();
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const reload = useCallback(async () => {
    setLoading(true); setError(undefined);
    try { const body = await request<{ plants: Plant[] }>("/api/conservatory/plants"); setPlants(body.plants || []); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load plants"); }
    finally { setLoading(false); }
  }, [request]);
  useEffect(() => { void reload(); }, [reload]);
  return { plants, loading, error };
}

function PlantCard({ plant }: { plant: Plant }) {
  return <Link to={`/conservatory/plants/${plant.id}`} className="block rounded-xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><p className="text-xs uppercase tracking-wide text-muted-foreground">{plant.accession_number}</p><h3 className="mt-2 text-lg font-semibold italic">{plant.display_name}</h3><p className="mt-2 text-sm text-muted-foreground">{plant.location || "Location not recorded"}</p></Link>;
}

function Dashboard() {
  const { plants, loading, error } = usePlants();
  if (loading || error) return <Status loading={loading} error={error} />;
  return <><ConservatoryReadinessBanner /><h2 className="text-3xl font-semibold">Your living collection</h2><p className="mt-2 text-muted-foreground">Dedicated collection records with stable accession numbers and QR identifiers.</p><div className="mt-7 grid gap-4 md:grid-cols-3"><div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Plants</p><strong className="mt-2 block text-3xl">{plants.length}</strong></div><div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">QR ready</p><strong className="mt-2 block text-3xl">{plants.filter((plant) => plant.qr_identifier).length}</strong></div><div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Locations recorded</p><strong className="mt-2 block text-3xl">{plants.filter((plant) => plant.location).length}</strong></div></div><div className="mt-10 grid gap-4 md:grid-cols-3">{plants.slice(0, 6).map((plant) => <PlantCard key={plant.id} plant={plant} />)}</div></>;
}

function PlantList() {
  const { plants, loading, error } = usePlants();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => plants.filter((plant) => `${plant.accession_number} ${plant.display_name} ${plant.accepted_scientific_name || ""} ${plant.location || ""}`.toLowerCase().includes(query.toLowerCase())), [plants, query]);
  if (loading || error) return <Status loading={loading} error={error} />;
  return <><h2 className="text-3xl font-semibold">My Plants</h2><input aria-label="Search plants" className="mt-6 w-full rounded-lg border bg-background px-4 py-3" placeholder="Accession, scientific name, or location" value={query} onChange={(event) => setQuery(event.target.value)} /><p className="mt-3 text-sm text-muted-foreground">{filtered.length} result{filtered.length === 1 ? "" : "s"}</p><div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{filtered.map((plant) => <PlantCard key={plant.id} plant={plant} />)}</div></>;
}

function AddPlant() {
  const request = useApi();
  const navigate = useNavigate();
  const { report, loading: readinessLoading, error: readinessError } = useConservatoryReadiness();
  const ready = report?.ready_for_collection_entry === true;
  const [form, setForm] = useState<PlantInput>({ display_name: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) { setError("Collection entry is blocked until persistent storage and restart survival are verified."); return; }
    setSaving(true); setError(undefined);
    try { const plant = await request<Plant>("/api/conservatory/plants", { method: "POST", body: JSON.stringify(form) }); navigate(`/conservatory/plants/${plant.id}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The plant could not be saved."); }
    finally { setSaving(false); }
  }
  const field = (key: keyof PlantInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  if (readinessLoading) return <Status loading />;
  if (!ready) return <><ConservatoryReadinessBanner /><div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-6"><h2 className="text-2xl font-semibold">Plant entry is locked</h2><p className="mt-2 text-sm text-muted-foreground">{readinessError || report?.instruction || "The deployed backend has not supplied verified persistence evidence."}</p><Link className="mt-4 inline-block text-sm font-medium text-primary" to="/conservatory/readiness">Review blocked gates</Link></div></>;
  return <><ConservatoryReadinessBanner /><h2 className="text-3xl font-semibold">Add Test Plant</h2><p className="mt-2 text-muted-foreground">Readiness passed. Begin with three test plants before entering the production collection.</p><form className="mt-7 max-w-2xl space-y-5 rounded-xl border bg-card p-6" onSubmit={submit}>{error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}<label className="block"><span className="text-sm font-medium">Display name</span><input required minLength={2} className="mt-2 w-full rounded-md border bg-background px-3 py-2" value={form.display_name} onChange={(event) => field("display_name", event.target.value)} /></label><label className="block"><span className="text-sm font-medium">Accepted scientific name</span><input className="mt-2 w-full rounded-md border bg-background px-3 py-2" value={form.accepted_scientific_name || ""} onChange={(event) => field("accepted_scientific_name", event.target.value)} /></label><label className="block"><span className="text-sm font-medium">Location</span><input className="mt-2 w-full rounded-md border bg-background px-3 py-2" placeholder="Greenhouse bench 2" value={form.location || ""} onChange={(event) => field("location", event.target.value)} /></label><label className="block"><span className="text-sm font-medium">Notes</span><textarea rows={5} className="mt-2 w-full rounded-md border bg-background px-3 py-2" value={form.notes || ""} onChange={(event) => field("notes", event.target.value)} /></label><button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" disabled={saving}>{saving ? "Saving…" : "Save and assign accession"}</button></form></>;
}

function QrImage({ plant }: { plant: Plant }) {
  const { session } = useAuth();
  const [source, setSource] = useState<string>();
  useEffect(() => {
    let active = true; let objectUrl = "";
    fetch(`${API_BASE}/api/conservatory/plants/${encodeURIComponent(plant.id)}/qr.svg`, { credentials: "include", headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} }).then((response) => { if (!response.ok) throw new Error("QR image unavailable"); return response.blob(); }).then((blob) => { objectUrl = URL.createObjectURL(blob); if (active) setSource(objectUrl); }).catch(() => { if (active) setSource(undefined); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [plant.id, session?.access_token]);
  return source ? <img src={source} alt={`QR code for ${plant.accession_number}`} className="h-28 w-28" /> : <div className="flex h-28 w-28 items-center justify-center border text-center text-xs">QR unavailable</div>;
}

/** How a number was obtained, said plainly. A reader must never have to guess. */
const ORIGIN_LABEL: Record<string, string> = {
  measured: "measured by an instrument",
  manual: "entered by hand",
  inferred: "inferred, not measured",
  unknown: "not recorded",
};

/**
 * Recording where a plant went, or correcting where it was said to be.
 *
 * The reason is the grower's to choose and the form refuses to choose it for
 * them, because the two are not interchangeable: a move says the plant
 * physically went somewhere and becomes part of its husbandry history, while a
 * correction says the record was wrong and the plant never went anywhere.
 * Defaulting to "move" would quietly manufacture husbandry every time somebody
 * fixed a typo, and that invented history would later read as a cause of
 * whatever the plant did next.
 *
 * Retired locations are not offered. A plant cannot be put somewhere that no
 * longer exists, and the backend refuses it — offering it would only produce a
 * failure the grower cannot act on.
 */
function RecordPlacement({
  plantId,
  locations,
  hasPlacement,
  onRecorded,
}: {
  plantId: string;
  locations: GrowingLocation[];
  hasPlacement: boolean;
  onRecorded: (event: Placement) => void;
}) {
  const request = useApi();
  const [locationId, setLocationId] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!locationId || !reason) return;
    setSaving(true);
    setError(undefined);
    try {
      const event = await request<Placement>(
        `/api/conservatory/plants/${encodeURIComponent(plantId)}/placement`,
        { method: "POST", body: JSON.stringify({ location_id: locationId, reason, note: note || null }) },
      );
      onRecorded(event);
      setNote("");
      setReason("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The placement could not be recorded");
    } finally {
      setSaving(false);
    }
  }

  if (!locations.length) return <p className="mt-4 text-xs text-muted-foreground" data-testid="no-locations">
    No growing locations have been created yet, so this plant cannot be placed.
  </p>;

  return <form className="mt-4 space-y-3 border-t pt-4" onSubmit={submit} data-testid="record-placement">
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">
        <span className="block text-xs text-muted-foreground">Location</span>
        <select className="mt-1 rounded-md border px-3 py-2" value={locationId} data-testid="placement-location"
          onChange={(changed) => setLocationId(changed.target.value)}>
          <option value="">Choose a location…</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
      </label>
      <label className="text-sm">
        <span className="block text-xs text-muted-foreground">What happened</span>
        <select className="mt-1 rounded-md border px-3 py-2" value={reason} data-testid="placement-reason-select"
          onChange={(changed) => setReason(changed.target.value)}>
          {/* Deliberately unset. Choosing for the grower would invent history. */}
          <option value="">Choose…</option>
          {!hasPlacement && <option value="initial">First placement — where it started</option>}
          <option value="move">The plant moved here</option>
          <option value="correction">Correction — it was always here, the record was wrong</option>
        </select>
      </label>
    </div>
    <label className="block text-sm">
      <span className="block text-xs text-muted-foreground">Note (optional)</span>
      <input className="mt-1 w-full rounded-md border px-3 py-2" value={note} data-testid="placement-note"
        onChange={(changed) => setNote(changed.target.value)} />
    </label>
    <p className="text-[11px] text-muted-foreground" data-testid="placement-guidance">
      A move becomes part of this plant&rsquo;s husbandry history. A correction does not: it records
      that the earlier entry was wrong, and the plant never went anywhere.
    </p>
    {error && <p className="text-xs text-destructive" role="alert" data-testid="placement-error">{error}</p>}
    <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      disabled={saving || !locationId || !reason} data-testid="placement-submit">
      {saving ? "Recording…" : "Record placement"}
    </button>
  </form>;
}

/**
 * Cultivation context for one plant: where it is, where it has been, and what
 * is known about the conditions there.
 *
 * Every environmental number is shown with its origin. A hand-entered
 * temperature and an instrument reading look identical once the origin is
 * dropped, and a grower deciding whether to move a plant is entitled to know
 * which one they are acting on.
 *
 * A variable nobody has recorded is rendered as not recorded, never as a
 * blank or a zero. An empty slot reads as "nothing to consider here", which is
 * exactly the wrong conclusion when the truth is that no sensor exists.
 */
function CultivationContext({ plantId }: { plantId: string }) {
  const request = useApi();
  const [placement, setPlacement] = useState<PlacementView>();
  const [locations, setLocations] = useState<GrowingLocation[]>([]);
  const [environment, setEnvironment] = useState<EnvironmentView>();
  const [error, setError] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      request<PlacementView>(`/api/conservatory/plants/${encodeURIComponent(plantId)}/placement`),
      request<{ locations: GrowingLocation[] }>(`/api/conservatory/locations`),
    ])
      .then(async ([placementView, locationList]) => {
        if (!active) return;
        // A response missing its history is a contract the service did not
        // honour. Coercing it to an empty list would render as "no moves have
        // been recorded", which is a claim about the plant rather than about
        // the response — so it is reported as unavailable instead.
        if (!placementView || !Array.isArray(placementView.history)) {
          setUnavailable(true);
          return;
        }
        setPlacement(placementView);
        setLocations(locationList.locations ?? []);
        const currentId = placementView.current?.location_id;
        if (!currentId) return;
        // Environment is fetched only once a current location is known; asking
        // for the conditions of nowhere is not a meaningful question.
        const env = await request<EnvironmentView>(
          `/api/conservatory/locations/${encodeURIComponent(currentId)}/environment`,
        );
        if (active) setEnvironment(env);
      })
      .catch((reason) => {
        if (!active) return;
        // A backend without these routes yet is a different fact from a plant
        // with no recorded location, and it must not read as "never placed".
        if (reason instanceof ApiError && reason.status === 404) setUnavailable(true);
        else setError(reason instanceof Error ? reason.message : "Cultivation context unavailable");
      });
    return () => { active = false; };
  }, [plantId, request]);

  const nameFor = (id: string | null | undefined) =>
    locations.find((location) => location.id === id)?.name ?? (id ? "A location no longer listed" : null);

  if (unavailable) return <section className="mt-6 rounded-xl border border-dashed p-5" data-testid="context-unavailable">
    <h3 className="text-sm font-semibold">Cultivation context is not available from this backend</h3>
    <p className="mt-1 text-xs text-muted-foreground">This says nothing about where the plant is. It means the service did not offer the placement record.</p>
  </section>;

  if (error) return <section className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-5" role="alert" data-testid="context-error">
    <h3 className="text-sm font-semibold">Cultivation context could not be loaded</h3>
    <p className="mt-1 text-xs">{error}</p>
  </section>;

  if (!placement) return <p className="mt-6 text-sm text-muted-foreground" role="status">Loading cultivation context…</p>;

  const usable = locations.filter((location) => !location.retired_at);

  return <section className="mt-6 space-y-5" data-testid="cultivation-context">
    <div className="rounded-xl border p-5">
      <h3 className="text-sm font-semibold">Where it is now</h3>
      {placement.current ? (
        <p className="mt-1 text-lg" data-testid="current-location">{nameFor(placement.current.location_id)}</p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground" data-testid="no-current-location">
          {placement.history.length
            ? "Not currently in any location. Its earlier placements are below."
            : "No placement has been recorded for this plant."}
        </p>
      )}
      <RecordPlacement
        plantId={plantId}
        locations={usable}
        hasPlacement={placement.history.length > 0}
        onRecorded={(event) =>
          setPlacement((current) =>
            current
              ? { ...current, current: event, history: [...current.history, event] }
              : current,
          )
        }
      />
    </div>

    <div className="rounded-xl border p-5">
      <h3 className="text-sm font-semibold">Where it has been</h3>
      {placement.history.length ? (
        <ol className="mt-3 space-y-2" data-testid="placement-history">
          {placement.history.map((event) => (
            <li key={event.id} className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide" data-testid={`placement-reason-${event.reason}`}>
                {/* A correction is not a move: the plant never went anywhere. */}
                {event.reason === "correction" ? "record corrected" : event.reason}
              </span>
              <span>{nameFor(event.location_id) ?? "Removed from the collection"}</span>
              {event.note && <span className="text-muted-foreground">— {event.note}</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">No moves have been recorded.</p>
      )}
    </div>

    <div className="rounded-xl border p-5">
      <h3 className="text-sm font-semibold">Conditions where it is</h3>
      {!placement.current ? (
        <p className="mt-1 text-sm text-muted-foreground">The plant is not in a location, so there are no conditions to report.</p>
      ) : environment ? (
        <dl className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="environment-variables">
          {Object.entries(environment.variables).map(([variable, reading]) => (
            <div key={variable} className="rounded-lg border p-3" data-testid={`env-${variable}`} data-known={reading.known ? "true" : "false"}>
              <dt className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{variable.replace(/_/g, " ")}</dt>
              <dd className="mt-1 text-lg">
                {reading.known ? `${reading.value} ${reading.unit}` : "Not recorded"}
              </dd>
              <p className="mt-1 text-[11px] text-muted-foreground" data-testid={`env-origin-${variable}`}>
                {/* The origin travels with the number, always. */}
                {ORIGIN_LABEL[reading.origin] ?? reading.origin}
                {reading.known && reading.instrument ? ` · ${reading.instrument}` : ""}
                {reading.known && reading.is_summary ? ` · ${reading.summary_kind} over a window, not a spot reading` : ""}
              </p>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground" role="status">Loading conditions…</p>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground" data-testid="context-provenance">
        These are collection records, not scientific evidence. Values entered by hand and values
        measured by an instrument are both shown, labelled, and are not interchangeable.
      </p>
    </div>
  </section>;
}

function PlantDossier({ plant, arrivedByScan }: { plant: Plant; arrivedByScan?: boolean }) {
  return <div className="rounded-xl border bg-card p-6">
    {arrivedByScan && <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs" data-testid="scan-arrival">Opened by scanning this plant&rsquo;s tag.</p>}
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{plant.accession_number}</p>
    <div className="mt-4 flex flex-wrap justify-between gap-6"><div><h2 className="text-3xl font-semibold italic">{plant.display_name}</h2><p className="mt-2">{plant.accepted_scientific_name || "Accepted name not yet linked"}</p><p className="mt-2 text-muted-foreground">{plant.location || "Location not recorded"}</p><p className="mt-5 max-w-2xl">{plant.notes || "No notes recorded"}</p></div><QrImage plant={plant} /></div>
    <p className="mt-6 break-all font-mono text-xs text-muted-foreground">{plant.qr_identifier}</p>
    <CultivationContext plantId={plant.id} />
  </div>;
}

/**
 * The plant id comes from the path, not from useParams.
 *
 * This route is mounted under a `/conservatory/*` splat, which declares no
 * `:plantId`, so useParams returned undefined here and every dossier requested
 * `/api/conservatory/plants/` with an empty id — the list endpoint, whose shape
 * is not a plant. The page could never show a specific plant. The surrounding
 * router already matches paths by hand, so the id is passed down the same way.
 */
function Detail({ plantId }: { plantId: string }) {
  const request = useApi();
  const [plant, setPlant] = useState<Plant>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!plantId) { setError("No plant was identified in this address."); return; }
    request<Plant>(`/api/conservatory/plants/${encodeURIComponent(plantId)}`).then(setPlant).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load plant"));
  }, [plantId, request]);
  if (error || !plant) return <Status loading={!error} error={error} />;
  return <PlantDossier plant={plant} />;
}

/**
 * Where a scanned tag lands.
 *
 * The tag carries a durable identity rather than a page address, so arriving
 * here means resolving that identity to an accession before anything can be
 * shown. Three outcomes are kept apart on purpose: the plant, a tag this
 * collection does not know, and a failure to ask. Rendering the middle one as
 * an error would tell a grower their plant is missing when the service is
 * merely unreachable.
 */
function Scan({ identifier }: { identifier: string }) {
  const request = useApi();
  const [plant, setPlant] = useState<Plant>();
  const [unresolved, setUnresolved] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    setPlant(undefined); setUnresolved(false); setError(undefined);
    request<Plant>(`/api/conservatory/resolve/${encodeURIComponent(identifier)}`)
      .then((result) => { if (active) setPlant(result); })
      .catch((reason) => {
        if (!active) return;
        // A tag we cannot match is a different fact from a service we cannot
        // reach, and only one of them is about the plant. The status says
        // which; the message is for the reader, not for this branch.
        if (reason instanceof ApiError && reason.status === 404) setUnresolved(true);
        else setError(reason instanceof Error && reason.message ? reason.message : "Unable to resolve this tag");
      });
    return () => { active = false; };
  }, [identifier, request]);

  if (plant) return <PlantDossier plant={plant} arrivedByScan />;
  if (unresolved) return <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-6" role="alert" data-testid="scan-unresolved">
    <h2 className="text-xl font-semibold">This tag does not match a plant in your collection</h2>
    <p className="mt-2 text-sm text-muted-foreground">It was not matched approximately. A near miss would attach one plant&rsquo;s history to another, so nothing is shown rather than the wrong record.</p>
    <p className="mt-3 text-sm">If the tag is damaged but its accession number is still legible, search for that number in <Link className="underline" to="/conservatory/plants">My Plants</Link>.</p>
    <p className="mt-3 break-all font-mono text-xs text-muted-foreground">Scanned: {identifier}</p>
  </div>;
  return <Status loading={!error} error={error} />;
}

function Labels() {
  const { plants, loading, error } = usePlants();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  if (loading || error) return <Status loading={loading} error={error} />;
  const visible = selected.size ? plants.filter((plant) => selected.has(plant.id)) : plants;
  const toggleSelection = (plantId: string) => setSelected((current) => { const next = new Set(current); if (next.has(plantId)) next.delete(plantId); else next.add(plantId); return next; });
  return <><div className="no-print flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-3xl font-semibold">Print QR Labels</h2><p className="mt-2 text-muted-foreground">Select plants or print the full collection. Browser print settings control the final label stock.</p></div><button type="button" className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => window.print()}>Print {visible.length} label{visible.length === 1 ? "" : "s"}</button></div><div className="no-print mt-6 grid gap-2 md:grid-cols-2">{plants.map((plant) => <label key={plant.id} className="flex items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={selected.has(plant.id)} onChange={() => toggleSelection(plant.id)} /><span><strong>{plant.accession_number}</strong> — <em>{plant.display_name}</em></span></label>)}</div><div className="print-zone mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">{visible.map((plant) => <article key={plant.id} className="plant-label flex min-h-[1.45in] items-center gap-3 border border-black p-2 text-black"><QrImage plant={plant} /><div><strong className="block text-sm">{plant.accession_number}</strong><em className="mt-1 block text-sm">{plant.display_name}</em>{plant.location && <span className="mt-1 block text-xs">{plant.location}</span>}</div></article>)}</div></>;
}

export default function MyConservatory() {
  const location = useLocation();
  const path = location.pathname.replace(/\/$/, "");
  let content: React.ReactNode = <Dashboard />;
  if (path === "/conservatory/plants") content = <PlantList />;
  else if (path === "/conservatory/plants/new") content = <AddPlant />;
  else if (path === "/conservatory/labels") content = <Labels />;
  else if (path === "/conservatory/readiness") content = <ConservatoryReadinessPage />;
  else {
    const detailMatch = /^\/conservatory\/plants\/([^/]+)$/.exec(path);
    const scanMatch = /^\/conservatory\/scan\/(.+)$/.exec(path);
    if (detailMatch) content = <Detail plantId={decodeURIComponent(detailMatch[1])} />;
    // The identifier is matched greedily: a scanned tag may itself be a URL,
    // so the remainder of the path is the identity and must not be truncated
    // at its first slash.
    else if (scanMatch) content = <Scan identifier={decodeURIComponent(scanMatch[1])} />;
  }
  return <Shell>{content}</Shell>;
}
