# Architecture and upgrade points

## Data model

A version-1 Automerge document contains immutable workspace identity/name/creation metadata, records keyed by random IDs, and history entries keyed by random IDs. Records contain category, title, notes, location, assignee, status, author label, and creation time. IDs prevent independent additions from colliding. Each session uses a separate Automerge actor; clone-based edits also receive independent actor identities.

Edit only fields the user actually changed. Sending every visible form value back would accidentally override independently updated fields. Concurrent values for the same field are surfaced through `getConflicts`; no wall-clock last-write policy is imposed. An explicit resolution writes the chosen field again and adds a history entry.

After merging, the document is saved and loaded once before validation and return. Release tests exposed reused nested objects whose `getConflicts` handle omitted a newly merged non-winning alternative in three-way conflicts. Re-materialization preserves the change graph and heads while ensuring every alternative is inspected. All six three-team merge orders are regression-tested. The extra serialization is acceptable within the prototype's bounded workspace size and should be remeasured before increasing that limit.

Two records independently describing the same real-world observation remain distinct. CRDT convergence does not deduplicate their meaning or establish which report is true. Supply reports are observations, not transactions against a guaranteed global inventory.

## Persistence

IndexedDB stores four object stores: workspaces, settings, pending receiver, and last receipt per workspace. Workspace edits read, modify, and save in one read/write transaction. This prevents a stale browser tab from replacing a newer saved document. A BroadcastChannel and focus refresh update other tabs' views; data correctness does not rely on those notifications.

An imported document is validated before use. For an existing workspace, IDs must match and documents must have common Automerge history. Merging, saving the last receipt, and updating the active workspace occur in one transaction. Import failures must leave the previous stored workspace intact.

## Transfer pipeline

`WorkspaceDoc → Automerge.save → versioned JSON envelope → base64 → numbered QR frames`

The reverse path validates frame limits, reassembles the entire transfer, checks its SHA-256, validates the envelope and snapshot SHA-256, loads Automerge, validates schema and metadata, asks the user to review, and then persists the merged result. File transfer starts at the envelope stage and uses the same validation.

A transfer digest is an integrity check, not a digital signature. Sender labels are unverified. Do not reuse it as an authorization mechanism.

## Exchange acknowledgement semantics

A last receipt stores the incoming sender label and whether the incoming document's heads matched the merged state. The interface only says that this device matches the **received snapshot** if the local heads still match that receipt. Any subsequent local edit invalidates that display. There is no claim about a peer's current live state or all members of the expedition.

To confirm after concurrent edits, B merges A, then sends B's combined state to A. A can return that state to B. “Already received” means the snapshot was already present at import time, not that every device is synchronized.

## Upgrade path

1. Phase 2 is implemented in `core/views.ts` and `ui/ExpeditionViews.tsx`: derived checkpoint groups, composable filters, and activity inspection. The existing storage and exchange protocol remain unchanged. Record creation accepts an optional assignee, defaulting to the original empty assignment. Future structured route IDs or coordinates should use an explicit schema migration, rather than overloading location text.
2. Incremental sync: introduce a negotiated protocol using Automerge sync messages, with per-peer state and dependency handling. Keep snapshot files as recovery/import format. Do not use wall-clock timestamps to select missing changes.
3. Secure workspaces: define membership, key distribution, device signatures, encryption, and revocation together. A workspace ID alone is not a secret.
4. New transports: implement send/receive adapters that feed validated envelopes or a new supported protocol into the model. Keep UI and transport code out of merge rules.
5. Storage migration: increment IndexedDB version and workspace schema independently, retain fixtures, and provide explicit migration/backup behaviour.

## Boundaries

Checkpoint groups are derived from trimmed, case-insensitive location labels. They are not geographic entities or route order. Conflicting records remain visible on the board even if Automerge's displayed status is archived. Completed checkpoint counts exclude all unresolved field conflicts. Activity is sorted by reported time with an ID tie-breaker for display only; neither this ordering nor the board affects merge decisions.

No server is required for local operation. Hosting supplies the initial executable assets. The service worker handles app-shell caching; IndexedDB handles user data. Updating the service worker is prompted rather than forced during an exchange. The current origin owns its data: moving to another hostname or port creates a separate browser store, so export/import when changing deployment origins.
