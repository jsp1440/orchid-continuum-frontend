import { marked } from "marked";

import { parseAtlasCalyxQuestionContext } from "@/features/atlas-next/calyxHandoff";
import {
  CLASSROOM_INVESTIGATION_ORIGIN,
  classroomCalyxTurnRouteContext,
} from "@/lib/classroomInvestigationNavigation";
import { calyxNavigationContextIsExplicitlyNonEvidentiary } from "@/lib/calyxRouteTrustBoundary";
import { speciesDossierCalyxTurnRouteContext } from "@/lib/speciesDossierCalyxNavigation";
import type { CalyxCitation, CalyxConversation } from "@/lib/calyxWorkspace";

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
const MAX_DOCUMENT_CONTEXT_CHARACTERS = 2000;
const MAX_WORKSPACE_CONTEXT_CHARACTERS = 1200;
const MAX_WORKSPACE_CONTEXT_FILES = 6;
const MAX_STRUCTURED_PREVIEW_ROWS = 8;
const MAX_STRUCTURED_PREVIEW_COLUMNS = 6;
const MAX_STRUCTURED_PREVIEW_POINTS = 12;
const MAX_ROUTE_GENUS_CHARACTERS = 80;
const MAX_ROUTE_ORIGIN_CHARACTERS = 80;
const MAX_ROUTE_TAXON_CHARACTERS = 180;
const RESEARCH_STATION_ORIGIN = "research-station";
const SAFE_ROUTE_TAXON = /^[A-Za-z0-9][A-Za-z0-9 .:_()'×-]*$/;

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

  return `[From "${fileName}"]\n${trimmed.slice(0, MAX_DOCUMENT_CONTEXT_CHARACTERS)}`;
}

type StructuredWorkspaceCell = string | number | null;

export type StructuredWorkspacePreview = {
  format: "csv" | "tsv" | "json";
  summary: string;
  columns: string[];
  rows: Array<Record<string, StructuredWorkspaceCell>>;
  chart: {
    labelKey: string;
    valueKey: string;
    points: Array<{ label: string; value: number }>;
  } | null;
};

function normalizeWorkspaceCell(value: unknown): StructuredWorkspaceCell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(trimmed) ? numeric : trimmed;
  }
  return JSON.stringify(value);
}

function parseDelimitedRecords(content: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    if (record.some((value) => value.trim())) records.push(record);
    record = [];
  };

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];

    if (character === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === delimiter && !inQuotes) {
      pushField();
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && next === "\n") index += 1;
      pushRecord();
      continue;
    }

    field += character;
  }

  if (field.length || record.length) pushRecord();
  if (inQuotes) throw new Error("Unterminated quoted field");
  return records;
}

function uniqueHeaders(values: string[]): string[] {
  const used = new Set<string>();

  return values.map((value, index) => {
    const base = value.trim() || `Column ${index + 1}`;
    let candidate = base;
    let suffix = 2;

    while (used.has(candidate)) {
      candidate = `${base} (${suffix})`;
      suffix += 1;
    }

    used.add(candidate);
    return candidate;
  });
}

function finalizeStructuredPreview(
  format: StructuredWorkspacePreview["format"],
  columns: string[],
  rawRows: Array<Record<string, StructuredWorkspaceCell>>,
): StructuredWorkspacePreview | null {
  if (!columns.length || !rawRows.length) return null;

  const visibleColumns = columns.slice(0, MAX_STRUCTURED_PREVIEW_COLUMNS);
  const previewRows = rawRows.slice(0, MAX_STRUCTURED_PREVIEW_ROWS).map((row) =>
    Object.fromEntries(visibleColumns.map((column) => [column, row[column] ?? null])),
  );

  const stringLabelColumn = visibleColumns.find((column) =>
    rawRows.some((row) => typeof row[column] === "string" && row[column]?.toString().trim()),
  );
  const labelColumn = stringLabelColumn ?? visibleColumns[0];
  const numericColumn = visibleColumns.find(
    (column) => column !== labelColumn && rawRows.some((row) => typeof row[column] === "number"),
  );

  const chart =
    labelColumn && numericColumn
      ? {
          labelKey: labelColumn,
          valueKey: numericColumn,
          points: rawRows
            .slice(0, MAX_STRUCTURED_PREVIEW_POINTS)
            .map((row, index) => {
              const value = row[numericColumn];
              if (typeof value !== "number") return null;
              const labelValue = row[labelColumn];
              return {
                label:
                  typeof labelValue === "string" && labelValue.trim()
                    ? labelValue
                    : typeof labelValue === "number"
                      ? String(labelValue)
                      : `Row ${index + 1}`,
                value,
              };
            })
            .filter((point): point is { label: string; value: number } => Boolean(point)),
        }
      : null;

  return {
    format,
    summary: `${rawRows.length} row${rawRows.length === 1 ? "" : "s"} · ${columns.length} column${columns.length === 1 ? "" : "s"}${rawRows.length > previewRows.length || columns.length > visibleColumns.length ? " · preview trimmed" : ""}`,
    columns: visibleColumns,
    rows: previewRows,
    chart: chart?.points.length ? chart : null,
  };
}

