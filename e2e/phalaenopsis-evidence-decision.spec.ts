import { expect, test, type Page } from "@playwright/test";

/**
 * Brain #103 / frontend #551 mounted acceptance proof.
 *
 * This walks the real Research Station component tree in Chromium while
 * intercepting only the governed backend contracts with deterministic,
 * production-equivalent fixtures. No model/provider call is made. The goal is
 * to prove that the mounted product can carry one Phalaenopsis investigation
 * from persisted project -> governed plan/evidence -> synthesis/verification ->
 * immutable cited review export -> proposal-only Candidate Knowledge handoff.
 *
 * The fixtures deliberately include disagreement. The browser must preserve it,
 * while keeping publication and canonical/KG mutation impossible without human
 * authority.
 */

test.describe.configure({ mode: "serial" });

const PROJECT_ID = "brain-103-phalaenopsis";
const TAXON = "Phalaenopsis";
const QUESTION =
  "Which traits and environmental evidence best distinguish cool-growing from warm-growing Phalaenopsis species, and how strong is the evidence for a practical cultivation classification?";
const TURN_QUESTION = `Regarding ${TAXON}: ${QUESTION}`;
const CONVERSATION_ID = "conv-brain-103";
const FINGERPRINT = "a".repeat(64);

const ACCOUNT = {
  email: `brain-103-browser-${Date.now()}@continuum.test`,
  password: "a-throwaway-password-1",
};

const project = {
  project_id: PROJECT_ID,
  title: "Phalaenopsis cultivation evidence decision",
  description: "Brain #103 governed vertical slice",
  research_question: QUESTION,
  hypothesis: "Elevation, climate, and traits jointly distinguish practical cultivation groups.",
  status: "ACTIVE",
};

const mission = {
  mission_id: "mission-brain-103",
  project_id: PROJECT_ID,
  question: TURN_QUESTION,
  state: "REVIEW_REQUIRED",
  current_stage: "VERIFY",
  steps_executed: 9,
  plan: {
    question: TURN_QUESTION,
    domains: ["literature", "occurrence_elevation", "traits"],
    retrieval_queries: [
      "Phalaenopsis temperature cultivation physiology",
      "Phalaenopsis elevation occurrence climate",
      "Phalaenopsis leaf trait thermal adaptation",
    ],
    source_budget: 12,
    per_domain_source_budget: 4,
    claims_and_inferences_separated: true,
  },
  sources: [
    {
      result_id: "lit-1",
      title: "Temperature responses in Phalaenopsis cultivation",
      object_type: "literature",
      authorized_excerpt: "Temperature response differs across taxa.",
      citation: { revision_id: 12, source_anchor_ids: [101] },
    },
    { result_id: "occ-1", title: "Governed occurrence/elevation aggregate", object_type: "occurrence_elevation" },
    { result_id: "trait-1", title: "Governed trait evidence", object_type: "traits" },
  ],
  supporting_evidence: [
    {
      candidate_id: "candidate-cultivation-1",
      candidate_version: 1,
      subject: TAXON,
      predicate: "cultivation_classification",
      value: "cool_to_intermediate",
      source_revision_id: 12,
      source_anchor_ids: [101],
      provenance: {
        confidence: 0.78,
        domain: "cultivation",
        source_object_type: "literature_claim",
        source_object_id: 44,
        extraction_run_id: 7,
      },
    },
  ],
  contradicting_evidence: [
    {
      candidate_id: "candidate-conflict-1",
      subject: TAXON,
      predicate: "temperature_preference",
      value: "warm",
      source_revision_id: 13,
      provenance: { confidence: 0.51 },
    },
  ],
  missing_evidence: [],
  confidence: 0.78,
  conclusions: [
    {
      type: "provisional",
      text: "The governed evidence supports a cool-to-intermediate practical classification for part of Phalaenopsis, with material temperature conflict retained for review.",
      claim_ids: ["claim-cultivation"],
    },
  ],
  reasoning_ledger: { ledger_id: "ledger-brain-103", version: 1 },
  validation: { valid: true, blockers: [] },
  review_status: "HUMAN_REVIEW_REQUIRED",
  publication_eligibility: {
    eligible: false,
    automatic_publication: false,
    blockers: ["human_review_required"],
  },
  blockers: [],
  partial: false,
  created_at: "2026-09-13T10:00:00Z",
  updated_at: "2026-09-13T10:00:00Z",
};

