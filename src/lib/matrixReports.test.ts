import { afterEach, describe, expect, it, vi } from "vitest";

import { finalizeMatrixReport, listMatrixReports } from "./matrixReports";

afterEach(() => vi.unstubAllGlobals());

describe("Matrix reproducible report client", () => {
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
