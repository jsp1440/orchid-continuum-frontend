/**
 * `fetchResearchTraits` against bodies the producer really returns.
 *
 * The producer is NOT on backend main yet: it is jsp1440/orchid-calyx-backend
 * #1611 (head d68d9a9e). `__fixtures__/researchTraits.pr1611.json` was
 * captured from that branch through TestClient with the PR's own FakeService
 * (real `ResearchTraitsService.get()`, database boundary replaced). This test
 * therefore proves the client/producer contract, not deployment, and depends
 * on #1611 merging.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import captured from "./__fixtures__/researchTraits.pr1611.json";
import { fetchResearchTraits } from "./researchTraits";

afterEach(() => vi.unstubAllGlobals());

function serve(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
}

describe("research traits client against PR #1611 payloads", () => {
  it("accepts the AVAILABLE body and keeps unknown counts unknown and withheld groups empty", async () => {
    serve(captured.available_species);
    const result = await fetchResearchTraits({ rank: "species", name: "Cattleya purpurata" });
    const byId = Object.fromEntries(result.distributions.map((item) => [item.trait_id, item]));
    expect(byId["growth-form"].evidence_state).toBe("VERIFIED");
    expect(byId["growth-form"].sample_size).toBeNull();
    expect(byId["growth-form"].buckets).toContainEqual({ value: "terrestrial", count: null });
    expect(byId["growth-form"].receipts.every((receipt) => receipt.source_url === null || !receipt.source_url.includes("@"))).toBe(true);
    expect(byId["scent-class"].evidence_state).toBe("WITHHELD");
    expect(byId["scent-class"].buckets).toEqual([]);
    expect(byId["scent-class"].receipts).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/latitude|longitude|locality/i);
  });

  it.each([["unavailable_genus", "UNAVAILABLE"], ["absent_genus", "ABSENT"]] as const)(
    "accepts the %s body as %s with no distributions",
    async (key, state) => {
      serve(captured[key]);
      const result = await fetchResearchTraits({ rank: "genus", name: "Cattleya" });
      expect(result.state).toBe(state);
      expect(result.distributions).toEqual([]);
    },
  );
});
