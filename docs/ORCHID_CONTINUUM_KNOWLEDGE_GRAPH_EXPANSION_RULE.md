# Orchid Continuum Knowledge Graph Expansion Rule

## Core Idea

The Orchid Continuum knowledge graph must not be limited to orchid-centered relationships.

The first public view may place an orchid genus at the center of a spoke diagram, but the true graph is ecological, evolutionary, cultural, climatic, and relational. Orchids are one entry point into the graph, not the only center of the graph.

## Rule

When modeling a relationship, ask not only:

```text
How does this factor affect the orchid?
```

also ask:

```text
What affects that factor?
What else does that factor affect?
How does this relationship change across space, time, climate, habitat, season, evolution, and culture?
```

## Example

A simple orchid-centered graph might say:

```text
Catasetum → pollinated by → euglossine bees
Catasetum → occurs in → humid tropical forest
Catasetum → associated with → mycorrhizal fungi
```

A fuller Orchid Continuum graph should also allow:

```text
euglossine bees → affected by → climate
euglossine bees → collect → fragrance compounds
euglossine bees → interact with → Gongora / Stanhopea / Coryanthes / other orchids
fragrance compounds → vary with → flowering season / habitat / species lineage
mycorrhizal fungi → affected by → soil moisture / substrate / forest disturbance
habitat → shaped by → rainfall / elevation / canopy / land use
companion orchids → share → pollinators / habitat / phenology / fungi
climate change → shifts → pollinator timing / flowering windows / habitat range
```

## Why This Matters

No orchid exists alone, but neither do pollinators, fungi, climates, companion plants, or habitats.

The Continuum should reveal the larger web:

- orchids connect to pollinators
- pollinators connect to climate, fragrance chemistry, migration, nesting, and other plants
- fungi connect to substrate, soil chemistry, moisture, forest structure, and orchid germination
- habitats connect to geology, rainfall, altitude, disturbance, and land use
- traits connect to DNA, evolution, convergence, pollination strategy, and identification
- human history connects to economics, medicine, culture, trade, art, literature, and conservation

## Design Implication

The homepage spoke diagram may begin with a genus at the center, but each spoke should eventually become a doorway into a deeper subgraph.

Example spokes:

- Species
- Pollinators
- Mycorrhizae
- Companion Species
- Habitat
- Climate
- Traits
- DNA / Phylogeny
- Conservation
- Culture / History
- Literature / Research

Each spoke should be expandable, clickable, and able to reveal its own relationships.

## Data Model Implication

Avoid tables that only support one-way orchid relationships. Prefer a general relationship model that can store subject-predicate-object statements with provenance.

Minimum relationship concept:

```text
subject_type
subject_id
predicate
object_type
object_id
relationship_context
location
season
evidence_type
source_id
confidence
notes
created_at
updated_at
```

This supports:

```text
orchid → pollinated_by → bee
bee → affected_by → temperature
fungus → associated_with → orchid_seedling
habitat → contains → companion_species
climate_zone → overlaps_with → genus_distribution
trait → distinguishes → species_pair
paper → supports → relationship
```

## Storytelling Implication

The Orchid Continuum should not only answer:

```text
What is this orchid?
```

It should also answer:

```text
What is this orchid connected to?
What are those connected to?
What changes when one part of the system changes?
How do subtle traits reveal evolutionary history?
How do ecological relationships shape orchid diversity?
```

## Implementation Priority

This does not need to be fully implemented on the first homepage release.

However, backend schemas, API designs, Genus Story Packages, Atlas layers, and Matrix planning should leave room for multi-hop relationships from the beginning.

Do not design the graph as a static list of orchid facts.
Design it as a living network of relationships.
