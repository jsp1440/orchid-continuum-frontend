import { describe, expect, it } from "vitest";

import { buildStructuredWorkspacePreview } from "./calyxConversation";

describe("CALYX structured preview header integrity", () => {
  it("preserves literal headers when duplicate suffixes would otherwise collide", () => {
    const preview = buildStructuredWorkspacePreview(
      "notes.csv",
      "note,note (2),note\nfirst,literal,duplicate",
    );

    expect(preview).toMatchObject({
      columns: ["note", "note (2)", "note (3)"],
      rows: [
        {
          note: "first",
          "note (2)": "literal",
          "note (3)": "duplicate",
        },
      ],
    });
  });
});
