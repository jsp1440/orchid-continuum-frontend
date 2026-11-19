// @vitest-environment jsdom
// jsdom: a member session (and so a member token) only exists in a browser;
// memberReadAuth returns no token when there is no window.
/**
 * J4 (Release 1): a refused or failed Matrix request is said in plain words.
 *
 * Owner decision (R1 J4, backend #1647): Matrix identification is available
 * to signed-in members; sessions are private to their creator; every other
 * Matrix route stays owner-only. Bodies marked CAPTURED come from
 * src/lib/__fixtures__/matrixIdentification.memberBackend.json (the real
 * backend running locally); the rest are SYNTHETIC error shapes, labelled
 * where used.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const owner = vi.hoisted(() => ({ session: false }));
const identity = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: identity.token ? { access_token: identity.token } : null }, error: null }),
    },
  },
}));
vi.mock("@/lib/backendConfig", async () => {
  const actual = await vi.importActual<typeof import("@/lib/backendConfig")>("@/lib/backendConfig");
  return { ...actual, hasOwnerBearerSession: () => owner.session };
});

import member from "@/lib/__fixtures__/matrixIdentification.memberBackend.json";
import {
  addSessionObservation,
  createIdentificationSession,
  evaluateIdentificationSession,
  getRegistryVersion,
  listMatrixRegistries,
  listVisionSuggestions,
  MatrixApiError,
  matrixAccessState,
  MATRIX_MEMBER_SESSION_UNVERIFIED_MESSAGE,
  MATRIX_OWNER_ACCESS_MESSAGE,
  MATRIX_OWNER_SESSION_UNVERIFIED_MESSAGE,
  MATRIX_SESSION_NOT_FOUND_MESSAGE,
  MATRIX_SIGN_IN_MESSAGE,
  MATRIX_UNAVAILABLE_MESSAGE,
} from "./matrixIdentification";
import { getMatrixPersistenceStatus, listMatrixReports } from "./matrixReports";

/** CAPTURED: the real backend's anonymous refusal on a member Matrix route. */
const ANON_BODY = member.anon_registry_list.body;
const SESSION = member.create.body.session_id;

function respond(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })));
}

async function rejection(promise: Promise<unknown>): Promise<MatrixApiError> {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(MatrixApiError);
  return error as MatrixApiError;
}

afterEach(() => {
  vi.unstubAllGlobals();
  owner.session = false;
  identity.token = null;
});

describe("matrixAccessState", () => {
  it("treats 403, and 401 on an owner-only route without an owner session, as owner access required", () => {
    expect(matrixAccessState(403, false)).toBe("owner_access_required");
    expect(matrixAccessState(403, true)).toBe("owner_access_required");
    expect(matrixAccessState(401, false)).toBe("owner_access_required");
    expect(matrixAccessState(401, false, { memberRoute: false })).toBe("owner_access_required");
    expect(matrixAccessState(403, false, { memberRoute: true, code: "OWNER_ACCESS_REQUIRED" })).toBe("owner_access_required");
  });

  it("on a member route, a 401 asks the visitor to sign in, or to sign in again if a member session was refused", () => {
    expect(matrixAccessState(401, false, { memberRoute: true })).toBe("sign_in_required");
    expect(matrixAccessState(401, false, { memberRoute: true, memberTokenSent: true })).toBe("member_session_unverified");
    expect(matrixAccessState(401, false, { memberRoute: true, code: "INVALID_MEMBER_TOKEN" })).toBe("member_session_unverified");
    expect(matrixAccessState(401, true, { memberRoute: true })).toBe("owner_session_unverified");
  });

  it("keeps the member-auth 503 codes apart from an outage", () => {
    expect(matrixAccessState(503, false, { code: "MEMBER_AUTH_UNAVAILABLE" })).toBe("member_auth_unavailable");
    expect(matrixAccessState(503, false, { code: "MEMBER_AUTH_NOT_CONFIGURED" })).toBe("member_access_unconfigured");
    expect(matrixAccessState(503, false, { code: "MATRIX_SESSION_PERSISTENCE_UNAVAILABLE" })).toBe("unavailable");
  });

  it("treats 401 while an owner session is held as an unverified owner session", () => {
    expect(matrixAccessState(401, true)).toBe("owner_session_unverified");
  });

  it("treats 5xx and no response as unavailable, and leaves other statuses alone", () => {
    expect(matrixAccessState(500, false)).toBe("unavailable");
    expect(matrixAccessState(503, false)).toBe("unavailable");
    expect(matrixAccessState(null, false)).toBe("unavailable");
    expect(matrixAccessState(0, false)).toBe("unavailable");
    expect(matrixAccessState(404, false)).toBeNull();
    expect(matrixAccessState(422, false)).toBeNull();
  });
});

