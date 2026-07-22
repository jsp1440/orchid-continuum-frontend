import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type BackendPlant = Record<string, unknown>;

type Plant = {
  id: string;
  displayName: string;
  acceptedScientificName?: string;
  notes?: string;
  location?: string;
  categoryId?: string;
  qrIdentifier?: string;
  uncertainIdentification: boolean;
  createdAt?: string;
};

const API_BASE = (import.meta.env.VITE_CALYX_API_URL || "").replace(/\/$/, "");
const EVENT_ID = import.meta.env.VITE_CONSERVATORY_EVENT_ID || "";
const EXHIBITOR_ID = import.meta.env.VITE_CONSERVATORY_EXHIBITOR_ID || "";
const CATEGORY_ID = import.meta.env.VITE_CONSERVATORY_CATEGORY_ID || "";

function normalizePlant(record: BackendPlant): Plant {
  const text = (key: string) => typeof record[key] === "string" ? String(record[key]) : undefined;
  const id = text("id") || text("plant_id") || "";
  const name = text("name") || text("display_name") || text("scientific_name") || "Unnamed plant";
  return {
    id,
    displayName: name,
    acceptedScientificName: text("accepted_scientific_name") || text("scientific_name"),
    notes: text("notes"),
    location: text("location"),
    categoryId: text("category_id"),
    qrIdentifier: text("qr_identifier") || (id ? `calyx:plant:${id}` : undefined),
    uncertainIdentification: /\b(?:cf\.|aff\.|sp\.)\b/i.test(name),
    createdAt: text("created_at"),
  };
}

function decodeQr(raw: string): string {
  const value = raw.trim();
  if (!value) throw new Error("Enter or scan a QR identifier.");
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/plants\/([^/]+)$/);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    // Plain identifiers are valid.
  }
  return value.replace(/^(?:calyx:plant:|plant:)/i, "").trim();
}

function useCalyxApi() {
  const { session } = useAuth();
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!API_BASE) throw new Error("VITE_CALYX_API_URL is not configured.");
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...(init?.headers || {}),
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(String(body.detail || body.message || response.statusText || "Backend request failed"));
    }
    return response.json() as Promise<T>;
  }
  return {
    async list(): Promise<Plant[]> {
      if (!EVENT_ID) throw new Error("VITE_CONSERVATORY_EVENT_ID is not configured.");
      await request("/api/implementation-planning/health");
      const records = await request<BackendPlant[]>(`/judging/events/${encodeURIComponent(EVENT_ID)}/plants`);
      return records.map(normalizePlant);
    },
    async get(id: string): Promise<Plant> {
      return normalizePlant(await request<BackendPlant>(`/judging/plants/${encodeURIComponent(id)}`));
    },
    async add(name: string, notes: string): Promise<Plant> {
      if (!EVENT_ID || !EXHIBITOR_ID || !CATEGORY_ID) throw new Error("Conservatory event, exhibitor, and category environment values are required.");
      return normalizePlant(await request<BackendPlant>(`/judging/events/${encodeURIComponent(EVENT_ID)}/plants`, {
        method: "POST",
        body: JSON.stringify({ exhibitor_id: EXHIBITOR_ID, category_id: CATEGORY_ID, name: name.trim(), notes: notes.trim() || null }),
      }));
    },
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background"><header className="border-b bg-card"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Orchid Continuum</p><h1 className="text-2xl font-semibold">My Conservatory</h1></div><nav className="flex flex-wrap gap-2 text-sm"><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory">Dashboard</Link><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/plants">My Plants</Link><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/search">Search</Link><Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/scan">QR Scanner</Link><Link className="rounded-md bg-primary px-3 py-2 text-primary-foreground" to="/conservatory/plants/new">Add Plant</Link></nav></div></header><main className="mx-auto max-w-7xl px-4 py-8">{children}</main></div>;
}

function Status({ loading, error }: { loading: boolean; error?: string }) {
  if (loading) return <div className="rounded-lg border p-8" role="status">Loading conservatory records…</div>;
  if (error) return <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6" role="alert"><h2 className="font-semibold">The conservatory could not be loaded</h2><p className="mt-2 text-sm">{error}</p></div>;
  return null;
}

function PlantCard({ plant }: { plant: Plant }) {
  return <Link to={`/conservatory/plants/${plant.id}`} className="block rounded-xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><p className="text-xs uppercase tracking-wide text-muted-foreground">{plant.categoryId || "Collection plant"}</p><h3 className="mt-2 text-lg font-semibold italic">{plant.displayName}</h3>{plant.uncertainIdentification && <p className="mt-2 text-xs font-medium text-amber-700">Identification uncertain</p>}<p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{plant.notes || "No collection notes recorded."}</p></Link>;
}

