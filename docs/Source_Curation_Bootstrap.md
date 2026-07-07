# Source Curation Bootstrap

## Objective

Source curation prepares architecture source material for future Orchid Continuum builds without mutating source files or assuming repository access that has not been verified.

## Expected Repositories

| Repository | Role | Required For Curation | Missing Access Behavior |
| --- | --- | --- | --- |
| `jsp1440/orchid-continuum-frontend` | Current infrastructure documentation and session bootstrap home | Yes | Stop the build if the working repository cannot be identified. |
| `jsp1440/orchid-calyx-backend` | Backend context for Calyx and executive-function architecture | Helpful | Report `WARN`; do not block source inventory work. |
| `jsp1440/orchid-continuum-architecture` | Target architecture library and curated source home | Required for architecture repository writes | Report `WARN`; do not fabricate or clone the repository. |

## Read-Only Checks

The BUILD-INFRA-003 scripts may inspect:

- Command availability for `git` and `gh`.
- `gh auth status` when `gh` is already installed.
- Repository metadata through `gh repo view` when available.
- Local checkout existence under bounded workspace roots.
- Whether expected source-staging folders exist.
- Whether staged source files appear to be present.

The scripts must not:

- Install tools.
- Authenticate `gh`.
- Clone repositories.
- Create folders.
- Delete, move, copy, rename, or edit source files.
- Push branches.
- Deploy services.

## Source Staging Strategy

Use a deliberate source-staging area outside application source directories. Prefer one of:

- `$env:ORCHID_SOURCE_STAGING`
- `$env:ORCHID_CONTINUUM_WORKSPACE\sources`
- `$HOME\OrchidContinuum\sources`
- `$HOME\source\repos\orchid-sources`

Recommended subfolders:

| Folder | Purpose |
| --- | --- |
| `incoming` | Newly received source files that have not been reviewed. |
| `inventory` | Human-readable source inventory notes. |
| `curated` | Reviewed material ready for architecture-library work. |
| `deferred` | Material intentionally held for later review. |

## Source File Handling Rules

- Preserve original filenames where possible.
- Record source origin, owner, date received, and access constraints before deriving summaries.
- Keep private, sensitive, or unclear-permission material out of Git until explicitly approved.
- Do not paste secrets, credentials, private URLs, or access tokens into repository files.
- Do not auto-modify Google Drive files or local source files during diagnostics.
- Treat missing source staging as `WARN` with manual setup guidance.

## Missing Access Report Format

```text
Architecture/source access blocker: <tool/repository/source>
Repository: <owner/repo or not applicable>
Local path checked: <path or not applicable>
Command/check: <exact check>
Result: <first complete warning or error>
Manual next step: <specific action>
```

## Future Curation Build Entry Criteria

Before a future architecture curation build starts:

- Run `.\scripts\check_architecture_access.ps1`.
- Run `.\scripts\check_source_curation_readiness.ps1`.
- Confirm whether `jsp1440/orchid-continuum-architecture` is accessible.
- Confirm source-staging location and inventory expectations.
- Confirm which files are approved for repository inclusion.