function buildDelimitedStructuredPreview(content: string, delimiter: string, format: "csv" | "tsv") {
  const records = parseDelimitedRecords(content, delimiter);
  if (records.length < 2) return null;

  const header = uniqueHeaders(records[0]);
  if (!header.length) return null;

  const rawRows = records.slice(1).map((values) =>
    Object.fromEntries(header.map((column, index) => [column, normalizeWorkspaceCell(values[index])])),
  );

  return finalizeStructuredPreview(format, header, rawRows);
}

function buildJsonStructuredPreview(content: string) {
  const payload = JSON.parse(content) as unknown;
  const records = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? ((payload as { rows?: unknown; items?: unknown; data?: unknown }).rows ??
          (payload as { items?: unknown }).items ??
          (payload as { data?: unknown }).data)
      : null;
  if (!Array.isArray(records)) return null;

  const objectRows = records.filter(
    (record): record is Record<string, unknown> =>
      Boolean(record) && typeof record === "object" && !Array.isArray(record),
  );
  if (!objectRows.length) return null;

  const columns = Array.from(new Set(objectRows.flatMap((record) => Object.keys(record))));
  const rawRows = objectRows.map((record) =>
    Object.fromEntries(columns.map((column) => [column, normalizeWorkspaceCell(record[column])])),
  );
  return finalizeStructuredPreview("json", columns, rawRows);
}

