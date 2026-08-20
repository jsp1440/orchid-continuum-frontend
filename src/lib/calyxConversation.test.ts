import { describe, expect, it } from "vitest";

import { atlasOccurrenceEvidenceCalyxHref } from "@/features/atlas-next/calyxHandoff";
import {
  buildCalyxTurnContext,
  buildCalyxConversationExport,
  buildCalyxDocumentContextPrompt,
  buildStructuredWorkspacePreview,
  DEFAULT_PROJECT_ID,
  formatUploadedFileSize,
  isCalyxTextWorkspaceFile,
  normalizeProjectId,
  parseCalyxRouteContext,
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
        routeSearch: "",
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

  it("grounds CALYX turns in bounded featured-genus route context", () => {
    expect(parseCalyxRouteContext("?genus=Vanilla&origin=homepage-featured-taxon")).toEqual({
      origin: "homepage-featured-taxon",
      featuredTaxon: { rank: "genus", name: "Vanilla" },
      questionContext: null,
    });

    expect(
      buildCalyxTurnContext({
        projectId: "calyx-speak",
        uploadedFiles: [],
        routeSearch: "?genus=Vanilla&origin=homepage-featured-taxon",
      }),
    ).toMatchObject({
      route_context: {
        origin: "homepage-featured-taxon",
        featured_taxon: { rank: "genus", accepted_name: "Vanilla" },
      },
    });
  });

  it("carries the Atlas active question into Calyx route context as non-evidentiary metadata", () => {
    const href = atlasOccurrenceEvidenceCalyxHref(
      "Vanilla",
      "  What evidence supports this occurrence pattern?  ",
    );
    expect(href).not.toBeNull();
    const search = new URL(href as string, "https://orchidcontinuum.org").search;

    expect(parseCalyxRouteContext(search)).toEqual({
      origin: "atlas-next-occurrence-evidence",
      featuredTaxon: { rank: "genus", name: "Vanilla" },
      questionContext: {
        question: "What evidence supports this occurrence pattern?",
        question_source: "user",
        question_is_evidence: false,
      },
    });

    expect(
      buildCalyxTurnContext({
        projectId: "calyx-speak",
        uploadedFiles: [],
        routeSearch: `${search}&latitude=-12.4&longitude=-77.1&locality=protected&occurrence_id=secret-1&collector=private`,
      }),
    ).toMatchObject({
      route_context: {
        origin: "atlas-next-occurrence-evidence",
        featured_taxon: { rank: "genus", accepted_name: "Vanilla" },
        question: "What evidence supports this occurrence pattern?",
        question_source: "user",
        question_is_evidence: false,
      },
    });

    const routeContext = (
      buildCalyxTurnContext({
        projectId: "calyx-speak",
        uploadedFiles: [],
        routeSearch: `${search}&latitude=-12.4&longitude=-77.1&locality=protected&occurrence_id=secret-1&collector=private`,
      }).route_context ?? {}
    ) as Record<string, unknown>;
    expect(routeContext).not.toHaveProperty("latitude");
    expect(routeContext).not.toHaveProperty("longitude");
    expect(routeContext).not.toHaveProperty("locality");
    expect(routeContext).not.toHaveProperty("occurrence_id");
    expect(routeContext).not.toHaveProperty("collector");
  });

  it("fails closed when Atlas question provenance is malformed", () => {
    const parsed = parseCalyxRouteContext(
      "?genus=Vanilla&origin=atlas-next-occurrence-evidence&question=Where%3F&question_source=user&question_is_evidence=true",
    );
    expect(parsed.questionContext).toBeNull();

    const context = buildCalyxTurnContext({
      projectId: "calyx-speak",
      uploadedFiles: [],
      routeSearch:
        "?genus=Vanilla&origin=atlas-next-occurrence-evidence&question=Where%3F&question_source=user&question_is_evidence=true",
    });
    expect(context.route_context).not.toHaveProperty("question");
    expect(context.route_context).not.toHaveProperty("question_source");
    expect(context.route_context).not.toHaveProperty("question_is_evidence");
  });

  it("drops malformed or oversized route context instead of forwarding it", () => {
    expect(parseCalyxRouteContext("?genus=%3Cscript%3E&origin=homepage%2Fbad")).toEqual({
      origin: null,
      featuredTaxon: null,
      questionContext: null,
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

  it("preserves quoted multiline fields and duplicate headers in delimited previews", () => {
    const preview = buildStructuredWorkspacePreview(
      "notes.csv",
      'species,note,note\nCattleya,"line one\nline two",first\nDracula,single,second',
    );

    expect(preview).toMatchObject({
      columns: ["species", "note", "note (2)"],
      rows: [
        { species: "Cattleya", note: "line one\nline two", "note (2)": "first" },
        { species: "Dracula", note: "single", "note (2)": "second" },
      ],
    });
  });

  it("uses distinct label and value fields for numeric-only charts", () => {
    const preview = buildStructuredWorkspacePreview("counts.csv", "year,count\n2024,10\n2025,12");

    expect(preview?.chart).toMatchObject({
      labelKey: "year",
      valueKey: "count",
      points: [
        { label: "2024", value: 10 },
        { label: "2025", value: 12 },
      ],
    });
  });

  it("suppresses charts when no distinct numeric value column exists", () => {
    const preview = buildStructuredWorkspacePreview("years.csv", "year\n2024\n2025");
    expect(preview?.chart).toBeNull();
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