# HOMEPAGE-RECOVERY-007 — Contextual Public Calyx

Parent: #163
Issue: #170
Base: #175

## Convergence

- `PublicCalyxGuide` — SUPERSEDE as a long standalone homepage section; replace with a compact optional guide.
- PR #117 — CONVERGE conceptually: Calyx remains directly reachable; this lane adds page-aware context instead of another generic CTA.
- canonical `/api/calyx/speak/*` conversation backend — CONTINUE; no parallel backend created.
- full `CalyxWorkspace` — CONTINUE for the deeper authenticated scientific workspace.
- homepage Featured Genus, relationship, and Atlas contexts — CONTINUE and compose into one bounded page-context payload.

## Context payload

The homepage context includes only verified current UI state:
- active genus/species and taxon id where supplied;
- approved-media metadata where supplied;
- selected Atlas theme, service status, and current interpretation/caveat;
- visible relationship categories with availability, scope, evidence state, provenance, and caveats;
- selected relationship.

Unsupported fields are omitted/null. The payload does not infer scientific relationships.

## Public UI

Calyx is a compact, optional `Ask Calyx` control rather than a long homepage section or automatic popup. Opening it shows the active subject and current page-context summary. `Ask about this view` stores the bounded context in session storage and opens `/homepage-calyx`.

The contextual conversation surface reuses the canonical Calyx conversation client and sends `page_context` with the conversation and each turn. If the current server requires authentication, the UI reports that truthfully and offers Mission Control rather than pretending a public reply succeeded.

## Semantics

- backend failure is not no scientific data;
- no occurrence records is not biological absence;
- unavailable Atlas theme is not negative evidence;
- missing graph relationship is not biological absence;
- genus-level relationship context remains labeled genus-level;
- no citations or references are invented by the frontend.

## Atlas synchronization

`HomepageAtlasProvider` owns the selected homepage Atlas theme and data state. `HomeAtlas` updates it when the visitor changes themes or the occurrence service changes state. Calyx therefore receives the actual current theme rather than a hard-coded default.
