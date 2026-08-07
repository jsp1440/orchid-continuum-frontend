import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = (import.meta.env.VITE_CALYX_API_URL || "").replace(/\/$/, "");

export type ConservatoryGate = {
  name: string;
  passed: boolean;
  evidence: string;
  blocking_reason?: string | null;
};

export type ConservatoryReadinessReport = {
  ready_for_collection_entry: boolean;
  gates: ConservatoryGate[];
  storage_path: string;
  checked_at: string;
  instruction: string;
};

export function useConservatoryReadiness() {
  const { session } = useAuth();
  const [report, setReport] = useState<ConservatoryReadinessReport>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      if (!API_BASE) throw new Error("VITE_CALYX_API_URL is not configured.");
      const response = await fetch(`${API_BASE}/api/conservatory/readiness`, {
        credentials: "include",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!response.ok) throw new Error(`Readiness request failed (${response.status}).`);
      setReport(await response.json() as ConservatoryReadinessReport);
    } catch (reason) {
      setReport(undefined);
      setError(reason instanceof Error ? reason.message : "Readiness could not be verified.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { report, loading, error, refresh };
}

export function ConservatoryReadinessBanner() {
  const { report, loading, error, refresh } = useConservatoryReadiness();
  const ready = report?.ready_for_collection_entry === true;
  return (
    <section className={`no-print mb-7 rounded-xl border p-5 ${ready ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`} aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Collection entry readiness</p>
          <h2 className="mt-1 text-xl font-semibold">{loading ? "Checking deployment…" : ready ? "Ready for three test plants" : "Collection entry remains blocked"}</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{error || report?.instruction || "Calyx has not returned verified persistence evidence."}</p>
        </div>
        <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => void refresh()} disabled={loading}>{loading ? "Checking…" : "Check again"}</button>
      </div>
      {report && <div className="mt-4 grid gap-2 md:grid-cols-2">{report.gates.map((gate) => <div key={gate.name} className="rounded-lg border bg-background/70 p-3"><div className="flex items-center justify-between gap-3"><strong className="text-sm">{gate.name.replaceAll("_", " ")}</strong><span className={`text-xs font-semibold ${gate.passed ? "text-emerald-700" : "text-amber-700"}`}>{gate.passed ? "Verified" : "Blocked"}</span></div><p className="mt-1 text-xs text-muted-foreground">{gate.blocking_reason || gate.evidence}</p></div>)}</div>}
      <div className="mt-4"><Link className="text-sm font-medium text-primary" to="/conservatory/readiness">View full readiness report</Link></div>
    </section>
  );
}

export function ConservatoryReadinessPage() {
  const { report, loading, error, refresh } = useConservatoryReadiness();
  const ready = report?.ready_for_collection_entry === true;
  return <div><h2 className="text-3xl font-semibold">Conservatory Readiness</h2><p className="mt-2 text-muted-foreground">Live evidence from the deployed Calyx backend. Unknown conditions fail closed.</p><div className={`mt-6 rounded-xl border p-6 ${ready ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`}><h3 className="text-xl font-semibold">{loading ? "Checking…" : ready ? "Ready for controlled testing" : "Not ready for real collection entry"}</h3><p className="mt-2 text-sm">{error || report?.instruction || "No verified report is available."}</p><button type="button" className="mt-4 rounded-md border px-4 py-2" onClick={() => void refresh()} disabled={loading}>Refresh evidence</button></div>{report && <div className="mt-6 space-y-3">{report.gates.map((gate) => <article key={gate.name} className="rounded-xl border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold capitalize">{gate.name.replaceAll("_", " ")}</h3><span className={gate.passed ? "text-emerald-700" : "text-amber-700"}>{gate.passed ? "Verified" : "Blocked"}</span></div><p className="mt-2 text-sm text-muted-foreground">{gate.evidence}</p>{gate.blocking_reason && <p className="mt-2 text-sm font-medium">Required: {gate.blocking_reason}</p>}</article>)}</div>}</div>;
}
