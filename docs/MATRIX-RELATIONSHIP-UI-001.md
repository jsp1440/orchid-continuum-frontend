# MATRIX-RELATIONSHIP-UI-001

## Completed work

- Replaced the governed fallback-only relationship page with a live owner-authenticated matrix builder.
- Added a relationship-dimension field and editable evidence-assertion JSON workspace.
- Connected the page to `POST /api/matrix-relationship/build`.
- Rendered deterministic subject-by-object cells with state, assertion count and confidence.
- Preserved the backend disclaimer that not-recorded evidence is not biological absence.
- Removed silent fallback to fixture scores when the live API fails; errors are now explicit.

## Route

`/relationship-matrix`

## Safety

The interface does not write assertions, mutate the canonical graph or resolve conflicts. It only submits a caller-supplied evidence set to the read-only backend projection endpoint.

## Next work

- governed candidate and assertion retrieval;
- provenance drawer for each cell;
- comparison mode for two selected taxa or collection plants;
- export and saved matrix definitions;
- visual character-entry interface for Matrix Identification.