const synthesisStructure = {
  composer_contract: "oc-conversational-synthesis-v1",
  generative: false,
  degraded_composition: false,
  resolved_subject: TAXON,
  taxonomy_snapshot_id: "world-plants:2.1.2026",
  claim_coverage: [
    {
      claim_id: "claim-cultivation",
      claim: "Some Phalaenopsis evidence supports a cool-to-intermediate practical cultivation classification.",
      coverage: "supported",
      source_families: ["literature", "occurrence_elevation", "traits"],
      supporting_count: 3,
      contradicting_count: 1,
    },
    {
      claim_id: "claim-temperature-conflict",
      claim: "Temperature preference is uniform across the genus.",
      coverage: "contested",
      source_families: ["literature", "occurrence_elevation"],
      supporting_count: 1,
      contradicting_count: 2,
    },
  ],
  integrated_across_source_families: true,
  cited_source_families: ["literature", "occurrence_elevation", "traits"],
  source_families: ["literature", "occurrence_elevation", "traits"],
  missing_evidence: [],
  canonical_retrieval_gap: false,
  evidence_class_readiness: {
    status: "ready",
    literature_present: true,
    literature_review_required: true,
    continuum_evidence_classes: ["occurrence_elevation", "traits"],
    continuum_evidence_class_count: 2,
    required_continuum_evidence_class_count: 2,
    missing_requirements: [],
  },
  external_literature_review_required: true,
  unresolved_conflict: true,
  mission_unavailable: false,
  governed_provenance: {
    mission_id: "mission-brain-103",
    evidence_packet_id: "packet-brain-103",
    confidence: 0.78,
    review_status: "HUMAN_REVIEW_REQUIRED",
  },
};

function json(route: Parameters<Page["route"]>[1] extends never ? never : any, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installGovernedFixtures(page: Page) {
  await page.route("**/api/research/projects?limit=*", (route) => json(route, { items: [project] }));
  await page.route(`**/api/research/projects/${PROJECT_ID}`, (route) => json(route, project));
  await page.route(`**/api/research/projects/${PROJECT_ID}/taxa`, (route) =>
    json(route, { items: [{ project_id: PROJECT_ID, taxon_id: TAXON, relationship: "SUBJECT" }] }),
  );
  await page.route(`**/api/research/projects/${PROJECT_ID}/documents`, (route) =>
    json(route, {
      items: [
        { project_id: PROJECT_ID, document_id: "lit-1", revision_id: "12", relationship: "SOURCE" },
        { project_id: PROJECT_ID, document_id: "lit-conflict-1", revision_id: "13", relationship: "CONTRADICTS" },
      ],
    }),
  );
  await page.route(`**/api/research/projects/${PROJECT_ID}/evidence`, (route) =>
    json(route, {
      items: [
        { project_id: PROJECT_ID, evidence_kind: "AGGREGATE", evidence_id: "occurrence-elevation-1", relationship: "SUPPORTS" },
        { project_id: PROJECT_ID, evidence_kind: "CANDIDATE", evidence_id: "trait-1", relationship: "SUPPORTS" },
      ],
    }),
  );
  await page.route(`**/api/research/projects/${PROJECT_ID}/notes`, (route) => json(route, { items: [] }));
  await page.route(`**/api/research/projects/${PROJECT_ID}/activity**`, (route) => json(route, { items: [] }));

  await page.route("**/api/calyx/speak/conversations", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return json(route, {
      conversation_id: CONVERSATION_ID,
      project_id: PROJECT_ID,
      title: project.title,
      created_at: "2026-09-13T10:00:00Z",
      updated_at: "2026-09-13T10:00:00Z",
      messages: [],
      persistence_mode: "memory",
    });
  });

  await page.route(`**/api/calyx/speak/conversations/${CONVERSATION_ID}/turns`, (route) =>
    json(route, {
      conversation_id: CONVERSATION_ID,
      operator_message: {
        message_id: "operator-1",
        conversation_id: CONVERSATION_ID,
        role: "operator",
        content: TURN_QUESTION,
        created_at: "2026-09-13T10:00:00Z",
      },
      calyx_message: {
        message_id: "calyx-1",
        conversation_id: CONVERSATION_ID,
        role: "calyx",
        content: "The evidence supports a provisional cool-to-intermediate classification with retained conflict.",
        created_at: "2026-09-13T10:00:01Z",
      },
      answer: "The evidence supports a provisional cool-to-intermediate classification with retained conflict.",
      provider: { name: "provider-free-fixture", model: "none", request_hash: "fixture" },
      research: {
        casual: false,
        mission,
        mission_error: null,
        retrieval: {},
        citations: [
          {
            title: "Temperature responses in Phalaenopsis cultivation",
            authors: "Continuum governed fixture",
            publication_date: "2026",
            journal: "Acceptance fixture",
            doi: "10.0000/oc.brain103.fixture",
            provider: "governed-literature",
            review_state: "REVIEW_REQUIRED",
            canonical_evidence: false,
          },
        ],
      },
      synthesis_structure: synthesisStructure,
      workspace_outputs: [],
      deliverables: {},
      persistence_mode: "memory",
      epistemic_policy: { human_review_required: true },
    }),
  );

  await page.route("**/synthesis/run-manifest", (route) =>
    json(route, {
      contract_version: "oc-run-evidence-manifest-v1",
      run_id: `run:${PROJECT_ID}:${CONVERSATION_ID}`,
      research_question: QUESTION,
      taxon_id: TAXON,
      taxonomy_snapshot_id: "world-plants:2.1.2026",
      run_fingerprint: FINGERPRINT,
      created_at_utc: "2026-09-13T10:00:02Z",
      verification_state: "ready_for_review",
      resolved_evidence_count: 1,
      missing_evidence_count: 0,
      knowledge_gap_count: 0,
      contradictions: ["claim-temperature-conflict"],
      review_decision: null,
      epistemic_state: "provisional",
      human_review_required: true,
      automatic_scientific_publication_allowed: false,
      canonical_knowledge_mutation_allowed: false,
      canonical_activation_requires_human_authority: true,
      immutable: true,
    }),
  );

  await page.route("**/synthesis/candidate-proposal", (route) =>
    json(route, {
      contract_version: "oc-candidate-knowledge-proposal-v1",
      proposal_id: "proposal-brain-103",
      run_id: `run:${PROJECT_ID}:${CONVERSATION_ID}`,
      run_fingerprint: FINGERPRINT,
      candidate_handoff_request: { review_only: true },
      review_required: true,
      owner_submission_required: true,
      candidate_persistence_performed: false,
      automatic_approval: false,
      automatic_scientific_publication: false,
      canonical_knowledge_mutation: false,
      knowledge_graph_mutation: false,
    }),
  );
}

