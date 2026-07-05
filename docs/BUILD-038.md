# BUILD-038 — Living Research Layer

## Objective

Begin turning the public homepage from a collection of components into a guided Orchid Continuum experience that introduces Calyx, reveals audience pathways, and makes institutional infrastructure discoverable without overwhelming visitors.

This build follows BUILD-037/BUILD-036 homepage recovery work and preserves the public-experience philosophy as permanent architecture documentation.

## Implemented

### Public Calyx guide

Added:

- `src/components/orchid/PublicCalyxGuide.tsx`

The new homepage section introduces Calyx as the Orchid Continuum guide rather than an intrusive chatbot. It explains that visitors can explore a complicated living world through orchids, fungi, pollinators, habitats, climate, literature, and conservation evidence.

It includes subtle audience pathways for:

- Growers
- Students
- Researchers
- Conservationists

These are click-free/low-friction invitations, not forced identity collection.

### Homepage integration

Updated:

- `src/components/AppLayout.tsx`

The Calyx guide is inserted after the Knowledge Graph section, where it naturally follows the explanation of connected knowledge.

### Footer institutional pathways

Updated:

- `src/components/orchid/Footer.tsx`

The footer now makes important institutional pathways discoverable:

- Featured Genus
- Knowledge Graph
- Ask Calyx
- Atlas
- Research Center
- Pollinators
- Mycorrhizal fungi
- Climate Comparison
- Orchid University
- Glossary
- Classroom
- Species care
- Partners
- Get involved
- Mission Control
- Governance
- Data sources

Mission Control is now reachable from the public site without being placed in the main navigation or interrupting the public tour.

### Living Homepage Philosophy

Added:

- `docs/architecture/Living_Homepage_Philosophy.md`

This preserves the design philosophy established during the BUILD-037/038 planning conversation:

- The orchid is the hero, not the logo.
- Featured Genus is the organizing principle.
- Species rotate within the Featured Genus.
- Every homepage section answers a different question.
- The knowledge graph should teach what connected knowledge empowers visitors to do.
- The homepage Atlas should use thematic maps, not research-grade GIS controls.
- Pollinators and fungi are organisms/evidence nodes, not labels.
- Calyx is a guide, not a pop-up.
- Mission Control belongs in institutional pathways.

## Scope intentionally deferred

This build does not yet implement:

- A live public Calyx chat panel.
- Backend public Calyx conversation endpoints.
- Pollinator dossier pages.
- Mycorrhizal dossier pages.
- Flowering-through-time animation.
- Featured Genus archive.
- Thematic Atlas controls.
- Hero image/logo hierarchy redesign.

Those should follow in later builds once the narrative structure and public guide are stable.

## Deployment

Frontend deployment required after merge.
