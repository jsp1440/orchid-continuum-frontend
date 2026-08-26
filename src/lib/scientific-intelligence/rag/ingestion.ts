/**
 * Publication ingestion and change detection.
 *
 * A newly discovered or updated publication becomes a canonical source record
 * with a stable content hash. Re-ingesting identical content is a no-op
 * (deterministic handling of unchanged documents); a materially changed body
 * produces a new document version and marks the source for reprocessing. The
 * source record is never lost on failure.
 *
 * Parsing splits the body into locatable paragraphs and classifies each
 * paragraph's sensitivity. Passages that expose precise wild locality are
 * classified `protected_locality` and are excluded from the extractable text,
 * so protected locality is fail-closed from the very first stage.
 */

import { SensitivityClass, isProtectedLocality } from './contracts'
import { contentHash } from './hash'
import type { RawPublication } from './fixtures/phalaenopsis'

export const PARSER_VERSION = 'oc-paragraph-parser@1.0.0'

export type SourceRecord = {
  sourceId: string
  doi: string
  title: string
  authors: string
  year: number
  journal: string
  license: string
  contentHash: string
  version: number
  ingestedAt: string
  /** Set when a prior version existed and the content changed. */
  supersedesVersion: number | null
}

export type ParsedParagraph = {
  index: number
  text: string
  /** Character offset of this paragraph's text within the full document body. */
  span: { start: number; end: number }
  sensitivity: SensitivityClass
  /** Reason a paragraph was withheld, when it was. */
  withheldReason: string | null
}

export type ParsedDocument = {
  documentId: string
  sourceId: string
  version: number
  contentHash: string
  /** The full body as ingested (offsets are relative to this). */
  fullText: string
  paragraphs: ParsedParagraph[]
  /** Concatenation of only the non-protected paragraphs, for extraction. */
  extractableText: string
  parserVersion: string
  parsedAt: string
}

export type IngestionOutcome = {
  source: SourceRecord
  changed: boolean
  reason: 'new' | 'unchanged' | 'content_changed'
}

/**
 * A precise-locality detector. Matches decimal-degree coordinate pairs, which
 * are the classic protected-locality leak in botanical literature. Conservative
 * by design: it errs toward withholding.
 */
export function isProtectedLocalityText(text: string): boolean {
  return isProtectedLocality(text)
}

/**
 * Establish or update the canonical source record and detect change.
 * `prior` is the previously stored source record for the same sourceId, if any.
 */
export function ingestPublication(
  publication: RawPublication,
  prior: SourceRecord | null,
  now: () => string = () => new Date().toISOString(),
): IngestionOutcome {
  const hash = contentHash({
    doi: publication.doi,
    title: publication.title,
    body: publication.body,
  })

  if (prior && prior.contentHash === hash) {
    return { source: prior, changed: false, reason: 'unchanged' }
  }

  const source: SourceRecord = {
    sourceId: publication.sourceId,
    doi: publication.doi,
    title: publication.title,
    authors: publication.authors,
    year: publication.year,
    journal: publication.journal,
    license: publication.license,
    contentHash: hash,
    version: prior ? prior.version + 1 : publication.version,
    ingestedAt: now(),
    supersedesVersion: prior ? prior.version : null,
  }

  return { source, changed: true, reason: prior ? 'content_changed' : 'new' }
}

/** Parse a publication body into locatable, sensitivity-classified paragraphs. */
export function parseDocument(
  publication: RawPublication,
  source: SourceRecord,
  now: () => string = () => new Date().toISOString(),
): ParsedDocument {
  const fullText = publication.body
  const paragraphs: ParsedParagraph[] = []

  let cursor = 0
  const rawParagraphs = fullText.split('\n')
  for (let i = 0; i < rawParagraphs.length; i += 1) {
    const text = rawParagraphs[i]
    const start = fullText.indexOf(text, cursor)
    const span = { start, end: start + text.length }
    cursor = span.end
    const protectedLocality = isProtectedLocalityText(text)
    paragraphs.push({
      index: i,
      text,
      span,
      sensitivity: protectedLocality ? 'protected_locality' : 'public',
      withheldReason: protectedLocality ? 'precise wild locality withheld for conservation' : null,
    })
  }

  const extractableText = paragraphs
    .filter((paragraph) => paragraph.sensitivity !== 'protected_locality')
    .map((paragraph) => paragraph.text)
    .join('\n')

  return {
    documentId: `${source.sourceId}#v${source.version}`,
    sourceId: source.sourceId,
    version: source.version,
    contentHash: source.contentHash,
    fullText,
    paragraphs,
    extractableText,
    parserVersion: PARSER_VERSION,
    parsedAt: now(),
  }
}
