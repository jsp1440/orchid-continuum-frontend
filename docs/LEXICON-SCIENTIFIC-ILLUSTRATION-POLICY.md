# Lexicon scientific illustration policy

The frontend presents the governing Orchid Continuum scientific-illustration policy implemented by the canonical backend/Brain documentation.

Core UI requirements:

- prefer authentic orchid and specimen imagery when it adequately communicates the concept;
- distinguish documentary images from explanatory or synthetic figures;
- clearly label AI-assisted scientific illustrations;
- expose provenance, evidence class, limitations, and validation state where available;
- require literature-grounded specifications for process and mechanism diagrams;
- preserve the validation progression: Draft → Evidence-linked → Machine-checked → Expert-reviewed → Validated;
- never infer that a missing scientific review has occurred.

The user-facing explanation is implemented in `src/components/lexicon/ValidationView.tsx`.

The canonical methodology and FAQ live in the backend Brain as `docs/brain/LEXICON-SCIENTIFIC-ILLUSTRATION-STANDARD.md`.
