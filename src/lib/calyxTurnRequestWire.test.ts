import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildCalyxTurnContext } from "@/lib/calyxConversation";
import { createCalyxConversation, sendCalyxTurn } from "@/lib/calyxWorkspace";
import { featuredTaxonCalyxHref } from "@/lib/featuredTaxonNavigation";
import {
  adoptCultivationHandoff,
  buildCultivationHandoff,
  cultivationCalyxHref,
  resetAdoptedCultivationHandoffs,
  seedCultivationHandoff,
} from "@/lib/conservatoryCultivationCalyx";

/**
 * What actually leaves the browser on a Calyx turn.
 *
 * Every other test of this path stops one hop short. `CalyxWorkspace.test.tsx`
 * replaces `@/lib/calyxWorkspace` wholesale, so `sendCalyxTurn` never runs and
 * the assertions are about the arguments handed to a mock. That proves the page
 * builds the right object; it cannot prove the object survives serialization
 * into the request body, which is where a governed boundary would actually be
 * lost.
 *
 * The distinction is not hypothetical here. `buildCalyxTurnContext` assembles
 * `route_context` with optional keys, and a key whose value is `undefined`
 * disappears from `JSON.stringify` output without any error. A boundary flag
 * that reads correctly in a unit test can therefore be absent on the wire.
 *
 * So these tests run the real transport with `fetch` stubbed, and read the
 * request body.
 */

type Captured = { url: string; init: RequestInit };

let captured: Captured[] = [];

function body(index = 0): Record<string, unknown> {
  const raw = captured[index]?.init?.body;
  expect(typeof raw).toBe("string");
  return JSON.parse(String(raw)) as Record<string, unknown>;
}

beforeEach(() => {
  captured = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      captured.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ conversation_id: "conversation-1", messages: [] }),
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The exact address the homepage Genus of the Day card links to. */
function genusOfTheDaySearch(genus: string): string {
  return new URL(featuredTaxonCalyxHref(genus), "https://orchidcontinuum.org").search;
}

describe("Genus of the Day governed context reaches the request body", () => {
  it("carries the canonical genus and its non-evidence flag on the turn", async () => {
    const context = buildCalyxTurnContext({
      projectId: "continuum",
      uploadedFiles: [],
      routeSearch: genusOfTheDaySearch("Phalaenopsis"),
    });

    await sendCalyxTurn("conversation-1", { message: "How is this genus pollinated?", context });

    const sent = body();
    expect(String(captured[0].url)).toContain("/api/calyx/speak/conversations/conversation-1/turns");
    expect(captured[0].init.method).toBe("POST");

    const routeContext = (sent.context as Record<string, unknown>).route_context as Record<string, unknown>;
    expect(routeContext).toBeTruthy();
    expect(routeContext.origin).toBe("homepage-featured-taxon");
    expect(routeContext.featured_taxon).toEqual({ rank: "genus", accepted_name: "Phalaenopsis" });

    // The whole point of the boundary: navigation context is not evidence, and
    // the flag saying so has to survive to the server. `false` is the assertion
    // — an absent key would let the receiver default it to anything.
    expect(routeContext.featured_taxon_is_evidence).toBe(false);
    expect(Object.keys(routeContext)).toContain("featured_taxon_is_evidence");
  });

  it("carries the same context when the conversation is created, not only on turns", async () => {
    // A first message creates the conversation and sends a turn. If only the
    // turn carried the boundary, the conversation would already exist with an
    // unqualified taxon attached to it.
    const context = buildCalyxTurnContext({
      projectId: "continuum",
      uploadedFiles: [],
      routeSearch: genusOfTheDaySearch("Phalaenopsis"),
    });

    await createCalyxConversation({ title: "Genus of the Day", project_id: "continuum", context });

    const routeContext = (body().context as Record<string, unknown>).route_context as Record<string, unknown>;
    expect(routeContext.featured_taxon).toEqual({ rank: "genus", accepted_name: "Phalaenopsis" });
    expect(routeContext.featured_taxon_is_evidence).toBe(false);
  });

  it("never lets an undefined optional key masquerade as a sent value", async () => {
    // `JSON.stringify` drops undefined-valued keys silently. Anything the
    // context declares must therefore either be a real value on the wire or
    // absent from the object entirely — never `undefined` in between.
    const context = buildCalyxTurnContext({
      projectId: "continuum",
      uploadedFiles: [],
      routeSearch: genusOfTheDaySearch("Phalaenopsis"),
    });

    await sendCalyxTurn("conversation-1", { message: "anything", context });

    const sent = body().context as Record<string, unknown>;
    const routeContext = sent.route_context as Record<string, unknown>;
    for (const [key, value] of Object.entries(routeContext)) {
      expect(value, `route_context.${key} was undefined and vanished from the request`).not.toBeUndefined();
    }
  });
});