describe("Matrix requests never surface the raw refusal", () => {
  it("an anonymous visitor refused with 401 on a member route is asked to sign in, not told Matrix is owner-only", async () => {
    respond(member.anon_registry_list.status, ANON_BODY);
    const error = await rejection(listMatrixRegistries());
    expect(error.message).toBe(MATRIX_SIGN_IN_MESSAGE);
    expect(error.access).toBe("sign_in_required");
    expect(error.status).toBe(401);
    expect(error.message).not.toMatch(/owner|Matrix API|401|API key/i);
  });

  it("a member whose token is refused with 401 is asked to sign in again", async () => {
    identity.token = "synthetic-member-token";
    // SYNTHETIC body shape for an expired member token (backend code INVALID_MEMBER_TOKEN).
    respond(401, { detail: { code: "INVALID_MEMBER_TOKEN", message: "synthetic" } });
    const error = await rejection(listMatrixRegistries());
    expect(error.message).toBe(MATRIX_MEMBER_SESSION_UNVERIFIED_MESSAGE);
    expect(error.access).toBe("member_session_unverified");
  });

  it("a signed-in member's requests carry the member token on member routes only", async () => {
    identity.token = "synthetic-member-token";
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(member.owner_only_reports.body), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await listMatrixRegistries().catch(() => undefined);
    await getRegistryVersion("r1-synthetic-member-matrix", "1").catch(() => undefined);
    await createIdentificationSession({ registry_id: "r1-synthetic-member-matrix", version: "1" }).catch(() => undefined);
    await evaluateIdentificationSession(SESSION).catch(() => undefined);
    await listVisionSuggestions(SESSION).catch(() => undefined);
    await listMatrixReports(SESSION).catch(() => undefined);
    await getMatrixPersistenceStatus().catch(() => undefined);
    const sent = fetchMock.mock.calls.map(([url, init]) => [
      `${(init as RequestInit | undefined)?.method ?? "GET"} ${new URL(String(url)).pathname}`,
      new Headers((init as RequestInit | undefined)?.headers).get("Authorization"),
    ]);
    expect(sent).toEqual([
      ["GET /api/matrix-identification/registry", "Bearer synthetic-member-token"],
      ["GET /api/matrix-identification/registry/r1-synthetic-member-matrix/1", "Bearer synthetic-member-token"],
      ["POST /api/matrix-identification/sessions", "Bearer synthetic-member-token"],
      [`POST /api/matrix-identification/sessions/${SESSION}/evaluate`, "Bearer synthetic-member-token"],
      // Owner-only for members: no member token, whatever the client.
      [`GET /api/matrix-identification/sessions/${SESSION}/vision/suggestions`, null],
      [`GET /api/matrix-identification/sessions/${SESSION}/reports`, null],
      ["GET /api/matrix-identification/sessions/persistence-status", null],
    ]);
  });

  it("an owner-only Matrix route refused for a member says owner access, not sign in", async () => {
    respond(member.owner_only_vision_suggestions.status, member.owner_only_vision_suggestions.body);
    const vision = await rejection(listVisionSuggestions(SESSION));
    expect(vision.access).toBe("owner_access_required");
    expect(vision.message).not.toMatch(/sign in/i);
    respond(401, ANON_BODY);
    expect((await rejection(listVisionSuggestions(SESSION))).access).toBe("owner_access_required");
    respond(member.owner_only_reports.status, member.owner_only_reports.body);
    const reports = await rejection(listMatrixReports(SESSION));
    expect(reports.message).toBe("This view is limited to owner access.");
    expect(reports.access).toBe("owner_access_required");
    respond(member.owner_only_session_persistence.status, member.owner_only_session_persistence.body);
    expect((await rejection(getMatrixPersistenceStatus())).message).toBe("This view is limited to owner access.");
  });

  it("another member's session is not found, said in plain words", async () => {
    identity.token = "synthetic-member-b-token";
    respond(member.other_member_get.status, member.other_member_get.body);
    const error = await rejection(evaluateIdentificationSession(SESSION));
    expect(error.status).toBe(404);
    expect(error.access).toBeNull();
    expect(error.message).toBe(MATRIX_SESSION_NOT_FOUND_MESSAGE);
    expect(error.message).not.toContain(SESSION);
  });

  it("member verification being unavailable is its own retryable state (CAPTURED 503)", async () => {
    identity.token = "synthetic-member-token";
    respond(member.identity_down_registry_list.status, member.identity_down_registry_list.body);
    const error = await rejection(listMatrixRegistries());
    expect(error.access).toBe("member_auth_unavailable");
    expect(error.message).toBe("Member verification is temporarily unavailable — try again.");
    expect(error.message).not.toMatch(/MEMBER_AUTH|503/);
  });

  it("never submits the withheld marker as a character or a value", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const [character, value] of [["withheld", "white"], ["flower_color", "withheld"], ["flower_color", " Withheld "], ["flower_color", ["white", "withheld"]]] as const) {
      await expect(addSessionObservation(SESSION, character, value, "certain")).rejects.toThrow(/withheld/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a 403 is owner access required as well", async () => {
    respond(403, { detail: "Forbidden" });
    const error = await rejection(createIdentificationSession({ registry_id: "r", version: "1" }));
    expect(error.message).toBe(MATRIX_OWNER_ACCESS_MESSAGE);
    expect(error.access).toBe("owner_access_required");
  });

  it("an owner whose session is refused is asked to sign in again as the owner", async () => {
    owner.session = true;
    identity.token = "synthetic-member-token";
    respond(401, { detail: "Owner session expired" });
    const error = await rejection(listMatrixRegistries());
    expect(error.message).toBe(MATRIX_OWNER_SESSION_UNVERIFIED_MESSAGE);
    expect(error.access).toBe("owner_session_unverified");
  });

  it("a 5xx is unavailable with a retry, without the raw body", async () => {
    respond(503, { detail: { code: "MATRIX_SESSION_PERSISTENCE_UNAVAILABLE", message: "MATRIX_SESSION_DATABASE_URL_REQUIRED" } });
    const error = await rejection(createIdentificationSession({ registry_id: "r", version: "1" }));
    expect(error.message).toBe(MATRIX_UNAVAILABLE_MESSAGE);
    expect(error.access).toBe("unavailable");
    expect(error.message).not.toMatch(/MATRIX_SESSION|503/);
  });

  it("an unreachable service is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const error = await rejection(listMatrixRegistries());
    expect(error.message).toBe(MATRIX_UNAVAILABLE_MESSAGE);
    expect(error.access).toBe("unavailable");
    expect(error.status).toBeNull();
  });

  it("keeps the specific message for statuses that are not access or outage states", async () => {
    respond(422, { detail: "value out of range" });
    const error = await rejection(listMatrixRegistries());
    expect(error.access).toBeNull();
    expect(error.message).toBe('Matrix API 422: "value out of range"');
  });
});
