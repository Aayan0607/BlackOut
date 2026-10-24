# Local release test report

Updated on 24 October 2026 on Windows with Node 24 and locally installed Google Chrome. Results describe the local working tree including the interactive experience upgrade. The user has deployed an earlier version; this upgrade has not been deployed by the agent. Browser contexts use isolated test storage; the user's normal expeditions were not seeded or cleared.

## Results

| Check                                                               | Result                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| Core, protocol, storage, views, replay, and synthetic release suite | 26 tests passed across 6 files                                |
| Production TypeScript/Vite/PWA build                                | Passed; 14 precached entries, approximately 4,021 KiB         |
| Chrome production-browser suite                                     | 12 distinct scenarios passed across the full and focused runs |
| Dependency audit                                                    | 0 known vulnerabilities reported by npm at test time          |
| Patch whitespace check                                              | Passed                                                        |
| Desktop exchange and mobile checkpoint screenshots                  | Inspected                                                     |

The full test command is `npm run test:release`. The individual commands were run during this pass. The expanded 11-scenario suite passed, followed by a four-scenario focused run after final visual changes and the addition of the restart-in-transit case (12 distinct scenarios total). Core tests passed in 54.38 seconds; the final focused browser run took 40.3 seconds. No dependencies were added for the experience; the audit result above is from the earlier release pass. The CI workflow is prepared but has not been executed on GitHub.

## Synthetic workloads

- **300-record expedition:** ten locations, five team labels, all four categories, Unicode titles, and 1,100-character pseudo-random notes per record. Full export/import preserved heads. A 301st record was rejected without changing the saved workspace. A second expedition remained independent.
- **Measured large snapshot:** 312,978 bytes; exchange JSON 417,633 bytes. The record-generation/export/storage check took 27,602 ms in this local run with other checks running. This is an aggregate test duration, not a phone interaction or camera-speed benchmark. IDs/timestamps are fresh each run, so sizes can vary slightly.
- **Large UI:** 300 imported records survived an offline reload. Search returned the expected record, the board showed ten locations, and activity pagination expanded from 30 to 60 events. File export remained available when the transfer exceeded the 200-frame QR bound. A corrupted import left all 300 records intact.
- **Three teams:** 12 shared seed records plus 12 independent additions per team produced 48 records. All six merge orders converged to identical heads. All three conflicting assignments remained visible; replaying old snapshots did not undo an explicit resolution.
- **Concurrent storage:** 24 writes from two repository connections retained all records. A merge that would exceed 300 records preserved the previous document and receipt.
- **History boundary:** a seeded 3,000-entry history was valid; an additional edit was refused. This tests the declared limit, not 3,000 sequential browser interactions.
- **Resumable transfers:** reversed/duplicate frames, persistence at every frame boundary, partial reload, missing frames, mixed transfers, and integrity failures were exercised.

## Twelve browser scenarios

1. Create a separate eight-record synthetic demo without replacing an existing expedition; export and recover it in a fresh offline browser profile with the conflict preserved.
2. Import 300 records, use the board and history pagination, reload offline, search, reject a corrupt file, and export through the large-transfer file fallback.
3. Inject a storage-quota exception: preserve the unsaved form, retry successfully, and render HTML/script-looking input as literal text after reload.
4. Edit from a second tab: hide obsolete outgoing QR codes and disable the stale download until the snapshot is refreshed.
5. Inject a QR-frame storage exception: do not advance progress; retry the identical frame successfully and retain it after reload.
6. Create and assign checkpoints, combine filters, complete a checkpoint, inspect activity, and reopen the views offline at phone width.
7. Use two isolated devices to edit independently offline, exchange both ways, resolve conflicts, replay snapshots, and reject a different expedition.
8. Decode actual generated QR images through the scanner library offline and resume a partial scan after reload.
9. Check phone-width layout and the camera-unavailable fallback.
10. Complete the interactive replay offline, choose a resolution, inspect all three matching copies, and verify that no real expedition was created.
11. Use the replay at phone widths, select camps with the keyboard, pause playback, restart, respect reduced-motion preferences, and verify all three offline-kit groups against cached assets.
12. Restart during an animated encounter, wait beyond its pending callback, and verify both the reset simulation and the existing real expedition remain intact after reload.

Real-exchange assertions also verify the merge summary shows one new report, one updated report, and one conflict on a concurrent import, followed by zero new changes on a duplicate resolved import. Both possible replay assignment choices converge in core tests. Desktop replay and mobile offline-kit screenshots were inspected; a stylesheet-order contrast issue was corrected before the final visual pass.

Quota tests deliberately inject exceptions; they do not exhaust the physical disk. QR image tests execute the decoder, but do not test camera focus, glare, movement, or lighting.

## Fixes driven by testing and hardening

- A three-team merge could reuse a nested object that exposed only two alternatives through `getConflicts`, although all three remained in the saved snapshot. Re-materializing the merged document fixes inspection before validation and return; all six merge orders now pass.
- QR progress advances only after the frame is saved. A failed write can be retried without reporting progress that would disappear after reload.
- Preparing a new outgoing snapshot clears any previous downloadable snapshot first; stale snapshots are also hidden from the manual fallback.
- Export validates workspace and sender metadata. Imported history must refer to an existing record.
- A rendering error now offers a reload screen without clearing saved browser data.

## Local artifacts

- `artifacts/synthetic/demo.blackout.json`: small fictional demo backup.
- `artifacts/synthetic/large.blackout.json`: 300-record endurance backup.
- `artifacts/synthetic/metrics.json`: machine-readable workload measurements.
- `artifacts/blackout-static.zip`: production static build, 1,311,883 bytes.
- ZIP SHA-256: `3f2c230206d1dc2e7e437b2655d939e776e7b0724f04858d63c7f38c29ab6dcf`.
- `test-results/`: latest browser screenshots and run status; failed runs retain traces until the next run.

Artifacts are local and ignored by Git. Rebuild/repackage after source edits. The ZIP contains app assets only; the synthetic backups are separate.

## Still requires external verification

- This upgrade has not been deployed to Vercel or checked on the production origin.
- No physical two-phone optical exchange, mobile installation, Safari/iOS test, or actual storage eviction test was performed.
- No remote CI run or organizer submission was performed.
- Offline operation requires an initial successful load and cache. Browser data clearing removes local records; backups remain necessary.

Follow DEPLOYMENT.md and DEVICE-CHECKLIST.md before claiming a successful physical offline demo.