function usePlants() {
  const api = useCalyxApi();
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  useEffect(() => { let active = true; api.list().then((value) => active && setPlants(value)).catch((reason) => active && setError(reason instanceof Error ? reason.message : "Unable to load plants")).finally(() => active && setLoading(false)); return () => { active = false; }; }, []);
  return { plants, loading, error };
}

function Dashboard() {
  const { plants, loading, error } = usePlants();
  if (loading || error) return <Status loading={loading} error={error}/>;
  const recent = [...plants].sort((a, b) => Date.parse(b.createdAt || "0") - Date.parse(a.createdAt || "0")).slice(0, 3);
  return <><div className="mb-8"><p className="text-sm font-medium text-primary">Private collection workspace</p><h2 className="mt-1 text-3xl font-semibold">Your orchids, in context</h2><p className="mt-3 max-w-3xl text-muted-foreground">A scientifically careful view of the living collection records currently available through Calyx.</p></div><div className="grid gap-4 md:grid-cols-3"><div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Collection</p><strong className="mt-2 block text-3xl">{plants.length}</strong></div><div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">QR linked</p><strong className="mt-2 block text-3xl">{plants.filter(p => p.qrIdentifier).length}</strong></div><div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Needs identification</p><strong className="mt-2 block text-3xl">{plants.filter(p => p.uncertainIdentification).length}</strong></div></div><div className="mt-10 flex items-center justify-between"><h2 className="text-xl font-semibold">Recently added</h2><Link className="text-sm font-medium text-primary" to="/conservatory/plants">View all plants</Link></div><div className="mt-4 grid gap-4 md:grid-cols-3">{recent.length ? recent.map(p => <PlantCard key={p.id} plant={p}/>) : <p className="text-muted-foreground">No plants are currently available.</p>}</div></>;
}

function Plants({ searchMode = false }: { searchMode?: boolean }) {
  const { plants, loading, error } = usePlants();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => plants.filter(p => `${p.displayName} ${p.notes || ""}`.toLowerCase().includes(query.toLowerCase())), [plants, query]);
  if (loading || error) return <Status loading={loading} error={error}/>;
  return <><h2 className="text-3xl font-semibold">{searchMode ? "Search your collection" : "My Plants"}</h2><p className="mt-2 text-muted-foreground">Search and review authenticated plant records without changing scientific or provenance fields.</p><input aria-label="Search plants" className="mt-6 w-full rounded-lg border bg-background px-4 py-3" placeholder="Scientific name, collection name, or note" value={query} onChange={e => setQuery(e.target.value)}/><p className="mt-3 text-sm text-muted-foreground" role="status">{filtered.length} result{filtered.length === 1 ? "" : "s"}</p><div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{filtered.map(p => <PlantCard key={p.id} plant={p}/>)}</div>{!filtered.length && <div className="mt-6 rounded-lg border p-8 text-muted-foreground">No matching plant records.</div>}</>;
}

function Detail() {
  const { plantId = "" } = useParams();
  const api = useCalyxApi();
  const [plant, setPlant] = useState<Plant>();
  const [error, setError] = useState<string>();
  useEffect(() => { api.get(plantId).then(setPlant).catch(reason => setError(reason instanceof Error ? reason.message : "Unable to load plant")); }, [plantId]);
  if (error || !plant) return <Status loading={!error} error={error}/>;
  return <><Link className="text-sm text-primary" to="/conservatory/plants">← My Plants</Link><div className="mt-5 rounded-xl border bg-card p-6"><p className="text-xs uppercase tracking-wide text-muted-foreground">Plant passport</p><h2 className="mt-2 text-3xl font-semibold italic">{plant.displayName}</h2>{plant.uncertainIdentification && <p className="mt-2 text-sm font-medium text-amber-700">Identification is recorded as uncertain.</p>}<dl className="mt-8 grid gap-5 md:grid-cols-2"><div><dt className="text-sm font-medium text-muted-foreground">Accepted scientific name</dt><dd className="mt-1 italic">{plant.acceptedScientificName || "Not supplied by the current backend"}</dd></div><div><dt className="text-sm font-medium text-muted-foreground">Location</dt><dd className="mt-1">{plant.location || "Restricted or not recorded"}</dd></div><div><dt className="text-sm font-medium text-muted-foreground">Notes</dt><dd className="mt-1">{plant.notes || "No notes recorded"}</dd></div><div><dt className="text-sm font-medium text-muted-foreground">QR identifier</dt><dd className="mt-1 break-all font-mono text-sm">{plant.qrIdentifier || "Not assigned"}</dd></div></dl></div></>;
}

