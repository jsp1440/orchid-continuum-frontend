# BUILD-050 - Mission Control Intelligence Intake and Grant Office Integration

## Purpose

BUILD-050 adds a working Intelligence Inbox inside the existing owner-gated Mission Control surface. Incoming Twin Daily Briefs, funding alerts, partnership leads, research notices, dataset/API opportunities, technology alerts, and operational notes can now be pasted, parsed, edited, saved, and routed instead of disappearing in chat or email.

This build does not create a separate Mission Control product. It extends the existing `/mission-control` operations center.

## Architecture

Frontend modules:

- `src/pages/MissionControl.tsx` renders the Intelligence Inbox, Grant Office, Partnership / Research Queue, source archive, daily executive summary, parsed-item editor, and saved-item editor.
- `src/lib/missionControlIntelligence.ts` defines durable record types, deterministic Twin Daily Brief parsing, deadline-priority rules, routing helpers, and Mission Control browser persistence.

MVP persistence:

- Uses the existing frontend persistence pattern available to this Mission Control worktree: `localStorage`.
- Store key: `oc_mission_control_intelligence_v1`.
- Raw source text is preserved in `sourceBriefings`.
- Parsed actionable records are preserved in `intelligenceItems`.

Backend promotion contract:

When the Calyx backend or control-panel database layer is available, use the same fields and route all writes through server-side owner authorization. Do not bypass provenance or write directly from public frontend code.

```sql
create table source_briefings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_date date,
  raw_text text not null,
  created_at timestamptz not null default now()
);

create table intelligence_items (
  id uuid primary key default gen_random_uuid(),
  source_briefing_id uuid references source_briefings(id),
  title text not null,
  summary text not null,
  source text not null,
  source_date date,
  category text[] not null default array['Unknown'],
  priority text not null check (priority in ('critical', 'high', 'medium', 'low')),
  status text not null check (status in ('new', 'triaged', 'active', 'waiting', 'submitted', 'completed', 'declined', 'archived')),
  deadline_date date,
  funding_amount text,
  organization text,
  recommended_action text,
  owner text,
  notes text,
  source_excerpt text not null,
  source_link text,
  eligibility_summary text,
  missing_information text,
  application_progress integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create view grant_opportunities as
select
  id,
  title as opportunity_name,
  organization as funder,
  funding_amount as amount,
  deadline_date as deadline,
  eligibility_summary,
  status,
  priority,
  recommended_action as next_action,
  missing_information,
  application_progress,
  source_link
from intelligence_items
where category && array['Funding', 'Grant'];
```

## User Workflow

1. Open `/mission-control` or `/orchid-continuum-mission-control`.
2. Unlock using the configured owner access code.
3. Paste Twin Daily Brief text into Intelligence Inbox.
4. Click `Parse brief`.
5. Review and edit title, categories, priority, status, deadline, amount, organization, owner, source link, summary, and recommended action.
6. Click `Save items`.
7. Confirm records appear in:
   - Daily Executive Summary
   - Grant Office
   - Partnership / Research Queue
   - Saved Intelligence Records
   - Source archive

## Parser Rules

The parser is deterministic and does not require AI calls. It detects common headings including:

- Funding and Grants
- Research and Publications
- Taxonomy Updates
- Conservation News
- Partnership Opportunities
- Technology and Infrastructure Opportunities

It splits likely blocks, extracts titles, categories, priority words, deadlines, funding amounts, recommended actions, organizations, source links, and preserves an original excerpt. Parsed or inferred values remain editable and should be treated as unverified until reviewed.

Grant deadline priority:

- `critical`: deadline within 7 days
- `high`: deadline within 30 days
- `medium`: deadline within 90 days
- `low`: no deadline or beyond 90 days

## Governance

BUILD-050 follows Orchid Continuum governance:

- Existing constitutional documents are not overwritten.
- Mission Control remains the single owner workspace.
- Raw source text is preserved.
- Parsed/inferred fields remain visibly editable.
- Funding/grant routing is a view over intelligence records, not a duplicate competing system.
- Partnership, dataset, API, technology, and research leads remain actionable records with next actions.

## Phase 2 Email Intake Plan

Future inbound addresses:

- `intake@orchidcontinuum.org`
- `grants@orchidcontinuum.org`
- `research@orchidcontinuum.org`
- `partnerships@orchidcontinuum.org`
- `missioncontrol@orchidcontinuum.org`

Recommended flow:

1. Mail provider webhook receives inbound email.
2. Server verifies recipient, sender, and attachment safety.
3. Server creates a `source_briefings` row with raw email body, subject, sender, recipient, message id, received date, and attachment metadata.
4. Server invokes the same deterministic parser.
5. Optional AI classifier enriches fields only after deterministic fallback has produced records.
6. Server writes `intelligence_items`.
7. Mission Control shows the same Grant Office and Partnership / Research Queue views.

## Future AI Classification Plan

AI classification may add better summaries, eligibility extraction, missing-information detection, and deduplication. AI output must be stored as inferred assistance, preserve source excerpts, and never replace raw source text.

## Future GitHub Brain Synchronization Plan

After server-side persistence exists, the Brain sync should export reviewed intelligence records as provenance-preserving knowledge objects:

- Source briefing
- Parsed opportunity
- Verified decision
- Follow-up task
- Grant submission milestone
- Partnership contact record

Only reviewed records should become authoritative Brain knowledge. New and parsed records remain intake candidates.
