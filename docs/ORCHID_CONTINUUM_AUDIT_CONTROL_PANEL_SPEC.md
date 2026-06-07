# Orchid Continuum Audit & Control Panel Specification

## Purpose

The Orchid Continuum is a large, changing biodiversity platform. It cannot be managed safely by guessing. Every build, deployment, data backfill, taxonomy update, image pipeline change, or integration must begin and end with an audit.

This document defines the audit-first operating model for the Orchid Continuum Admin Center.

## Constitutional Rule

No build proceeds without an audit.

Every major action must have:

1. **Pre-build audit** — What exists now? What is connected? What is failing? What tables, endpoints, keys, and deployments are involved?
2. **Change log** — What exactly was changed? Which files, routes, tables, services, or environment variables were touched?
3. **Post-build audit** — Did the intended change work? Did anything drift, break, disappear, duplicate, or point to the wrong backend?

For complex builds, audits may need three layers:

- frontend audit
- backend/API audit
- database/storage audit

If an AI assistant cannot audit, it must say so clearly instead of guessing.

## Why This Exists

The Orchid Continuum has many moving parts:

- React/Vite frontend
- Render backend services
- Supabase/Famous database services
- Neon/PostgreSQL data layers
- Mapbox/atlas layers
- Google Colab scripts
- Julius AI notebooks
- OREP relationship extraction
- taxonomy update workflows
- mycorrhizal data layers
- image harvesters and media caches
- Azure migration target

Without a push-button audit system, the project becomes dependent on expensive AI rebuilds, incomplete memory, and guesses about table names, routes, hosts, and deployment state.

The Admin Center exists to make the system know what state it is in.

## Core Principle

The audit system must report the current state of the platform from actual sources whenever possible.

It should not merely generate a narrative from memory. It should inspect:

- database schemas
- table counts
- missing columns
- endpoint availability
- backend routes
- storage bucket status
- image counts
- taxonomy version
- failed jobs
- stale caches
- deployment targets
- environment variables present/missing
- pending backfills
- integration drift

AI may summarize the audit, but the raw evidence should come from live checks.

## Audit Types

### 1. Full System Audit

Reports the state of the entire Orchid Continuum platform:

- services
- repos
- deployments
- databases
- schemas
- pipelines
- image systems
- atlas layers
- domain/DNS state
- active blockers
- next actions

### 2. Frontend Audit

Checks:

- current GitHub repo and branch
- build status
- npm scripts
- environment variables expected by the frontend
- hardcoded backend hosts
- broken routes
- navigation links
- Coming Soon protection
- whether homepage sections use the same active genus
- whether direct external calls are present where backend-only rules apply

### 3. Backend/API Audit

Checks:

- live backend host
- health endpoint
- route registry
- `/images/genus/{genus}` endpoint
- `/atlas/occurrences` endpoint
- `/api/species/search` endpoint
- `/api/species/{id}` endpoint
- mycorrhizal endpoints
- cache endpoints
- route response shape
- timeouts
- CORS
- cold-start behavior

### 4. Database Schema Audit

Checks:

- schemas present
- tables present
- row counts
- column names
- indexes
- foreign keys
- materialized views
- stale or empty tables
- duplicate tables
- broken references
- missing image references
- data drift between staging and production

### 5. Taxonomy Audit

Checks:

- current taxonomy source/version
- Dr. Hassler WorldPlants update status
- accepted names
- synonyms
- unresolved names
- duplicates
- genus counts
- species counts
- taxonomic conflicts
- pending diff import
- tables affected by taxonomy updates

The taxonomy pipeline should support easy ingestion of new files from Dr. Hassler, producing:

- pre-import diff
- affected taxa report
- synonym change report
- accepted-name changes
- downstream impact report
- post-import verification

### 6. Image Pipeline Audit

Checks:

- total image records
- approved image counts
- image counts per genus
- image counts per species
- missing image URLs
- broken image URLs
- storage bucket status
- cache status
- whether homepage image endpoints return sufficient records
- whether placeholders are appearing because images are genuinely absent or because queries are wrong

### 7. Atlas Audit

Checks:

- occurrence table status
- coordinate completeness
- NULL coordinate percentages
- valid/invalid coordinate counts
- genus coverage
- species coverage
- Mapbox layer status
- Leaflet/OpenStreetMap status
- homepage atlas filter behavior
- whether atlas genus matches the active Genus of the Day

