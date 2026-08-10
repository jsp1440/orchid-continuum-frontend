import { marked } from "marked";

import type { CalyxConversation } from "@/lib/calyxWorkspace";

marked.setOptions({ gfm: true, breaks: true });

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

export function shouldReuseConversation(conversation: Pick<CalyxConversation, "project_id"> | null, projectId: string) {
  if (!conversation) return false;
  return normalizeProjectId(conversation.project_id) === normalizeProjectId(projectId);
}

export function renderCalyxRichText(content: string) {
  const escapedMarkdown = content.replace(/[&<>"']/g, (character) => HTML_ESCAPE_MAP[character] ?? character);
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
