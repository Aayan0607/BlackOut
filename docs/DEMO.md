# BlackOut demo and submission notes

## Three-minute live demonstration

Prepare two devices on the same HTTPS deployment. Use one expedition and transfer it to the second device before going offline. Keep brightness high enough to scan. Test the actual phones beforehand using DEVICE-CHECKLIST.md.

1. **0:00–0:25 — The problem.** “An expedition splits into two teams. Both keep useful notes, but there is no network to share them. BlackOut lets those updates travel when people meet.” Show the devices offline and reopen the cached app.
2. **0:25–1:00 — Independent work.** On A, record a hazard at Camp 2. On B, record a water-cache observation at Camp 2. Give the same shared checkpoint different assignees on each device.
3. **1:00–1:50 — Exchange.** A shows QR frames; B scans all frames, reviews, and merges. Show both reports and the assignment conflict. B now prepares a fresh snapshot and sends it back to A. If camera conditions fail, use the prepared exchange files and explicitly identify the fallback.
4. **1:50–2:25 — A decision, not a silent overwrite.** Pick an assignment in Needs review, exchange the resolution, and inspect the checkpoint board and recorded history.
5. **2:25–3:00 — Recovery and boundaries.** Export a backup. Explain that data is local, initial installation requires a connection, exchange happens face to face, and this prototype provides neither emergency delivery nor an automatic mesh. A courier can relay a snapshot to a third device later.

Keep the live dataset small. Full-history snapshots with hundreds of records deliberately fall back to files; do not use the 300-record endurance fixture as the QR demo.

## Solo practice

This device → Create demo expedition creates eight explicitly synthetic reports with one real concurrent assignment conflict. It creates a fresh expedition ID each time, preserving existing expeditions. Share one created demo between devices; independently created demos are different expeditions and cannot merge.

The release tests generate `artifacts/synthetic/demo.blackout.json` and `large.blackout.json`. Import through Create / join expedition → Exchange → Receive. These are fictional fixtures. The large fixture contains 300 records across ten locations and five team labels. They are local test artifacts, excluded from the site and Git.

## Submission description

BlackOut is an offline expedition field log. Team members record checkpoints, hazards, supplies, and observations independently. At an encounter, one phone displays a sequence of QR codes and another scans them, reviews the incoming snapshot, and merges the records. A return exchange brings both devices together. Concurrent decisions remain visible for a person to resolve instead of silently replacing one another.

The prototype uses React, TypeScript, IndexedDB, Automerge, and a service-worker cache. It requires no account, server API, or paid service. A checkpoint board groups local reports by named location, activity records expose the edits carried by snapshots, and exchange files provide a recovery path. Optical transfer remains manual and full-snapshot-based.

## Questions judges may ask

- **Why not Bluetooth?** This version demonstrates a browser-compatible camera/screen encounter workflow. The versioned envelope and merge model can support another transport later; no Bluetooth functionality is claimed.
- **Does it know a report is true?** No. Device names are labels, and report contents require human judgment. Checksums detect corruption, not impersonation.
- **Does it connect distant teams?** No. People must encounter one another or carry a snapshot onward through another available channel.
- **What happens when both teams edit a record?** Independent field edits merge. Different values for the same field remain available for explicit resolution. Activity timestamps never choose the winner.
- **What happens if a scan stops?** Successfully persisted frames survive a reload. Continue the same outgoing snapshot; reset before switching transfers.
- **What did you test?** Use TEST-REPORT.md for measured local results. Distinguish automated browser contexts from physical phones and synthetic quota failures from actual disk exhaustion.

## Final submission checklist

- Add the final repository and deployment links once published.
- Record the actual two-phone demo, including the offline reload and return exchange.
- Follow the organizer's current submission form, deadline, and AI/library disclosure requirements; those have not been reverified in this release pass.
- Disclose AI implementation assistance and the third-party libraries in README.md.
- Keep physical-device claims limited to checks actually completed.
