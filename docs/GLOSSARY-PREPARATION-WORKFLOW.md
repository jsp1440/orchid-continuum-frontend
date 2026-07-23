# Glossary Preparation Workflow (OC-AUTO-001)

The first reusable automation workflow for Orchid Continuum. It turns raw
glossary entries (CSV or JSON) into a **reviewable, deterministic publication
package**: normalized JSON, one Markdown review page per accepted term (each with
a generated scientific illustration prompt), a machine-readable rejection report,
and **proposed** Knowledge Graph publication metadata.

> **Safety boundary.** This workflow performs **no** network calls, **no**
> external AI/illustration calls, **no** database access, and **no** Knowledge
> Graph writes. It only reads the input file you give it and writes files under
> the output directory you choose. It requires no production credentials and no
> production database.

## Purpose

Prepare glossary content for human review before anything is published. The
workflow normalizes and validates entries, flags duplicates and conflicts,
generates a deterministic illustration prompt per term, and proposes (but never
executes) Knowledge Graph nodes and relationships.

## Architecture

The workflow lives in `src/lib/glossary/` and follows this repository's existing
conventions (TypeScript modules under `src/lib`, colocated Vitest `*.test.ts`
tests, runnable scripts under `scripts/`). It has **zero runtime dependency** on
the frontend bundle: the only frontend reference is a *type-only* import of the
Knowledge Graph domain vocabulary, mirrored locally and guarded against drift by
a test.

| Module | Responsibility |
| --- | --- |
| `types.ts` | Shared types, `GLOSSARY_WORKFLOW_VERSION`, `GlossaryParseError`. |
| `normalize.ts` | Pure text/field normalization (whitespace, Unicode NFC, line endings, capitalization, list fields, slugs). |
| `parse.ts` | RFC-4180-style CSV parser and JSON parser → loose `RawGlossaryRecord[]`. |
| `validate.ts` | Per-record validation and single-record normalization. |
| `illustrationPrompt.ts` | Deterministic, template-based illustration prompt generation. |
| `knowledgeGraph.ts` | Proposed KG node + relationship metadata (proposals only). |
| `workflow.ts` | Orchestration, stable IDs, duplicate/conflict handling. Pure & deterministic. |
| `render.ts` | Markdown review pages + machine-readable rejection report. |
| `run.ts` | Filesystem runner: read input, run core, write output package. |
| `index.ts` | Public API barrel. |

The **core** (`runGlossaryWorkflow`) is a pure function: identical input always
produces a byte-identical result with no timestamps or elapsed times. Runtime
metadata (generated-at, elapsed-ms) is added only by the writer/CLI layer, in a
clearly separated `runtime` block, so the reviewable artifacts stay deterministic.

## Supported inputs

- **CSV** — a header row plus one record per row. Quoted fields, embedded commas
  and newlines, and doubled-quote (`""`) escaping are supported.
- **JSON** — a top-level array, or an object wrapping the array under `entries`,
  `terms`, `glossary`, or `records`.

### Fields

| Field | Required | CSV/JSON aliases accepted |
| --- | --- | --- |
| `term` | **Yes** | `term`, `name`, `glossary term` |
| `definition` | **Yes** | `definition`, `def`, `meaning`, `description` |
| `category` | No | `category`, `type`, `group` |
| `synonyms` | No | `synonyms`, `synonym`, `aka`, `also known as` |
| `relatedTerms` | No | `related terms`, `related_terms`, `related`, `see also` |
| `source` | No | `source`, `reference` |
| `sourceCitation` | No | `source citation`, `source_citation`, `citation` |
| `notes` | No | `notes`, `note`, `comment`, `remarks` |

Only **term** and **definition** are required for a valid publication candidate.
List fields accept either a delimited string (`,` `;` `|` or newline) or a JSON
array.

## Execution command

Uses Node's native TypeScript type-stripping (Node ≥ 22.6 — this repo is verified
on Node 22). No extra tooling required.

```bash
# via npm script
npm run glossary:prepare -- --input examples/glossary/sample-glossary.csv --out ./glossary-output

# or directly
node scripts/prepare-glossary.mjs --input examples/glossary/sample-glossary.json --out ./glossary-output
```

### Options

| Option | Description |
| --- | --- |
| `--input`, `-i <path>` | Input glossary file (`.csv` or `.json`). **Required.** |
| `--out`, `-o <dir>` | Output directory. Default: `./glossary-output`. |
| `--format <csv\|json>` | Force the input format (otherwise inferred from the extension). |
| `--dry-run` | Validation-only: run everything and report, but write no files. |
| `--quiet` | Print only the final JSON summary line. |
| `--help`, `-h` | Show usage. |

**Exit codes:** `0` success · `1` unrecoverable execution/input failure (e.g.
malformed CSV/JSON, undeterminable format) · `2` bad CLI usage.

## Output structure

```
<out>/
  glossary-normalized.json     # accepted + rejected + warnings + stats + source meta + workflow version
  rejections.json              # machine-readable rejection report
  processing-summary.json      # stats + output paths + runtime (generatedAt, elapsedMs)
  terms/
    <slug>.md                  # one reviewable Markdown page per accepted term
```

