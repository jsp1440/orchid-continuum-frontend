import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildCalyxTurnContext } from "@/lib/calyxConversation";
import { createCalyxConversation, sendCalyxTurn } from "@/lib/calyxWorkspace";
import { featuredTaxonCalyxHref } from "@/lib/featuredTaxonNavigation";

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