### 8. OREP Audit

Checks:

- literature corpus status
- paper count
- extracted relationships
- relationship types
- novel relationships
- staging tables
- unresolved concepts
- figure queue candidates
- glossary integration candidates
- provenance completeness

### 9. Mycorrhizal Layer Audit

Checks:

- mycorrhizal tables
- known associations
- species profiles
- fungal taxa
- source citations
- relationship completeness
- links to species dossiers
- links to Genus Story Packages

### 10. Grant / Partner Readiness Audit

Checks:

- current public demo URL
- working screenshots
- current architecture documents
- fiscal sponsor references
- partner letters/status
- grant-specific narrative assets
- budget readiness
- risk statements
- technical maturity claims
- what can honestly be shown now

## Admin Center Modules

The Admin Center should include:

- Mission Control
- Database Audit
- Pipeline Control
- Taxonomy Manager
- Atlas & Mapping
- OREP / Figure Labs
- Research Engine
- Species Dossier
- Relationship Graph
- Grant Narrative Engine
- Partner Correspondence
- Taxonomy Diff
- Conservation Ranker
- Site Manager
- AI & M365 / Azure Vision

These modules match the existing OC Admin Center v2 concept and should gradually move from mock/advisory mode to live audit mode.

## Push-Button Audit Behavior

A push-button audit should produce:

1. Timestamp
2. Environment audited
3. Data sources checked
4. Raw result summary
5. Findings
6. Blockers
7. Drift detected
8. Recommended next actions
9. Confidence level
10. Links to evidence/logs when available

Example output format:

```text
AUDIT TYPE: Image Pipeline Audit
DATE: 2026-06-06
ENVIRONMENT: Production / Render / GitHub main

CHECKS RUN:
- Backend health
- /images/genus/Catasetum
- /images/genus/Vanilla
- Approved image table count
- Broken image URLs
- Homepage backend constants

FINDINGS:
- Frontend points image calls to canonical backend.
- Backend route exists / does not exist.
- Catasetum returns N records.
- Vanilla returns N records.

BLOCKERS:
- Main backend missing /images/genus route.

NEXT ACTIONS:
1. Add route to backend.
2. Verify database query.
3. Re-run audit.
```

## Self-Audit / Nightly Review Concept

The system should eventually run a scheduled nightly self-audit.

Each night it should:

- check service health
- check failed jobs
- check stale caches
- check pending taxonomy updates
- check image/genus coverage
- check incomplete backfills
- check broken endpoints
- check deployment drift
- produce a next-actions report

The nightly report should not automatically make dangerous changes. It should identify what needs attention and prepare safe, reviewable actions.

## Self-Repair Boundaries

The system may eventually auto-repair low-risk issues, such as:

- refreshing stale cache tables
- retrying failed harmless fetches
- flagging broken image URLs
- regenerating non-public audit summaries
- rebuilding static data packages

The system should not automatically:

- rewrite taxonomy
- delete records
- overwrite production tables
- change accepted names
- deploy new code
- publish AI-generated scientific claims
- replace provenance-backed data

Human approval is required for high-impact actions.

## AI Role

AI should sit in the middle of the system as an interpreter and advisor, not as an unchecked actor.

AI can:

- summarize audit results
- explain blockers
- propose next steps
- draft grant language
- generate figure prompts
- flag inconsistencies
- help triage pipeline failures

AI must not:

- guess table names
- pretend to have inspected systems it cannot access
- fabricate successful checks
- silently change architecture
- bypass provenance rules
- treat placeholders as real data

## Immediate Implementation Priorities

1. Keep this audit specification in the GitHub repo.
2. Add a backend route registry endpoint if one does not exist.
3. Add a lightweight `/health/full` endpoint that reports service, database, image, and atlas status.
4. Build an Image Pipeline Audit for the homepage image problem.
5. Build a Frontend Config Audit to detect hardcoded backend drift.
6. Build a Taxonomy Audit that can accept new Dr. Hassler files.
7. Build a Nightly Audit Report system before attempting self-repair.

## Summary

The Orchid Continuum is too complex to manage by memory or guesswork. The Admin Center must become the system’s mission control: a place where Jeffery can press a button and know what is real, what is connected, what is broken, and what should happen next.

Audit first. Build second. Verify third.
