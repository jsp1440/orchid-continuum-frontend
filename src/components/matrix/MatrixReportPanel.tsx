import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, FileCheck2, Fingerprint, ShieldAlert } from "lucide-react";

import {
  finalizeMatrixReport,
  getMatrixPersistencePreflight,
  getMatrixPersistenceStatus,
  getMatrixRegistryPersistencePreflight,
  getMatrixRegistryPersistenceStatus,
  listMatrixReports,
  type MatrixPersistencePreflight,
  type MatrixPersistenceStatus,
  type MatrixRegistryPersistencePreflight,
  type MatrixRegistryPersistenceStatus,
  type MatrixReportSummary,
} from "@/lib/matrixReports";

type Props = {
  sessionId: string;
  disabled?: boolean;
};

type PersistenceTone = "durable" | "ready" | "blocked" | "ephemeral";

type ReadinessCopy = {
  title: string;
  detail: string;
  tone: PersistenceTone;
};

function shortDigest(value: string): string {
  return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-10)}` : value;
}

function sessionReadinessCopy(
  persistence: MatrixPersistenceStatus,
  preflight: MatrixPersistencePreflight | null,
): ReadinessCopy {
  if (persistence.durable === true && persistence.ready === true) {
    return {
      title: "Durable Matrix session persistence is active",
      detail: "Session and report state are using the governed durable PostgreSQL store.",
      tone: "durable",
    };
  }
  if (preflight?.activation_ready === true) {
    return {
      title: "Session persistence is activation-ready but not enabled",
      detail: "The target PostgreSQL schema satisfies migration 612, but durable mode remains a separate governed deployment action.",
      tone: "ready",
    };
  }
  if (preflight?.database_url_configured === true) {
    const blockers = preflight.blockers?.length
      ? `Blockers: ${preflight.blockers.join(", ")}.`
      : "The migration-612 contract is not currently satisfied.";
    return {
      title: "Session persistence preflight is blocked",
      detail: `${blockers} No activation is being attempted from this interface.`,
      tone: "blocked",
    };
  }
  return {
    title: "This Matrix session is not durably persisted",
    detail: persistence.warning || persistence.error || "The current persistence mode may not survive a host restart.",
    tone: "ephemeral",
  };
}

function registryReadinessCopy(
  persistence: MatrixRegistryPersistenceStatus,
  preflight: MatrixRegistryPersistencePreflight | null,
): ReadinessCopy {
  if (persistence.durable === true && persistence.ready === true) {
    return {
      title: "Immutable Matrix registry persistence is active",
      detail: "Registry versions are being served from the governed durable PostgreSQL store.",
      tone: "durable",
    };
  }
  if (preflight?.activation_ready === true) {
    return {
      title: "Registry persistence is activation-ready but not enabled",
      detail: "Migration 613, strict source-package integrity, and file→database checksum copy verification are all ready. Activation remains a separate governed deployment action.",
      tone: "ready",
    };
  }
  if (preflight?.database_url_configured === true) {
    const blockers = preflight.blockers?.length
      ? `Blockers: ${preflight.blockers.join(", ")}.`
      : "The durable registry contract is not currently satisfied.";
    return {
      title: "Immutable registry persistence preflight is blocked",
      detail: `${blockers} A durable session is not fully reproducible if its exact registry package can disappear after restart.`,
      tone: "blocked",
    };
  }
  return {
    title: "Immutable Matrix registry packages are not durably persisted",
    detail: persistence.warning || persistence.error || "The current registry store may not survive a host restart.",
    tone: "ephemeral",
  };
}

function PersistenceCard({
  readiness,
  mode,
  details,
}: {
  readiness: ReadinessCopy;
  mode: string;
  details: React.ReactNode;
}) {
  const durable = readiness.tone === "durable";
  const ready = readiness.tone === "ready";
  const blocked = readiness.tone === "blocked";
  return (
    <div className={`rounded-2xl border p-4 ${durable ? "bg-background" : ready ? "bg-emerald-50/40" : "bg-amber-50/50"}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        {durable ? (
          <Database className="h-4 w-4 text-emerald-700" />
        ) : ready ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
        ) : blocked ? (
          <ShieldAlert className="h-4 w-4" />
        ) : (
          <AlertTriangle className="h-4 w-4" />
        )}
        {readiness.title}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Mode: {mode}. {readiness.detail}</p>
      {details}
      {!durable && (
        <p className="mt-2 text-xs font-medium">
          Content hashes preserve identity and auditability, but they do not make an ephemeral server record restart-durable.
        </p>
      )}
      {ready && (
        <p className="mt-2 text-xs font-medium text-emerald-800">
          This screen is informational only. Migration, copy, and activation remain governed deployment actions outside the browser.
        </p>
      )}
    </div>
  );
}

