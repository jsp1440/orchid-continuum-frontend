# Deployment Workflow

## Deployment Policy

BUILD-INFRA-002 does not deploy anything. Deployment remains a separate, explicit action after code review and merge.

## Pre-Deployment Checklist

Before any deployment build:

- Confirm the merged commit.
- Confirm deployment target and hosting provider.
- Confirm required environment variables.
- Confirm build command and runtime version.
- Confirm rollback path.
- Confirm health check or smoke test.
- Record deployment requirement in `docs/Build_Registry.md`.

## Current Verification Model

The initial deployment diagnostic is intentionally conservative:

- Frontend deployment status requires manual host dashboard or production URL verification.
- Backend deployment status requires manual host dashboard, health endpoint, and environment verification.
- Scripts do not call provider APIs until safe read-only access is documented.

## Future Enhancement

A later infrastructure build may add provider-specific read-only deployment checks if credentials, API scopes, and expected output are documented.
