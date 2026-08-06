import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

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

type PlantInput = {
  display_name: string;
  accepted_scientific_name?: string;
  location?: string;
  notes?: string;
};

function useApi() {
  const { session } = useAuth();
  return useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
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
        throw new Error(String(body.detail || body.message || `Request failed (${response.status})`));
      }
      return response.json() as Promise<T>;
    },
    [session?.access_token],
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <style>{`@media print { body * { visibility: hidden !important; } .print-zone, .print-zone * { visibility: visible !important; } .print-zone { position: absolute; inset: 0; background: white; color: black; padding: 0.25in; } .no-print { display: none !important; } .plant-label { break-inside: avoid; page-break-inside: avoid; } }`}</style>
      <header className="no-print border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5">
          <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Orchid Continuum</p><h1 className="text-2xl font-semibold">My Conservatory</h1></div>
          <nav className="flex flex-wrap gap-2 text-sm">
            <Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory">Dashboard</Link>
            <Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/plants">My Plants</Link>
            <Link className="rounded-md px-3 py-2 hover:bg-muted" to="/conservatory/labels">Print Labels</Link>
            <Link className="rounded-md bg-primary px-3 py-2 text-primary-foreground" to="/conservatory/plants/new">Add Plant</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
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
    setLoading(true);
    setError(undefined);
    try {
      const body = await request<{ plants: Plant[] }>("/api/conservatory/plants");
      setPlants(body.plants || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load plants");
    } finally {
      setLoading(false);
    }
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
  return <><h2 className="text-3xl font-semibold">Your living collection</h2><p className="mt-2 text-muted-foreground">Dedicated collection records with stable accession numbers and QR identifiers.</p><div className="mt-7 grid gap-4 md:grid-cols-3"><div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Plants</p><strong className="mt-2 block text-3xl">{plants.length}</strong></div><div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">QR ready</p><strong className="mt-2 block text-3xl">{plants.filter((plant) => plant.qr_identifier).length}</strong></div><div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Locations recorded</p><strong className="mt-2 block text-3xl">{plants.filter((plant) => plant.location).length}</strong></div></div><div className="mt-10 grid gap-4 md:grid-cols-3">{plants.slice(0, 6).map((plant) => <PlantCard key={plant.id} plant={plant} />)}</div></>;
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
  const [form, setForm] = useState<PlantInput>({ display_name: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(undefined);
    try { const plant = await request<Plant>("/api/conservatory/plants", { method: "POST", body: JSON.stringify(form) }); navigate(`/conservatory/plants/${plant.id}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The plant could not be saved."); }
    finally { setSaving(false); }
  }
  const field = (key: keyof PlantInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <><h2 className="text-3xl font-semibold">Add Plant</h2><p className="mt-2 text-muted-foreground">Creates a dedicated Conservatory record and assigns the next accession number automatically.</p><form className="mt-7 max-w-2xl space-y-5 rounded-xl border bg-card p-6" onSubmit={submit}>{error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}<label className="block"><span className="text-sm font-medium">Display name</span><input required minLength={2} className="mt-2 w-full rounded-md border bg-background px-3 py-2" value={form.display_name} onChange={(event) => field("display_name", event.target.value)} /></label><label className="block"><span className="text-sm font-medium">Accepted scientific name</span><input className="mt-2 w-full rounded-md border bg-background px-3 py-2" value={form.accepted_scientific_name || ""} onChange={(event) => field("accepted_scientific_name", event.target.value)} /></label><label className="block"><span className="text-sm font-medium">Location</span><input className="mt-2 w-full rounded-md border bg-background px-3 py-2" placeholder="Greenhouse bench 2" value={form.location || ""} onChange={(event) => field("location", event.target.value)} /></label><label className="block"><span className="text-sm font-medium">Notes</span><textarea rows={5} className="mt-2 w-full rounded-md border bg-background px-3 py-2" value={form.notes || ""} onChange={(event) => field("notes", event.target.value)} /></label><button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" disabled={saving}>{saving ? "Saving…" : "Save and assign accession"}</button></form></>;
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

function Detail() {
  const { plantId = "" } = useParams();
  const request = useApi();
  const [plant, setPlant] = useState<Plant>();
  const [error, setError] = useState<string>();
  useEffect(() => { request<Plant>(`/api/conservatory/plants/${encodeURIComponent(plantId)}`).then(setPlant).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load plant")); }, [plantId, request]);
  if (error || !plant) return <Status loading={!error} error={error} />;
  return <div className="rounded-xl border bg-card p-6"><p className="text-xs uppercase tracking-wide text-muted-foreground">{plant.accession_number}</p><div className="mt-4 flex flex-wrap justify-between gap-6"><div><h2 className="text-3xl font-semibold italic">{plant.display_name}</h2><p className="mt-2">{plant.accepted_scientific_name || "Accepted name not yet linked"}</p><p className="mt-2 text-muted-foreground">{plant.location || "Location not recorded"}</p><p className="mt-5 max-w-2xl">{plant.notes || "No notes recorded"}</p></div><QrImage plant={plant} /></div><p className="mt-6 break-all font-mono text-xs text-muted-foreground">{plant.qr_identifier}</p></div>;
}

function Labels() {
  const { plants, loading, error } = usePlants();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  if (loading || error) return <Status loading={loading} error={error} />;
  const visible = selected.size ? plants.filter((plant) => selected.has(plant.id)) : plants;
  return <><div className="no-print flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-3xl font-semibold">Print QR Labels</h2><p className="mt-2 text-muted-foreground">Select plants or print the full collection. Browser print settings control the final label stock.</p></div><button type="button" className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => window.print()}>Print {visible.length} label{visible.length === 1 ? "" : "s"}</button></div><div className="no-print mt-6 grid gap-2 md:grid-cols-2">{plants.map((plant) => <label key={plant.id} className="flex items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={selected.has(plant.id)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(plant.id) ? next.delete(plant.id) : next.add(plant.id); return next; })} /><span><strong>{plant.accession_number}</strong> — <em>{plant.display_name}</em></span></label>)}</div><div className="print-zone mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">{visible.map((plant) => <article key={plant.id} className="plant-label flex min-h-[1.45in] items-center gap-3 border border-black p-2 text-black"><QrImage plant={plant} /><div><strong className="block text-sm">{plant.accession_number}</strong><em className="mt-1 block text-sm">{plant.display_name}</em>{plant.location && <span className="mt-1 block text-xs">{plant.location}</span>}</div></article>)}</div></>;
}

export default function MyConservatory() {
  const location = useLocation();
  const path = location.pathname.replace(/\/$/, "");
  let content: React.ReactNode = <Dashboard />;
  if (path === "/conservatory/plants") content = <PlantList />;
  else if (path === "/conservatory/plants/new") content = <AddPlant />;
  else if (path === "/conservatory/labels") content = <Labels />;
  else if (/^\/conservatory\/plants\/[^/]+$/.test(path)) content = <Detail />;
  return <Shell>{content}</Shell>;
}
