import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { speciesDossierContinuumActions } from "@/lib/speciesDossierContinuumNavigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  buildCultivationHandoff,
  cultivationCalyxHref,
  seedCultivationHandoff,
} from "@/lib/conservatoryCultivationCalyx";
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
  /** For a correction, the placement it corrects. */
  corrects_id?: string | null;
  /** Set on an entry a later correction says was wrong. Derived by the backend. */
  corrected_by_id?: string | null;
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

type Assessment = {
  variable: string;
  outcome: "within" | "outside" | "unassessable" | "conflicting";
  reason?: string;
  breached?: { bound: string; limit: number }[];
  condition?: { value?: number; unit?: string; origin?: string };
  bounds?: Record<string, { value: number; evidence_strength?: string }[]>;
  /**
   * How old the reading behind this verdict is, in days.
   *
   * Absent or null means the reading carries no usable timestamp. That is not
   * the same as "just measured", and it must never render as a fresh reading.
   */
  condition_age_days?: number | null;
};

type PlacementAssessment = {
  assessments: Assessment[];
  counts: Record<string, number>;
  /** False when nothing could be compared at all — not the same as "fine". */
  anything_assessed: boolean;
  /**
   * False when the store holding cultivation evidence could not be read.
   *
   * Absent means the backend predates the distinction and did consult it. Only
   * an explicit false says nobody looked, which is a fact about our plumbing
   * and must never be rendered as a fact about the literature.
   */
  requirement_source_consulted?: boolean;
  /** The age of the oldest reading that produced a verdict, in days. */
  oldest_verdict_condition_age_days?: number | null;
  is_recommendation: boolean;
};

type CollectionReviewRow = {
  plant_id: string;
  accession_number: string | null;
  display_name: string | null;
  accepted_scientific_name: string | null;
  breaches: Array<{ variable: string; breached: Array<{ bound: string; limit: number }> }>;
  requirement_source_consulted: boolean;
  /** The age of the oldest reading behind this plant's verdicts, in days. */
  oldest_verdict_condition_age_days?: number | null;
};

type CollectionReview = {
  groups: Record<string, CollectionReviewRow[]>;
  counts: Record<string, number>;
  plant_count: number;
  /** False when nothing in the whole collection could be compared. */
  anything_assessed: boolean;
  /** How many plants were assessed against a knowledge store nobody could read. */
  requirement_source_unread_for: number;
  is_recommendation: boolean;
};

type TaxonPlacementLocation = {
  location_id: string;
  name: string | null;
  kind: string | null;
  assessments: Assessment[];
  counts: Record<string, number>;
  /** False when nothing at this location could be compared. Stated per row. */
  anything_assessed: boolean;
  oldest_verdict_condition_age_days?: number | null;
};

type TaxonPlacementSearch = {
  taxon: string | null;
  locations: TaxonPlacementLocation[];
  requirements: {
    value?: unknown;
    claim_class?: string;
    reason?: string;
    source_consulted?: boolean;
  };
  /** False when nothing anywhere could be compared. */
  anything_assessed: boolean;
  is_recommendation: boolean;
  reason?: string;
};

type PlantPhotograph = {
  id: string;
  plant_id: string;
  content_type: string;
  byte_size: number;
  /** When the camera says it was taken. Null when the file did not say. */
  taken_at: string | null;
  /** When it reached the Continuum. A different claim, always. */
  recorded_at: string;
  caption: string | null;
  exif_stripped?: boolean;
};

