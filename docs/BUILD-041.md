# BUILD-041 — Calyx Mission Control: AI Orchestration

## Objective

Create the first visible Mission Control workspace for coordinating external AI systems so Jeff is no longer the manual copy/paste router between ChatGPT, Claude, Perplexity, Kimi, Codex, GitHub, and the Orchid Continuum Brain.

This build is a frontend-first orchestration scaffold. It does not yet automate external AI API calls. It creates the interface, protocol, role model, and task queue language needed before safe automation.

## Implemented

### AI Orchestration workspace

Added:

- `src/pages/AIOrchestration.tsx`

The workspace defines agent roles:

- Claude — implementation engineer
- Perplexity — research analyst
- Kimi — independent reviewer
- ChatGPT / Calyx — chief architect and orchestrator

It also includes:

- file-output standard
- downloadable AI Collaboration Protocol Markdown generated in-browser
- copy-to-clipboard protocol button
- current orchestration queue
- constitutional alignment note
- next automation step note

### Routes

Updated:

- `src/App.tsx`

New routes:

- `/mission-control/ai-orchestration`
- `/ai-orchestration`

## Scope intentionally deferred

This build does not yet implement:

- backend `ai_tasks` table
- backend `ai_outputs` table
- persistent Brain storage for AI outputs
- automatic prompt dispatch to external model APIs
- file ingestion from Claude/Kimi/Perplexity outputs
- automatic tracker updates
- autonomous PR review/merge/deploy decisions

Those are the next backend-focused automation steps.

## Deployment

Frontend deployment required.
Backend deployment not required.
