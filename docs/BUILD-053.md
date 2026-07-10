# BUILD-053 - Mission Control Activation and Authentication Completion

## Activation Audit

BUILD-053 completes the frontend activation layer for the existing authenticated owner workflow. Mission Control continues to use the existing design and endpoint contracts, but stored owner sessions are now validated with the backend before privileged controls are treated as live.

Operational with backend owner session:

- Owner login through `POST /api/mission-control/owner/session`
- Stored session validation through `GET /api/mission-control/owner/session`
- Permission loading through `GET /api/mission-control/owner/permissions`
- Calyx command records
- Operations queue transitions
- Twin Brief source briefing persistence
- Local intelligence import and backend intelligence edits
- Executive audit downloads
- Research request creation
- Partnership packet generation
- Harvester run once, pause/resume, reassess, retire, and restore
- Executive Intelligence state consumption through `/api/executive/state`

Read-only or externally blocked:

- Repository/deployment actions remain links or disabled controls because no backend deployment-action service is available.
- Harvester target/schedule/proposal controls remain unavailable until exact selector/form workflows are implemented.
- GitHub/Render/OAuth-backed live integration telemetry requires external credentials.

## Features Activated

- Stored owner session tokens are revalidated against the backend before Mission Control reloads privileged owner data.
- Invalid or expired stored sessions are removed and shown as backend auth errors instead of being silently trusted.
- Active harvester mutation buttons show `owner authorized` after a signed backend owner session is live.

## Remaining External Dependencies

- Backend deployment with BUILD-053 changes.
- Backend `CALYX_OWNER_ACCESS_CODE` and `CALYX_OWNER_SESSION_SECRET`.
- Backend `DATABASE_URL` and applied owner/runtime migrations for durable persistence.
- External GitHub/Render/OAuth credentials for live deployment and partner-service telemetry.

## Deployment Checklist

1. Deploy backend BUILD-053 after required migrations and secrets are configured.
2. Smoke test owner login and session validation in Mission Control.
3. Confirm permissions load and privileged controls remain disabled without a backend session.
4. Confirm command, queue transition, audit, research request, packet, and harvester actions work with a valid owner session.
5. Deploy frontend BUILD-053.

## Required Secrets

Frontend source does not require privileged secrets. The backend must provide:

- `CALYX_OWNER_ACCESS_CODE`
- `CALYX_OWNER_SESSION_SECRET`
- `CALYX_API_KEY`
- `DATABASE_URL`

## Required OAuth Credentials

None for this frontend activation pass. External workspace, deployment, and partner-service integrations remain blocked until their OAuth or API credentials are configured server-side.

## Operational Readiness Assessment

Mission Control can operate as the authenticated owner console once backend BUILD-053 is deployed with required secrets. Features without backend services or external credentials remain visibly unavailable rather than ambiguous placeholders.
