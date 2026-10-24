# BlackOut

An expedition field log that carries updates between disconnected devices. Built for Syntax Error 2026.

**Phase 1:** a local-first PWA with durable records, Automerge merging, visible concurrent edits, QR snapshot exchange, and file backups. There is no backend, paid API, or account requirement.

**Phase 2:** checkpoint board, category/status/assignment filters, quick capture by category, assignments when creating records, expedition-wide activity, and two-way rendezvous guidance. Phase 1 workspaces and exchange files remain compatible; no storage migration is needed.

**Phase 3:** local release hardening, a separate synthetic demo expedition, capacity/recovery tests, Vercel configuration, a future CI workflow, and demo/submission documentation. Hosting and real-phone acceptance remain separate verification steps.

Start with [the test report](docs/TEST-REPORT.md), [demo script](docs/DEMO.md), and [Vercel handoff](docs/DEPLOYMENT.md).

## Experience BlackOut

New visitors land on an interactive expedition replay. Returning users with an active expedition reopen their field log; **Experience BlackOut** in the sidebar opens the replay at any time.

- Start the blackout or step through at your own pace. Three independent Automerge documents gather different reports and conflicting assignments.
- Select a camp to inspect what its copy knows. Animated encounter paths show snapshots moving between teams; choose an assignment when the conflict appears.
- Complete the return journey to make all three copies match. The replay uses the same edits and merge functions as the field log, operates entirely in memory, and never changes the user's expeditions or network connection.
- Pause, restart, keyboard navigation, reduced-motion preferences, and offline replay are supported. No external map tiles, fonts, or animation packages are required.

Real imports now show an exact result: newly added reports, reports whose fields or conflict alternatives changed, added history events, and records needing review immediately after the import. The summary is saved with the receipt; duplicate imports show zero new changes. Recently received cards briefly highlight when you return to the field log.

**This device → Your offline kit** checks a build-generated manifest against cached assets for the app, merge engine, and QR decoder. Readiness requires all listed assets and an active controlling service worker; the graphics do not simulate download progress.

## Expedition workflow

- Use **＋ checkpoint** to record a stop, its location, and who should follow up. Use the other quick-capture buttons for observations, hazards, and supply reports.
- **Checkpoint board** groups records by their typed location (ignoring case and surrounding spaces). Use a consistent name such as “Camp 2” across reports. Unlocated reports appear separately. Groups are alphabetical, not a planned route or GPS map.
- Conflicting records and open hazards appear first at each stop. Open any item to update its status or review conflicts. The completed checkpoint count excludes unresolved conflicts; “done” is a recorded team decision, not verified arrival.
- **All records** combines category, status, assignment, and text filters. Search includes notes, locations, assignments, and author labels. Clear filters restores active records. Archived and Needs review are separate scopes.
- **Activity** shows saved changes carried by this expedition, including imported history. Search by record or change and filter by device label. Times are device-reported and may be out of order when device clocks differ. Load more to inspect older events.
- At a rendezvous, receive and merge, then prepare a fresh snapshot to return. The exchange screen describes the last receipt without claiming that the other device is still up to date or that a displayed code was delivered.

All views reflect only the data on this device. They become more complete when teammates exchange updates.

## Run locally

Requires Node.js 22.12+ (tested with Node 24) and npm.

```sh
npm ci
npm run dev
```

Development mode is for editing. **Use the production preview for offline testing:**

```sh
npm run build
npm run preview -- --port 4173
```

Open http://127.0.0.1:4173. Wait for “Ready for offline use”, then reload with networking disabled. The service worker caches all build assets, including the merge engine and QR decoder worker. No external fonts or runtime CDN resources are used.

For phone testing, serve `dist/` on an HTTPS static host. A phone opening a laptop's ordinary HTTP LAN address is not a supported camera/PWA setup. Installation is optional; prior loading and completed caching are required.

## Two-device demonstration

