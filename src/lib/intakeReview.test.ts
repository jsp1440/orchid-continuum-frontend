import { afterEach, describe, expect, it, vi } from "vitest";
import { createIntakeReviewClient, IntakeReviewApiError, moderationTargetLabel } from "./intakeReview";

const BASE = "https://orchid-calyx-backend.onrender.com";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const record = (id: string, created_at: string) => ({
  id, submitter_auth_subject: "member-a", taxon_name_verbatim: "Cattleya labiata", location_verbatim: "Serra do Mar, Brazil",
  observation_date: "2026-06-15", epistemic_label: "PROBABLE", moderation_state: "SUBMITTED", notes: null, evidence_media_ids: [], created_at,
});

afterEach(() => vi.unstubAllGlobals());

describe("createIntakeReviewClient", () => {
  it("lists pending ids publicly, then fetches each full record through the owner boundary, newest first", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("moderation_state=SUBMITTED")) {
        return Promise.resolve(jsonResponse({ items: [{ id: "a", moderation_state: "SUBMITTED", created_at: "2026-06-01T00:00:00Z" }, { id: "b", moderation_state: "SUBMITTED", created_at: "2026-06-02T00:00:00Z" }], total: 2 }));
      }
      if (url.endsWith("/api/community/observations/a")) return Promise.resolve(jsonResponse(record("a", "2026-06-01T00:00:00Z")));
      if (url.endsWith("/api/community/observations/b")) return Promise.resolve(jsonResponse(record("b", "2026-06-02T00:00:00Z")));
      return Promise.resolve(jsonResponse({ detail: "unexpected" }, 500));
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = await createIntakeReviewClient({ accessToken: "owner-jwt" }).listPending();
    expect(pending.map((item) => item.id)).toEqual(["b", "a"]);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/community/observations?moderation_state=SUBMITTED&limit=50`);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.credentials).toBe("include");
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer owner-jwt");
    }
  });

  it("maps a 401 on the moderation view to authentication_required", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) =>
      Promise.resolve(url.includes("moderation_state=") ? jsonResponse({ items: [{ id: "a", moderation_state: "SUBMITTED", created_at: "x" }], total: 1 }) : jsonResponse({ detail: "Owner session or API key is required" }, 401)),
    ));
    const error = await createIntakeReviewClient().listPending().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IntakeReviewApiError);
    expect((error as IntakeReviewApiError).kind).toBe("authentication_required");
  });

  it("records a moderation decision with the backend's field names and a trimmed reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "a", moderation_state: "APPROVED", created_at: "x" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createIntakeReviewClient().moderate("a", "APPROVED", "  Clear photo, plausible range.  ");
    expect(result.moderation_state).toBe("APPROVED");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/community/observations/a/moderate`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ observation_id: "a", new_state: "APPROVED", reason: "Clear photo, plausible range." });
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
  });

  it("maps 422 on a decision to validation_failed with the backend detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ detail: "'SUBMITTED' is not a valid moderation target." }, 422)));
    const error = await createIntakeReviewClient().moderate("a", "APPROVED").catch((e: unknown) => e);
    expect((error as IntakeReviewApiError).kind).toBe("validation_failed");
    expect((error as IntakeReviewApiError).message).toMatch(/not a valid moderation target/);
  });

  it("reads the contact inbox and the subscription summary from the owner routes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [], total: 0, offset: 0, limit: 50 }))
      .mockResolvedValueOnce(jsonResponse({ total: 2, by_state: { subscribed: 1, unsubscribed: 1 }, welcome_communications_awaiting_approval: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createIntakeReviewClient();
    await expect(client.listContactMessages()).resolves.toMatchObject({ total: 0 });
    await expect(client.subscriptionSummary()).resolves.toMatchObject({ total: 2 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/constituent/contact/messages?limit=50`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/api/constituent/subscriptions/summary`);
  });

  it("labels approval as release to the community feed, never as verification", () => {
    expect(moderationTargetLabel("APPROVED")).toBe("Approve for community feed");
    for (const target of ["APPROVED", "QUARANTINED", "SCREENED", "REJECTED"] as const) {
      expect(moderationTargetLabel(target)).not.toMatch(/verif|confirm|fact/i);
    }
  });
});
