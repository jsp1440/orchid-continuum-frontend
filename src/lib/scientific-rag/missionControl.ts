/**
 * Mission Control observability for the scientific RAG slice.
 *
 * Every metric here is DERIVED from durable ledger records — never a
 * hand-entered completion percentage. If an event did not happen, its counter
 * is zero. This is the honest-status contract the directive requires.
 */

import type { EventLedger } from "./ledger";
import type { DomainEventType } from "./events";

export type ScientificRagMetrics = {
  sourcesDiscovered: number;
  documentsParsed: number;
  parseFailures: number;
  claimsExtracted: number;
  claimsQuarantined: number;
  taxaResolved: number;
  taxaAmbiguous: number;
  embeddingsCreated: number;
  embeddingsReused: number;
  embeddingsFailed: number;
  graphUpdatesCompleted: number;
  graphUpdatesFailed: number;
  evidenceVerified: number;
  evidenceRejected: number;
  answersVerified: number;
  answersBlocked: number;
  pendingEvents: number;
  retryingEvents: number;
  deadLetterEvents: number;
  quarantinedEvents: number;
  oldestPendingAgeMs: number | null;
  runs: RunSummary[];
};

export type RunSummary = {
  correlationId: string;
  eventCount: number;
  firstEventAt: string;
  lastEventAt: string;
  stageDurationsMs: Record<string, number>;
  terminalVerdict: "verified" | "blocked" | "in_progress" | "none";
};

function count(ledger: EventLedger, type: DomainEventType): number {
  return ledger.eventsByType(type).length;
}

export function computeMetrics(ledger: EventLedger, now: string): ScientificRagMetrics {
  const nowMs = new Date(now).getTime();
  const pending = ledger.eventsByStatus("pending");
  const oldestPending = pending
    .map((e) => new Date(e.createdAt).getTime())
    .sort((a, b) => a - b)[0];

  const correlationIds = [...new Set(ledger.events().map((e) => e.correlationId))];
  const runs: RunSummary[] = correlationIds.map((cid) => summarizeRun(ledger, cid));

  return {
    sourcesDiscovered: count(ledger, "source.discovered") + count(ledger, "source.downloaded"),
    documentsParsed: count(ledger, "document.parsed"),
    parseFailures: count(ledger, "document.parse_failed"),
    claimsExtracted: count(ledger, "claim.extracted"),
    claimsQuarantined: count(ledger, "claim.quarantined"),
    taxaResolved: count(ledger, "taxon.resolved"),
    taxaAmbiguous: count(ledger, "taxon.ambiguous"),
    embeddingsCreated: count(ledger, "embedding.created"),
    embeddingsReused: count(ledger, "embedding.reused"),
    embeddingsFailed: count(ledger, "embedding.failed"),
    graphUpdatesCompleted: count(ledger, "graph.updated"),
    graphUpdatesFailed: count(ledger, "graph.update_failed"),
    evidenceVerified: count(ledger, "evidence.verified"),
    evidenceRejected: count(ledger, "evidence.rejected"),
    answersVerified: count(ledger, "answer.verified"),
    answersBlocked: count(ledger, "answer.blocked"),
    pendingEvents: pending.length,
    retryingEvents: ledger.eventsByStatus("retrying").length,
    deadLetterEvents: ledger.eventsByStatus("dead_letter").length,
    quarantinedEvents: ledger.eventsByStatus("quarantined").length,
    oldestPendingAgeMs: oldestPending !== undefined ? nowMs - oldestPending : null,
    runs,
  };
}

function summarizeRun(ledger: EventLedger, correlationId: string): RunSummary {
  const events = ledger
    .eventsForRun(correlationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const first = events[0];
  const last = events[events.length - 1];

  // Stage durations from the first event of each stage group.
  const stageOf = (t: DomainEventType): string => t.split(".")[0];
  const stageDurationsMs: Record<string, number> = {};
  const stageFirst = new Map<string, number>();
  for (const e of events) {
    const stage = stageOf(e.type);
    const ts = new Date(e.createdAt).getTime();
    if (!stageFirst.has(stage)) stageFirst.set(stage, ts);
  }
  const base = first ? new Date(first.createdAt).getTime() : 0;
  for (const [stage, ts] of stageFirst) stageDurationsMs[stage] = ts - base;

  let terminalVerdict: RunSummary["terminalVerdict"] = "none";
  if (events.some((e) => e.type === "answer.verified")) terminalVerdict = "verified";
  else if (events.some((e) => e.type === "answer.blocked")) terminalVerdict = "blocked";
  else if (events.length > 0) terminalVerdict = "in_progress";

  return {
    correlationId,
    eventCount: events.length,
    firstEventAt: first?.createdAt ?? "",
    lastEventAt: last?.createdAt ?? "",
    stageDurationsMs,
    terminalVerdict,
  };
}
