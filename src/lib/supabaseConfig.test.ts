import { describe, expect, it, vi, afterEach } from "vitest";

/**
 * The identity origin used to be a pair of unreachable string literals. These
 * pin the two properties that made it worth changing: a deployment can point
 * the bundle somewhere else, and a bundle that was not pointed anywhere else
 * still reaches the shipped project.
 */

async function loadConfig() {
  vi.resetModules();
  return import("./supabase");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("supabase client configuration", () => {
  it("uses the shipped hosted project when nothing overrides it", async () => {
    const { SUPABASE_URL, SUPABASE_IS_DEFAULT_PROJECT } = await loadConfig();
    expect(SUPABASE_URL).toBe("https://cvjuxzkznxzxcjkdvzla.databasepad.com");
    expect(SUPABASE_IS_DEFAULT_PROJECT).toBe(true);
  });

  it("honours a deployment-supplied origin and key", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://identity.example.test");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key-for-this-deployment");
    const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_IS_DEFAULT_PROJECT } = await loadConfig();
    expect(SUPABASE_URL).toBe("https://identity.example.test");
    expect(SUPABASE_ANON_KEY).toBe("anon-key-for-this-deployment");
    expect(SUPABASE_IS_DEFAULT_PROJECT).toBe(false);
  });

  it("strips a trailing slash, which supabase-js would otherwise double", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://identity.example.test/");
    const { SUPABASE_URL } = await loadConfig();
    expect(SUPABASE_URL).toBe("https://identity.example.test");
  });

  it("treats a blank override as absent rather than as an empty origin", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "   ");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_IS_DEFAULT_PROJECT } = await loadConfig();
    expect(SUPABASE_URL).toBe("https://cvjuxzkznxzxcjkdvzla.databasepad.com");
    expect(SUPABASE_ANON_KEY).toMatch(/^eyJ/);
    expect(SUPABASE_IS_DEFAULT_PROJECT).toBe(true);
  });

  it("never ships a service-role key as the browser key", async () => {
    const { SUPABASE_ANON_KEY } = await loadConfig();
    const [, payload] = SUPABASE_ANON_KEY.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    expect(claims.role).toBe("anon");
  });
});
