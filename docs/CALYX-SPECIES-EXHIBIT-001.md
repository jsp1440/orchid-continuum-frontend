# Calyx Species Exhibit frontend integration

Consume the backend `calyx-species-exhibit-v1` response without inventing scientific content.

Requirements:
- render nine distinct canonical species when available;
- one working representative image and one unique caption per species;
- selected-species narrative changes with selection;
- display binomial separately from authorship;
- show evidence state, confidence, caveats and unavailable domains;
- provenance detail and deep links;
- remove failed images with an accessible fallback;
- reject duplicate taxon IDs, normalized names, media URLs and captions;
- never reuse genus narrative as a species fallback;
- responsive tablet, mobile and desktop layout;
- degraded state explicitly says species evidence is unavailable.

The frontend is a typed consumer and presentation layer only.