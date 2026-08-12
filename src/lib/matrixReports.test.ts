import { afterEach, describe, expect, it, vi } from "vitest";

import {
  finalizeMatrixReport,
  getMatrixPersistencePreflight,
  getMatrixPersistenceStatus,
  listMatrixReports,
} from "./matrixReports";

afterEach(() => vi.unstubAllGlobals());

describe("Matrix reproducible report client", () => {
  it("reads the backend persistence mode without inferring durability from report hashing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        mode: "file_ephemeral",
        durable: false,
        ready: true,
        durable_requested: false,
        warning: "File-backed Matrix sessions are not restart-durable on ephemeral hosts.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const status = await getMatrixPersistenceStatus();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/matrix-identification/sessions/persistence-status");
    expect(status.durable).toBe(false);
    expect(status.mode).toBe("file_ephemeral");
  });

  it("keeps activation readiness separate from durable activation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        database_url_configured: true,
        durable_requested: false,
        activated: false,
        connectivity: true,
        table_exists: true,
        migration_612_schema_ready: true,
        activation_ready: true,
        blockers: [],
        migration_applied_by_preflight: false,
        environment_changed_by_preflight: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const preflight = await getMatrixPersistencePreflight();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/matrix-identification/sessions/persistence-preflight");
    expect(preflight.activation_ready).toBe(true);
    expect(preflight.activated).toBe(false);
    expect(preflight.durable_requested).toBe(false);
    expect(preflight.migration_applied_by_preflight).toBe(false);
    expect(preflight.environment_changed_by_preflight).toBe(false);
  });

  it("preserves migration blockers from the backend preflight", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        database_url_configured: true,
        durable_requested: false,
        activated: false,
        connectivity: true,
        table_exists: true,
        migration_612_schema_ready: false,
        activation_ready: false,
        blockers: ["MATRIX_SESSION_REQUIRED_INDEXES_MISSING"],
        missing_indexes: ["idx_matrix_identification_sessions_owner_updated"],
        migration_applied_by_preflight: false,
        environment_changed_by_preflight: false,
      }),
    }));

    const preflight = await getMatrixPersistencePreflight();
    expect(preflight.activation_ready).toBe(false);
    expect(preflight.blockers).toEqual(["MATRIX_SESSION_REQUIRED_INDEXES_MISSING"]);
    expect(preflight.missing_indexes).toEqual(["idx_matrix_identification_sessions_owner_updated"]);
  });

  it("finalizes the current session revision through the governed report endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        created: true,
        report: {
          report_id: "digest",
          content_digest_sha256: "digest",
          finalized_at: "2026-08-11T00:00:00Z",
          core: {
            schema_version: "matrix-identification-report/v1",
            evaluator_version: "matrix-identification-evaluator/v1",
            session_id: "s1",
            session_revision: 2,
            registry: {},
            observations: [],
            ranking: { candidates: [] },
            governance: {
              artifact_type: "candidate_ranking_evidence_report",
              verified_taxonomic_identification: false,
              automatic_publication: false,
              canonical_taxonomy_mutation: false,
            },
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await finalizeMatrixReport("s1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/matrix-identification/sessions/s1/reports");
    expect(init.method).toBe("POST");
    expect(result.report.core.session_revision).toBe(2);
    expect(result.report.core.governance.verified_taxonomic_identification).toBe(false);
  });

  it("lists prior frozen revisions without inferring publication state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        session_id: "s1",
        reports: [
          {
            report_id: "abc",
            content_digest_sha256: "abc",
            finalized_at: "2026-08-11T00:00:00Z",
            session_revision: 1,
            leading_candidate: "Taxon alpha",
          },
        ],
      }),
    }));

    const reports = await listMatrixReports("s1");
    expect(reports).toHaveLength(1);
    expect(reports[0].session_revision).toBe(1);
    expect(reports[0].leading_candidate).toBe("Taxon alpha");
  });
});
