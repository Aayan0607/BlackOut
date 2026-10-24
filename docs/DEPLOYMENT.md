# Vercel deployment handoff

No deployment, commit, or push was performed for Phase 3. The app is a static Vite PWA. No backend, environment variables, API keys, or database provisioning are required.

## Verify locally first

Use Node 24 and run `npm ci`, then `npm run test:release`. The browser tests use locally installed Google Chrome. The release run generates synthetic files, builds production assets, and tests the production preview. CI uses Playwright's Chromium instead; its workflow is prepared but has not run remotely.

Preview with `npm run preview -- --port 4173 --strictPort`. Development mode does not provide the production offline cache. Wait for Ready for offline use before disconnecting. If an old version is open, use Update app after finishing any current transfer.

## When ready to publish

Import the BlackOut repository into Vercel after reviewing and pushing the intended changes yourself. If the repository root is BlackOut, use the repository root as the project root. If using the parent CASECOM repository instead, select the BlackOut subdirectory.

- Framework: Vite
- Install: `npm ci`
- Build: `npm run build`
- Output directory: `dist`
- Runtime used for local validation: Node 24
- Environment variables: none

`vercel.json` declares the build/output settings and static response headers. The service worker and index explicitly request revalidation; fingerprinted build assets remain available to the offline cache. Camera access is limited to the same origin. See Vercel's [configuration reference](https://vercel.com/docs/project-configuration/vercel-json) for the hosting settings.

This app uses in-page navigation at the origin root and does not require a catch-all route rewrite. Preserve actual JS/WASM/worker asset responses; do not rewrite missing assets to HTML. The manifest, icons, QR worker, and merge engine must be accessible on the final HTTPS origin.

## Verify the hosted result

1. Choose the stable production URL and open it on both phones. Do not alternate between preview URLs during a demo.
2. Wait for offline readiness. Install using the browser's install/Add to Home Screen option if available; installation is optional.
3. Create one expedition and join it on the second phone. Test camera permission, a full two-way exchange, and file backup.
4. Disable Wi-Fi and cellular networking, reload both apps, add independent records, exchange, and resolve a conflicting assignment.
5. Complete DEVICE-CHECKLIST.md and record OS/browser versions and outcomes.

Changing the origin—including port, hostname, or Vercel preview URL—uses different browser storage. Export a backup from the old origin and import it into the new one. An app update on the same origin preserves IndexedDB; clearing site data does not.

## Local package

The current `dist/` is the production artifact. Rebuild after source edits. `artifacts/blackout-static.zip`, when generated during release preparation, contains this static build only; source code and synthetic browser data are not deployed with it.