Each term Markdown page contains: term, definition, category, synonyms, related
terms, source & citation, the generated illustration prompt, proposed Knowledge
Graph metadata, warnings, and the review status. Everything except the
`runtime` block of `processing-summary.json` is deterministic.

## Validation behavior

Each record is validated independently. A record is **rejected** (with a
specific `reasonCode`) when it has:

- `missing_term` — empty/blank term.
- `missing_definition` — empty/blank definition.
- `malformed_record` — no recognizable glossary fields at all.
- `invalid_field_type` — `term`/`definition` supplied as an unsupported type
  (e.g. an object or array).
- `conflicting_duplicate_definition` — see below.

Non-fatal issues (coerced numeric values, capitalized definition, dropped
list entries, ignored optional fields) are recorded as **warnings** and do not
block acceptance. Whole-file structural problems (unterminated CSV quote,
invalid JSON) raise `GlossaryParseError` and cause a non-zero exit.

Normalization applied to accepted records: trim + collapse internal whitespace,
Unicode NFC, unified line endings, sentence-initial capitalization of the
definition (interior scientific casing preserved), and list fields split,
trimmed, de-duplicated case-insensitively (first spelling kept), and sorted.

## Duplicate handling

Duplicates are detected case-insensitively on the normalized term.

- **Identical definition** → the first occurrence is kept and accepted; the
  duplicate is dropped with a `duplicate_identical` warning.
- **Conflicting definition** → the first occurrence is kept; the conflicting
  record is **rejected** with `conflicting_duplicate_definition` and counted in
  `conflictingDuplicates`.

## Knowledge Graph preparation (proposals only)

For each accepted term the workflow prepares a **proposed** node and proposed
relationships. Nothing is written to the graph.

- **Node** — `{ id: "glossary:<slug>", nodeType: "glossary_term", label,
  summary, category, domains, publicationStatus: "proposed" }`.
- **Relationships** — `has_synonym`, `related_to`, `in_category`, and
  `sourced_from` edges, each with `publicationStatus: "proposed"` and
  deterministic target ids.

### Documented compatibility gap

The frontend Knowledge Graph model (`src/types/knowledgeObject.ts`) exposes
`KnowledgeObject.objectType` as a fixed enum with **no** "glossary term"
member. Widening that enum would be an out-of-scope schema change, so proposed
nodes instead carry `nodeType: "glossary_term"` and `knowledgeObjectType: null`,
and map onto the existing KG **domain** vocabulary
(`KNOWLEDGE_GRAPH_DOMAINS` from `src/lib/knowledgeGraph.ts`, mirrored locally and
drift-guarded by a test). The emitted records are a clean intermediate
publication format that a later, separate publish step can consume.

## Safety boundaries

- No network, database, external AI, illustration API, deployment, GitHub,
  scheduled, or migration actions.
- No production credentials or production database required.
- Side effects are limited to reading the input file and writing under the
  output directory.
- Determinism: reviewable artifacts are byte-stable across runs; only the
  `runtime` block of the summary varies.

## Extending later

**Figure Labs integration.** The illustration prompt is generated but never
submitted. A later, separate step can read `illustrationPrompt.prompt` from each
accepted entry (or Markdown page) and submit it to Figure Labs or another
illustration system, then attach returned image references back to the record.
Keep submission in its own module so this preparation stage stays offline and
deterministic.

**Publishing approved records to the Knowledge Graph.** After human review, an
approved-records publisher can consume the proposed node/relationship records and
call the real KG repositories/interfaces to create nodes and edges. Resolve the
documented `objectType` gap there (either add a KG type or map to an existing
one) — this workflow deliberately leaves that decision to the publish step.

**Reusable pattern for future workflows.** This establishes a minimal, clean
pattern — *parse → normalize → validate → generate → prepare-proposals →
render → write*, deterministic core with runtime metadata isolated to the writer.
The same shape can back:

- **Literature extraction** — parse references, propose `literature` KG nodes and
  `cited_in` edges.
- **Zenodo harvesting** — normalize dataset metadata, propose dataset nodes.
- **World Plants synchronization** — normalize taxonomic names, propose
  `taxonomy` nodes and reconciliation edges.
- **Conservatory workflows** — normalize exhibit/entry records into reviewable
  packages.

Reuse `normalize.ts`, the parse/validate/rejection scaffolding, and the
proposal/rendering split; add a workflow-specific `workflow.ts` and prompt/proposal
builders. Do **not** grow a generalized workflow engine before two or three
concrete workflows justify the shared abstraction.

## Tests

```bash
npx vitest run src/lib/glossary   # focused workflow tests
npm test                          # full backend suite
```

Tests cover: valid CSV/JSON, missing/blank required fields, malformed CSV/JSON,
invalid field types, duplicate (identical and conflicting) handling, Unicode
botanical terminology, synonym/related-term normalization, deterministic prompt
and normalized output, rejection reporting, output-file creation, validation-only
mode, and confirmation that no network/`fetch` and no production database are
required. All fixtures are local strings or temporary files.
