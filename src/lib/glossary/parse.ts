/**
 * Input parsing for the Glossary Preparation Workflow.
 *
 * Two entry points: parseCsv and parseJson. Both return loosely-typed
 * RawGlossaryRecord[] preserving original values so validation can report
 * faithful rejection reasons. Whole-file structural problems (unterminated CSV
 * quotes, invalid JSON) throw GlossaryParseError; individual bad records are
 * left for the validation stage.
 */

import { GlossaryParseError, type RawGlossaryRecord } from './types.ts';

/** Canonical field keys and the header aliases that map onto them. */
const FIELD_ALIASES: Record<keyof Omit<RawGlossaryRecord, 'sourceRecordNumber'>, string[]> = {
  term: ['term', 'name', 'glossary term'],
  definition: ['definition', 'def', 'meaning', 'description'],
  category: ['category', 'type', 'group'],
  synonyms: ['synonyms', 'synonym', 'aka', 'also known as'],
  relatedTerms: ['relatedterms', 'related terms', 'related_terms', 'related', 'see also', 'see_also', 'seealso'],
  source: ['source', 'reference'],
  sourceCitation: ['sourcecitation', 'source citation', 'source_citation', 'citation'],
  notes: ['notes', 'note', 'comment', 'comments', 'remarks'],
};

/** Normalize a header cell for alias matching. */
function headerKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Map a raw header cell to a canonical field key, or null if unrecognized. */
function resolveField(rawHeader: string): keyof RawGlossaryRecord | null {
  const key = headerKey(rawHeader);
  const collapsed = key.replace(/[\s_]+/g, '');
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (key === alias || collapsed === alias.replace(/[\s_]+/g, '')) {
        return field as keyof RawGlossaryRecord;
      }
    }
  }
  return null;
}

/**
 * Parse an RFC 4180-style CSV string into rows of cells. Supports quoted
 * fields, embedded commas/newlines, and doubled quotes ("") as escapes.
 * Throws GlossaryParseError on an unterminated quoted field.
 */
export function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  const text = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
      continue;
    }
    cell += char;
    i += 1;
  }

  if (inQuotes) {
    throw new GlossaryParseError('Malformed CSV: unterminated quoted field');
  }

  // flush the final cell/row unless the input ended with a trailing newline
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Parse CSV text into raw glossary records. */
export function parseCsv(input: string): RawGlossaryRecord[] {
  const rows = parseCsvRows(input).filter((r) => !(r.length === 1 && r[0].trim() === ''));
  if (rows.length === 0) return [];

  const header = rows[0];
  const fieldForColumn = header.map((cell) => resolveField(cell));
  if (!fieldForColumn.some((f) => f === 'term')) {
    throw new GlossaryParseError(
      'Malformed CSV: no recognizable "term" column found in header row',
    );
  }

  const records: RawGlossaryRecord[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r];
    const record: RawGlossaryRecord = { sourceRecordNumber: r };
    for (let c = 0; c < fieldForColumn.length; c += 1) {
      const field = fieldForColumn[c];
      if (!field || field === 'sourceRecordNumber') continue;
      const value = c < cells.length ? cells[c] : '';
      (record as unknown as Record<string, unknown>)[field] = value;
    }
    records.push(record);
  }
  return records;
}

/** Read a canonical field from a loose object, checking aliases too. */
function readField(obj: Record<string, unknown>, field: keyof RawGlossaryRecord): unknown {
  if (field in obj) return obj[field];
  const aliases = FIELD_ALIASES[field as keyof typeof FIELD_ALIASES];
  if (!aliases) return undefined;
  for (const key of Object.keys(obj)) {
    if (resolveField(key) === field) return obj[key];
  }
  return undefined;
}

/**
 * Parse JSON text into raw glossary records. Accepts a top-level array, or an
 * object wrapping the array under "entries", "terms", "glossary", or "records".
 * Throws GlossaryParseError on invalid JSON or an unrecognizable shape.
 */
export function parseJson(input: string): RawGlossaryRecord[] {
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch (error) {
    throw new GlossaryParseError(
      `Malformed JSON: ${error instanceof Error ? error.message : 'unparseable input'}`,
    );
  }

  let list: unknown;
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === 'object') {
    const wrapper = data as Record<string, unknown>;
    list = wrapper.entries ?? wrapper.terms ?? wrapper.glossary ?? wrapper.records;
  }

  if (!Array.isArray(list)) {
    throw new GlossaryParseError(
      'Malformed JSON: expected an array of glossary entries or an object with an "entries"/"terms" array',
    );
  }

  return list.map((item, index) => {
    const sourceRecordNumber = index + 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      // Preserve the position so validation can reject it as malformed.
      return { sourceRecordNumber } as RawGlossaryRecord;
    }
    const obj = item as Record<string, unknown>;
    return {
      term: readField(obj, 'term'),
      definition: readField(obj, 'definition'),
      category: readField(obj, 'category'),
      synonyms: readField(obj, 'synonyms'),
      relatedTerms: readField(obj, 'relatedTerms'),
      source: readField(obj, 'source'),
      sourceCitation: readField(obj, 'sourceCitation'),
      notes: readField(obj, 'notes'),
      sourceRecordNumber,
    };
  });
}

/** Detect input format from a file extension, or null if unknown. */
export function detectFormat(fileName: string): 'csv' | 'json' | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.json')) return 'json';
  return null;
}

/** Parse input by explicit format. */
export function parseInput(input: string, format: 'csv' | 'json'): RawGlossaryRecord[] {
  return format === 'csv' ? parseCsv(input) : parseJson(input);
}