export default function MatrixReportPanel({ sessionId, disabled }: Props) {
  const [reports, setReports] = useState<MatrixReportSummary[]>([]);
  const [persistence, setPersistence] = useState<MatrixPersistenceStatus | null>(null);
  const [preflight, setPreflight] = useState<MatrixPersistencePreflight | null>(null);
  const [registryPersistence, setRegistryPersistence] = useState<MatrixRegistryPersistenceStatus | null>(null);
  const [registryPreflight, setRegistryPreflight] = useState<MatrixRegistryPersistencePreflight | null>(null);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState(
    "Freeze the current evidence state into a content-addressed report. This does not publish or verify an identification.",
  );

  async function refresh(): Promise<void> {
    const [
      reportItems,
      persistenceState,
      preflightState,
      registryPersistenceState,
      registryPreflightState,
    ] = await Promise.all([
      listMatrixReports(sessionId),
      getMatrixPersistenceStatus(),
      getMatrixPersistencePreflight(),
      getMatrixRegistryPersistenceStatus(),
      getMatrixRegistryPersistencePreflight(),
    ]);
    setReports(reportItems);
    setPersistence(persistenceState);
    setPreflight(preflightState);
    setRegistryPersistence(registryPersistenceState);
    setRegistryPreflight(registryPreflightState);
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

  const sessionReadiness = persistence ? sessionReadinessCopy(persistence, preflight) : null;
  const registryReadiness = registryPersistence
    ? registryReadinessCopy(registryPersistence, registryPreflight)
    : null;
  const fullyDurable = sessionReadiness?.tone === "durable" && registryReadiness?.tone === "durable";

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

      {(sessionReadiness || registryReadiness) && (
        <div className="mt-5 space-y-3">
          {sessionReadiness && persistence && (
            <PersistenceCard
              readiness={sessionReadiness}
              mode={persistence.mode}
              details={preflight ? (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>Database URL: {preflight.database_url_configured ? "configured" : "not configured"}</span>
                  <span>Connectivity: {preflight.connectivity ? "confirmed" : "not confirmed"}</span>
                  <span>Migration 612 schema: {preflight.migration_612_schema_ready ? "ready" : "not ready"}</span>
                  <span>Activation flag: {preflight.durable_requested ? "requested" : "not requested"}</span>
                </div>
              ) : null}
            />
          )}

          {registryReadiness && registryPersistence && (
            <PersistenceCard
              readiness={registryReadiness}
              mode={registryPersistence.mode}
              details={registryPreflight ? (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>Migration 613 schema: {registryPreflight.migration_613_schema_ready ? "ready" : "not ready"}</span>
                  <span>Source inventory: {registryPreflight.source_inventory_ready ? "verified" : "not verified"}</span>
                  <span>Registry copy: {registryPreflight.data_copy_ready ? "checksum-complete" : "incomplete"}</span>
                  <span>Activation flag: {registryPreflight.durable_requested ? "requested" : "not requested"}</span>
                  {registryPreflight.file_registry_count != null && (
                    <span>File registries: {registryPreflight.file_registry_count}</span>
                  )}
                  {registryPreflight.database_registry_count != null && (
                    <span>Database registries: {registryPreflight.database_registry_count}</span>
                  )}
                </div>
              ) : null}
            />
          )}

          {!fullyDurable && (
            <p className="rounded-xl border bg-muted/30 px-4 py-3 text-xs leading-5 text-muted-foreground">
              Full restart durability requires both the identification session and the exact immutable registry package referenced by that session to be durable.
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
