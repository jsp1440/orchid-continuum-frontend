/**
 * Publication ingestion + change detection.
 *
 * Establishes a canonical source record, computes a stable content hash over
 * the parsed document, deduplicates against prior versions, and decides whether
 * downstream parsing/extraction should run. An unchanged publication is a
 * provable no-op; a changed one bumps the version and reprocesses. Failures
 * classify without losing the source record.
 */

import { contentHash } from "./hashing";
import type { PublicationFixture, FixturePassage } from "./fixtures/phalaenopsisPublication";
import type { SensitivityClassification } from "./events";

export type SourceRecord = {
  sourceRecordId: string;
  title: string;
  authors: string[];
  year: number;
  doi: string;
  license: string;
  accessConstraint: "open" | "restricted" | "paywalled";
  contentHash: string;
  version: number;
  discoveredAt: string;
};

export type ParsedPassage = FixturePassage & {
  documentId: string;
  passageContentHash: string;
  sensitivity: SensitivityClassification;
};

export type ParsedDocument = {
  documentId: string;
  sourceRecordId: string;
  contentHash: string;
  passages: ParsedPassage[];
};

export type IngestionOutcome =
  | { decision: "new"; record: SourceRecord; document: ParsedDocument }
  | { decision: "changed"; record: SourceRecord; document: ParsedDocument; previousVersion: number }
  | { decision: "unchanged"; record: SourceRecord }
  | { decision: "parse_failed"; sourceRecordId: string; reason: string };

/** Compute the document content hash from the ordered passage texts. */
export function documentContentHash(pub: PublicationFixture): string {
  const joined = pub.passages
    .map((p) => `${p.section}|${p.page}|${p.paragraph}|${p.text.trim()}`)
    .join("\n---\n");
  return contentHash(joined);
}

function classifyPassage(p: FixturePassage): SensitivityClassification {
  return p.sensitive ? "protected_locality" : "public";
}

/**
 * In-memory registry of known source records, keyed by sourceRecordId. Stands
 * in for the source table; the interface is intentionally minimal.
 */
export class SourceRegistry {
  private records = new Map<string, SourceRecord>();

  get(id: string): SourceRecord | undefined {
    return this.records.get(id);
  }
  put(record: SourceRecord): void {
    this.records.set(record.sourceRecordId, record);
  }
  all(): SourceRecord[] {
    return [...this.records.values()];
  }
}

function parse(pub: PublicationFixture, hash: string, version: number): ParsedDocument {
  const documentId = `${pub.sourceRecordId}#v${version}`;
  const passages: ParsedPassage[] = pub.passages.map((p) => ({
    ...p,
    documentId,
    passageContentHash: contentHash(p.text),
    sensitivity: classifyPassage(p),
  }));
  return { documentId, sourceRecordId: pub.sourceRecordId, contentHash: hash, passages };
}

/**
 * Ingest a publication. Deterministic: the same input against the same registry
 * state always yields the same decision. `now` is injected so timestamps are
 * reproducible in tests.
 */
export function ingestPublication(
  pub: PublicationFixture,
  registry: SourceRegistry,
  now: string,
): IngestionOutcome {
  // A publication with no passages cannot be parsed — classify, keep the id.
  if (!pub.passages || pub.passages.length === 0) {
    return { decision: "parse_failed", sourceRecordId: pub.sourceRecordId, reason: "no parseable content" };
  }

  const hash = documentContentHash(pub);
  const existing = registry.get(pub.sourceRecordId);

  if (existing && existing.contentHash === hash) {
    // Unchanged — no reprocessing.
    return { decision: "unchanged", record: existing };
  }

  const version = existing ? existing.version + 1 : 1;
  const record: SourceRecord = {
    sourceRecordId: pub.sourceRecordId,
    title: pub.title,
    authors: pub.authors,
    year: pub.year,
    doi: pub.doi,
    license: pub.license,
    accessConstraint: pub.accessConstraint,
    contentHash: hash,
    version,
    discoveredAt: existing ? existing.discoveredAt : now,
  };
  registry.put(record);
  const document = parse(pub, hash, version);

  if (existing) {
    return { decision: "changed", record, document, previousVersion: existing.version };
  }
  return { decision: "new", record, document };
}
