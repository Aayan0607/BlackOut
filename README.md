# BlackOut

An expedition field log that carries updates between disconnected devices. Built for Syntax Error 2026.

**Phase 1:** a local-first PWA with durable records, Automerge merging, visible concurrent edits, QR snapshot exchange, and file backups. There is no backend, paid API, or account requirement.

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
npm test
npm run build
npm run test:e2e
```

Browser tests use an installed Google Chrome (`channel: chrome`) and launch a production preview on port 4173. They cover isolated browser profiles, offline reloads, independent edits, conflict resolution, duplicate imports, QR image decoding, persisted partial transfers, wrong-workspace rejection, and mobile layout/camera fallback. These tests do not substitute for physical phone-camera testing.

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
