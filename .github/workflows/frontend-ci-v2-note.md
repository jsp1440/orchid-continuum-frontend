# Frontend CI note

The first CI run showed that the Vite build passes, but repository-wide linting currently reports pre-existing issues in files outside the immediate Archie change.

For the preview-release phase, CI should block on the production build and keep lint advisory until a dedicated lint cleanup pass is completed.