async function signIn(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Create an account", exact: true }).click();
  await modal.getByPlaceholder("you@orchidcontinuum.org").fill(ACCOUNT.email);
  await modal.getByPlaceholder("••••••••").fill(ACCOUNT.password);
  await modal.getByRole("button", { name: /^create account$/i }).last().click();
  await expect(page.getByTestId("account-menu")).toBeVisible({ timeout: 20_000 });
}

test("Phalaenopsis evidence-to-review journey is mounted, inspectable, and review-only", async ({ page }) => {
  await installGovernedFixtures(page);
  await signIn(page);

  await page.goto(
    `/research?genus=${TAXON}&origin=homepage-featured-taxon&context_is_evidence=false&project=${PROJECT_ID}`,
    { waitUntil: "domcontentloaded" },
  );

  await expect(page.getByText("Your current investigation")).toBeVisible();
  await expect(page.getByText(QUESTION)).toBeVisible();
  await expect(page.getByText("lit-conflict-1")).toBeVisible();

  await page.getByRole("button", { name: "Synthesize this investigation" }).click();

  await expect(page.getByText("Governed research plan")).toBeVisible();
  await expect(page.getByText("literature", { exact: true })).toBeVisible();
  await expect(page.getByText("occurrence elevation", { exact: true })).toBeVisible();
  await expect(page.getByText("traits", { exact: true })).toBeVisible();
  await expect(page.getByText("Ready for review")).toBeVisible();
  await expect(page.getByText("2/2")).toBeVisible();

  await expect(
    page.getByRole("img", { name: "3 supporting and 1 contradicting evidence records" }),
  ).toBeVisible();
  await expect(page.getByText("The evidence behind this answer does not agree.")).toBeVisible();
  await expect(page.getByText("Calyx Verification Workbench")).toBeVisible();

  await page.getByRole("button", { name: "Build run manifest" }).click();
  await expect(page.getByText("Run manifest")).toBeVisible();
  await expect(page.getByText("Human review required")).toBeVisible();
  await expect(page.getByText("Immutable")).toBeVisible();
  await expect(page.getByText("Ready for human review")).toBeVisible();
  await expect(page.getByText(`${FINGERPRINT.slice(0, 12)}…`)).toBeVisible();
  await expect(page.getByText("Contradictions preserved")).toBeVisible();
  await expect(page.getByText("claim-temperature-conflict")).toBeVisible();
  await expect(page.getByText(/No automatic publication · No canonical mutation/)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export cited review packet" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^orchid-review-brain-103-phalaenopsis-[a-f0-9]{12}\.md$/);

  await page.getByRole("button", { name: "Prepare candidate proposal" }).click();
  const proposal = page.getByTestId("candidate-proposal-ready");
  await expect(proposal).toBeVisible();
  await expect(proposal).toContainText("Candidate proposal prepared · owner submission required");
  await expect(proposal).toContainText("proposal-brain-103");
  await expect(proposal).toContainText("No candidate persisted");
  await expect(proposal).toContainText("No automatic approval");
  await expect(proposal).toContainText("No scientific publication");
  await expect(proposal).toContainText("No canonical or Knowledge Graph mutation");
});
