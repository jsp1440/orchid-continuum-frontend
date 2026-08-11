import { marked } from "marked";

import type { CalyxConversation } from "@/lib/calyxWorkspace";

marked.setOptions({ gfm: true, breaks: true });

const UNSAFE_HREF_PROTOCOL = /^(javascript|data|vbscript):/i;

marked.use({
  renderer: {
    link(href: string, title: string | null | undefined, text: string): string {
      const safeHref = UNSAFE_HREF_PROTOCOL.test(href ?? "") ? "#" : (href ?? "");
      const titleAttr = title ? ` title="${title}"` : "";
      return `<a href="${safeHref}"${titleAttr} rel="noopener noreferrer" target="_blank">${text}</a>`;
    },
  },
});

export const DEFAULT_PROJECT_ID = "calyx-speak";
export const STORAGE_KEY = "orchid-continuum:calyx-speak:v2";

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function normalizeProjectId(projectId: string | null | undefined) {
  const trimmed = projectId?.trim();
  return trimmed ? trimmed : DEFAULT_PROJECT_ID;
}

export function shouldReuseConversation(
  conversation: Pick<CalyxConversation, "project_id"> | null,
  projectId: string,
) {
  if (!conversation) return false;
  return normalizeProjectId(conversation.project_id) === normalizeProjectId(projectId);
}

export function renderCalyxRichText(content: string) {
  const escapedMarkdown = content.replace(
    /[&<>"']/g,
    (character) => HTML_ESCAPE_MAP[character] ?? character,
  );
  const rendered = marked.parse(escapedMarkdown);
  return typeof rendered === "string" ? rendered : `<p>${escapedMarkdown}</p>`;
}

export function formatUploadedFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

const TEXT_WORKSPACE_MIME_TYPES = new Set([
  "text/plain",
  "text/csv",
  "text/tab-separated-values",
  "text/markdown",
  "application/json",
]);

export function isCalyxTextWorkspaceFile(file: Pick<File, "name" | "type">) {
  return TEXT_WORKSPACE_MIME_TYPES.has(file.type) || /\.(txt|md|csv|tsv|json)$/i.test(file.name);
}

export function buildCalyxDocumentContextPrompt(fileName: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";

  return `[From "${fileName}"]\n${trimmed.slice(0, 2000)}`;
}

export function visibleConversationMessages(messages: CalyxConversation["messages"]) {
  return messages.filter((message) => message.role === "operator" || message.role === "calyx");
}

export function buildCalyxConversationExport(
  conversation: Pick<CalyxConversation, "conversation_id" | "project_id" | "created_at" | "messages">,
) {
  const lines = [
    "# CALYX Conversation",
    "",
    `**Project:** ${normalizeProjectId(conversation.project_id)}`,
    `**Conversation ID:** ${conversation.conversation_id}`,
    `**Started:** ${new Date(conversation.created_at).toLocaleString()}`,
    "",
    "---",
    "",
  ];

  for (const message of visibleConversationMessages(conversation.messages)) {
    lines.push(`## ${message.role === "operator" ? "You" : "CALYX"}`);
    lines.push("");
    lines.push(message.content);
    lines.push("");
  }

  return lines.join("\n");
}
