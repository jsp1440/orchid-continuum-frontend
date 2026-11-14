/**
 * The structured part of `research.scientific_evidence`: topics, one entry per
 * taxon, the records behind each, comparison lines and notices.
 *
 * This extends `calyxScientificEvidence.ts` and holds to the same rules:
 *
 *   - Every part is optional and validated on its own. A part that is present
 *     but of the wrong shape becomes an `unreadable` part ("could not be
 *     displayed"). It is never read as an empty part, and it never blanks the
 *     sentences the main reader returns.
 *   - Nothing is inferred. An empty list is an empty list: it produces no line
 *     of its own, so silence is never turned into "none", "absent" or "not a
 *     synonym". Text that means something (a marker, a conservation note, what
 *     follows a synonym name) is carried exactly as the source wrote it.
 *   - A held-back record is carried as a count and the returned reason text
 *     only; no other field of it is read.
 *   - No `as` casts over unvalidated data: every value takes its type from the
 *     check that precedes it.
 */

export type EvidenceItem = {
  text: string;
  detail: string | null;
  /** Only ever shown as text, except a DOI that passes `doiHref`. */
  citation: string | null;
  doi: string | null;
  state: string | null;
  review: string | null;
  /** A line about this record that the page derives only from returned fields (for example the year in a citation). */
  note: string | null;
};

export type EvidenceStatement = { cls: string | null; text: string };

export type RecordsSectionKind =
  | "relationships"
  | "held_back"
  | "not_retrieved"
  | "distribution"
  | "conservation"
  | "synonymy"
  | "synonym_resolution"
  | "mycorrhiza"
  | "host_pathogen"
  | "publication"
  | "area_taxa"
  | "area_other_writings";

export type RecordsSection =
  | { unreadable: true; kind: RecordsSectionKind }
  /** A key under `evidence` this page does not know: that part could not be displayed. */
  | { unreadable: true; kind: "unknown"; name: string }
  | {
      unreadable: false;
      kind: RecordsSectionKind;
      /** Evidence state as returned (for example "documented"), or null when not returned. */
      state: string | null;
      /** Review state as returned (for example "UNREVIEWED"), or null when not returned. */
      review: string | null;
      citation: string | null;
      /** For example "18 of 18 shown". Only built from counts the backend returned. */
      counts: string | null;
      items: EvidenceItem[];
      statements: EvidenceStatement[];
      /** For example "No records attached." or "Not checked against the publication."; from returned flags only. */
      note: string | null;
    };

export type SubjectScope = "subject" | "area" | "direct_subtaxon" | "contextual_parent_species";

export type EvidenceSubject =
  | { unreadable: true }
  | {
      unreadable: false;
      scope: SubjectScope;
      label: string | null;
      kgNodeId: number | null;
      status: string | null;
      sentences: string[];
      askedAs: string | null;
      alsoAskedAs: string[];
      explanation: string | null;
      /** The returned note that labels a contextual (species-level) scope of a subtaxon turn. */
      contextNote: string | null;
      sections: RecordsSection[];
    };

export type StructuredEvidence = {
  topics: string[];
  topicsUnreadable: boolean;
  subjects: EvidenceSubject[];
  comparison: string[];
  comparisonUnreadable: boolean;
  notices: string[];
  noticesUnreadable: boolean;
  /** True when a subtaxon turn carries a direct scope and a contextual scope. */
  isSubtaxonTurn: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/** A list of non-blank strings, kept word for word. `null` when it is not such a list. */
function strictStrings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    if (item.trim()) out.push(item);
  }
  return out;
}

/** A DOI becomes a link target only when it has the DOI shape; nothing else from the data is ever a link. */
const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;
export function doiHref(doi: string | null): string | null {
  return doi !== null && DOI_PATTERN.test(doi) ? `https://doi.org/${doi}` : null;
}

function statementsOf(value: unknown): EvidenceStatement[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const out: EvidenceStatement[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const text = str(item.statement);
    if (text === null) return null;
    out.push({ cls: str(item.class), text });
  }
  return out;
}

