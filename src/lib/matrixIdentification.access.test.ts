/**
 * J4 (Release 1): a refused or failed Matrix request is said in plain words.
 *
 * Matrix identification is owner-only on the backend today. The refusal body
 * used below is the real backend's text (app/security.py
 * verify_owner_or_api_key: 401 "Owner session or API key is required"); the
 * 403 and 503 bodies are SYNTHETIC error shapes. Nothing here changes who may
 * use Matrix — it only pins what the visitor is told.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const owner = vi.hoisted(() => ({ session: false }));
vi.mock("@/lib/backendConfig", async () => {
  const actual = await vi.importActual<typeof import("@/lib/backendConfig")>("@/lib/backendConfig");
  return { ...actual, hasOwnerBearerSession: () => owner.session };
});
vi.mock("@/lib/memberReadAuth", () => ({
  withMatrixMemberAuth: async (_url: string, init: RequestInit) => init,
}));

import {
  createIdentificationSession,
  listMatrixRegistries,
  MatrixApiError,
  matrixAccessState,
  MATRIX_MEMBER_SESSION_REQUIRED_MESSAGE,
  MATRIX_OWNER_ACCESS_MESSAGE,
  MATRIX_OWNER_SESSION_UNVERIFIED_MESSAGE,
  MATRIX_UNAVAILABLE_MESSAGE,
} from "./matrixIdentification";

const OWNER_REQUIRED_BODY = { detail: "Owner session or API key is required" };

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
});

describe("matrixAccessState", () => {
  it("separates member sign-in from owner-only refusals", () => {
    expect(matrixAccessState(403, false)).toBe("owner_access_required");
    expect(matrixAccessState(403, true)).toBe("owner_access_required");
    expect(matrixAccessState(401, false, true)).toBe("member_session_required");
    expect(matrixAccessState(401, false, false)).toBe("owner_access_required");
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
  it("a signed-out visitor refused with 401 is asked to sign in", async () => {
    respond(401, OWNER_REQUIRED_BODY);
    const error = await rejection(listMatrixRegistries());
    expect(error.message).toBe(MATRIX_MEMBER_SESSION_REQUIRED_MESSAGE);
    expect(error.message).toBe("Sign in to use Matrix identification.");
    expect(error.access).toBe("member_session_required");
    expect(error.status).toBe(401);
    expect(error.message).not.toMatch(/Matrix API|401|Owner session or API key/i);
  });

  it("a 403 is owner access required as well", async () => {
    respond(403, { detail: "Forbidden" });
    const error = await rejection(createIdentificationSession({ registry_id: "r", version: "1" }));
    expect(error.message).toBe(MATRIX_OWNER_ACCESS_MESSAGE);
    expect(error.access).toBe("owner_access_required");
  });

  it("an owner whose session is refused is asked to sign in again as the owner", async () => {
    owner.session = true;
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
