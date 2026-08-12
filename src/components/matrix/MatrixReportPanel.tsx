import { useEffect, useState } from "react";
import { AlertTriangle, Database, FileCheck2, Fingerprint } from "lucide-react";

import {
  finalizeMatrixReport,
  getMatrixPersistenceStatus,
  listMatrixReports,
  type MatrixPersistenceStatus,
  type MatrixReportSummary,
} from "@/lib/matrixReports";

type Props = {
  sessionId: string;
  disabled?: boolean;
};

function shortDigest(value: string): string {
  return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-10)}` : value;
}

export default function MatrixReportPanel({ sessionId, disabled }: Props) {
  const [reports, setReports] = useState<MatrixReportSummary[]>([]);
  const [persistence, setPersistence] = useState<MatrixPersistenceStatus | null>(null);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState(
    "Freeze the current evidence state into a content-addressed report. This does not publish or verify an identification.",
  );

  async function refresh(): Promise<void> {
    const [reportItems, persistenceState] = await Promise.all([
      listMatrixReports(sessionId),
      getMatrixPersistenceStatus(),
    ]);
    setReports(reportItems);
    setPersistence(persistenceState);
  }

  useEffect(() => {
    void refresh().catch((error) => {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to verify Matrix persistence state.");
    });
  }, [sessionId]);

  async function finalize(): Promise<void> {
    setStatus("working");
    setMessage("Freezing the exact Matrix revision and evidence trail…");
    try {
      const result = await finalizeMatrixReport(sessionId);
      await refresh();
      setStatus("idle");
      setMessage(
        result.created
          ? `Evidence report created for revision ${result.report.core.session_revision}.`
          : "This exact evidence revision already has the same reproducible report.",
      );
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to finalize Matrix report.");
    }
  }

  const durableReady = persistence?.durable === true && persistence.ready === true;

  return (
    <section className="rounded-3xl border bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Evidence report</p>
          <h2 className="mt-2 text-2xl font-semibold">Freeze a reproducible identification record</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            The report records the exact session revision, registry checksum, observations, ranking, score, coverage, conflicts and provenance. Its digest changes if the evidence changes.
          </p>
        </div>
        <FileCheck2 className="h-7 w-7 text-emerald-700" />
      </div>

      {persistence && (
        <div className={`mt-5 rounded-2xl border p-4 ${durableReady ? "bg-background" : "bg-amber-50/50"}`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            {durableReady ? <Database className="h-4 w-4 text-emerald-700" /> : <AlertTriangle className="h-4 w-4" />}
            {durableReady ? "Durable Matrix persistence is active" : "This Matrix session is not durably persisted"}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Mode: {persistence.mode}. {durableReady
              ? "Session and report state are using the governed durable store."
              : persistence.warning || persistence.error || "The current persistence mode may not survive a host restart."}
          </p>
          {!durableReady && (
            <p className="mt-2 text-xs font-medium">
              A reproducible digest identifies the evidence content, but it does not make an ephemeral server record restart-durable.
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void finalize()}
          disabled={disabled || status === "working"}
          className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {status === "working" ? "Freezing report…" : "Freeze evidence report"}
        </button>
        <span className="text-xs text-muted-foreground" aria-live="polite">{message}</span>
      </div>

      {reports.length > 0 && (
        <div className="mt-6 space-y-3">
          {reports.slice().reverse().map((report) => (
            <article key={report.report_id} className="rounded-2xl border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Session revision {report.session_revision}</p>
                  <p className="mt-1 text-sm font-semibold">
                    {report.leading_candidate ? `${report.leading_candidate} · leading hypothesis` : "No leading candidate"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Registry {report.registry?.registry_id ?? "—"} · {report.registry?.version ?? "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
                  <Fingerprint className="h-3.5 w-3.5" /> {shortDigest(report.content_digest_sha256)}
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Candidate-ranking evidence only · not a verified taxonomic identification · not automatically published
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
