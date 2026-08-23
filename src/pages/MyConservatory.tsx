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

type PlantEvent = {
  id: string;
  kind: string;
  /** When it happened in the world. */
  occurred_at: string;
  /** When somebody wrote it down. Never the same fact as occurred_at. */
  recorded_at: string;
  recorder_kind: string;
  note: string | null;
  supersedes_id: string | null;
  superseded_by_id: string | null;
};

type PlantTimeline = {
  plant_id: string;
  standing: PlantEvent[];
  corrected: PlantEvent[];
  event_count: number;
  is_scientific_evidence: boolean;
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
    <header className="no-print border-b bg-card"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Orchid Continuum</p><h1 className="text-2xl font-semibold">My Conservatory</h1></div><nav className="flex flex-wrap gap-2 text-sm"><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory">Dashboard</Link><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/plants">My Plants</Link><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/locations">Locations</Link><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/labels">Print Labels</Link><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/readiness">Readiness</Link><Link className="rounded-md bg-primary px-3 py-2 text-primary-foreground" to="/conservatory/plants/new">Add Plant</Link></nav></div></header>
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

/** What a grower actually does to a plant. A generic "note" is deliberately absent. */
const EVENT_KINDS: { value: string; label: string }[] = [
  { value: "watered", label: "Watered" },
  { value: "fertilised", label: "Fertilised" },
  { value: "repotted", label: "Repotted" },
  { value: "mounted", label: "Mounted" },
  { value: "spike_observed", label: "Spike seen" },
  { value: "flowering_observed", label: "Flowering" },
  { value: "leaf_observation", label: "Leaf observation" },
  { value: "root_observation", label: "Root observation" },
  { value: "pest_observation", label: "Pest seen" },
  { value: "disease_observation", label: "Disease seen" },
  { value: "treatment_applied", label: "Treatment applied" },
  { value: "photograph_taken", label: "Photograph taken" },
  { value: "died", label: "Died" },
  { value: "disposed", label: "Disposed of" },
];

const EVENT_LABEL = new Map(EVENT_KINDS.map((kind) => [kind.value, kind.label]));

/** A date input yields YYYY-MM-DD; the ledger stores an instant. */
function asOccurredAt(day: string): string {
  return new Date(`${day}T00:00:00Z`).toISOString();
}

function asDay(instant: string): string {
  return (instant || "").slice(0, 10);
}

/**
 * The plant's ledger: what happened, and when anybody wrote it down.
 *
 * Both timestamps are shown whenever they disagree. A grower noticing on
 * Sunday that a plant spiked last week is making one claim about the plant and
 * a weaker one about timing, and showing only the occurrence hides how late
 * the record was made.
 *
 * The form will not let a grower record an event as happening in the future,
 * and it does not silently substitute today: an occurrence date is the one
 * fact only the grower knows.
 *
 * Corrections are shown, not hidden. "I thought it flowered in March and I was
 * wrong" is itself information about the collection.
 */
function PlantLedger({ plantId }: { plantId: string }) {
  const request = useApi();
  const [timeline, setTimeline] = useState<PlantTimeline>();
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [kind, setKind] = useState("");
  const [day, setDay] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    request<PlantTimeline>(`/api/conservatory/plants/${encodeURIComponent(plantId)}/events`)
      .then((result) => {
        if (!active) return;
        // A response without a standing list is a contract the service did not
        // honour, and must not render as "nothing has happened to this plant".
        if (!result || !Array.isArray(result.standing)) { setUnavailable(true); return; }
        setTimeline(result);
      })
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof ApiError && reason.status === 404) setUnavailable(true);
        else setLoadError(reason instanceof Error ? reason.message : "The ledger could not be loaded");
      });
    return () => { active = false; };
  }, [plantId, request]);

  const today = new Date().toISOString().slice(0, 10);

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!kind || !day) return;
    setSaving(true);
    setError(undefined);
    try {
      const created = await request<PlantEvent>(
        `/api/conservatory/plants/${encodeURIComponent(plantId)}/events`,
        { method: "POST", body: JSON.stringify({ kind, occurred_at: asOccurredAt(day), note: note || null }) },
      );
      setTimeline((current) =>
        current
          ? { ...current, standing: [...current.standing, created], event_count: current.event_count + 1 }
          : current,
      );
      setKind(""); setDay(""); setNote("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The observation could not be recorded");
    } finally {
      setSaving(false);
    }
  }

  if (unavailable) return <section className="mt-6 rounded-xl border border-dashed p-5" data-testid="ledger-unavailable">
    <h3 className="text-sm font-semibold">The plant ledger is not available from this backend</h3>
    <p className="mt-1 text-xs text-muted-foreground">This says nothing about what has happened to the plant.</p>
  </section>;

  if (loadError) return <section className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-5" role="alert" data-testid="ledger-error">
    <p className="text-xs">{loadError}</p>
  </section>;

  if (!timeline) return <p className="mt-6 text-sm text-muted-foreground" role="status">Loading the plant ledger…</p>;

  return <section className="mt-6 rounded-xl border p-5" data-testid="plant-ledger">
    <h3 className="text-sm font-semibold">What has happened to this plant</h3>

    <form className="mt-3 space-y-3 border-b pb-4" onSubmit={submit} data-testid="record-event">
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="block text-xs text-muted-foreground">What happened</span>
          <select className="mt-1 rounded-md border px-3 py-2" value={kind} data-testid="event-kind"
            onChange={(changed) => setKind(changed.target.value)}>
            <option value="">Choose…</option>
            {EVENT_KINDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-muted-foreground">When it happened</span>
          {/* Not defaulted to today: when it happened is the one fact only the
              grower knows, and guessing it would forge the plant's timeline. */}
          <input type="date" max={today} className="mt-1 rounded-md border px-3 py-2" value={day}
            data-testid="event-day" onChange={(changed) => setDay(changed.target.value)} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="block text-xs text-muted-foreground">Note (optional)</span>
        <input className="mt-1 w-full rounded-md border px-3 py-2" value={note} data-testid="event-note"
          onChange={(changed) => setNote(changed.target.value)} />
      </label>
      {error && <p className="text-xs text-destructive" role="alert" data-testid="event-error">{error}</p>}
      <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        disabled={saving || !kind || !day} data-testid="event-submit">
        {saving ? "Recording…" : "Record observation"}
      </button>
    </form>

    {timeline.standing.length ? (
      <ol className="mt-4 space-y-2" data-testid="event-list">
        {timeline.standing.map((event) => (
          <li key={event.id} className="text-sm" data-testid={`event-${event.kind}`}>
            <span className="font-medium">{EVENT_LABEL.get(event.kind) ?? event.kind}</span>
            <span className="text-muted-foreground"> — {asDay(event.occurred_at)}</span>
            {asDay(event.recorded_at) !== asDay(event.occurred_at) && (
              // Shown only when they disagree, because that gap is the fact.
              <span className="text-muted-foreground" data-testid={`event-recorded-late-${event.id}`}>
                {" "}(recorded {asDay(event.recorded_at)})
              </span>
            )}
            {event.note && <span className="text-muted-foreground"> — {event.note}</span>}
          </li>
        ))}
      </ol>
    ) : (
      <p className="mt-4 text-sm text-muted-foreground" data-testid="no-events">Nothing has been recorded for this plant yet.</p>
    )}

    {timeline.corrected.length > 0 && <div className="mt-4 border-t pt-3" data-testid="corrected-events">
      <h4 className="text-xs font-semibold text-muted-foreground">Corrected</h4>
      <ul className="mt-1 space-y-1 text-xs text-muted-foreground line-through">
        {timeline.corrected.map((event) => (
          <li key={event.id}>{EVENT_LABEL.get(event.kind) ?? event.kind} — {asDay(event.occurred_at)}</li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-muted-foreground">Kept because a corrected record is itself part of the collection&rsquo;s history.</p>
    </div>}

    <p className="mt-4 text-[11px] text-muted-foreground" data-testid="ledger-provenance">
      These are your records of your own plant. They are not scientific evidence and are not
      published as observations of the species.
    </p>
  </section>;
}

const ENVIRONMENT_VARIABLES: { value: string; label: string; unit: string }[] = [
  { value: "temperature_c", label: "Temperature", unit: "\u00B0C" },
  { value: "relative_humidity_pct", label: "Relative humidity", unit: "%" },
  { value: "light_ppfd_umol_m2_s", label: "Light (PPFD)", unit: "\u00B5mol/m\u00B2/s" },
  { value: "daily_light_integral_mol_m2_d", label: "Daily light integral", unit: "mol/m\u00B2/d" },
];

/**
 * Entering a reading for a location, and saying honestly where it came from.
 *
 * The grower picks the origin, and the form will not pick it for them. A
 * measurement and a hand-entered estimate are different claims about the same
 * number, and defaulting to "measured" would give every guess an instrument's
 * authority for as long as the record survives.
 *
 * Choosing "measured" requires naming the instrument. Without one the backend
 * refuses the reading outright rather than downgrading it, so the form asks
 * for it at the point the grower makes that claim rather than letting them
 * discover the refusal after typing everything else.
 */
function RecordReading({ locationId, onRecorded }: { locationId: string; onRecorded: () => void }) {
  const request = useApi();
  const [variable, setVariable] = useState("");
  const [value, setValue] = useState("");
  const [origin, setOrigin] = useState("");
  const [instrument, setInstrument] = useState("");
  const [day, setDay] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const today = new Date().toISOString().slice(0, 10);
  const needsInstrument = origin === "measured";
  const ready = Boolean(variable && origin && day && value.trim() && (!needsInstrument || instrument.trim()));

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!ready) return;
    setSaving(true);
    setError(undefined);
    try {
      await request(`/api/conservatory/locations/${encodeURIComponent(locationId)}/environment`, {
        method: "POST",
        body: JSON.stringify({
          variable,
          value: Number(value),
          origin,
          observed_at: new Date(`${day}T00:00:00Z`).toISOString(),
          // Only a measured reading may carry an instrument; sending one
          // otherwise is refused, and would be a lie if it were not.
          instrument: needsInstrument ? instrument.trim() : null,
        }),
      });
      setVariable(""); setValue(""); setOrigin(""); setInstrument(""); setDay("");
      onRecorded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The reading could not be recorded");
    } finally {
      setSaving(false);
    }
  }

  return <form className="mt-3 space-y-3 border-t pt-3" onSubmit={submit} data-testid="record-reading">
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">
        <span className="block text-xs text-muted-foreground">What</span>
        <select className="mt-1 rounded-md border px-3 py-2" value={variable} data-testid="reading-variable"
          onChange={(changed) => setVariable(changed.target.value)}>
          <option value="">Choose…</option>
          {ENVIRONMENT_VARIABLES.map((option) => <option key={option.value} value={option.value}>{option.label} ({option.unit})</option>)}
        </select>
      </label>
      <label className="text-sm">
        <span className="block text-xs text-muted-foreground">Value</span>
        <input type="number" step="any" className="mt-1 w-28 rounded-md border px-3 py-2" value={value}
          data-testid="reading-value" onChange={(changed) => setValue(changed.target.value)} />
      </label>
      <label className="text-sm">
        <span className="block text-xs text-muted-foreground">When</span>
        <input type="date" max={today} className="mt-1 rounded-md border px-3 py-2" value={day}
          data-testid="reading-day" onChange={(changed) => setDay(changed.target.value)} />
      </label>
      <label className="text-sm">
        <span className="block text-xs text-muted-foreground">How you got it</span>
        {/* Unset on purpose. Defaulting to "measured" would give every guess
            an instrument's authority for as long as the record survives. */}
        <select className="mt-1 rounded-md border px-3 py-2" value={origin} data-testid="reading-origin"
          onChange={(changed) => setOrigin(changed.target.value)}>
          <option value="">Choose…</option>
          <option value="measured">An instrument measured it</option>
          <option value="manual">I read or judged it myself</option>
        </select>
      </label>
    </div>
    {needsInstrument && <label className="block text-sm" data-testid="instrument-field">
      <span className="block text-xs text-muted-foreground">Which instrument</span>
      <input className="mt-1 w-full rounded-md border px-3 py-2" value={instrument} data-testid="reading-instrument"
        onChange={(changed) => setInstrument(changed.target.value)} placeholder="SensorPush HT.w #A31" />
      <span className="mt-1 block text-[11px] text-muted-foreground" data-testid="instrument-required">
        A measurement has to say what measured it. Without an instrument this is a reading you took
        yourself, which is a different and equally useful claim.
      </span>
    </label>}
    {error && <p className="text-xs text-destructive" role="alert" data-testid="reading-error">{error}</p>}
    <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      disabled={saving || !ready} data-testid="reading-submit">
      {saving ? "Recording…" : "Record reading"}
    </button>
  </form>;
}

/**
 * The kinds of place a grower actually keeps orchids.
 *
 * Two benches in one greenhouse can differ more than two greenhouses do, so a
 * bench is its own kind rather than a detail buried in a name. `custom` exists
 * so the vocabulary never blocks a real collection.
 */
const LOCATION_KINDS: { value: string; label: string }[] = [
  { value: "greenhouse", label: "Greenhouse" },
  { value: "greenhouse_bench", label: "Greenhouse bench" },
  { value: "shade_house", label: "Shade house" },
  { value: "lath_house", label: "Lath house" },
  { value: "outdoor", label: "Outdoor area" },
  { value: "windowsill", label: "Windowsill" },
  { value: "indoor_growing_area", label: "Indoor growing area" },
  { value: "shelf", label: "Shelf" },
  { value: "zone", label: "Named zone" },
  { value: "custom", label: "Something else" },
];

/**
 * Creating and listing growing locations.
 *
 * Conditions typed here are the grower's own assessment of a place. The form
 * says so, because the same field read later as a measurement would give every
 * comparison built on it a precision nobody ever took. The backend stamps the
 * origin; this surface has to be honest about what it is asking for.
 */
function Locations() {
  const request = useApi();
  const [locations, setLocations] = useState<GrowingLocation[]>();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [described, setDescribed] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();

  const load = useCallback(() => {
    request<{ locations: GrowingLocation[] }>("/api/conservatory/locations")
      .then((result) => setLocations(result.locations ?? []))
      .catch((reason) => setLoadError(reason instanceof Error ? reason.message : "Locations could not be loaded"));
  }, [request]);

  useEffect(() => { load(); }, [load]);

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!name.trim() || !kind) return;
    setSaving(true);
    setError(undefined);
    try {
      const created = await request<GrowingLocation>("/api/conservatory/locations", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), kind, described_conditions: described.trim() || null }),
      });
      setLocations((current) => [...(current ?? []), created]);
      setName(""); setKind(""); setDescribed("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The location could not be created");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <Status loading={false} error={loadError} />;

  const active = (locations ?? []).filter((location) => !location.retired_at);
  const retired = (locations ?? []).filter((location) => location.retired_at);

  return <div className="space-y-6">
    <div>
      <h2 className="text-3xl font-semibold">Growing locations</h2>
      <p className="mt-2 text-muted-foreground">Where plants actually live. A plant can move between them without losing its history.</p>
    </div>

    <form className="rounded-xl border p-5 space-y-3" onSubmit={submit} data-testid="create-location">
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="block text-xs text-muted-foreground">Name</span>
          <input className="mt-1 rounded-md border px-3 py-2" value={name} data-testid="location-name"
            onChange={(changed) => setName(changed.target.value)} placeholder="Cool bench" />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-muted-foreground">Kind of place</span>
          <select className="mt-1 rounded-md border px-3 py-2" value={kind} data-testid="location-kind"
            onChange={(changed) => setKind(changed.target.value)}>
            <option value="">Choose…</option>
            {LOCATION_KINDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="block text-xs text-muted-foreground">How you would describe the conditions (optional)</span>
        <input className="mt-1 w-full rounded-md border px-3 py-2" value={described} data-testid="location-described"
          onChange={(changed) => setDescribed(changed.target.value)} placeholder="Bright shade, cool nights" />
      </label>
      <p className="text-[11px] text-muted-foreground" data-testid="described-disclaimer">
        This is recorded as your description of the place, not as a measurement. Instrument readings
        are entered separately and stay distinguishable from it.
      </p>
      {error && <p className="text-xs text-destructive" role="alert" data-testid="location-error">{error}</p>}
      <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        disabled={saving || !name.trim() || !kind} data-testid="location-submit">
        {saving ? "Creating…" : "Create location"}
      </button>
    </form>

    {locations === undefined ? <Status loading error={undefined} /> : active.length ? (
      <ul className="grid gap-3 md:grid-cols-2" data-testid="location-list">
        {active.map((location) => <li key={location.id} className="rounded-xl border p-4" data-testid={`location-card-${location.id}`}>
          <strong className="block">{location.name}</strong>
          <span className="text-xs text-muted-foreground">{LOCATION_KINDS.find((k) => k.value === location.kind)?.label ?? location.kind}</span>
          <RecordReading locationId={location.id} onRecorded={load} />
        </li>)}
      </ul>
    ) : (
      <p className="text-sm text-muted-foreground" data-testid="no-locations-yet">No growing locations yet. Create one above before placing a plant.</p>
    )}

    {retired.length > 0 && <div data-testid="retired-locations">
      <h3 className="text-sm font-semibold">Retired</h3>
      {/* Kept visible: placement history points at these, and hiding them
          would make a plant's past read as though it happened nowhere. */}
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {retired.map((location) => <li key={location.id}>{location.name} — no longer in use</li>)}
      </ul>
    </div>}
  </div>;
}

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
    <PlantLedger plantId={plant.id} />
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
  else if (path === "/conservatory/locations") content = <Locations />;
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