export function buildStructuredWorkspacePreview(
  fileName: string,
  content: string,
): StructuredWorkspacePreview | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  try {
    if (/\.csv$/i.test(fileName)) return buildDelimitedStructuredPreview(trimmed, ",", "csv");
    if (/\.tsv$/i.test(fileName)) return buildDelimitedStructuredPreview(trimmed, "\t", "tsv");
    if (/\.json$/i.test(fileName) || /^[[{]/.test(trimmed)) return buildJsonStructuredPreview(trimmed);
  } catch {
    return null;
  }

  return null;
}

export type CalyxRouteContext = {
  origin: string | null;
  featuredTaxon: { rank: "genus"; name: string } | null;
  questionContext: {
    question: string;
    question_source: "user";
    question_is_evidence: false;
  } | null;
};

export function parseCalyxRouteContext(search: string): CalyxRouteContext {
  const params = new URLSearchParams(search);
  const rawGenus = params.get("genus")?.trim() ?? "";
  const rawOrigin = params.get("origin")?.trim() ?? "";
  const genus = rawGenus && rawGenus.length <= MAX_ROUTE_GENUS_CHARACTERS && /^[A-Za-z][A-Za-z -]*$/.test(rawGenus)
    ? rawGenus
    : "";
  const origin = rawOrigin && rawOrigin.length <= MAX_ROUTE_ORIGIN_CHARACTERS && /^[a-z0-9-]+$/i.test(rawOrigin)
    ? rawOrigin
    : "";
  return {
    origin: origin || null,
    featuredTaxon: genus ? { rank: "genus", name: genus } : null,
    questionContext: parseAtlasCalyxQuestionContext(search),
  };
}

function parseResearchExactTaxon(search: string, origin: string | null): string | null {
  if (origin !== RESEARCH_STATION_ORIGIN) return null;
  const value = new URLSearchParams(search).get("taxon")?.trim() ?? "";
  if (!value || value.length > MAX_ROUTE_TAXON_CHARACTERS || !SAFE_ROUTE_TAXON.test(value)) return null;
  return value;
}

export function buildCalyxTurnContext(options: {
  projectId: string;
  uploadedFiles: Array<Pick<File, "name" | "type" | "size">>;
  selectedAttachment?: Pick<File, "name" | "type" | "size"> | null;
  selectedDocumentText?: string;
  documentContext?: string;
  fileTextContent?: string | null;
  routeSearch?: string;
}) {
  const context: Record<string, unknown> = {
    surface: "orchid-continuum-frontend",
    project_id: normalizeProjectId(options.projectId),
  };

  const routeSearch = options.routeSearch ?? (typeof window !== "undefined" ? window.location.search : "");
  // Governed origins that carry exact identity use their dedicated adapters so
  // their evidence boundaries are validated in one place instead of re-derived
  // from generic query parameters here.
  const dossierRouteContext = speciesDossierCalyxTurnRouteContext(routeSearch);
  const classroomRouteContext = classroomCalyxTurnRouteContext(routeSearch);

  const routeContext = parseCalyxRouteContext(routeSearch);
  const featuredTaxonIsExplicitlyNonEvidentiary =
    calyxNavigationContextIsExplicitlyNonEvidentiary(routeSearch);
  const researchTaxon = parseResearchExactTaxon(routeSearch, routeContext.origin);
  const invalidClassroomArrival =
    routeContext.origin === CLASSROOM_INVESTIGATION_ORIGIN && !classroomRouteContext;

  if (dossierRouteContext) {
    context.route_context = dossierRouteContext;
  } else if (classroomRouteContext) {
    context.route_context = {
      ...classroomRouteContext,
      ...(routeContext.questionContext
        ? {
            question: routeContext.questionContext.question,
            question_source: routeContext.questionContext.question_source,
            question_is_evidence: routeContext.questionContext.question_is_evidence,
          }
        : {}),
    };
  } else if (
    !invalidClassroomArrival &&
    (routeContext.origin || routeContext.featuredTaxon || routeContext.questionContext || researchTaxon)
  ) {
    context.route_context = {
      origin: routeContext.origin ?? undefined,
      featured_taxon: routeContext.featuredTaxon
        ? { rank: routeContext.featuredTaxon.rank, accepted_name: routeContext.featuredTaxon.name }
        : undefined,
      ...(routeContext.featuredTaxon && featuredTaxonIsExplicitlyNonEvidentiary
        ? { featured_taxon_is_evidence: false }
        : {}),
      ...(researchTaxon
        ? {
            taxon: researchTaxon,
            taxon_source: RESEARCH_STATION_ORIGIN,
            taxon_is_evidence: false,
          }
        : {}),
      // Spread, not three optional reads. Assigning `undefined` still creates the
      // key, so a rejected question left route_context carrying `question`,
      // `question_source` and `question_is_evidence` - the exact fields the
      // fail-closed rule exists to withhold. JSON.stringify happens to drop
      // them on the wire, which is why this went unnoticed, but the contract is
      // about what the object asserts, not what survives serialization.
      ...(routeContext.questionContext
        ? {
            question: routeContext.questionContext.question,
            question_source: routeContext.questionContext.question_source,
            question_is_evidence: routeContext.questionContext.question_is_evidence,
          }
        : {}),
    };
  }

  const trimmedSelection = options.selectedDocumentText?.trim() ?? "";
  const trimmedDraftContext = options.documentContext?.trim() ?? "";
  const trimmedFileExcerpt = options.fileTextContent?.trim() ?? "";

  context.workspace = {
    attachment_count: options.uploadedFiles.length,
    attachments: options.uploadedFiles.slice(0, MAX_WORKSPACE_CONTEXT_FILES).map((file) => ({
      name: file.name,
      type: file.type || "unknown",
      size_bytes: file.size,
    })),
    selected_attachment: options.selectedAttachment
      ? {
          name: options.selectedAttachment.name,
          type: options.selectedAttachment.type || "unknown",
          size_bytes: options.selectedAttachment.size,
          selected_text_excerpt: trimmedSelection
            ? trimmedSelection.slice(0, MAX_WORKSPACE_CONTEXT_CHARACTERS)
            : undefined,
          visible_text_excerpt:
            !trimmedSelection && trimmedFileExcerpt
              ? trimmedFileExcerpt.slice(0, MAX_WORKSPACE_CONTEXT_CHARACTERS)
              : undefined,
        }
      : undefined,
    draft_document_context: trimmedDraftContext
      ? trimmedDraftContext.slice(0, MAX_WORKSPACE_CONTEXT_CHARACTERS)
      : undefined,
  };

  return context;
}

export function visibleConversationMessages(messages: CalyxConversation["messages"]) {
  return messages.filter((message) => message.role === "operator" || message.role === "calyx");
}

function formatCitation(citation: CalyxCitation) {
  const identifiers = [
    citation.doi ? `DOI ${citation.doi}` : null,
    citation.pmid ? `PMID ${citation.pmid}` : null,
    citation.pmcid ? `PMCID ${citation.pmcid}` : null,
  ].filter(Boolean);
  const bibliographic = [citation.authors, citation.publication_date, citation.journal]
    .filter(Boolean)
    .join("; ");
  const governance = citation.canonical_evidence
    ? "canonical Continuum evidence"
    : citation.review_state?.replaceAll("_", " ").toLowerCase() || "external / review required";
  return `- **${citation.title}**${bibliographic ? ` — ${bibliographic}` : ""}${identifiers.length ? ` — ${identifiers.join(" · ")}` : ""} — ${governance}`;
}

export function buildCalyxConversationExport(
  conversation: Pick<CalyxConversation, "conversation_id" | "project_id" | "created_at" | "messages">,
) {
  const lines = [
    "# CALYX Research Package",
    "",
    `**Project:** ${normalizeProjectId(conversation.project_id)}`,
    `**Conversation ID:** ${conversation.conversation_id}`,
    `**Started:** ${new Date(conversation.created_at).toLocaleString()}`,
    "",
    "This export preserves CALYX answers, research instructions, citations supplied by the backend, and any chart/map-ready specifications included in the conversation.",
    "",
    "---",
    "",
  ];

  for (const message of visibleConversationMessages(conversation.messages)) {
    lines.push(`## ${message.role === "operator" ? "You" : "CALYX"}`);
    lines.push("");
    lines.push(message.content);
    lines.push("");

    if (message.role === "calyx" && Array.isArray(message.metadata?.citations) && message.metadata.citations.length) {
      lines.push("### Sources surfaced for this turn");
      lines.push("");
      for (const citation of message.metadata.citations) {
        lines.push(formatCitation(citation));
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}