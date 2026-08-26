// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AI_DATA_SCIENCE_MODULE_ID,
  saveAiDataScienceProgress,
  type ExecutedLab,
} from "@/lib/appliedAiDataScience";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ session: null, loading: false })),
  occurrences: vi.fn(async () => ({ data: { kind: "occurrence", features: [] }, error: null, unconfigured: false })),
  capability: vi.fn(async () => ({
    enabled: true,
    session_writes_enabled: false,
    persistence: "memory",
    publication_enabled: false,
    candidate_knowledge_writes_enabled: false,
    calyx_model_calls_enabled: false,
  })),
  moduleFetch: vi.fn(async () => {
    throw new Error("module contract unavailable in this test");
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@/lib/atlas", async () => {
  const actual = await vi.importActual<typeof import("@/lib/atlas")>("@/lib/atlas");
  return {
    ...actual,
    atlasApi: { ...actual.atlasApi, occurrences: mocks.occurrences },
  };
});

vi.mock("@/lib/universityApi", async () => {
  const actual = await vi.importActual<typeof import("@/lib/universityApi")>("@/lib/universityApi");
  return {
    ...actual,
    universityApi: { ...actual.universityApi, capability: mocks.capability },
  };
});

vi.mock("@/lib/appliedAiDataScience", async () => {
  const actual = await vi.importActual<typeof import("@/lib/appliedAiDataScience")>(
    "@/lib/appliedAiDataScience",
  );
  return {
    ...actual,
    appliedAiDataScienceApi: { ...actual.appliedAiDataScienceApi, module: mocks.moduleFetch },
  };
});

vi.mock("@/lib/calyxWorkspace", () => ({
  createCalyxConversation: vi.fn(),
  sendCalyxTurn: vi.fn(),
}));

const { default: AppliedAIDataScienceLab } = await import("./AppliedAIDataScienceLab");

const PROGRESS_STORAGE_KEY = "oc_ai_ds_lab_progress_v1";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function buildExecutedLabFixture(): ExecutedLab {
  return {
    program_id: "program-1",
    module_id: AI_DATA_SCIENCE_MODULE_ID,
    project_id: "project-1",
    lab_manifest_id: "manifest-1",
    lab_manifest_sha256: "c".repeat(64),
    result_table: { columns: {} },
    visualization_payload: {},
    quality_diagnostics: {
      row_count: 0,
      elevation: {
        complete: 0,
        missing: 0,
        missing_fraction: 0,
        measured_zero_count: 0,
        zero_is_not_used_for_missing: true,
      },
      year: { complete: 0, missing: 0, minimum: null, maximum: null },
      records_by_country: {},
      records_by_source: {},
      warnings: [],
      diagnostics_are_descriptive_not_biological_conclusions: true,
      sampling_effort_not_controlled: true,
    },
    assumptions: [],
    warnings: [],
    provenance: {},
    calyx_context: {
      is_evidence: false,
      generated_explanation_is_evidence: false,
      model_call_performed: false,
    },
    assessment: {
      graded_automatically: false,
      prompts: [{ id: "prompt-1", prompt: "What does the missingness suggest?", checks: [] }],
    },
    research_promotion_packet: {
      promotion_id: "promotion-1",
      promotion_sha256: "a".repeat(64),
      project_id: "project-1",
      handoff: "by_reference",
      dataset: { dataset_id: "dataset-1", rows_sha256: "b".repeat(64), schema_ref: null, provenance: {} },
      lab_manifest: { lab_manifest_id: "manifest-1", manifest_sha256: "c".repeat(64) },
      analysis_plan: { plan_id: "plan-1", method: "describe.v1", method_version: "1" },
      analysis_result: {
        analysis_id: "analysis-1",
        input_sha256: "d".repeat(64),
        result_sha256: "e".repeat(64),
        receipt_sha256: "f".repeat(64),
        diagnostic_id: "diagnostic-1",
        diagnostics_sha256: "1".repeat(64),
      },
      review_state: "unreviewed_educational_analysis",
      human_review_required: true,
      generated_explanation_is_evidence: false,
      scientific_publication_authorized: false,
      candidate_knowledge_promotion_authorized: false,
      knowledge_graph_mutation_authorized: false,
      taxonomy_mutation_authorized: false,
    },
    replay_proof: {
      verified: true,
      analysis_id: "analysis-1",
      input_sha256: "d".repeat(64),
      result_sha256: "e".repeat(64),
      receipt_sha256: "f".repeat(64),
      first_execution_created_analysis: true,
      second_execution_reused_analysis: false,
    },
    scientific_interpretation_generated: false,
    scientific_publication_authorized: false,
    candidate_knowledge_promotion_authorized: false,
    knowledge_graph_mutation_authorized: false,
    taxonomy_mutation_authorized: false,
  };
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

beforeEach(() => {
  window.localStorage.clear();
  mocks.useAuth.mockReturnValue({ session: null, loading: false });
  mocks.occurrences.mockClear();
  mocks.capability.mockClear();
  mocks.moduleFetch.mockClear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
});

async function flush(times = 3) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function renderLab() {
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AppliedAIDataScienceLab />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
}

describe("AppliedAIDataScienceLab assessment continuity", () => {
  it("resumes a prior lab session, including reflection responses, as if the page had reloaded", async () => {
    const executed = buildExecutedLabFixture();
    saveAiDataScienceProgress(
      {
        prepared: null,
        executed,
        assessment_responses: { "prompt-1": "Missing elevations cluster in one country." },
        calyx_answer: null,
      },
      "2026-08-20T00:00:00Z",
    );

    renderLab();
    await flush();

    expect(container.textContent).toContain("Resumed your prior lab session");
    const textarea = container.querySelector(
      'textarea[aria-label="Reflection 1 response"]',
    ) as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe("Missing elevations cluster in one country.");
  });

  it("fails closed to a fresh session instead of crashing when persisted state is corrupt", async () => {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, "{not valid json");

    expect(() => renderLab()).not.toThrow();
    await flush();

    expect(container.textContent).not.toContain("Resumed your prior lab session");
    expect(container.textContent).not.toContain("Interpret before you continue");
    expect(window.localStorage.getItem(PROGRESS_STORAGE_KEY)).toBeNull();
  });
});