describe("Conservatory cultivation context reaches the request body", () => {
  const TOKEN = "cafe1234deadbeef";

  function memoryStorage() {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => { map.set(key, value); },
      removeItem: (key: string) => { map.delete(key); },
    };
  }

  function arrive() {
    resetAdoptedCultivationHandoffs();
    const handoff = buildCultivationHandoff({
      acceptedScientificName: "Phalaenopsis amabilis",
      locationKind: "greenhouse_bench",
      readings: [
        { variable: "temperature_c", value: 31, origin: "measured", observed_at: "2026-08-20T06:30:00Z" },
        { variable: "relative_humidity_pct", value: 62, origin: "manual", observed_at: "2026-08-20T06:31:00Z" },
      ],
    })!;
    const storage = memoryStorage();
    seedCultivationHandoff(storage, TOKEN, handoff);
    const search = new URL(cultivationCalyxHref(handoff.taxon, TOKEN)!, "https://orchidcontinuum.org").search;
    // The route adopts before the workspace mounts; this is that step.
    expect(adoptCultivationHandoff(search, storage)).not.toBeNull();
    return search;
  }

  it("sends the grower's readings with their provenance and both denials", async () => {
    const search = arrive();
    const context = buildCalyxTurnContext({ projectId: "continuum", uploadedFiles: [], routeSearch: search });

    await sendCalyxTurn("conversation-1", { message: "Is this bench too warm?", context });

    const routeContext = (body().context as Record<string, unknown>).route_context as Record<string, unknown>;
    expect(routeContext.origin).toBe("conservatory-cultivation");
    expect(routeContext.taxon).toBe("Phalaenopsis amabilis");
    expect(routeContext.location).toEqual({ kind: "greenhouse_bench" });
    expect(routeContext.observations).toEqual([
      { variable: "temperature_c", value: 31, unit: "°C", origin: "measured", observed_on: "2026-08-20" },
      { variable: "relative_humidity_pct", value: 62, unit: "%", origin: "manual", observed_on: "2026-08-20" },
    ]);

    // The denials are the whole reason this is allowed to travel at all.
    expect(routeContext.observations_are_evidence).toBe(false);
    expect(routeContext.observations_are_occurrence_data).toBe(false);
    expect(routeContext.taxon_is_evidence).toBe(false);
  });

  it("puts nothing private on the wire and nothing at all in the address", async () => {
    const search = arrive();
    const context = buildCalyxTurnContext({ projectId: "continuum", uploadedFiles: [], routeSearch: search });
    await sendCalyxTurn("conversation-1", { message: "anything", context });

    const wire = JSON.stringify(body());
    for (const forbidden of ["accession", "OC-0001", "qr_identifier", "ocq_", "notes", "plant_id", "location_name", "latitude", "longitude", "locality"]) {
      expect(wire.toLowerCase(), `"${forbidden}" reached the request`).not.toContain(forbidden.toLowerCase());
    }
    // The address carried a token, never the observations themselves.
    expect(search).not.toMatch(/temperature|humidity|31|62/);
  });

  it("carries no cultivation context when the handoff was never adopted", async () => {
    // Arriving with a token nobody seeded — a pasted link, or a reload after
    // the single-use entry was consumed. It must be an ordinary Calyx session,
    // not a cultivation question with invented conditions.
    resetAdoptedCultivationHandoffs();
    const search = "?genus=Phalaenopsis&taxon=Phalaenopsis+amabilis&origin=conservatory-cultivation&context_is_evidence=false&cultivation=cafe1234deadbeef";
    const context = buildCalyxTurnContext({ projectId: "continuum", uploadedFiles: [], routeSearch: search });
    await sendCalyxTurn("conversation-1", { message: "anything", context });

    const routeContext = ((body().context as Record<string, unknown>).route_context ?? {}) as Record<string, unknown>;
    expect(routeContext.observations).toBeUndefined();
    expect(JSON.stringify(body())).not.toContain("greenhouse_bench");
  });
});
