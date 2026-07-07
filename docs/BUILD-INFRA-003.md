# BUILD-INFRA-003: Architecture Repository Access and Source Curation Bootstrap

## Purpose

BUILD-INFRA-003 establishes a safe, read-only workflow for checking Orchid Continuum architecture repository access and source-curation readiness. It builds on BUILD-INFRA-001 workstation diagnostics and BUILD-INFRA-002 session bootstrap reporting.

## Scope

This build is development-operations infrastructure only. It adds source-curation documentation and read-only PowerShell diagnostics that help a future session understand whether the architecture repository, supporting repositories, and local source-staging area are ready for architecture work.

## Files Created Or Updated

Created:

- `docs/BUILD-INFRA-003.md`
- `docs/Source_Curation_Bootstrap.md`
- `scripts/check_architecture_access.ps1`
- `scripts/check_source_curation_readiness.ps1`

Updated:

- `docs/Build_Registry.md`
- `docs/Known_Issues.md`

## Relationship To Prior Infrastructure Builds

BUILD-INFRA-001 remains the source of truth for Windows workstation setup, Git/GitHub CLI readiness, npm workflow, Node validation, Python, and Google Drive workflow notes.

BUILD-INFRA-002 remains the source of truth for starting a development session, checking repository status, reviewing branch state, reviewing pull requests, recording known issues, and maintaining the build registry.

BUILD-INFRA-003 supplements those builds by defining how architecture source material should be staged, verified, and reported before any architecture repository or source document curation work begins.

## How To Run

From the frontend repository root:

```powershell
.\scripts\check_architecture_access.ps1
.\scripts\check_source_curation_readiness.ps1
```

Optional source root override:

```powershell
$env:ORCHID_SOURCE_STAGING = "C:\OrchidContinuum\sources"
.\scripts\check_source_curation_readiness.ps1
```

## Output Meaning

- `PASS` means the expected read-only condition was detected.
- `WARN` means the check could not verify the condition, but the session can continue with manual review.
- `FAIL` is reserved for script execution errors that make the result unreliable.

Architecture repository 404 or missing local checkout should remain `WARN`, not a workspace-wide failure.

## Intentional Non-Goals

This build does not:

- Create or clone the architecture repository.
- Modify source documents.
- Move, copy, delete, rename, or overwrite files.
- Install packages.
- Authenticate GitHub CLI.
- Change PATH.
- Deploy anything.
- Modify frontend or backend application code.
- Modify package files, lockfiles, build configuration, deployment configuration, secrets, or `.env` files.

## Known Limitations

- `jsp1440/orchid-continuum-architecture` may return 404 until repository visibility and connector access are resolved.
- GitHub CLI checks require `gh` to be installed and authenticated.
- Source-staging readiness is structural only; it does not validate the scientific quality or provenance of source files.
- Google Drive visibility and source availability may still require manual confirmation.
