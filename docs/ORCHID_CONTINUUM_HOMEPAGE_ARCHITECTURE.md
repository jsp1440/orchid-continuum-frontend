# Orchid Continuum Homepage Architecture Brief

## Purpose

The Orchid Continuum homepage is not a static gallery. It is a living biodiversity storytelling front page. Its purpose is to make visitors feel awe, curiosity, and confidence that orchids are connected to species, habitats, pollinators, fungi, climate, culture, research, conservation, and evolutionary history.

The homepage should function as a rotating **Genus Story Package** system.

## Core Principle

Everything on the homepage must be tied to the same active genus.

If the active genus is `Catasetum`, then the hero image, 3x3 image grid, atlas map, knowledge graph, relationship spokes, species cards, companion species, pollinator story, fungus story, trait highlights, and archive link must all refer to `Catasetum`.

No homepage section should remain hardcoded to an unrelated genus such as Cattleya when the Genus of the Day is different.

## Genus of the Day

The Genus of the Day should rotate deterministically, ideally every 12 hours using a UTC-based clock. This allows more genera to be featured over time than a once-daily system.

The genus package should be preserved after it expires so users can return to past genera through an archive such as:

- Today's Genus
- Previous Genus
- Past Featured Genera
- Explore the Archive

Each completed genus package becomes part of the Orchid Continuum library forever.

## Genus Story Package

A Genus Story Package is a prebuilt cached data object for one genus. It should not be assembled live in the browser from many separate slow queries.

A package should eventually include:

- genus name
- active start and end time
- hero image rotation sequence
- 3x3 image grid images
- all available species for the genus, or a paginated/batched subset for very large genera
- species dossiers
- captions and narrative text
- occurrence/atlas points
- pollinators
- mycorrhizal fungi
- companion orchids
- companion plants
- habitat and climate notes
- traits
- DNA/phylogenetic notes
- evolutionary context
- economic, medicinal, cultural, artistic, historical, literary, or ethnobotanical notes when available
- conservation notes
- research/literature notes
- knowledge graph nodes and edges
- source/provenance fields

The homepage should fetch the current package through one API call, for example:

```text
/api/genus-package/current
```

The browser should then rotate images locally using already-loaded data instead of repeatedly querying the database.

## Image Behavior

No AI-generated images are allowed.

Images must come from the Orchid Continuum approved image library or trusted backend sources. When no approved photo is available, the site should show the existing placeholder:

```text
IMAGE PENDING · ORCHID CONTINUUM APPROVED LIBRARY
```

The hero image and grid should work together:

1. A species image appears in the 3x3 grid.
2. After a calm interval, such as 2–3 minutes, one image moves into the large hero position.
3. The caption updates with the species story and available metadata.
4. A new species/image enters the grid.
5. The rotation continues through available species/images for the active genus.

Large genera with hundreds or thousands of species should not load every image at once. Load the first story batch quickly, then background-load or paginate additional batches.

## Atlas Behavior

The homepage atlas should be tied to the same active genus.

For a `Catasetum` day, the atlas should show Catasetum occurrence points first. Optional toggles can add:

- companion orchids
- companion plants
- pollinators
- fungi
- habitat overlays
- climate zones
- migration or seasonal movement patterns when available
- overlap zones where interactions occur

The atlas can also become a narrative element by showing how the genus, pollinators, fungi, and companion species overlap geographically.

## Relationship View

The homepage should communicate that no orchid exists alone.

A relationship view or spoke diagram should connect the active genus to:

- species
- pollinators
- fungi
- companion orchids
- companion plants
- habitat
- climate
- conservation
- research
- traits
- DNA/phylogeny
- culture/history

Each spoke should eventually become clickable and lead to deeper detail pages.

## Species View

The species view explains an individual species:

- scientific name
- images
- distribution
- habitat
- flowering season
- pollinator(s)
- fungal associations
- traits
- conservation status
- known interactions
- research notes
- cultural/economic/medicinal/historical notes when available
- source citations/provenance

Species dossiers should be reusable for conservation partners, researchers, educators, and public storytelling.

## Evolution View

The evolution view explains how orchids are related and why subtle differences matter.

It should show:

- closest relatives
- look-alike species
- key distinguishing traits
- shared traits
- divergent traits
- convergent traits
- DNA or phylogenetic context when available
- whether traits appear inherited from a common ancestor or evolved independently

This is central to the Orchid Matrix concept. The Matrix should not only answer “What is this orchid?” It should also help answer “Why is this orchid different?” and “How did this orchid become this way?”

## Matrix Lens

The homepage should eventually include a small Matrix Lens teaser tied to the active genus. The full Matrix interface should live on its own page.

Example homepage block:

```text
Matrix Lens: Catasetum
Key traits: separate male and female flowers, pseudobulbs, seasonal dormancy, fragrance-mediated bee pollination, explosive pollinia release.
Explore this genus in the Orchid Matrix →
```

Future interaction: a user can drag a species image/card into the Matrix interface to compare traits, identify look-alikes, or open a species dossier.

## Coming Soon Behavior

Top navigation links that are not wired yet should not break. They should lead to a polished Coming Soon page or modal.

Suggested text:

```text
Coming Soon

This Orchid Continuum section is being connected to the living database. The page is part of the project roadmap and will open as its data, images, and stories are wired into the Continuum.
```

This sounds intentional and professional without implying failure.

## Backend Design Direction

The frontend should not be hardwired to Render, Supabase, Neon, or Azure directly. It should use one configurable API base URL.

Current short-term host may be Render. Long-term migration may move the system to Microsoft Azure.

Portable architecture:

- React/Vite frontend
- API layer serving genus packages
- Postgres-compatible database
- object storage for images
- scheduled package builder jobs
- cached genus_story_packages
- source/provenance tracking

Future Azure equivalents may include:

- Azure Static Web Apps
- Azure App Service or Azure Functions
- Azure Database for PostgreSQL
- Azure Blob Storage
- Azure AI services for source-grounded narrative synthesis

## Immediate Development Rule

Do not redesign the homepage when debugging data problems.

First audit:

1. Which backend endpoint is the frontend calling?
2. What JSON is returned?
3. How many image records are returned?
4. Are images filtered out by the frontend?
5. Is the backend connected to the correct database?
6. Is the query using the correct approved image table/view?
7. Are the atlas, image grid, hero image, and knowledge graph all using the same active genus?

Only change code after the audit identifies the failing layer.

## Summary

The Orchid Continuum homepage should be a rotating, archived, source-grounded biodiversity story engine. It should reveal orchids through three major lenses:

1. Species View — What is this orchid?
2. Relationship View — What does it interact with?
3. Evolution View — How did it become this way?

The long-term goal is to make visitors say: “I had no idea orchids were connected to so much.”