function AddPlant() {
  const api = useCalyxApi(); const navigate = useNavigate();
  const [name, setName] = useState(""); const [notes, setNotes] = useState(""); const [error, setError] = useState<string>(); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); if (name.trim().length < 2) { setError("Enter a plant name with at least two characters."); return; } setSaving(true); setError(undefined); try { const plant = await api.add(name, notes); navigate(`/conservatory/plants/${plant.id}`); } catch (reason) { setError(reason instanceof Error ? reason.message : "The plant could not be saved."); } finally { setSaving(false); } }
  return <><h2 className="text-3xl font-semibold">Add Plant</h2><p className="mt-2 text-muted-foreground">Create a real backend record using the configured event, exhibitor, and category context.</p><form className="mt-7 max-w-2xl space-y-5 rounded-xl border bg-card p-6" onSubmit={submit}>{error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}<label className="block"><span className="text-sm font-medium">Scientific or collection name</span><input autoFocus required minLength={2} className="mt-2 w-full rounded-md border bg-background px-3 py-2" value={name} onChange={e => setName(e.target.value)}/></label><label className="block"><span className="text-sm font-medium">Collection notes</span><textarea rows={5} className="mt-2 w-full rounded-md border bg-background px-3 py-2" value={notes} onChange={e => setNotes(e.target.value)}/></label><div className="flex gap-3"><button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" disabled={saving}>{saving ? "Saving…" : "Save plant"}</button><Link className="rounded-md border px-4 py-2" to="/conservatory/plants">Cancel</Link></div></form></>;
}

function Scanner() {
  const navigate = useNavigate(); const api = useCalyxApi(); const [value, setValue] = useState(""); const [error, setError] = useState<string>(); const [scanning, setScanning] = useState(false); const video = useRef<HTMLVideoElement>(null); const stream = useRef<MediaStream>();
  useEffect(() => () => stream.current?.getTracks().forEach(track => track.stop()), []);
  async function resolve(raw = value) { try { const plant = await api.get(decodeQr(raw)); navigate(`/conservatory/plants/${plant.id}`); } catch (reason) { setError(reason instanceof Error ? reason.message : "QR identifier could not be resolved."); } }
  async function scan() { if (!("BarcodeDetector" in window)) { setError("Camera QR decoding is unavailable in this browser. Enter the identifier below."); return; } try { const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); stream.current = media; if (video.current) { video.current.srcObject = media; await video.current.play(); } setScanning(true); } catch { setError("Camera permission was denied or no camera is available."); } }
  return <><h2 className="text-3xl font-semibold">Scan a plant</h2><p className="mt-2 text-muted-foreground">Resolve a QR identifier against the authenticated Calyx backend. Manual entry remains available on browsers without camera decoding.</p><div className="mt-7 grid gap-6 md:grid-cols-2"><div className="rounded-xl border bg-card p-5"><video ref={video} muted playsInline className="aspect-video w-full rounded-lg bg-muted"/><button className="mt-4 rounded-md border px-4 py-2" onClick={scan} disabled={scanning}>{scanning ? "Camera active" : "Start camera"}</button></div><form className="rounded-xl border bg-card p-5" onSubmit={e => { e.preventDefault(); void resolve(); }}><label className="block"><span className="text-sm font-medium">QR or plant identifier</span><input className="mt-2 w-full rounded-md border bg-background px-3 py-2" value={value} onChange={e => setValue(e.target.value)} placeholder="calyx:plant:…"/></label>{error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}<button className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground">Resolve plant</button><p className="mt-4 text-xs text-muted-foreground">QR data contains an identifier, not mutable plant data.</p></form></div></>;
}

export default function MyConservatory() {
  const location = useLocation();
  const path = location.pathname;
  let page: React.ReactNode = <Dashboard/>;
  if (path === "/conservatory/plants") page = <Plants/>;
  else if (path === "/conservatory/search") page = <Plants searchMode/>;
  else if (path === "/conservatory/plants/new") page = <AddPlant/>;
  else if (path === "/conservatory/scan") page = <Scanner/>;
  else if (/^\/conservatory\/plants\/[^/]+$/.test(path)) page = <Detail/>;
  return <Shell>{page}</Shell>;
}