function sourceCitation(value: unknown): string | null | undefined {
  // undefined: present but unreadable; null: no citation returned.
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return undefined;
  if (value.citation_text !== undefined && value.citation_text !== null && typeof value.citation_text !== "string") return undefined;
  return str(value.citation_text);
}

function shownOf(shown: unknown, projected: unknown, listed: unknown): string | null {
  const s = count(shown);
  const total = count(listed) ?? count(projected);
  if (s === null || total === null) return s === null ? null : `${s} shown`;
  return `${s} of ${total} shown`;
}

type Build = { items: EvidenceItem[]; counts: string | null; note?: string | null };

function section(kind: RecordsSectionKind, raw: Record<string, unknown>, build: Build): RecordsSection | null {
  const citation = sourceCitation(raw.source);
  const statements = statementsOf(raw.statements);
  if (citation === undefined || statements === null) return { unreadable: true, kind };
  const state = raw.state === undefined || raw.state === null ? null : str(raw.state);
  const review = raw.review_state === undefined || raw.review_state === null ? null : str(raw.review_state);
  return { unreadable: false, kind, state, review, citation, counts: build.counts, items: build.items, statements, note: build.note ?? null };
}

function item(text: string | null, rest: Partial<EvidenceItem> = {}): EvidenceItem | null {
  if (text === null) return null;
  return { text, detail: null, citation: null, doi: null, state: null, review: null, note: null, ...rest };
}

function all<T>(values: unknown, each: (value: unknown) => T | null): T[] | null {
  if (!Array.isArray(values)) return null;
  const out: T[] = [];
  for (const value of values) {
    const built = each(value);
    if (built === null) return null;
    out.push(built);
  }
  return out;
}

function relationshipItem(value: unknown): EvidenceItem | null {
  if (!isRecord(value)) return null;
  const citation = value.citation_text;
  if (citation !== undefined && citation !== null && typeof citation !== "string") return null;
  const doi = value.doi;
  if (doi !== undefined && doi !== null && typeof doi !== "string") return null;
  return item(str(value.statement), {
    citation: str(citation),
    doi: str(doi),
    state: str(value.state),
    review: str(value.review_state_plain),
    detail: str(value.partner),
  });
}

function heldBackItem(value: unknown): EvidenceItem | null {
  // Only the count and the returned reason text are read. Nothing else about a
  // held-back record is looked at, whatever the data holds.
  if (!isRecord(value)) return null;
  const n = count(value.count);
  const reason = str(value.statement);
  if (reason === null) return null;
  return item(reason, { detail: n === null ? null : `${n} held back` });
}

function notRetrievedItem(value: unknown): EvidenceItem | null {
  return isRecord(value) ? item(str(value.statement)) : null;
}

function plainSections(evidence: Record<string, unknown>): RecordsSection[] {
  const out: RecordsSection[] = [];
  const simple: Array<[RecordsSectionKind, (value: unknown) => EvidenceItem | null]> = [
    ["relationships", relationshipItem],
    ["held_back", heldBackItem],
    ["not_retrieved", notRetrievedItem],
  ];
  for (const [kind, each] of simple) {
    const raw = evidence[kind];
    if (raw === undefined || raw === null) continue;
    const items = all(raw, each);
    if (items === null) out.push({ unreadable: true, kind });
    else if (items.length) {
      out.push({ unreadable: false, kind, state: null, review: null, citation: null, counts: null, items, statements: [], note: null });
    }
    // An empty list adds nothing: it is not a finding.
  }
  return out;
}

function distributionSection(raw: unknown): RecordsSection | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) return { unreadable: true, kind: "distribution" };
  const areas = all(raw.areas, (value) => {
    if (!isRecord(value)) return null;
    // The area as the source wrote it, marker included, is the displayed text.
    return item(str(value.as_written_by_source) ?? str(value.area));
  });
  if (areas === null) return { unreadable: true, kind: "distribution" };
  return section("distribution", raw, { items: areas, counts: shownOf(raw.areas_shown, raw.areas_projected, raw.areas_listed) });
}

