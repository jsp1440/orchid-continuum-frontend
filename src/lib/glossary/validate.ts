/**
 * Field validation and single-record normalization for the Glossary
 * Preparation Workflow. Duplicate/conflict handling lives in workflow.ts.
 */

import {
  capitalizeDefinition,
  normalizeList,
  normalizeMultiLine,
  normalizeSingleLine,
} from './normalize.ts';
import type {
  NormalizedGlossary,
  ProvenanceMetadata,
  RawGlossaryRecord,
  RejectedGlossaryRecord,
  WorkflowWarning,
} from './types.ts';

/** Preserve an original scalar value as a string (or null if absent/empty). */
function originalScalar(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value === '' ? null : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  return null;
}

/** Coerce a scalar-ish field to a trimmed string, or null if not coercible. */
function coerceString(value: unknown): { value: string | null; wasCoerced: boolean } {
  if (value === undefined || value === null) return { value: null, wasCoerced: false };
  if (typeof value === 'string') return { value, wasCoerced: false };
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { value: String(value), wasCoerced: true };
  }
  return { value: null, wasCoerced: false };
}

export interface ValidationResult {
  ok: boolean;
  glossary?: NormalizedGlossary;
  provenance?: ProvenanceMetadata['originalValues'];
  warnings: WorkflowWarning[];
  rejection?: Omit<RejectedGlossaryRecord, 'sourceRecordNumber'>;
}

/**
 * Validate and normalize a single raw record. Returns either a normalized
 * glossary payload (ok) or a structured rejection. Non-fatal issues surface as
 * warnings. This function does not consider duplicates (see workflow.ts).
 */
export function validateRecord(raw: RawGlossaryRecord): ValidationResult {
  const warnings: WorkflowWarning[] = [];
  const recordNo = raw.sourceRecordNumber;

  const originalValues: ProvenanceMetadata['originalValues'] = {
    term: originalScalar(raw.term),
    definition: originalScalar(raw.definition),
    category: originalScalar(raw.category),
    synonyms: originalScalar(raw.synonyms),
    relatedTerms: originalScalar(raw.relatedTerms),
    source: originalScalar(raw.source),
    sourceCitation: originalScalar(raw.sourceCitation),
    notes: originalScalar(raw.notes),
  };

  // A record with no usable fields at all is malformed.
  const hasAnyField = Object.values(originalValues).some((v) => v !== null);
  if (!hasAnyField) {
    return {
      ok: false,
      warnings,
      rejection: {
        suppliedTerm: null,
        reasonCode: 'malformed_record',
        reason: 'Record contains no recognizable glossary fields',
        recoverableFields: {},
      },
    };
  }

  // Term: required, must be a string-ish value.
  const termCoerced = coerceString(raw.term);
  if (raw.term !== undefined && raw.term !== null && termCoerced.value === null) {
    return {
      ok: false,
      warnings,
      rejection: {
        suppliedTerm: originalScalar(raw.term),
        reasonCode: 'invalid_field_type',
        reason: `Field "term" has an unsupported type (${describeType(raw.term)}); expected text`,
        recoverableFields: buildRecoverable(raw),
      },
    };
  }
  const term = termCoerced.value ? normalizeSingleLine(termCoerced.value) : '';
  if (!term) {
    return {
      ok: false,
      warnings,
      rejection: {
        suppliedTerm: originalScalar(raw.term),
        reasonCode: 'missing_term',
        reason: 'Missing or empty required field "term"',
        recoverableFields: buildRecoverable(raw),
      },
    };
  }
  if (termCoerced.wasCoerced) {
    warnings.push(warn(recordNo, term, 'coerced_term', 'Term value was coerced from a non-text type'));
  }

  // Definition: required, must be string-ish.
  const defCoerced = coerceString(raw.definition);
  if (raw.definition !== undefined && raw.definition !== null && defCoerced.value === null) {
    return {
      ok: false,
      warnings,
      rejection: {
        suppliedTerm: term,
        reasonCode: 'invalid_field_type',
        reason: `Field "definition" has an unsupported type (${describeType(raw.definition)}); expected text`,
        recoverableFields: buildRecoverable(raw, term),
      },
    };
  }
  let definition = defCoerced.value ? normalizeMultiLine(defCoerced.value) : '';
  if (!definition) {
    return {
      ok: false,
      warnings,
      rejection: {
        suppliedTerm: term,
        reasonCode: 'missing_definition',
        reason: 'Missing or empty required field "definition"',
        recoverableFields: buildRecoverable(raw, term),
      },
    };
  }
  if (defCoerced.wasCoerced) {
    warnings.push(warn(recordNo, term, 'coerced_definition', 'Definition value was coerced from a non-text type'));
  }
  const capitalized = capitalizeDefinition(definition);
  if (capitalized.changed) {
    definition = capitalized.value;
    warnings.push(warn(recordNo, term, 'capitalized_definition', 'Capitalized the first letter of the definition'));
  }

  // Optional scalar fields.
  const category = optionalScalar(raw.category, recordNo, term, 'category', warnings);
  const source = optionalScalar(raw.source, recordNo, term, 'source', warnings);
  const sourceCitation = optionalScalar(raw.sourceCitation, recordNo, term, 'sourceCitation', warnings);
  const notesCoerced = coerceString(raw.notes);
  if (notesCoerced.wasCoerced) {
    warnings.push(warn(recordNo, term, 'coerced_notes', 'Notes value was coerced from a non-text type'));
  }
  const notes = notesCoerced.value ? normalizeMultiLine(notesCoerced.value) || null : null;

  // List fields.
  const synonyms = normalizeListField(raw.synonyms, recordNo, term, 'synonyms', warnings);
  const relatedTerms = normalizeListField(raw.relatedTerms, recordNo, term, 'relatedTerms', warnings);

  const glossary: NormalizedGlossary = {
    term,
    definition,
    category,
    synonyms,
    relatedTerms,
    source,
    sourceCitation,
    notes,
  };

  return { ok: true, glossary, provenance: originalValues, warnings };
}

