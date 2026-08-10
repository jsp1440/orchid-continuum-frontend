import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROJECT_ID,
  formatUploadedFileSize,
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
});