function conservationSection(raw: unknown): RecordsSection | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) return { unreadable: true, kind: "conservation" };
  const notes = all(raw.notes, (value) => (isRecord(value) ? item(str(value.note_as_written_by_source)) : null));
  if (notes === null) return { unreadable: true, kind: "conservation" };
  return section("conservation", raw, { items: notes, counts: null });
}

function synonymySection(raw: unknown): RecordsSection | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) return { unreadable: true, kind: "synonymy" };
  const synonyms = all(raw.synonyms, (value) => {
    if (!isRecord(value)) return null;
    const after = value.text_after_name_as_written_by_source;
    if (after !== undefined && after !== null && typeof after !== "string") return null;
    return item(str(value.name_with_authorship), { detail: str(after) });
  });
  if (synonyms === null) return { unreadable: true, kind: "synonymy" };
  return section("synonymy", raw, { items: synonyms, counts: shownOf(raw.synonyms_shown, raw.synonyms_projected, raw.synonyms_listed) });
}

function resolutionSection(raw: unknown): RecordsSection | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) return { unreadable: true, kind: "synonym_resolution" };
  const candidates = all(raw.candidates, (value) => {
    if (!isRecord(value)) return null;
    return item(str(value.synonym_as_written), { detail: str(value.accepted_label) });
  });
  if (candidates === null) return { unreadable: true, kind: "synonym_resolution" };
  // `records_attached: false` is stated as a plain fact; the returned explanation sits beside it.
  return section("synonym_resolution", raw, { items: candidates, counts: null, note: raw.records_attached === false ? "No records attached to this name lookup." : null });
}

function publicationSection(raw: unknown): RecordsSection | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) return { unreadable: true, kind: "publication" };
  const places = all(raw.places, (value) => {
    if (!isRecord(value)) return null;
    const year = value.year;
    if (year !== undefined && year !== null && !(typeof year === "number" && Number.isInteger(year))) return null;
    if (value.withheld_by_privacy_gate !== undefined && typeof value.withheld_by_privacy_gate !== "boolean") return null;
    // Withheld: nothing else of the record is read.
    if (value.withheld_by_privacy_gate === true) return item("Place of publication withheld by the privacy gate.");
    // The citation exactly as the checklist wrote it: no expansion, no link.
    return item(str(value.as_written_by_source), {
      detail: str(value.checklist_row_name),
      note: typeof year === "number" ? `year in parentheses in the citation: ${year}` : "No year is given for this citation (see the statements below).",
    });
  });
  if (places === null) return { unreadable: true, kind: "publication" };
  return section("publication", raw, {
    items: places,
    counts: null,
    note: raw.is_verified_publication === false ? "Not checked against the publication." : "Whether this was checked against the publication is not reported.",
  });
}

/**
 * What one checklist lists for an area name. Never called a flora, a species count or occurrence
 * records. A marker of the source is carried verbatim; the page gives it no meaning. Other
 * writings of the area name are separate statements with their own counts, never merged.
 */