1. Open the same deployment on both devices and assign different device names.
2. On A, create an expedition and one checkpoint record.
3. On B, choose Create / join expedition → Receive. On A, choose Exchange updates → Prepare update codes.
4. B scans every frame (rotation or manual stepping), reviews the snapshot, then joins. Both devices now share an expedition origin.
5. Disable networking on both devices. Reopen the app to verify offline loading.
6. Add a different observation on each device. Edit the shared checkpoint's assignee differently on each.
7. A prepares its snapshot; B scans and merges. B now sees both observations and the conflicting assignment.
8. B prepares a fresh combined snapshot; A scans and merges. Both hold the same shared changes.
9. Resolve the conflict on one device and exchange the resulting snapshot. Open the record to inspect history.

A QR scan updates its receiver only. Two-way exchange is necessary to bring both devices together. The app never claims that all expedition members are up to date. A third device can carry changes onward by importing and exporting the same expedition.

The receiver persists incomplete transfers in IndexedDB. After an interrupted scan, reopen Receive and continue the **same outgoing snapshot**. Refreshing the sender creates a new transfer; reset the receiver to switch to it.

## Alternative transports

- **Exchange file:** download a `.blackout.json` file, move it using an available method, and import it on the other device. It is also a full workspace backup, including history.
- **QR image:** import a screenshot of one QR frame. It passes through the same decoder and receiver as a camera scan.
- **Manual frame:** paste one frame through the expandable fallback. Useful for testing; not the main demonstration.

## Verification

```sh
npm run test:release
```

This runs core/storage tests (and generates the synthetic files), the production build, then browser tests. To rerun only browser tests, first ensure `artifacts/synthetic/large.blackout.json` exists by running `npm test`. Synthetic fixtures and screenshots are ignored by Git and are not bundled into the public site. Test browser contexts are isolated from your normal app data.

Browser tests use an installed Google Chrome (`channel: chrome`) and launch a production preview on port 4173. They cover isolated browser profiles, offline reloads, independent edits, conflict resolution, duplicate imports, QR image decoding, persisted partial transfers, wrong-workspace rejection, and mobile layout/camera fallback. These tests do not substitute for physical phone-camera testing.

The expanded release tests also cover 300 records, a 3,000-entry history boundary, all six three-team merge orders, concurrent tab writes, synthetic quota failures, stale outgoing snapshots, and hostile-looking text rendered literally. The prepared GitHub workflow uses Playwright Chromium and has not yet run remotely.

## Architecture

```text
src/core/model.ts          Workspace schema, edits, history, merge and conflicts
src/core/transfer.ts       Validated exchange files, QR framing and assembly
src/storage/repository.ts  IndexedDB persistence and atomic local transactions
src/ui/                   Screens, forms, scanner, exchange workflow
tests/e2e/                Production-browser acceptance tests
docs/                     Protocol, architecture, physical test checklist
```

UI components do not implement merge rules. The data model is transport-independent. A future Bluetooth, local-network, or server transport can carry the same snapshots, or introduce a versioned incremental protocol. Both the workspace schema and exchange envelope are versioned; unsupported versions fail explicitly.

## Limits and truthful claims

- The app must have loaded and cached before connectivity disappears.
- Devices exchange at an encounter. There is no automatic mesh, remote SOS, or background delivery.
- QR codes and files contain readable expedition data. Checksums detect corruption; they do not authenticate a sender or encrypt content.
- Device names and timestamps are self-reported. Wall-clock time does not decide concurrent edits.
- Browser data deletion or storage eviction can remove local records. Request persistent storage and keep exchange-file backups.
- Full snapshots are deliberately used in Phase 1. Transfer cost grows with history. Large workspaces should use file exchange.
- Limits: 300 records, 3,000 history entries, 900 KB snapshot, 1.5 MB exchange file, and 200 QR frames at 650 payload characters each. These are prototype bounds, not capacity claims for an expedition.
- Record history preserves edits; archive is used instead of destructive deletion.
- Physical camera reliability, mobile installation, and a deployed HTTPS origin need device validation before the live demo.

## Credits

React and Vite provide the app shell; Automerge provides CRDT storage/merging; idb wraps IndexedDB; qrcode generates codes; qr-scanner decodes them; vite-plugin-pwa/Workbox cache the production build. Vitest and Playwright provide verification. Dependency licenses remain with their authors. BlackOut's interface, exchange protocol, workflow, and tests are project code.

AI assistance was used for implementation and testing. Maintain the real Git history and disclose reused libraries and assistance according to the organizer's rules.
