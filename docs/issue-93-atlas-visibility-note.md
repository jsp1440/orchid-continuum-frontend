# Issue #93 — Homepage Atlas initial visibility

The homepage Atlas now starts with an empty genus filter so a featured genus absent from the currently loaded occurrence sample cannot make a healthy map appear empty. The shared featured genus remains visible and explicitly selectable in the Atlas UI; Reset continues to clear filters.

Validation is enforced by `HomeAtlas.initialVisibility.test.ts` and `HomeAtlas.visibilityImplementation.test.ts`.