type LocationChange = {
  id: string;
  change: string;
  previous_name: string | null;
  new_name: string | null;
  note: string | null;
  recorded_at: string;
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

type EnvironmentReading = {
  id: string;
  variable: string;
  unit: string;
  value: number | null;
  origin: string;
  instrument: string | null;
  observed_at: string;
  note: string | null;
  supersedes_id: string | null;
  superseded_by_id: string | null;
};

type EnvironmentView = {
  location_id: string;
  variables: Record<string, EnvironmentVariable>;
  readings?: EnvironmentReading[];
};

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
    <header className="no-print border-b bg-card"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Orchid Continuum</p><h1 className="text-2xl font-semibold">My Conservatory</h1></div><nav className="flex flex-wrap gap-2 text-sm"><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory">Dashboard</Link><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/plants">My Plants</Link><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/locations">Locations</Link><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/review">Review</Link><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/could-i-grow-this">Could I grow this?</Link><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/labels">Print Labels</Link><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/readiness">Readiness</Link><Link className="rounded-md bg-primary px-3 py-2 text-primary-foreground" to="/conservatory/plants/new">Add Plant</Link></nav></div></header>
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

/**
 * Fetch an image the collection owner alone may see, and hand back an object
 * URL for it.
 *
 * A bare `<img src>` cannot do this. The browser issues that request without
 * the Authorization header and, cross-origin, without cookies, so a private
 * image answers 401 and renders as a broken-image icon — which reads to a
 * grower as "this photograph is gone" rather than "the browser did not ask
 * properly".
 *
 * `undefined` means still loading and `null` means it could not be fetched;
 * collapsing the two would render the failure state for a moment on every
 * successful load.
 */
function useAuthenticatedImage(path: string): string | null | undefined {
  const { session, loading } = useAuth();
  const [source, setSource] = useState<string | null>();
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setSource(undefined);
    // Asking before the session has hydrated sends the request without
    // credentials: the service answers 401, the reader is shown a failure for
    // the moment it takes to retry, and the id of a private image has been
    // handed over by an unauthenticated caller for nothing.
    if (loading) return () => { active = false; };
    fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Image unavailable (${response.status})`);
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => { if (active) setSource(null); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, session?.access_token, loading]);
  return source;
}

function QrImage({ plant }: { plant: Plant }) {
  const source = useAuthenticatedImage(`/api/conservatory/plants/${encodeURIComponent(plant.id)}/qr.svg`);
  return source ? <img src={source} alt={`QR code for ${plant.accession_number}`} className="h-28 w-28" /> : <div className="flex h-28 w-28 items-center justify-center border text-center text-xs">QR unavailable</div>;
}

/**
 * One stored photograph.
 *
 * Split out so the image can be fetched with the collection owner's
 * credentials. A photograph that cannot be fetched says so in words: an
 * unexplained broken-image icon in a private collection reads as data loss.
 */
function PlantPhotographImage({ photograph }: { photograph: PlantPhotograph }) {
  const source = useAuthenticatedImage(`/api/conservatory/photographs/${encodeURIComponent(photograph.id)}`);
  if (source === undefined) {
    return <div className="flex h-32 w-full items-center justify-center rounded-md border text-xs text-muted-foreground" role="status">Loading photograph…</div>;
  }
  if (source === null) {
    return <div className="flex h-32 w-full items-center justify-center rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground" data-testid={`photograph-unreachable-${photograph.id}`}>
      This photograph could not be loaded. It has not been removed from the collection.
    </div>;
  }
  return <img className="w-full rounded-md" alt={photograph.caption || "Photograph of this plant"} src={source} />;
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
 * Whether two instants fall on the same day.
 *
 * Used to decide whether a photograph's two clocks need saying separately. On
 * the same day the distinction is noise; on different days it is the whole
 * point.
 */
function sameDay(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  return asDay(left) === asDay(right);
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
  /** The standing event a correction is about to supersede, if any. */
  const [correcting, setCorrecting] = useState<PlantEvent>();

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
    // A correction fixes the kind for us, so only a new observation needs one.
    // This guard and the submit button's must agree; when they drifted apart,
    // the button enabled itself and the handler silently did nothing.
    if ((!correcting && !kind) || !day) return;
    setSaving(true);
    setError(undefined);
    try {
      const created = await request<PlantEvent>(
        `/api/conservatory/plants/${encodeURIComponent(plantId)}/events`,
        {
          method: "POST",
          body: JSON.stringify({
            // A correction is its own kind of event. Sending the corrected
            // event's kind instead would leave two competing claims with
            // nothing saying which supersedes which.
            kind: correcting ? "correction" : kind,
            occurred_at: asOccurredAt(day),
            note: note || null,
            supersedes_id: correcting ? correcting.id : null,
          }),
        },
      );
      setTimeline((current) => {
        if (!current) return current;
        if (!correcting) {
          return { ...current, standing: [...current.standing, created], event_count: current.event_count + 1 };
        }
        // The superseded record moves out of what stands and into what was
        // corrected. It is never removed: a corrected entry is part of the
        // collection's history.
        return {
          ...current,
          standing: current.standing.filter((event) => event.id !== correcting.id),
          corrected: [...current.corrected, { ...correcting, superseded_by_id: created.id }],
          event_count: current.event_count + 1,
        };
      });
      setKind(""); setDay(""); setNote(""); setCorrecting(undefined);
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
      {correcting && <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs" data-testid="correcting-banner">
        Correcting: <strong>{EVENT_LABEL.get(correcting.kind) ?? correcting.kind}</strong> on {asDay(correcting.occurred_at)}.
        The original stays in the record, marked as corrected — it is not deleted.
        <button type="button" className="ml-2 underline" data-testid="cancel-correction"
          onClick={() => { setCorrecting(undefined); setDay(""); setNote(""); }}>Cancel</button>
      </div>}
      <div className="flex flex-wrap gap-3">
        {!correcting && <label className="text-sm">
          <span className="block text-xs text-muted-foreground">What happened</span>
          <select className="mt-1 rounded-md border px-3 py-2" value={kind} data-testid="event-kind"
            onChange={(changed) => setKind(changed.target.value)}>
            <option value="">Choose…</option>
            {EVENT_KINDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>}
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
        disabled={saving || (!correcting && !kind) || !day} data-testid="event-submit">
        {saving ? "Recording…" : correcting ? "Record correction" : "Record observation"}
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
            <button type="button" className="ml-2 text-xs underline" data-testid={`correct-${event.id}`}
              onClick={() => { setCorrecting(event); setDay(""); setNote(""); setError(undefined); }}>
              Correct this
            </button>
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
function RecordReading({
  locationId,
  onRecorded,
  correcting,
  onCancelCorrection,
}: {
  locationId: string;
  onRecorded: () => void;
  correcting?: EnvironmentReading;
  onCancelCorrection?: () => void;
}) {
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
  // A correction keeps the variable of the reading it replaces. Letting it
  // change would turn one claim into a different one wearing the same
  // identity, and the backend refuses it.
  const effectiveVariable = correcting ? correcting.variable : variable;
  const ready = Boolean(
    effectiveVariable && origin && day && value.trim() && (!needsInstrument || instrument.trim()),
  );

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!ready) return;
    setSaving(true);
    setError(undefined);
    try {
      await request(`/api/conservatory/locations/${encodeURIComponent(locationId)}/environment`, {
        method: "POST",
        body: JSON.stringify({
          variable: effectiveVariable,
          value: Number(value),
          origin,
          observed_at: new Date(`${day}T00:00:00Z`).toISOString(),
          supersedes_id: correcting ? correcting.id : null,
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
    {correcting && <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs" data-testid="correcting-reading">
      Correcting the {correcting.variable.replace(/_/g, " ")} reading of {correcting.value} from{" "}
      {(correcting.observed_at || "").slice(0, 10)}. The original stays in the record, marked as
      corrected, and stops being used — it is not deleted.
      <button type="button" className="ml-2 underline" data-testid="cancel-reading-correction"
        onClick={() => onCancelCorrection?.()}>Cancel</button>
    </div>}
    <div className="flex flex-wrap gap-3">
      {!correcting && <label className="text-sm">
        <span className="block text-xs text-muted-foreground">What</span>
        <select className="mt-1 rounded-md border px-3 py-2" value={variable} data-testid="reading-variable"
          onChange={(changed) => setVariable(changed.target.value)}>
          <option value="">Choose…</option>
          {ENVIRONMENT_VARIABLES.map((option) => <option key={option.value} value={option.value}>{option.label} ({option.unit})</option>)}
        </select>
      </label>}
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
      {saving ? "Recording…" : correcting ? "Record correction" : "Record reading"}
    </button>
  </form>;
}

/**
 * The readings recorded at one location, and the way back from a typo.
 *
 * Without this list a correction was unreachable: the form could send one but
 * nothing showed a grower which reading to correct. A mistyped number matters
 * here more than most places, because readings feed the placement assessment —
 * a stray 120 can put a plant "outside" a bound it never breached.
 *
 * Corrected readings stay visible, struck through. They are part of the record
 * of what the grower believed at the time, and hiding them would leave someone
 * unable to see that a number they remember has already been revised.
 */
function LocationReadings({ locationId }: { locationId: string }) {
  const request = useApi();
  const [readings, setReadings] = useState<EnvironmentReading[]>();
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string>();
  const [correcting, setCorrecting] = useState<EnvironmentReading>();

  const load = useCallback(() => {
    setError(undefined);
    request<EnvironmentView>(`/api/conservatory/locations/${encodeURIComponent(locationId)}/environment`)
      .then((result) => {
        // A response without a readings array is a contract the service did
        // not honour. Rendering it as an empty list would claim this bench has
        // never been measured, on the strength of a broken payload.
        if (!result || !Array.isArray(result.readings)) { setUnavailable(true); return; }
        setReadings(result.readings);
      })
      .catch((cause) => {
        if (cause instanceof ApiError && cause.status === 404) setUnavailable(true);
        else setError(cause instanceof Error ? cause.message : "Readings could not be loaded");
      });
  }, [locationId, request]);

  useEffect(() => { load(); }, [load]);

  const standing = (readings ?? []).filter((row) => !row.superseded_by_id);
  const corrected = (readings ?? []).filter((row) => row.superseded_by_id);

  return <div className="mt-3" data-testid={`readings-${locationId}`}>
    {unavailable ? (
      <p className="text-xs text-muted-foreground" data-testid={`readings-unavailable-${locationId}`}>
        Readings are not available from this backend. This says nothing about what has been measured here.
      </p>
    ) : error ? (
      <p className="text-xs text-destructive" role="alert" data-testid={`readings-error-${locationId}`}>{error}</p>
    ) : !readings ? (
      <p className="text-xs text-muted-foreground" role="status">Loading readings…</p>
    ) : standing.length === 0 && corrected.length === 0 ? (
      <p className="text-xs text-muted-foreground" data-testid={`no-readings-${locationId}`}>Nothing measured here yet.</p>
    ) : (
      <>
        {standing.length > 0 && <ul className="space-y-1 text-xs" data-testid={`reading-list-${locationId}`}>
          {standing.map((reading) => (
            <li key={reading.id} data-testid={`reading-${reading.id}`}>
              {reading.variable.replace(/_/g, " ")}: {reading.value} {reading.unit}
              <span className="text-muted-foreground">
                {" "}({ORIGIN_LABEL[reading.origin] ?? reading.origin}
                {reading.instrument ? `, ${reading.instrument}` : ""}) — {(reading.observed_at || "").slice(0, 10)}
              </span>
              <button type="button" className="ml-2 underline" data-testid={`correct-reading-${reading.id}`}
                onClick={() => setCorrecting(reading)}>Correct this</button>
            </li>
          ))}
        </ul>}
        {corrected.length > 0 && <div className="mt-2" data-testid={`corrected-readings-${locationId}`}>
          <span className="text-[11px] font-semibold text-muted-foreground">Corrected</span>
          <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground line-through">
            {corrected.map((reading) => (
              <li key={reading.id}>{reading.variable.replace(/_/g, " ")}: {reading.value} {reading.unit}</li>
            ))}
          </ul>
        </div>}
      </>
    )}
    <RecordReading
      locationId={locationId}
      correcting={correcting}
      onCancelCorrection={() => setCorrecting(undefined)}
      onRecorded={() => { setCorrecting(undefined); load(); }}
    />
  </div>;
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
/**
 * Renaming and retiring a location.
 *
 * Both are offered here because both are things that happen to real
 * collections — benches get renamed when their purpose becomes clearer, and
 * dismantled when the greenhouse is rebuilt — and neither is a thing that
 * happens to a plant. Nothing either button does touches any plant's placement
 * history, and the copy says so, because "rename the bench" and "move the
 * plant" produce the same visible change beside a plant and mean entirely
 * different things.
 */
const CHANGE_LABEL: Record<string, string> = {
  created: "Created",
  renamed: "Renamed",
  retired: "Retired",
  unretired: "Brought back into use",
};

/**
 * A location's own history, which is emphatically not any plant's history.
 *
 * This is the surface where the distinction the placement model rests on
 * becomes visible: a rename appears here and nowhere near a plant, so a grower
 * puzzled by a bench having changed names can see when it happened without
 * finding a phantom move in a plant's record.
 */
function LocationHistory({ locationId }: { locationId: string }) {
  const request = useApi();
  const [open, setOpen] = useState(false);
  const [changes, setChanges] = useState<LocationChange[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open || changes || error) return;
    request<{ history: LocationChange[] }>(`/api/conservatory/locations/${encodeURIComponent(locationId)}/history`)
      .then((result) => {
        // A 200 without a history array is a contract the service did not
        // honour. Falling back to an empty list would render "no changes
        // recorded", which is a claim about this bench made from a broken
        // payload rather than from anything the service said.
        if (!result || !Array.isArray(result.history)) {
          setError("The history could not be read from the response.");
          return;
        }
        setChanges(result.history);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "The history could not be loaded"));
  }, [open, changes, error, locationId, request]);

  return <div className="mt-2">
    <button type="button" className="text-xs underline" data-testid={`history-toggle-${locationId}`}
      onClick={() => setOpen((current) => !current)}>
      {open ? "Hide history" : "History of this place"}
    </button>
    {open && <div className="mt-2" data-testid={`history-${locationId}`}>
      {error ? <p className="text-xs text-destructive" role="alert" data-testid={`history-error-${locationId}`}>{error}</p>
        : !changes ? <p className="text-xs text-muted-foreground" role="status">Loading…</p>
        : changes.length === 0 ? <p className="text-xs text-muted-foreground">No changes recorded.</p>
        : <ol className="space-y-1 text-xs text-muted-foreground">
            {changes.map((change) => <li key={change.id} data-testid={`history-entry-${change.change}`}>
              <span className="font-medium">{CHANGE_LABEL[change.change] ?? change.change}</span>
              {change.change === "renamed" && change.previous_name
                ? ` — ${change.previous_name} → ${change.new_name}`
                : change.new_name ? ` — ${change.new_name}` : ""}
              {" "}<span>({(change.recorded_at || "").slice(0, 10)})</span>
            </li>)}
          </ol>}
      <p className="mt-2 text-[11px] text-muted-foreground" data-testid={`history-scope-${locationId}`}>
        These are changes to the place itself. No plant moved because of any of them.
      </p>
    </div>}
  </div>;
}

/**
 * Bringing a retired location back.
 *
 * A bench that returns is the same bench. Un-retiring keeps its identity, so
 * every placement recorded before it was retired still points here and a
 * plant's earlier time on it stays one continuous record — which is exactly
 * what creating a replacement with the same name would destroy.
 */
function UnretireLocation({ location, onChanged }: { location: GrowingLocation; onChanged: () => void }) {
  const request = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function unretire() {
    setBusy(true); setError(undefined);
    try {
      await request(`/api/conservatory/locations/${encodeURIComponent(location.id)}/unretire`, {
        method: "POST", body: JSON.stringify({}),
      });
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The location could not be brought back");
    } finally { setBusy(false); }
  }

  return <span className="ml-2">
    <button type="button" className="text-xs underline" disabled={busy}
      data-testid={`unretire-${location.id}`} onClick={unretire}>Bring back into use</button>
    <span className="ml-2 text-[11px]" data-testid={`unretire-note-${location.id}`}>
      It keeps its identity, so plants that were here still show it in their history.
    </span>
    {error && <span className="ml-2 text-xs text-destructive" role="alert" data-testid={`unretire-error-${location.id}`}>{error}</span>}
  </span>;
}

function LocationAdmin({ location, onChanged }: { location: GrowingLocation; onChanged: () => void }) {
  const request = useApi();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(location.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function rename(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!name.trim() || name.trim() === location.name) return;
    setBusy(true); setError(undefined);
    try {
      await request(`/api/conservatory/locations/${encodeURIComponent(location.id)}/rename`, {
        method: "POST", body: JSON.stringify({ name: name.trim() }),
      });
      setRenaming(false);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The location could not be renamed");
    } finally { setBusy(false); }
  }

  async function retire() {
    setBusy(true); setError(undefined);
    try {
      await request(`/api/conservatory/locations/${encodeURIComponent(location.id)}/retire`, {
        method: "POST", body: JSON.stringify({}),
      });
      onChanged();
    } catch (cause) {
      // The common refusal is that plants are still here, which is a fact
      // about the collection the grower needs to act on rather than a bug.
      setError(cause instanceof Error ? cause.message : "The location could not be retired");
    } finally { setBusy(false); }
  }

  return <div className="mt-3 border-t pt-3" data-testid={`location-admin-${location.id}`}>
    {renaming ? (
      <form onSubmit={rename} className="space-y-2" data-testid={`rename-form-${location.id}`}>
        <input className="w-full rounded-md border px-3 py-2 text-sm" value={name}
          data-testid={`rename-input-${location.id}`} onChange={(changed) => setName(changed.target.value)} />
        <p className="text-[11px] text-muted-foreground" data-testid={`rename-note-${location.id}`}>
          Renaming changes what this place is called. It is not a move: no plant&rsquo;s history changes.
        </p>
        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
            disabled={busy || !name.trim() || name.trim() === location.name} data-testid={`rename-save-${location.id}`}>Save name</button>
          <button type="button" className="text-xs underline" data-testid={`rename-cancel-${location.id}`}
            // No name reset here: reopening the form sets it from the location,
          // so doing it again on cancel is unreachable.
          onClick={() => { setRenaming(false); setError(undefined); }}>Cancel</button>
        </div>
      </form>
    ) : (
      <div className="flex gap-3 text-xs">
        <button type="button" className="underline" data-testid={`rename-${location.id}`}
          onClick={() => { setRenaming(true); setName(location.name); setError(undefined); }}>Rename</button>
        <button type="button" className="underline" disabled={busy} data-testid={`retire-${location.id}`}
          onClick={retire}>Retire</button>
      </div>
    )}
    {error && <p className="mt-2 text-xs text-destructive" role="alert" data-testid={`location-admin-error-${location.id}`}>{error}</p>}
  </div>;
}

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
          <LocationReadings locationId={location.id} />
          <LocationAdmin location={location} onChanged={load} />
          <LocationHistory locationId={location.id} />
        </li>)}
      </ul>
    ) : (
      <p className="text-sm text-muted-foreground" data-testid="no-locations-yet">No growing locations yet. Create one above before placing a plant.</p>
    )}

    {retired.length > 0 && <div data-testid="retired-locations">
      <h3 className="text-sm font-semibold">Retired</h3>
      {/* Kept visible: placement history points at these, and hiding them
          would make a plant's past read as though it happened nowhere. */}
      <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
        {retired.map((location) => <li key={location.id} data-testid={`retired-${location.id}`}>
          {location.name} — no longer in use
          <UnretireLocation location={location} onChanged={load} />
        </li>)}
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
/**
 * What went wrong, in terms a grower can act on.
 *
 * A refused correction has three quite different causes and only one of them
 * is worth retrying. Rendering the raw code, or one generic sentence, leaves
 * somebody re-submitting a request that can never succeed.
 */
function placementFailure(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.code === "PLACEMENT_ALREADY_CORRECTED")
      return "Somebody has already corrected that entry. Reload the history to see the correction that stands.";
    if (cause.code === "CORRECTION_TARGET_NOT_FOUND")
      return "The entry being corrected is no longer in this plant's history. Reload the page and try again.";
    if (cause.code === "LOCATION_RETIRED")
      return "That location has been retired, so a plant cannot be moved there now.";
  }
  return cause instanceof Error ? cause.message : "The placement could not be recorded";
}

function RecordPlacement({
  plantId,
  locations,
  hasPlacement,
  correcting,
  onCancelCorrection,
  onRecorded,
}: {
  plantId: string;
  locations: GrowingLocation[];
  hasPlacement: boolean;
  /** The history entry being corrected, when the grower started from one. */
  correcting?: Placement;
  onCancelCorrection?: () => void;
  onRecorded: (event: Placement) => void;
}) {
  const request = useApi();
  const [locationId, setLocationId] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  // A correction fixes what it is correcting. Leaving the reason selectable
  // here would let a grower who clicked "this entry is wrong" file a move,
  // which records a journey the plant never made.
  const effectiveReason = correcting ? "correction" : reason;

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!locationId || !effectiveReason) return;
    setSaving(true);
    setError(undefined);
    try {
      const event = await request<Placement>(
        `/api/conservatory/plants/${encodeURIComponent(plantId)}/placement`,
        {
          method: "POST",
          body: JSON.stringify({
            location_id: locationId,
            reason: effectiveReason,
            note: note || null,
            ...(correcting ? { corrects_id: correcting.id } : {}),
          }),
        },
      );
      onRecorded(event);
      setNote("");
      setReason("");
      setLocationId("");
    } catch (cause) {
      setError(placementFailure(cause));
    } finally {
      setSaving(false);
    }
  }

  if (!locations.length) return <p className="mt-4 text-xs text-muted-foreground" data-testid="no-locations">
    No growing locations have been created yet, so this plant cannot be placed.
  </p>;

  return <form className="mt-4 space-y-3 border-t pt-4" onSubmit={submit} data-testid="record-placement">
    {correcting && (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm" data-testid="correcting-placement">
        <p>
          Correcting the entry recorded on{" "}
          {new Date(correcting.recorded_at).toLocaleDateString()}. Say where the plant actually was:
          this records that the entry was wrong, not that the plant went anywhere.
        </p>
        {onCancelCorrection && (
          <button type="button" className="mt-2 text-xs underline" data-testid="cancel-correction"
            onClick={onCancelCorrection}>
            Record something else instead
          </button>
        )}
      </div>
    )}
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">
        <span className="block text-xs text-muted-foreground">Location</span>
        <select className="mt-1 rounded-md border px-3 py-2" value={locationId} data-testid="placement-location"
          onChange={(changed) => setLocationId(changed.target.value)}>
          <option value="">Choose a location…</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
      </label>
      {!correcting && (
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
      )}
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
      disabled={saving || !locationId || !effectiveReason} data-testid="placement-submit">
      {saving ? "Recording…" : correcting ? "Record correction" : "Record placement"}
    </button>
  </form>;
}

const PHOTOGRAPH_FAILURE: Record<string, string> = {
  IMAGE_PROCESSING_UNAVAILABLE:
    "This service cannot strip location data from photographs right now, so it will not store one. Nothing was saved.",
  CONTENT_TYPE_NOT_ACCEPTED: "Only JPEG, PNG and WebP photographs can be stored.",
  PHOTOGRAPH_TOO_LARGE: "That file is too large to store.",
  PHOTOGRAPH_UNREADABLE: "That file could not be read as an image, so it was not stored.",
  EMPTY_UPLOAD: "That file was empty.",
};

/**
 * A plant's photographs, oldest capture first.
 *
 * Two things this panel must keep straight. The first is which clock a date
 * came from: a chronology of a plant is a chronology of when the pictures were
 * taken, and a photograph whose file carried no capture time says so rather
 * than borrowing the upload date and claiming a position it has not earned.
 *
 * The second is what a refused upload means. "This service cannot strip
 * location data right now" is a very different message from "that file was too
 * big", because the first one is the service protecting the grower's home
 * address and the second is a file problem. Collapsing them into "upload
 * failed" invites somebody to retry until something sticks.
 */
function Photographs({ plantId }: { plantId: string }) {
  const request = useApi();
  const { session } = useAuth();
  const [photographs, setPhotographs] = useState<PlantPhotograph[]>();
  const [unavailable, setUnavailable] = useState(false);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let active = true;
    request<{ photographs: PlantPhotograph[] }>(
      `/api/conservatory/plants/${encodeURIComponent(plantId)}/photographs`,
    )
      .then((result) => {
        if (!active) return;
        // A response missing its list is a contract the service did not
        // honour. Coercing it to an empty array would render as "no
        // photographs yet", which is a claim about the plant.
        if (!result || !Array.isArray(result.photographs)) { setUnavailable(true); return; }
        setPhotographs(result.photographs);
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 404) setUnavailable(true);
        else setError(cause instanceof Error ? cause.message : "Photographs could not be loaded");
      });
    return () => { active = false; };
  }, [plantId, request, reloads]);

  async function upload(changed: React.ChangeEvent<HTMLInputElement>) {
    const file = changed.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(undefined);
    try {
      const body = new FormData();
      body.append("file", file);
      if (caption.trim()) body.append("caption", caption.trim());
      // Sent as multipart, so no JSON Content-Type: the browser sets the
      // boundary and overriding it makes the request unparseable.
      const response = await fetch(
        `${API_BASE}/api/conservatory/plants/${encodeURIComponent(plantId)}/photographs`,
        {
          method: "POST",
          credentials: "include",
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
          body,
        },
      );
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        const code = failure?.detail?.code;
        setError(PHOTOGRAPH_FAILURE[code] ?? `The photograph could not be stored (${response.status}).`);
        return;
      }
      setCaption("");
      setReloads((count) => count + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The photograph could not be stored");
    } finally {
      setUploading(false);
      changed.target.value = "";
    }
  }

  if (unavailable) return <section className="mt-6 rounded-xl border border-dashed p-5" data-testid="photographs-unavailable">
    <h3 className="text-sm font-semibold">Photographs are not available from this backend</h3>
    <p className="mt-1 text-xs text-muted-foreground">This says nothing about whether this plant has been photographed.</p>
  </section>;

  return <section className="mt-6 rounded-xl border p-5" data-testid="photographs">
    <h3 className="text-sm font-semibold">Photographs</h3>
    <p className="mt-1 text-[11px] text-muted-foreground" data-testid="photographs-privacy">
      Location data is removed from every photograph before it is stored. If that cannot be done,
      the photograph is refused rather than saved.
    </p>

    <label className="mt-4 block text-sm">
      <span className="block text-xs text-muted-foreground">Caption (optional)</span>
      <input className="mt-1 w-full rounded-md border px-3 py-2" value={caption} data-testid="photograph-caption"
        onChange={(changed) => setCaption(changed.target.value)} />
    </label>
    <input type="file" className="mt-3 block text-sm" accept="image/jpeg,image/png,image/webp"
      data-testid="photograph-file" disabled={uploading} onChange={upload} />
    {uploading && <p className="mt-2 text-xs text-muted-foreground" role="status">Storing…</p>}
    {error && <p className="mt-2 text-xs text-destructive" role="alert" data-testid="photograph-error">{error}</p>}

    {!photographs ? (
      <p className="mt-4 text-sm text-muted-foreground" role="status">Loading photographs…</p>
    ) : photographs.length ? (
      <ul className="mt-4 grid gap-4 sm:grid-cols-2" data-testid="photograph-list">
        {photographs.map((photograph) => (
          <li key={photograph.id} className="rounded-lg border p-3" data-testid={`photograph-${photograph.id}`}>
            <PlantPhotographImage photograph={photograph} />
            {photograph.caption && <p className="mt-2 text-sm">{photograph.caption}</p>}
            <p className="mt-1 text-xs text-muted-foreground" data-testid={`photograph-when-${photograph.id}`}>
              {photograph.taken_at
                // Which clock this came from is stated, not implied by a bare
                // date sitting where a capture time would go. When the two
                // disagree, both are shown: a photograph taken in 2019 and
                // uploaded today is a claim about the plant and a much weaker
                // one about when anybody looked, and showing only the capture
                // date hides how late the record was made.
                ? sameDay(photograph.taken_at, photograph.recorded_at)
                  ? `Taken ${new Date(photograph.taken_at).toLocaleDateString()}`
                  : `Taken ${new Date(photograph.taken_at).toLocaleDateString()} · added ${new Date(photograph.recorded_at).toLocaleDateString()}`
                : `No capture date in the file · added ${new Date(photograph.recorded_at).toLocaleDateString()}`}
            </p>
          </li>
        ))}
      </ul>
    ) : (
      <p className="mt-4 text-sm text-muted-foreground" data-testid="photographs-none">
        No photographs recorded for this plant.
      </p>
    )}
  </section>;
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
/**
 * Ask Calyx about this plant where it actually is.
 *
 * The neighbouring "Ask Calyx" opens a question about the species and sends
 * nothing private, which is right for that question and useless for this one.
 * A grower wants to know whether their bench suits the plant, and that cannot
 * be answered without their readings.
 *
 * So this action hands the readings over deliberately, and says exactly what
 * travels before it is clicked. The observations go through single-use session
 * storage rather than the address, because a URL ends up in history, in
 * `Referer`, and in pasted links.
 */
function CultivationCalyxAction({
  acceptedScientificName,
  locationKind,
  readings,
}: {
  acceptedScientificName?: string | null;
  locationKind?: string | null;
  readings: EnvironmentReading[];
}) {
  const navigate = useNavigate();
  const [refused, setRefused] = useState<string>();

  const handoff = useMemo(
    () =>
      buildCultivationHandoff({
        acceptedScientificName,
        locationKind,
        // Standing readings only. A superseded value is one the grower has
        // already withdrawn, and comparing against it would answer about a
        // number they corrected.
        readings: readings.filter((reading) => !reading.superseded_by_id),
      }),
    [acceptedScientificName, locationKind, readings],
  );

  // Say which part is missing. "Unavailable" sends a grower looking for a
  // fault when what they need is to record a reading or link a name.
  if (!handoff) {
    const missing = !acceptedScientificName
      ? "this plant needs an accepted scientific name"
      : !locationKind
        ? "this plant needs to be placed somewhere first"
        : "no standing readings have been recorded where it is";
    return (
      <p className="mt-3 text-xs text-muted-foreground" data-testid="cultivation-calyx-unavailable">
        Calyx cannot evaluate these growing conditions yet — {missing}.
      </p>
    );
  }

  function evaluate() {
    setRefused(undefined);
    const token = crypto.randomUUID().replace(/-/g, "");
    // Seed first. Navigating after a refused write would arrive as a
    // cultivation question carrying no observations.
    if (!seedCultivationHandoff(window.sessionStorage, token, handoff!)) {
      setRefused(
        "Your browser would not let this page store the readings for the handoff, so nothing was sent.",
      );
      return;
    }
    const href = cultivationCalyxHref(handoff!.taxon, token);
    if (!href) {
      setRefused("The handoff could not be addressed, so nothing was sent.");
      return;
    }
    navigate(href);
  }

  return (
    <div className="mt-3" data-testid="cultivation-calyx-action">
      <button
        type="button"
        className="inline-flex items-center rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted"
        onClick={evaluate}
        data-testid="cultivation-calyx-submit"
      >
        Evaluate growing conditions with Calyx
      </button>
      <p className="mt-2 text-xs text-muted-foreground" data-testid="cultivation-calyx-disclosure">
        Sends <i>{handoff.taxon}</i>, that this is a{" "}
        {handoff.location.kind.replace(/_/g, " ")}, and {handoff.observations.length} reading
        {handoff.observations.length === 1 ? "" : "s"} with how each was obtained. Your
        plant&rsquo;s name, accession, notes, photographs and the name of the place it grows do not
        travel, and these readings are sent as cultivation observations — not as scientific
        evidence or occurrence records.
      </p>
      {refused && (
        <p className="mt-2 text-xs text-destructive" role="alert" data-testid="cultivation-calyx-refused">
          {refused}
        </p>
      )}
    </div>
  );
}

function CultivationContext({ plantId, acceptedScientificName }: { plantId: string; acceptedScientificName?: string | null }) {
  const request = useApi();
  const [placement, setPlacement] = useState<PlacementView>();
  const [locations, setLocations] = useState<GrowingLocation[]>([]);
  const [environment, setEnvironment] = useState<EnvironmentView>();
  const [error, setError] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);
  const [correcting, setCorrecting] = useState<Placement>();
  // Bumped after a correction to refetch rather than guess. See below.
  const [reloads, setReloads] = useState(0);

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
  }, [plantId, request, reloads]);

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

  const currentLocation = placement.current
    ? locations.find((candidate) => candidate.id === placement.current!.location_id)
    : undefined;

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
      <CultivationCalyxAction
        acceptedScientificName={acceptedScientificName}
        locationKind={currentLocation?.kind}
        readings={environment?.readings ?? []}
      />
      <RecordPlacement
        plantId={plantId}
        locations={correcting ? locations : usable}
        hasPlacement={placement.history.length > 0}
        correcting={correcting}
        onCancelCorrection={() => setCorrecting(undefined)}
        onRecorded={(event) => {
          if (event.corrects_id) {
            // Where the plant is after a correction depends on what the
            // correction targeted: correcting an old entry leaves the plant
            // wherever it has since moved. Only the backend applies that rule,
            // so the view is refetched rather than guessed. Assuming the
            // correction is the new current location is the same defect the
            // backend just stopped making.
            setCorrecting(undefined);
            setReloads((count) => count + 1);
            return;
          }
          setPlacement((current) =>
            current
              ? { ...current, current: event, history: [...current.history, event] }
              : current,
          );
        }}
      />
    </div>

    <div className="rounded-xl border p-5">
      <h3 className="text-sm font-semibold">Where it has been</h3>
      {placement.history.length ? (
        <ol className="mt-3 space-y-2" data-testid="placement-history">
          {placement.history.map((event) => (
            <li key={event.id} className="flex flex-wrap items-baseline gap-2 text-sm"
              data-testid={`placement-entry-${event.id}`}
              data-corrected={event.corrected_by_id ? "true" : "false"}>
              <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide" data-testid={`placement-reason-${event.reason}`}>
                {/* A correction is not a move: the plant never went anywhere. */}
                {event.reason === "correction" ? "record corrected" : event.reason}
              </span>
              <span className={event.corrected_by_id ? "line-through text-muted-foreground" : undefined}>
                {nameFor(event.location_id) ?? "Removed from the collection"}
              </span>
              {event.note && <span className="text-muted-foreground">— {event.note}</span>}
              {event.corrected_by_id ? (
                // Struck through, not removed. Somebody checking why the
                // records disagree with their memory needs to see what misled
                // them, and a deleted entry leaves the correction explaining
                // nothing.
                <span className="text-xs text-amber-700 dark:text-amber-400" data-testid={`placement-superseded-${event.id}`}>
                  a later correction says this was wrong
                </span>
              ) : (
                <button type="button" className="text-xs underline text-muted-foreground"
                  data-testid={`correct-placement-${event.id}`}
                  onClick={() => setCorrecting(event)}>
                  This entry is wrong
                </button>
              )}
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

/**
 * How long ago a reading was taken, in words a grower reads at a glance.
 *
 * Returns null when there is no age. Rendering "0 days ago" for a reading whose
 * age nobody can establish would claim it was taken just now, which is the one
 * thing it must not say.
 *
 * No threshold and no "stale" badge. Choosing a cutoff — a month, a season —
 * would be a policy nobody agreed to, and the backend refuses to pick one for
 * exactly the same reason. The number is shown; the grower decides.
 */
function readingAge(days: number | null | undefined): string | null {
  if (typeof days !== "number" || !Number.isFinite(days)) return null;
  // A reading stamped in the future is a clock or data problem, and saying so
  // is more use than a silently absent line.
  if (days < 0) return "timestamped in the future";
  // "taken", not "measured": the origin label right beside this already says
  // "measured by an instrument", and repeating the word made the line read as
  // though it were describing the instrument twice.
  if (days < 1) return "taken today";
  if (days < 2) return "taken yesterday";
  if (days < 60) return `taken ${Math.round(days)} days ago`;
  return `taken ${Math.round(days / 30)} months ago`;
}

const OUTCOME_COPY: Record<string, { label: string; detail: string }> = {
  within: {
    label: "Inside the known range",
    detail: "The recorded condition falls within a bound the Continuum has evidence for.",
  },
  outside: {
    label: "Outside the known range",
    detail: "The recorded condition falls outside a bound the Continuum has evidence for.",
  },
  unassessable: {
    label: "Cannot be assessed",
    detail: "Something needed for the comparison is missing.",
  },
  conflicting: {
    label: "Sources disagree",
    detail: "The evidence gives more than one bound, so no single comparison is possible.",
  },
};

const UNASSESSABLE_REASON: Record<string, string> = {
  NO_CONDITION_RECORDED: "Nothing has been recorded for this variable at this location.",
  NO_REQUIREMENT_EVIDENCE: "The Continuum holds no cultivation evidence for this taxon.",
  NO_CONDITION_AND_NO_REQUIREMENT: "Neither a reading here nor evidence for this taxon.",
  CONDITION_NOT_NUMERIC: "The recorded value cannot be compared numerically.",
  // Deliberately worded away from the taxon. "No evidence exists" is a claim
  // about the literature; this is a claim about our own plumbing, and a grower
  // deciding whether to move a plant is entitled to know which one they read.
  REQUIREMENT_SOURCE_UNAVAILABLE:
    "The store holding cultivation evidence could not be read, so nothing was looked up for this taxon.",
  NO_CONDITION_AND_REQUIREMENT_SOURCE_UNAVAILABLE:
    "Nothing has been recorded here, and the store holding cultivation evidence could not be read.",
};

/**
 * How this plant's conditions compare with what its taxon is known to need.
 *
 * The headline is deliberately the thing that is easiest to get wrong. A
 * comparison that finds nothing to complain about is not the same as a plant
 * that is well placed, and when nothing could be assessed the panel says so
 * first — before any per-variable detail — because a reader who skims a list
 * of grey rows and sees no red will otherwise conclude everything is fine.
 *
 * It offers no advice. Whether to move a plant depends on what else is on the
 * bench, what the grower can do and the season, none of which the backend has.
 */
function PlacementAssessmentPanel({ plantId }: { plantId: string }) {
  const request = useApi();
  const [assessment, setAssessment] = useState<PlacementAssessment>();
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    request<PlacementAssessment>(`/api/conservatory/plants/${encodeURIComponent(plantId)}/placement-assessment`)
      .then((result) => {
        if (!active) return;
        if (!result || !Array.isArray(result.assessments)) { setUnavailable(true); return; }
        setAssessment(result);
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 404) setUnavailable(true);
        else setError(cause instanceof Error ? cause.message : "The assessment could not be loaded");
      });
    return () => { active = false; };
  }, [plantId, request]);

  if (unavailable) return <section className="mt-6 rounded-xl border border-dashed p-5" data-testid="assessment-unavailable">
    <h3 className="text-sm font-semibold">Placement assessment is not available from this backend</h3>
    <p className="mt-1 text-xs text-muted-foreground">This says nothing about how the plant is doing.</p>
  </section>;

  if (error) return <section className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-5" role="alert" data-testid="assessment-error">
    <p className="text-xs">{error}</p>
  </section>;

  if (!assessment) return <p className="mt-6 text-sm text-muted-foreground" role="status">Loading placement assessment…</p>;

  const breaches = assessment.assessments.filter((row) => row.outcome === "outside");
  // Absent is the pre-existing shape and means the store was consulted. Only an
  // explicit false says otherwise; anything else here would make an older
  // backend look like a broken one.
  const sourceUnread = assessment.requirement_source_consulted === false;

  return <section className="mt-6 rounded-xl border p-5" data-testid="placement-assessment">
    <h3 className="text-sm font-semibold">How this place compares with what the taxon needs</h3>

    {sourceUnread ? (
      // Rendered ahead of everything else, because every other line on this
      // panel would otherwise describe this taxon's literature — and none of
      // it was consulted. Saying "no evidence for this taxon" here would turn
      // an outage into a scientific claim.
      <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm" data-testid="requirement-source-unread">
        The store holding cultivation evidence could not be read, so nothing was compared against
        what this taxon needs. This is not a statement about the taxon: nobody looked. Whatever you
        have recorded here is unaffected and is shown below.
      </p>
    ) : !assessment.anything_assessed ? (
      // Stated first and plainly. A reader skimming grey rows and seeing no
      // red would otherwise conclude the plant is fine.
      <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm" data-testid="nothing-assessed">
        Nothing could be compared. This is not a sign that the plant is well placed — it means the
        conditions here, the evidence for this taxon, or both, are missing.
      </p>
    ) : breaches.length ? (
      <p className="mt-2 text-sm" data-testid="assessment-summary">
        {breaches.length} recorded condition{breaches.length === 1 ? " falls" : "s fall"} outside a
        known range.
      </p>
    ) : (
      <p className="mt-2 text-sm" data-testid="assessment-summary">
        Everything that could be compared is inside its known range. Variables that could not be
        compared are listed below.
      </p>
    )}

    {readingAge(assessment.oldest_verdict_condition_age_days) && (
      <p className="mt-2 text-xs text-muted-foreground" data-testid="assessment-oldest-reading">
        The oldest reading behind these comparisons was{" "}
        {readingAge(assessment.oldest_verdict_condition_age_days)}.
      </p>
    )}

    <ul className="mt-3 space-y-2" data-testid="assessment-list">
      {assessment.assessments.map((row) => (
        <li key={row.variable} className="rounded-lg border p-3 text-sm"
          data-testid={`assessment-${row.variable}`} data-outcome={row.outcome}>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {row.variable.replace(/_/g, " ")}
            </span>
            <span className="font-medium">{OUTCOME_COPY[row.outcome]?.label ?? row.outcome}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.outcome === "unassessable" && row.reason
              ? UNASSESSABLE_REASON[row.reason] ?? OUTCOME_COPY.unassessable.detail
              : OUTCOME_COPY[row.outcome]?.detail}
          </p>
          {row.condition?.value !== undefined && (
            <p className="mt-1 text-xs" data-testid={`assessment-condition-${row.variable}`}>
              Recorded: {row.condition.value} {row.condition.unit}
              {/* The origin travels here too: a breach found against a
                  hand-entered number is a weaker finding than one against an
                  instrument, and the grower is entitled to see which. */}
              {row.condition.origin ? ` (${ORIGIN_LABEL[row.condition.origin] ?? row.condition.origin})` : ""}
              {/* When the number was taken travels with it. A verdict about
                  where the plant is now, resting on a reading from January, is
                  a different claim from the same verdict on this morning's. */}
              {readingAge(row.condition_age_days) ? ` · ${readingAge(row.condition_age_days)}` : ""}
            </p>
          )}
          {row.breached?.map((breach) => (
            <p key={breach.bound} className="mt-1 text-xs text-amber-600 dark:text-amber-400"
              data-testid={`assessment-breach-${row.variable}-${breach.bound}`}>
              Past the known {breach.bound} of {breach.limit}
              {row.bounds?.[breach.bound]?.[0]?.evidence_strength
                ? ` — evidence: ${row.bounds[breach.bound][0].evidence_strength}`
                : ""}
            </p>
          ))}
        </li>
      ))}
    </ul>

    <p className="mt-3 text-[11px] text-muted-foreground" data-testid="assessment-not-advice">
      This is a comparison, not advice. Whether to move a plant depends on what else is on the
      bench, what you can actually do, and the season — none of which are in this data.
    </p>
  </section>;
}

/**
 * Continuation from a plant the grower owns into the public scientific record
 * for its species.
 *
 * Only the plant's accepted SPECIES identity crosses this boundary, and only as
 * navigational context (`context_is_evidence=false`), never as evidence about
 * this plant. The accession, location, environmental readings, photographs, and
 * notes are the grower's private record and are deliberately not sent: what the
 * Continuum knows about a species is a different claim from what this grower has
 * observed on their bench. Fails closed — no action is offered — when the plant
 * carries no bounded canonical binomial, rather than widening a display name or
 * a partial identity into a search for a different taxon.
 */
export function PlantSpeciesContinuum({ plant }: { plant: Plant }) {
  const actions = speciesDossierContinuumActions({
    acceptedName: plant.accepted_scientific_name,
  });
  if (!actions) return null;
  const linkClass =
    "inline-flex items-center rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted";
  return (
    <section className="mt-6 rounded-lg border p-4" data-testid="plant-species-continuum">
      <h3 className="text-sm font-semibold">Explore this species in the Continuum</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Opens the public scientific record for{" "}
        <span className="italic">{plant.accepted_scientific_name}</span>. Your plant&rsquo;s own
        location, readings, and notes stay private and are not sent.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link className={linkClass} data-testid="plant-continuum-atlas" to={actions.atlas}>
          View on Atlas
        </Link>
        <Link className={linkClass} data-testid="plant-continuum-research" to={actions.research}>
          Open in Research
        </Link>
        <Link className={linkClass} data-testid="plant-continuum-calyx" to={actions.calyx}>
          Ask Calyx
        </Link>
      </div>
    </section>
  );
}

function PlantDossier({ plant, arrivedByScan }: { plant: Plant; arrivedByScan?: boolean }) {
  return <div className="rounded-xl border bg-card p-6">
    {arrivedByScan && <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs" data-testid="scan-arrival">Opened by scanning this plant&rsquo;s tag.</p>}
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{plant.accession_number}</p>
    <div className="mt-4 flex flex-wrap justify-between gap-6"><div><h2 className="text-3xl font-semibold italic">{plant.display_name}</h2><p className="mt-2">{plant.accepted_scientific_name || "Accepted name not yet linked"}</p><p className="mt-2 text-muted-foreground">{plant.location || "Location not recorded"}</p><p className="mt-5 max-w-2xl">{plant.notes || "No notes recorded"}</p></div><QrImage plant={plant} /></div>
    <p className="mt-6 break-all font-mono text-xs text-muted-foreground">{plant.qr_identifier}</p>
    <PlantSpeciesContinuum plant={plant} />
    <Photographs plantId={plant.id} />
    <CultivationContext plantId={plant.id} acceptedScientificName={plant.accepted_scientific_name} />
    <PlacementAssessmentPanel plantId={plant.id} />
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

const REVIEW_GROUP_COPY: Array<{
  key: string;
  heading: string;
  detail: string;
  tone: string;
}> = [
  {
    key: "outside",
    heading: "Outside a known range",
    detail:
      "A condition recorded where this plant is falls outside a bound the Continuum has evidence for.",
    tone: "border-destructive/40 bg-destructive/5",
  },
  {
    key: "conflicting",
    heading: "Sources disagree",
    detail:
      "The evidence gives more than one bound, so no single comparison is possible. Not a pass.",
    tone: "border-amber-500/40 bg-amber-500/5",
  },
  {
    key: "within",
    heading: "Inside the known range",
    detail:
      "Everything that could be compared was compared, and was inside. Variables that could not be compared are not counted here.",
    tone: "",
  },
  {
    key: "unassessed",
    heading: "Nothing could be compared",
    detail:
      "No condition recorded, no evidence for the taxon, or both. This says nothing about how these plants are doing.",
    tone: "",
  },
];

/**
 * The whole collection, grouped by what its assessments established.
 *
 * The failure this view exists to prevent is the one a list invites: a grower
 * scans it, sees nothing red, and stops. On one plant "cannot be assessed" is a
 * paragraph they read; across two hundred it is a grey block they skip.
 *
 * So "nothing could be compared" is a group with a heading of its own, and when
 * nothing in the entire collection could be assessed that is stated at the top
 * before any group is rendered. The groups are shown in a fixed order and never
 * sorted by severity: which plant to deal with first depends on the season,
 * the bench and what the grower can do, none of which is here, and a severity
 * sort would be advice wearing a sort order.
 */
function CollectionReviewPage() {
  const request = useApi();
  const [review, setReview] = useState<CollectionReview>();
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    request<CollectionReview>("/api/conservatory/collection/review")
      .then((result) => {
        if (!active) return;
        // A response without its groups is a contract the service did not
        // honour. Coercing it to empty groups would render as "no plant is
        // outside a known range", which is a claim about the collection rather
        // than about the response.
        if (!result || !result.groups || !result.counts) { setUnavailable(true); return; }
        setReview(result);
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 404) setUnavailable(true);
        else setError(cause instanceof Error ? cause.message : "The collection review could not be loaded");
      });
    return () => { active = false; };
  }, [request]);

  if (unavailable) return <section className="rounded-xl border border-dashed p-6" data-testid="review-unavailable">
    <h2 className="text-2xl font-semibold">Collection review is not available from this backend</h2>
    <p className="mt-2 text-sm text-muted-foreground">This says nothing about how the collection is doing.</p>
  </section>;

  if (error) return <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-6" role="alert" data-testid="review-error">
    <p className="text-sm">{error}</p>
  </section>;

  if (!review) return <Status loading />;

  return <div data-testid="collection-review">
    <h2 className="text-3xl font-semibold">How your collection compares</h2>
    <p className="mt-2 text-muted-foreground">
      Each plant&rsquo;s recorded conditions against bounds the Continuum has evidence for.
      Not a work list and not advice.
    </p>

    {!review.anything_assessed && (
      // Stated before any group. A reader who scrolls past four headings and
      // sees nothing red would otherwise conclude the collection is fine.
      <p className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm" data-testid="review-nothing-assessed">
        Nothing in this collection could be compared. This is not a sign that the plants are well
        placed &mdash; it means the conditions, the evidence for these taxa, or both, are missing.
      </p>
    )}

    {review.requirement_source_unread_for > 0 && (
      <p className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm" data-testid="review-source-unread">
        For {review.requirement_source_unread_for} plant
        {review.requirement_source_unread_for === 1 ? "" : "s"} the store holding cultivation
        evidence could not be read. Those are unassessed because nobody looked, which is not a
        statement about the plants or their taxa.
      </p>
    )}

    <div className="mt-7 grid gap-4 md:grid-cols-4">
      {REVIEW_GROUP_COPY.map((group) => (
        <div key={group.key} className={`rounded-xl border bg-card p-5 ${group.tone}`} data-testid={`review-count-${group.key}`}>
          <p className="text-sm text-muted-foreground">{group.heading}</p>
          <strong className="mt-2 block text-3xl">{review.counts[group.key] ?? 0}</strong>
        </div>
      ))}
    </div>

    {REVIEW_GROUP_COPY.map((group) => {
      const rows = review.groups[group.key] ?? [];
      return <section key={group.key} className="mt-8" data-testid={`review-group-${group.key}`}>
        <h3 className="text-sm font-semibold">{group.heading}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{group.detail}</p>
        {rows.length ? (
          <ul className="mt-3 space-y-2">
            {rows.map((row) => (
              <li key={row.plant_id} className="rounded-lg border p-3 text-sm" data-testid={`review-plant-${row.plant_id}`}>
                <Link className="font-medium text-primary" to={`/conservatory/plants/${encodeURIComponent(row.plant_id)}`}>
                  {row.display_name || row.accession_number || row.plant_id}
                </Link>
                {row.accepted_scientific_name && (
                  <span className="ml-2 italic text-muted-foreground">{row.accepted_scientific_name}</span>
                )}
                {row.breaches.map((breach) => (
                  <p key={breach.variable} className="mt-1 text-xs" data-testid={`review-breach-${row.plant_id}-${breach.variable}`}>
                    {breach.variable.replace(/_/g, " ")}
                    {breach.breached.map((limit) => ` · past the known ${limit.bound} of ${limit.limit}`).join("")}
                  </p>
                ))}
                {readingAge(row.oldest_verdict_condition_age_days) && (
                  // The row shows none of the underlying readings, so if the
                  // age is not here a season-old number passes as this
                  // morning's.
                  <p className="mt-1 text-xs text-muted-foreground" data-testid={`review-age-${row.plant_id}`}>
                    Oldest reading behind this: {readingAge(row.oldest_verdict_condition_age_days)}.
                  </p>
                )}
                {!row.requirement_source_consulted && (
                  <p className="mt-1 text-xs text-muted-foreground" data-testid={`review-unread-${row.plant_id}`}>
                    The evidence store could not be read for this plant.
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground" data-testid={`review-empty-${group.key}`}>No plants.</p>
        )}
      </section>;
    })}

    <p className="mt-8 text-[11px] text-muted-foreground" data-testid="review-not-advice">
      A grouping of comparisons, not advice. Which plant to deal with first depends on what else is
      on the bench, what you can do, and the season, none of which is in this data. The groups are
      not ordered by severity.
    </p>
  </div>;
}

/**
 * Where a plant the grower does not own yet could go.
 *
 * The buying question, answered from what their benches actually measure. The
 * pressure on this screen is the pull towards an answer it cannot support —
 * "yes, buy it, it goes on bench 3". Whether a bench has room, whether its
 * readings are current enough to act on, whether they can hold those
 * conditions through a season: none of that is in this data.
 *
 * So locations are listed in the order the backend gave them, never ranked,
 * and the page says outright that it is not advice. "Nothing could be
 * compared" — the common answer, because the Continuum holds trait evidence
 * for very few taxa — is stated before any location, because a list of grey
 * rows with nothing red reads as a list of benches that will do.
 */
function TaxonPlacementSearchPage() {
  const request = useApi();
  const [taxon, setTaxon] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [result, setResult] = useState<TaxonPlacementSearch>();
  const [searching, setSearching] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault();
    const query = taxon.trim();
    if (!query) return;
    setSearching(true);
    setError(undefined);
    setUnavailable(false);
    setResult(undefined);
    try {
      const found = await request<TaxonPlacementSearch>(
        `/api/conservatory/locations/suitability?taxon=${encodeURIComponent(query)}`,
      );
      // A response without its locations array is a contract the service did
      // not honour. Coercing it to an empty list would render as "no location
      // here suits this plant", which is a claim about the collection rather
      // than about the response.
      if (!found || !Array.isArray(found.locations)) { setUnavailable(true); return; }
      setResult(found);
      setSubmitted(query);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) setUnavailable(true);
      else setError(cause instanceof Error ? cause.message : "The search could not be run");
    } finally {
      setSearching(false);
    }
  }

  return <div data-testid="taxon-placement-search">
    <h2 className="text-3xl font-semibold">Could I grow this?</h2>
    <p className="mt-2 text-muted-foreground">
      Compare what your locations actually measure against published requirements for a
      species you are thinking of buying.
    </p>

    <form className="mt-6 flex flex-wrap gap-3" onSubmit={submit} data-testid="taxon-search-form">
      <input className="min-w-[18rem] flex-1 rounded-md border bg-background px-3 py-2"
        aria-label="Scientific name" placeholder="Cattleya skinneri" value={taxon}
        data-testid="taxon-search-input"
        onChange={(changed) => setTaxon(changed.target.value)} />
      <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        disabled={searching || !taxon.trim()} data-testid="taxon-search-submit">
        {searching ? "Comparing…" : "Compare with my locations"}
      </button>
    </form>

    {unavailable && <section className="mt-6 rounded-xl border border-dashed p-5" data-testid="taxon-search-unavailable">
      <h3 className="text-sm font-semibold">This search is not available from this backend</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        This says nothing about whether your locations suit this plant.
      </p>
    </section>}

    {error && <section className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-5" role="alert" data-testid="taxon-search-error">
      <p className="text-xs">{error}</p>
    </section>}

    {result && <section className="mt-7" data-testid="taxon-search-result">
      <h3 className="text-lg font-semibold">
        <span className="italic">{submitted}</span> against your locations
      </h3>

      {!result.anything_assessed && (
        // Said before any location. A screen of grey rows with nothing red
        // reads as a screen of benches that will do.
        <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm" data-testid="taxon-nothing-assessed">
          {result.requirements?.source_consulted === false
            ? "The store holding cultivation evidence could not be read, so nothing was compared. This is not a statement about this species: nobody looked."
            : "Nothing could be compared. The Continuum holds no cultivation evidence for this species, or your locations have no readings for the variables it would need — so this says nothing about whether you could grow it."}
        </p>
      )}

      <ul className="mt-4 space-y-3" data-testid="taxon-location-list">
        {result.locations.map((row) => (
          <li key={row.location_id} className="rounded-xl border p-4" data-testid={`taxon-location-${row.location_id}`}>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium">{row.name || row.location_id}</span>
              {row.kind && <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{row.kind.replace(/_/g, " ")}</span>}
            </div>
            {!row.anything_assessed ? (
              // Repeated per row rather than trusted from the heading above:
              // a reader scanning one bench must not have to remember it.
              <p className="mt-1 text-xs text-muted-foreground" data-testid={`taxon-location-unassessed-${row.location_id}`}>
                Nothing could be compared here. That is not the same as this location suiting the plant.
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {row.assessments.filter((a) => a.outcome === "within" || a.outcome === "outside").map((a) => (
                  <li key={a.variable} className="text-xs" data-testid={`taxon-variable-${row.location_id}-${a.variable}`}
                    data-outcome={a.outcome}>
                    {a.variable.replace(/_/g, " ")} — {OUTCOME_COPY[a.outcome]?.label ?? a.outcome}
                    {a.breached?.map((breach) => ` · past the known ${breach.bound} of ${breach.limit}`).join("")}
                  </li>
                ))}
              </ul>
            )}
            {readingAge(row.oldest_verdict_condition_age_days) && (
              <p className="mt-1 text-xs text-muted-foreground" data-testid={`taxon-age-${row.location_id}`}>
                Oldest reading behind this: {readingAge(row.oldest_verdict_condition_age_days)}.
              </p>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-6 text-[11px] text-muted-foreground" data-testid="taxon-not-advice">
        A comparison, not advice about buying the plant. Locations are not ranked, and nothing here
        knows whether a bench has room or whether you can hold those conditions through a season.
      </p>
    </section>}
  </div>;
}

export default function MyConservatory() {
  const location = useLocation();
  const path = location.pathname.replace(/\/$/, "");
  let content: React.ReactNode = <Dashboard />;
  if (path === "/conservatory/plants") content = <PlantList />;
  else if (path === "/conservatory/plants/new") content = <AddPlant />;
  else if (path === "/conservatory/labels") content = <Labels />;
  else if (path === "/conservatory/locations") content = <Locations />;
  else if (path === "/conservatory/review") content = <CollectionReviewPage />;
  else if (path === "/conservatory/could-i-grow-this") content = <TaxonPlacementSearchPage />;
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
