# Review the Calypso Laboratory locally

Use the review/calypso-laboratory branch. From the frontend repository root run:

```sh
npm ci
bash scripts/review-calypso-local.sh
```

Open http://127.0.0.1:4173/paperbotanica?lab=calypso and sign in or register with a disposable local identity. The launcher starts the existing React application and its in-memory reference identity backend. Accounts expire when the local backend exits. The frozen scientific assets are bundled with the development module. The sign-in boundary is the application's protected PaperBotanica route. Production builds omit this Laboratory. The comparison illustration is fetched from Project Runeberg on reveal and requires network access. All geometry, measurements and comparison results work offline after loading the local app.

The Species Dossier exposes the Laboratory link for resolved Calypso bulbosa in development. Its Matrix link uses the existing dossier's resolved context. No canonical glossary or KG target was verified for the selected organs. The local reference backend only provides a different species dossier fixture, so the browser smoke test enters through the protected Laboratory URL directly.

To exercise the local route automatically while the launcher is running:

```sh
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium node scripts/review-calypso-browser.mjs
```

The smoke test allows loopback requests only. It checks restricted access, a fixture sign-in, the frozen GLB, organ selection, an educational length change and revealing the comparison result. Viewing the external image is outside its assertions. The width, length and orientation sliders change only a selected organ's 2D projection. The scientific plate and GLB stay bound to their original artifact hashes.

Regenerate the backend outputs per review/README.md in the paired backend. Compare the complete review/calypso directory byte-for-byte against src/features/paperbotanica/calypso. Verify the existing API shape with the backend audit fixture:

```sh
PAPERBOTANICA_API_FIXTURE=/tmp/calypso-audit/backend-api-fixture.json npm test -- src/features/paperbotanica src/lib/routeAccessPolicy.test.ts
npm run validate:deployment
npm run build
```
