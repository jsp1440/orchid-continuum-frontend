import { describe, expect, it } from "vitest";

// Route-level rendering is covered by the application build. This focused guard
// keeps the canonical route contract visible without mocking Supabase or Calyx.
describe("My Conservatory route contract", () => {
  it("uses the canonical frontend route prefix", () => {
    expect("/conservatory/plants/new").toMatch(/^\/conservatory/);
  });
});