function areaSections(raw: unknown): RecordsSection[] {
  if (raw === undefined || raw === null) return [];
  if (!isRecord(raw)) return [{ unreadable: true, kind: "area_taxa" }];
  const taxa = all(raw.taxa, (value) => {
    if (!isRecord(value)) return null;
    const marker = value.source_marker;
    if (marker !== undefined && marker !== null && typeof marker !== "string") return null;
    const tags = value.source_tags === undefined || value.source_tags === null ? [] : strictStrings(value.source_tags);
    if (tags === null) return null;
    const written = [
      typeof marker === "string" && marker !== "" ? `marker as written by the source: ${marker}` : null,
      tags.length ? `tags as written by the source: ${tags.join(" ")}` : null,
    ].filter((part): part is string => part !== null).join(" \u00b7 ");
    return item(str(value.taxon), { detail: str(value.checklist_row_name), note: written || null });
  });
  const out: RecordsSection[] = [];
  if (taxa === null) out.push({ unreadable: true, kind: "area_taxa" });
  else {
    const notFound = raw.resolution === "NOT_FOUND";
    const withMarker = count(raw.taxa_listed_with_a_marker);
    const note = [
      raw.is_occurrence_record === false ? "Not an occurrence record." : null,
      raw.is_a_flora_or_species_count === false ? "Not a flora or a species count." : null,
      withMarker !== null ? `Taxa listed with a marker: ${withMarker}.` : null,
    ].filter((part): part is string => part !== null).join(" ");
    out.push(section("area_taxa", raw, {
      items: taxa,
      counts: notFound ? "nothing retrieved under this exact name" : shownOf(raw.taxa_shown, null, raw.taxa_listed),
      note: note || null,
    }) ?? { unreadable: true, kind: "area_taxa" });
  }
  const other = raw.other_writings;
  if (other !== undefined && other !== null) {
    const writings = all(other, (value) => {
      if (!isRecord(value)) return null;
      if (value.taxa_listed !== undefined && value.taxa_listed !== null && count(value.taxa_listed) === null) return null;
      const n = count(value.taxa_listed);
      return item(str(value.label), { detail: n === null ? null : `${n} taxa listed by the checklist under this writing` });
    });
    if (writings === null) out.push({ unreadable: true, kind: "area_other_writings" });
    else if (writings.length) out.push({ unreadable: false, kind: "area_other_writings", state: null, review: null, citation: null, counts: null, items: writings, statements: [], note: null });
  }
  return out;
}

const KNOWN_EVIDENCE_KEYS = new Set([
  "distribution", "conservation", "synonymy", "synonym_resolution", "further_synonym_resolutions",
  "mycorrhiza", "host_pathogen", "relationships", "held_back", "not_retrieved", "publication", "area_taxa",
]);

function statementsOnlySection(kind: "mycorrhiza" | "host_pathogen", raw: unknown): RecordsSection | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) return { unreadable: true, kind };
  const statements = raw.statements;
  if (!Array.isArray(statements)) return { unreadable: true, kind };
  const items = all(statements, (value) => {
    if (!isRecord(value)) return null;
    const doi = value.doi;
    if (doi !== undefined && doi !== null && typeof doi !== "string") return null;
    return item(str(value.statement), { doi: str(doi), detail: str(value.partner), state: str(value.class) });
  });
  if (items === null) return { unreadable: true, kind };
  return { unreadable: false, kind, state: null, review: null, citation: null, counts: null, items, statements: [], note: null };
}

function sectionsOf(evidence: unknown, resolutionOnSubject: unknown): RecordsSection[] {
  const out: RecordsSection[] = [];
  const push = (built: RecordsSection | null) => { if (built) out.push(built); };
  if (evidence !== undefined && evidence !== null && !isRecord(evidence)) return [{ unreadable: true, kind: "relationships" }];
  const record = isRecord(evidence) ? evidence : {};
  push(distributionSection(record.distribution));
  push(conservationSection(record.conservation));
  push(synonymySection(record.synonymy));
  push(resolutionSection(record.synonym_resolution ?? resolutionOnSubject));
  const further = record.further_synonym_resolutions;
  if (further !== undefined && further !== null) {
    if (!Array.isArray(further)) out.push({ unreadable: true, kind: "synonym_resolution" });
    else for (const one of further) push(isRecord(one) ? resolutionSection(one) : { unreadable: true, kind: "synonym_resolution" });
  }
  push(publicationSection(record.publication));
  out.push(...areaSections(record.area_taxa));
  push(statementsOnlySection("mycorrhiza", record.mycorrhiza));
  push(statementsOnlySection("host_pathogen", record.host_pathogen));
  out.push(...plainSections(record));
  // Any other part is one this page does not know: say so for that part only.
  for (const [key, value] of Object.entries(record)) {
    if (!KNOWN_EVIDENCE_KEYS.has(key) && value !== undefined && value !== null) out.push({ unreadable: true, kind: "unknown", name: key });
  }
  return out;
}

