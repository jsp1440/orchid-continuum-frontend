import { describe, expect, it } from "vitest";

import {
  buildCalyxConversationExport,
  buildCalyxDocumentContextPrompt,
  DEFAULT_PROJECT_ID,
  formatUploadedFileSize,
  isCalyxTextWorkspaceFile,
  normalizeProjectId,
  renderCalyxRichText,
  shouldReuseConversation,
} from "./calyxConversation";

describe("calyxConversation helpers", () => {
  it("normalizes empty project ids to the canonical default", () => {
    expect(normalizeProjectId("  ")).toBe(DEFAULT_PROJECT_ID);
    expect(normalizeProjectId(null)).toBe(DEFAULT_PROJECT_ID);
  });

  it("reuses only conversations that belong to the active project", () => {
    expect(shouldReuseConversation({ project_id: "vision-lab" }, "vision-lab")).toBe(true);
    expect(shouldReuseConversation({ project_id: "vision-lab" }, "brain-lab")).toBe(false);
    expect(shouldReuseConversation(null, "vision-lab")).toBe(false);
  });

  it("renders markdown while escaping raw html from backend content", () => {
    const html = renderCalyxRichText("**Bold** <script>alert('xss')</script>");

    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("formats attachment sizes for the workspace panel", () => {
    expect(formatUploadedFileSize(512)).toBe("512 B");
    expect(formatUploadedFileSize(2048)).toBe("2.0 KB");
    expect(formatUploadedFileSize(12 * 1024 * 1024)).toBe("12 MB");
  });

  it("recognizes text-friendly workspace attachments", () => {
    expect(isCalyxTextWorkspaceFile({ name: "paper.md", type: "" } as File)).toBe(true);
    expect(isCalyxTextWorkspaceFile({ name: "notes.bin", type: "application/octet-stream" } as File)).toBe(false);
  });

  it("builds a bounded document context prompt", () => {
    expect(buildCalyxDocumentContextPrompt("paper.txt", "  excerpt  ")).toBe('[From "paper.txt"]\nexcerpt');
    expect(buildCalyxDocumentContextPrompt("paper.txt", "   ")).toBe("");
  });

  it("exports only operator and CALYX messages", () => {
    const markdown = buildCalyxConversationExport({
      conversation_id: "conversation-1",
      project_id: "vision-lab",
      created_at: "2026-08-10T00:00:00Z",
      messages: [
        { message_id: "1", conversation_id: "conversation-1", role: "system", content: "ignore", created_at: "2026-08-10T00:00:00Z" },
        { message_id: "2", conversation_id: "conversation-1", role: "operator", content: "Question", created_at: "2026-08-10T00:00:01Z" },
        { message_id: "3", conversation_id: "conversation-1", role: "calyx", content: "Answer", created_at: "2026-08-10T00:00:02Z" },
      ],
    });

    expect(markdown).toContain("**Project:** vision-lab");
    expect(markdown).toContain("## You");
    expect(markdown).toContain("## CALYX");
    expect(markdown).not.toContain("ignore");
  });
});
