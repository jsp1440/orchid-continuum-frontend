# Google Drive Curation Workflow

Google Drive holds source reports and curated exports; Git holds approved, reviewable repository content. Do not keep an active Git clone inside a synced Drive folder.

Recommended layout:

- `C:\OrchidContinuum\` — local Git clones.
- Google Drive — source documents, incoming files, and reviewed exports.
- repository `docs/` — approved derived documentation committed via branch and PR.

## Access

Confirm Drive for desktop is signed in, or open Drive in a browser. Record source title, owner, access level, and retrieval date. Do not overwrite source originals. `scripts/check_google_drive.ps1` detects common mount locations and browser availability, but cannot prove access to a private shared folder.

## Curation

1. Keep originals in Drive.
2. Create a dated working copy/export only when needed.
3. Review privacy, licensing, names, emails, credentials, and grant information.
4. Commit only approved derived content; do not commit confidential raw exports unless policy explicitly permits it.

When access is blocked, report exact document title/link, expected account, whether browser and Drive desktop were tested, and whose sharing permission is needed. Do not request passwords or put protected content into Git.