function optionalScalar(
  value: unknown,
  recordNo: number,
  term: string,
  field: string,
  warnings: WorkflowWarning[],
): string | null {
  const coerced = coerceString(value);
  if (value !== undefined && value !== null && coerced.value === null) {
    warnings.push(warn(recordNo, term, `ignored_${field}`, `Ignored field "${field}" with unsupported type (${describeType(value)})`));
    return null;
  }
  if (coerced.wasCoerced) {
    warnings.push(warn(recordNo, term, `coerced_${field}`, `Field "${field}" was coerced from a non-text type`));
  }
  const normalized = coerced.value ? normalizeSingleLine(coerced.value) : '';
  return normalized || null;
}

function normalizeListField(
  value: unknown,
  recordNo: number,
  term: string,
  field: string,
  warnings: WorkflowWarning[],
): string[] {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) {
    if (!value.every((v) => typeof v === 'string' || typeof v === 'number')) {
      warnings.push(warn(recordNo, term, `partial_${field}`, `Some "${field}" entries had unsupported types and were dropped`));
    }
    return normalizeList(value.filter((v) => typeof v === 'string' || typeof v === 'number').map(String));
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return normalizeList(String(value));
  }
  warnings.push(warn(recordNo, term, `ignored_${field}`, `Ignored field "${field}" with unsupported type (${describeType(value)})`));
  return [];
}

function describeType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function warn(sourceRecordNumber: number, term: string | null, code: string, message: string): WorkflowWarning {
  return { sourceRecordNumber, term, code, message };
}

/** Salvage whatever normalized fields we can for a rejection's repair hints. */
function buildRecoverable(
  raw: RawGlossaryRecord,
  term?: string,
): RejectedGlossaryRecord['recoverableFields'] {
  const out: RejectedGlossaryRecord['recoverableFields'] = {};
  if (term) out.term = term;
  const def = coerceString(raw.definition);
  if (def.value) {
    const normalized = normalizeMultiLine(def.value);
    if (normalized) out.definition = normalized;
  }
  const cat = coerceString(raw.category);
  if (cat.value) {
    const normalized = normalizeSingleLine(cat.value);
    if (normalized) out.category = normalized;
  }
  return out;
}
