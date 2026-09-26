/**
 * Node-side validation must not construct the Supabase client by importing the
 * Matrix / Research clients (CI "CALYX-MATRIX-005 Validation" runs
 * src/lib/matrixIdentification.test.ts on Node 20, where supabase-js Realtime
 * throws "Node.js 20 detected without native WebSocket support" at
 * createClient). memberReadAuth imports supabase lazily and only in a browser.
 *
 * Node environment on purpose (no window). createClient is replaced by a spy
 * that throws, so any construction — at import time or on a member request —
 * fails this test loudly.
 */
import { describe, expect, it, vi } from "vitest";

const created = vi.hoisted(() => ({ count: 0 }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    created.count += 1;
    throw new Error("Supabase client constructed in Node");
  },
}));

describe("member auth in Node (no browser)", () => {
  it("importing the Matrix, Lexicon, reports and member-auth modules constructs no Supabase client", async () => {
    await import("@/lib/memberReadAuth");
    await import("@/lib/matrixIdentification");
    await import("@/lib/matrixLexicon");
    await import("@/lib/matrixReports");
    expect(created.count).toBe(0);
  });

  it("a member-route request in Node carries no member token and constructs no client", async () => {
    const { withMemberAuth } = await import("@/lib/memberReadAuth");
    const { CALYX_BACKEND_BASE_URL } = await import("@/lib/backendConfig");
    for (const [method, path] of [
      ["GET", "/api/matrix-identification/registry"],
      ["POST", "/api/matrix-identification/sessions"],
      ["GET", "/api/research/traits"],
    ]) {
      const input: RequestInit = { method };
      const init = await withMemberAuth(`${CALYX_BACKEND_BASE_URL}${path}`, input);
      expect(new Headers(init.headers).get("Authorization"), `${method} ${path}`).toBeNull();
    }
    expect(created.count).toBe(0);
  });
});
