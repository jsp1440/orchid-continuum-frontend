import { afterEach, describe, expect, it, vi } from "vitest";

import {
  finalizeMatrixReport,
  getMatrixPersistencePreflight,
  getMatrixPersistenceStatus,
  getMatrixRegistryPersistencePreflight,
  getMatrixRegistryPersistenceStatus,
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

  it("reads immutable registry persistence independently from session persistence", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        mode: "file_ephemeral",
        durable: false,
        ready: true,
        durable_requested: false,
        warning: "File-backed Matrix registry versions are not restart-durable on ephemeral hosts.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const status = await getMatrixRegistryPersistenceStatus();

    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/matrix-identification/registry/persistence-status");
    expect(status.durable).toBe(false);
    expect(status.mode).toBe("file_ephemeral");
  });

  it("requires registry schema, strict source inventory, and checksum-complete copy before activation readiness", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        schema_version: "matrix-identification-registry-persistence-preflight/v2",
        database_url_configured: true,
        durable_requested: false,
        activated: false,
        connectivity: true,
        table_exists: true,
        migration_613_schema_ready: true,
        source_inventory_ready: true,
        data_copy_ready: true,
        activation_ready: true,
        blockers: [],
        file_registry_count: 3,
        database_registry_count: 3,
        migration_applied_by_preflight: false,
        data_copied_by_preflight: false,
        environment_changed_by_preflight: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const preflight = await getMatrixRegistryPersistencePreflight();

    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/matrix-identification/registry/persistence-preflight");
    expect(preflight.activation_ready).toBe(true);
    expect(preflight.activated).toBe(false);
    expect(preflight.migration_613_schema_ready).toBe(true);
    expect(preflight.source_inventory_ready).toBe(true);
    expect(preflight.data_copy_ready).toBe(true);
    expect(preflight.data_copied_by_preflight).toBe(false);
  });

  it("preserves registry source-integrity blockers rather than treating them as copy readiness", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        database_url_configured: true,
        durable_requested: false,
        activated: false,
        migration_613_schema_ready: true,
        source_inventory_ready: false,
        data_copy_ready: false,
        activation_ready: false,
        blockers: ["MATRIX_REGISTRY_SOURCE_CHECKSUM_INVALID"],
        source_inventory: {
          physical_package_count: 3,
          valid_package_count: 2,
          inventory_complete: false,
          blockers: [{ code: "MATRIX_REGISTRY_SOURCE_CHECKSUM_INVALID", path: "/tmp/registry/a/1.json" }],
        },
        migration_applied_by_preflight: false,
        data_copied_by_preflight: false,
        environment_changed_by_preflight: false,
      }),
    }));

    const preflight = await getMatrixRegistryPersistencePreflight();

    expect(preflight.activation_ready).toBe(false);
    expect(preflight.source_inventory_ready).toBe(false);
    expect(preflight.blockers).toEqual(["MATRIX_REGISTRY_SOURCE_CHECKSUM_INVALID"]);
    expect(preflight.source_inventory?.valid_package_count).toBe(2);
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
