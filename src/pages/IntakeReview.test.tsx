// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IntakeReviewClient, PendingObservation } from "@/lib/intakeReview";
import { IntakeReviewApiError } from "@/lib/intakeReview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ useAuth: vi.fn(() => ({ session: null, user: null, loading: false })) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: mocks.useAuth }));

const { default: IntakeReview } = await import("@/pages/IntakeReview");

const observation: PendingObservation = {
  id: "obs-1", submitter_auth_subject: "member-a", taxon_name_verbatim: "Cattleya labiata",
  location_verbatim: "Serra do Mar, Brazil", observation_date: "2026-06-15", epistemic_label: "PROBABLE",
  moderation_state: "SUBMITTED", notes: "Two plants in flower on a rocky outcrop.", evidence_media_ids: [], created_at: "2026-06-16T09:00:00Z",
};

function fakeClient(overrides: Partial<IntakeReviewClient> = {}): IntakeReviewClient & { moderate: ReturnType<typeof vi.fn> } {
  return {
    listPending: vi.fn().mockResolvedValue([observation]),
    moderate: vi.fn().mockResolvedValue({ id: "obs-1", moderation_state: "APPROVED" }),
    listContactMessages: vi.fn().mockResolvedValue({
      items: [{ reference_id: "cm-1", category: "bug", name: "A. Grower", normalized_email: "grower@example.com", subject: "Atlas blank on iPad", body: "The map panel is blank.", source: "orchid-continuum-contact-page", received_at: "2026-06-16T10:00:00Z", state: "received", review: "human_review_required", agent_exposure: "never_forwarded_to_agents", content_trust: "untrusted_plain_text" }],
      total: 1,
    }),
    subscriptionSummary: vi.fn().mockResolvedValue({ total: 2, by_state: { subscribed: 1, unsubscribed: 1 }, welcome_communications_awaiting_approval: 2 }),
    ...overrides,
  } as IntakeReviewClient & { moderate: ReturnType<typeof vi.fn> };
}

let container: HTMLDivElement;
let root: Root;

async function render(client: IntakeReviewClient) {
  await act(async () => {
    root.render(createElement(MemoryRouter, null, createElement(IntakeReview, { client })));
  });
  await act(async () => { await Promise.resolve(); });
}

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("IntakeReview", () => {
  it("shows each pending report in full, flags the verbatim locality as moderation-only, and lists the inbox and counts", async () => {
    await render(fakeClient());
    const item = byTestId("intake-pending-item-obs-1");
    expect(item?.textContent).toContain("Cattleya labiata");
    expect(item?.textContent).toContain("SUBMITTED · PROBABLE self-assessed");
    expect(byTestId("intake-pending-locality-obs-1")?.textContent).toContain("Verbatim locality (protected · moderation view only): Serra do Mar, Brazil");
    expect(byTestId("intake-contact-item-cm-1")?.textContent).toContain("Atlas blank on iPad");
    expect(byTestId("intake-subscription-summary")?.textContent).toContain("Welcome emails held for approval2");
    expect(byTestId("intake-subscription-summary")?.textContent).not.toContain("@");
    expect(byTestId("intake-review-epistemic-notice")?.textContent).toMatch(/does not make it a scientific fact/);
  });

  it("records an approval with the typed reason and states that the feed shows an observer report, not a finding", async () => {
    const client = fakeClient();
    await render(client);
    const reason = byTestId("moderate-reason-obs-1") as HTMLTextAreaElement;
    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    await act(async () => {
      nativeSet?.call(reason, "Plausible range, clear photograph.");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { byTestId("moderate-obs-1-APPROVED")?.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(client.moderate).toHaveBeenCalledWith("obs-1", "APPROVED", "Plausible range, clear photograph.");
    expect(byTestId("intake-pending-item-obs-1")).toBeNull();
    expect(byTestId("intake-review-decision")?.textContent).toMatch(/observer report/);
    expect(byTestId("intake-review-decision")?.textContent).toMatch(/not as a scientific finding/);
    expect(byTestId("intake-review-decision")?.textContent).not.toMatch(/verified/);
    expect(byTestId("intake-pending-empty")?.textContent).toContain("No submissions are waiting");
  });

  it("offers every moderation target but never a verification action", async () => {
    await render(fakeClient());
    const labels = Array.from(container.querySelectorAll<HTMLButtonElement>("[data-testid^='moderate-obs-1-']")).map((button) => button.textContent?.trim());
    expect(labels).toEqual(["Mark screened", "Quarantine", "Approve for community feed", "Reject"]);
  });

  it("keeps screened and quarantined reports in the review queue", async () => {
    const client = fakeClient({
      moderate: vi.fn().mockResolvedValue({ id: "obs-1", moderation_state: "SCREENED" }),
    });
    await render(client);
    await act(async () => { byTestId("moderate-obs-1-SCREENED")?.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(byTestId("intake-pending-item-obs-1")?.textContent).toContain("SCREENED · PROBABLE self-assessed");
    expect(byTestId("intake-review-decision")?.textContent).toMatch(/recorded as screened/);
    expect(byTestId("intake-pending-empty")).toBeNull();
  });

  it("shows the owner-session state, changing nothing, when the boundary refuses", async () => {
    await render(fakeClient({ listPending: vi.fn().mockRejectedValue(new IntakeReviewApiError("authentication_required", "Owner session or API key is required", 401)) }));
    expect(byTestId("intake-review-auth-required")?.textContent).toContain("Owner session required");
    expect(byTestId("intake-pending-list")).toBeNull();
  });

  it("surfaces a rejected decision as an error and keeps the report pending", async () => {
    const client = fakeClient({ moderate: vi.fn().mockRejectedValue(new IntakeReviewApiError("validation_failed", "'SUBMITTED' is not a valid moderation target.", 422)) });
    await render(client);
    await act(async () => { byTestId("moderate-obs-1-REJECTED")?.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(byTestId("intake-review-error")?.textContent).toMatch(/not a valid moderation target/);
    expect(byTestId("intake-pending-item-obs-1")).not.toBeNull();
  });
});
