# Branch Strategy

## Default Branches

The expected default branch for Orchid Continuum repositories is `main` unless a repository explicitly documents otherwise.

## Build Branch Naming

Use descriptive build branches:

```text
build-infra-002-continuous-development-workspace
```

Recommended patterns:

- `build-infra-###-short-title` for infrastructure builds.
- `build-frontend-###-short-title` for frontend application builds.
- `build-backend-###-short-title` for backend service builds.
- `build-architecture-###-short-title` for architecture library builds.

## Branch Hygiene

- Start from the latest default branch when possible.
- Inspect `git status` before editing.
- Do not mix unrelated changes in one branch.
- Do not merge without explicit approval.
- Prefer draft PRs for AI-assisted implementation work until Jeff reviews the scope.

## Conflict Handling

If a branch already exists:

- Check whether it belongs to the same build.
- Compare the branch to the base branch.
- Do not force-push unless Jeff explicitly approves.
- Create a follow-up branch if ownership is unclear.