function subjectOf(raw: unknown, scope: SubjectScope, contextNote: string | null = null): EvidenceSubject {
  if (!isRecord(raw)) return { unreadable: true };
  const sentences = raw.reading === undefined ? [] : strictStrings(raw.reading);
  const also = raw.also_asked_as === undefined || raw.also_asked_as === null ? [] : strictStrings(raw.also_asked_as);
  if (sentences === null || also === null) return { unreadable: true };
  const area = isRecord(raw.area) ? raw.area : null;
  const areaLabel = area ? str(area.label) : null;
  const isArea = areaLabel !== null && str(raw.species) === null;
  const node = raw.kg_node_id ?? (area ? area.kg_node_id : undefined);
  return {
    unreadable: false,
    scope: isArea ? "area" : scope,
    // In a subtaxon entry `species` names the PARENT species and `name` the
    // subtaxon itself, so the subtaxon's own label must come from `name`.
    label: scope === "direct_subtaxon" ? str(raw.name) : str(raw.species) ?? str(raw.name) ?? areaLabel,
    kgNodeId: typeof node === "number" && Number.isInteger(node) ? node : null,
    status: str(raw.status),
    sentences,
    askedAs: str(raw.asked_as),
    alsoAskedAs: also,
    explanation: str(raw.explanation),
    contextNote,
    sections: sectionsOf(raw.evidence, raw.synonym_resolution),
  };
}

function optionalStrings(value: unknown): { list: string[]; unreadable: boolean } {
  if (value === undefined || value === null) return { list: [], unreadable: false };
  const list = strictStrings(value);
  return list === null ? { list: [], unreadable: true } : { list, unreadable: false };
}

/** Read the structured parts of a block whose status and schema `readScientificEvidence` has already accepted. */
export function readStructuredEvidence(raw: unknown): StructuredEvidence | null {
  if (!isRecord(raw)) return null;
  const topics = optionalStrings(raw.topics);
  const notices = optionalStrings(raw.notices);
  const comparisonRaw = raw.comparison;
  let comparison: string[] = [];
  let comparisonUnreadable = false;
  if (comparisonRaw !== undefined && comparisonRaw !== null) {
    const lines = isRecord(comparisonRaw) ? optionalStrings(comparisonRaw.lines) : { list: [], unreadable: true };
    comparison = lines.list;
    comparisonUnreadable = lines.unreadable;
  }

  let subjects: EvidenceSubject[] = [];
  let isSubtaxonTurn = false;
  if (Array.isArray(raw.subjects) && raw.subjects.length) {
    subjects = raw.subjects.map((one) => subjectOf(one, "subject"));
  } else if (raw.subjects !== undefined && raw.subjects !== null && !Array.isArray(raw.subjects)) {
    subjects = [{ unreadable: true }];
  } else if (isRecord(raw.subtaxon)) {
    // A turn about a variety (or other subtaxon): its own records and the
    // species' records are two scopes and stay two separate subjects.
    isSubtaxonTurn = true;
    const note = str(raw.contextual_note);
    subjects = [subjectOf(raw.subtaxon, "direct_subtaxon")];
    if (raw.contextual !== undefined && raw.contextual !== null) subjects.push(subjectOf(raw.contextual, "contextual_parent_species", note));
  } else if (isRecord(raw.evidence)) {
    subjects = [subjectOf(raw, "subject")];
  } else if (isRecord(raw.area_taxa)) {
    // An area name that was not found: the block carries the area part at the top level.
    subjects = [subjectOf({ area: { label: raw.area_asked }, evidence: { area_taxa: raw.area_taxa } }, "subject")];
  }
  return {
    topics: topics.list,
    topicsUnreadable: topics.unreadable,
    subjects,
    comparison,
    comparisonUnreadable,
    notices: notices.list,
    noticesUnreadable: notices.unreadable,
    isSubtaxonTurn,
  };
}
