import { describe, expect, it } from "vitest";

import { STORAGE_KEY } from "@/lib/calyxConversation";
import {
  parseResearchCalyxRouteBridge,
  researchReturnHref,
  seedResearchCalyxPersistence,
} from "@/lib/researchCalyxRouteBridge";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    value: (key: string) => values.get(key) ?? null,
  };
}

describe("Research → Calyx route bridge", () => {
  it("accepts bounded project, conversation, and exact taxon context", () => {
    expect(
      parseResearchCalyxRouteBridge(
        "?origin=research-station&project=proj-1&conversation=conv-9&genus=Phalaenopsis&taxon=Phalaenopsis%20amabilis",
      ),
    ).toEqual({
      projectId: "proj-1",
      conversationId: "conv-9",
      taxon: "Phalaenopsis amabilis",
    });
  });

  it("does not activate for Atlas or homepage handoffs", () => {
    expect(parseResearchCalyxRouteBridge("?origin=homepage-featured-taxon&genus=Vanda")).toBeNull();
  });

  it("fails closed on malformed identities instead of persisting them", () => {
    expect(
      parseResearchCalyxRouteBridge(
        "?origin=research-station&project=%3Cscript%3E&conversation=bad%2Fthread&taxon=%3Cimg%3E",
      ),
    ).toEqual({ projectId: null, conversationId: null, taxon: null });
  });

  it("lets an explicit Research handoff outrank an unrelated saved Calyx thread", () => {
    const storage = memoryStorage({
      [STORAGE_KEY]: JSON.stringify({
        projectId: "old-project",
        conversationId: "old-conversation",
        speakReplies: true,
      }),
    });

    seedResearchCalyxPersistence(
      "?origin=research-station&project=proj-1&conversation=conv-9&taxon=Phalaenopsis%20amabilis",
      storage as unknown as Storage,
    );

    expect(JSON.parse(storage.value(STORAGE_KEY) as string)).toEqual({
      projectId: "proj-1",
      conversationId: "conv-9",
      speakReplies: true,
    });
  });

  it("preserves the project when returning to Research", () => {
    expect(researchReturnHref("proj-1")).toBe("/research?project=proj-1");
    expect(researchReturnHref(null)).toBe("/research");
  });
});
