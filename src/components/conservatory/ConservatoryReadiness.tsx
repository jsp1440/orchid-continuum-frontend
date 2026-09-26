import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = (import.meta.env.VITE_CALYX_API_URL || "").replace(/\/$/, "");
const SERVICE_UNAVAILABLE = "Conservatory readiness cannot be verified for this deployment right now. Collection entry remains safely blocked.";
const READY_SUMMARY = "Required readiness checks are verified for controlled collection testing.";
const BLOCKED_SUMMARY = "One or more readiness checks are not yet verified. Collection entry remains safely blocked.";
const PUBLIC_GATE_NAMES: Record<string, string> = {
  persistent_storage: "persistent storage",
  restart_survival: "restart survival",
};

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

function publicGateSummary(gate: ConservatoryGate) {
  return gate.passed
    ? "This readiness check is verified."
    : "This readiness check is not yet verified. Collection entry remains blocked.";
}

function publicGateName(gate: ConservatoryGate, index: number) {
  // A backend probe name can contain the same internal detail as its evidence.
  // Only known, public labels cross this boundary; raw reports remain available
  // from the hook for separately authorized operator tooling.
  return Object.prototype.hasOwnProperty.call(PUBLIC_GATE_NAMES, gate.name)
    ? PUBLIC_GATE_NAMES[gate.name]
    : `Readiness check ${index + 1}`;
}

export function useConservatoryReadiness() {
  const { session } = useAuth();
  const [report, setReport] = useState<ConservatoryReadinessReport>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setReport(undefined);
    setError(undefined);
    try {
      if (!API_BASE) throw new Error(SERVICE_UNAVAILABLE);
      const response = await fetch(`${API_BASE}/api/conservatory/readiness`, {
        credentials: "include",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!response.ok) throw new Error(SERVICE_UNAVAILABLE);
      const next = await response.json() as ConservatoryReadinessReport;
      if (!Array.isArray(next.gates) || next.gates.length === 0 ||
          typeof next.ready_for_collection_entry !== "boolean" ||
          next.gates.some(gate => !gate || typeof gate.name !== "string" || typeof gate.passed !== "boolean")) {
        throw new Error(SERVICE_UNAVAILABLE);
      }
      setReport({ ...next, ready_for_collection_entry: next.ready_for_collection_entry && next.gates.every(gate => gate.passed) });
    } catch {
      setReport(undefined);
      setError(SERVICE_UNAVAILABLE);
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
  const summary = error || (report ? (ready ? READY_SUMMARY : BLOCKED_SUMMARY) : "Calyx has not returned verified persistence evidence. Collection entry remains safely blocked.");
  return (
    <section className={`no-print mb-7 rounded-xl border p-5 ${ready ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`} aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Collection entry readiness</p>
          <h2 className="mt-1 text-xl font-semibold">{loading ? "Checking deployment…" : ready ? "Ready for three test plants" : "Collection entry remains blocked"}</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{summary}</p>
        </div>
        <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => void refresh()} disabled={loading}>{loading ? "Checking…" : "Check again"}</button>
      </div>
      {report && <div className="mt-4 grid gap-2 md:grid-cols-2">{report.gates.map((gate, index) => <div key={index} className="rounded-lg border bg-background/70 p-3"><div className="flex items-center justify-between gap-3"><strong className="text-sm">{publicGateName(gate, index)}</strong><span className={`text-xs font-semibold ${gate.passed ? "text-emerald-700" : "text-amber-700"}`}>{gate.passed ? "Verified" : "Blocked"}</span></div><p className="mt-1 text-xs text-muted-foreground">{publicGateSummary(gate)}</p></div>)}</div>}
      <div className="mt-4"><Link className="text-sm font-medium text-primary" to="/conservatory/readiness">View full readiness report</Link></div>
    </section>
  );
}

export function ConservatoryReadinessPage() {
  const { report, loading, error, refresh } = useConservatoryReadiness();
  const ready = report?.ready_for_collection_entry === true;
  const summary = error || (report ? (ready ? READY_SUMMARY : BLOCKED_SUMMARY) : "No verified report is available. Collection entry remains safely blocked.");
  return <div><h2 className="text-3xl font-semibold">Conservatory Readiness</h2><p className="mt-2 text-muted-foreground">Live verification status from the deployed Calyx backend. Unknown conditions fail closed.</p><div className={`mt-6 rounded-xl border p-6 ${ready ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`}><h3 className="text-xl font-semibold">{loading ? "Checking…" : ready ? "Ready for controlled testing" : "Not ready for real collection entry"}</h3><p className="mt-2 text-sm">{summary}</p><button type="button" className="mt-4 rounded-md border px-4 py-2" onClick={() => void refresh()} disabled={loading}>Refresh status</button></div>{report && <div className="mt-6 space-y-3">{report.gates.map((gate, index) => <article key={index} className="rounded-xl border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold capitalize">{publicGateName(gate, index)}</h3><span className={gate.passed ? "text-emerald-700" : "text-amber-700"}>{gate.passed ? "Verified" : "Blocked"}</span></div><p className="mt-2 text-sm text-muted-foreground">{publicGateSummary(gate)}</p></article>)}</div>}</div>;
}
