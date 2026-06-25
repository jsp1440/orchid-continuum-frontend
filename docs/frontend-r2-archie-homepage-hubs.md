# FRONTEND-R2 — Archie Homepage Hubs

## Purpose

Archie is the homepage architecture and hub-wiring pass for the Orchid Continuum frontend.

The goal is to stop treating the homepage as a stack of impressive but separate sections and instead make it read as one coherent story:

> The Orchid Continuum is a living knowledge system for orchids, organized into four connected hubs.

## Four public hubs

### 1. The Orchid Observatory

**Role:** Explore the living record.

Connects:

- Atlas
- Species search
- Genus pages
- Living image gallery
- Occurrence geography
- biodiversity signals

Primary route: `/atlas`

### 2. The Orchid Conservatory

**Role:** Connect collections to conservation.

Connects:

- personal collection
- cultivation records
- bloom records
- OASIS care intelligence
- propagation and recovery workflows

Primary route: `/collection`

### 3. The Orchid Science Station

**Role:** Turn data into orchid science.

Connects:

- Research Station
- Matrix systems
- literature extraction
- knowledge graph
- relationship explorer
- taxonomy, traits, ecology, and conservation analysis

Primary route: `/research`

### 4. Orchid Continuum University

**Role:** Teach the system as it grows.

Connects:

- education page
- deception lab
- glossary
- classroom
- guided graph-based lessons

Primary route: `/education`

## Homepage story flow

The homepage should read in this order:

1. **Hero** — one living knowledge system for orchids.
2. **Four Hubs** — Observatory, Conservatory, Science Station, University.
3. **Today’s Genus** — a daily orchid story touching all hubs.
4. **Atlas + Knowledge Graph** — geography and relationships become visible.
5. **Research Station** — analytical engine behind the public story.
6. **Join** — growers, researchers, students, and conservation partners can participate.

## Build rules

- Do not invent new systems.
- Do not add unrelated new homepage sections.
- Use existing builds and routes wherever possible.
- Label incomplete surfaces honestly as preview, needs wiring, or coming soon.
- Avoid empty “No data yet” panels where narrative explanation would be better.
- Keep public navigation simple.
- Treat the homepage as the conductor for existing modules.

## Implementation sequence

### R2-A — Hub map

Add a shared source of truth for homepage hubs.

File:

- `src/lib/homepageHubMap.ts`

### R2-B — Hub section component

Create a homepage section that renders the four hubs from the hub map.

Potential file:

- `src/components/orchid/HomepageHubs.tsx`

### R2-C — Homepage insertion

Insert the hub section after the hero and before Genus of the Day / knowledge surfaces.

Likely file:

- `src/components/AppLayout.tsx`

### R2-D — Narrative cleanup

Review homepage section order and copy so the page flows as a story rather than a module inventory.

### R2-E — Wiring pass

For each hub card, verify that the linked route exists and that it is either live, preview, needs wiring, or coming soon.

## Success criteria

A first-time visitor should understand within 30 seconds:

1. What the Orchid Continuum is.
2. Why it matters.
3. The four major ways to enter it.
4. Which parts are live now.
5. Which parts are still being connected.
