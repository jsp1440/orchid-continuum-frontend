import { describe, expect, it } from "vitest";

import {
  buildCalyxTurnContext,
  buildCalyxConversationExport,
  buildCalyxDocumentContextPrompt,
  buildStructuredWorkspacePreview,
  DEFAULT_PROJECT_ID,
  formatUploadedFileSize,
  isCalyxTextWorkspaceFile,
  normalizeProjectId,
  renderCalyxRichText,
  shouldReuseConversation,
  visibleConversationMessages,
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

  it("strips javascript: and data: URL protocols from rendered links", () => {
    const jsUrl = renderCalyxRichText("[click](javascript:alert(1))");
    expect(jsUrl).not.toContain("javascript:");
    expect(jsUrl).toContain('href="#"');

    const dataUrl = renderCalyxRichText("[data](data:text/html,<h1>x</h1>)");
    expect(dataUrl).not.toContain("data:text/html");
    expect(dataUrl).toContain('href="#"');
  });

  it("adds rel and target attributes to safe links in rendered content", () => {
    const html = renderCalyxRichText("[Orchid Continuum](https://orchidcontinuum.org)");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('href="https://orchidcontinuum.org"');
  });

  it("formats attachment sizes for the workspace panel", () => {
    expect(formatUploadedFileSize(512)).toBe("512 B");
    expect(formatUploadedFileSize(2048)).toBe("2.0 KB");
    expect(formatUploadedFileSize(12 * 1024 * 1024)).toBe("12 MB");
  });

  it("recognizes text-friendly workspace attachments", () => {
    expect(isCalyxTextWorkspaceFile({ name: "paper.md", type: "" } as File)).toBe(true);
    expect(isCalyxTextWorkspaceFile({ name: "figure.png", type: "image/png" } as File)).toBe(false);
  });

  it("builds a bounded document context prompt", () => {
    expect(buildCalyxDocumentContextPrompt("paper.txt", "  excerpt  ")).toBe('[From "paper.txt"]\nexcerpt');
    expect(buildCalyxDocumentContextPrompt("paper.txt", "   ")).toBe("");
  });

  it("builds bounded workspace context for backend turns", () => {
    expect(
      buildCalyxTurnContext({
        projectId: "vision-lab",
        uploadedFiles: [{ name: "paper.csv", type: "text/csv", size: 2048 } as File],
        selectedAttachment: { name: "paper.csv", type: "text/csv", size: 2048 } as File,
        selectedDocumentText: "  selected rows  ",
        documentContext: "  draft note  ",
        fileTextContent: "a,b\n1,2",
      }),
    ).toEqual({
      surface: "orchid-continuum-frontend",
      project_id: "vision-lab",
      workspace: {
        attachment_count: 1,
        attachments: [{ name: "paper.csv", type: "text/csv", size_bytes: 2048 }],
        selected_attachment: {
          name: "paper.csv",
          type: "text/csv",
          size_bytes: 2048,
          selected_text_excerpt: "selected rows",
          visible_text_excerpt: undefined,
        },
        draft_document_context: "draft note",
      },
    });
  });

  it("extracts a structured preview for local datasets", () => {
    expect(
      buildStructuredWorkspacePreview("paper.csv", "species,count\nCattleya,12\nDracula,7"),
    ).toMatchObject({
      format: "csv",
      columns: ["species", "count"],
      rows: [
        { species: "Cattleya", count: 12 },
        { species: "Dracula", count: 7 },
      ],
      chart: {
        labelKey: "species",
        valueKey: "count",
      },
    });
  });

  it("filters visible conversation messages for export and display", () => {
    expect(
      visibleConversationMessages([
        { message_id: "1", conversation_id: "thread", role: "system", content: "ignore", created_at: "2026-08-10T00:00:00Z" },
        { message_id: "2", conversation_id: "thread", role: "operator", content: "Question", created_at: "2026-08-10T00:00:01Z" },
        { message_id: "3", conversation_id: "thread", role: "calyx", content: "Answer", created_at: "2026-08-10T00:00:02Z" },
      ]).map((message) => message.message_id),
    ).toEqual(["2", "3"]);
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
