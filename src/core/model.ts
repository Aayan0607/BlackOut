import * as A from '@automerge/automerge/slim'

export const SCHEMA_VERSION = 1
export const MAX_RECORDS = 300
export const MAX_HISTORY = 3000
export type RecordKind = 'observation' | 'hazard' | 'supply' | 'checkpoint'
export type RecordStatus = 'open' | 'done' | 'archived'
export interface FieldRecord {
  id: string; title: string; note: string; location: string; assignee: string
  kind: RecordKind; status: RecordStatus; author: string; createdAt: string
}
export interface HistoryEntry {
  id: string; recordId: string; actor: string; at: string; message: string
}
export type Workspace = {
  schemaVersion: number; id: string; name: string; createdAt: string
  records: { [id: string]: FieldRecord }; history: { [id: string]: HistoryEntry }
}
export type WorkspaceDoc = A.Doc<Workspace>
export type EditableField = 'title' | 'note' | 'location' | 'assignee' | 'kind' | 'status'
export const editableFields: EditableField[] = ['title', 'note', 'location', 'assignee', 'kind', 'status']
export const kinds: RecordKind[] = ['observation', 'hazard', 'supply', 'checkpoint']
export const statuses: RecordStatus[] = ['open', 'done', 'archived']
export const limits: Record<EditableField, number> = { title: 120, note: 1200, location: 100, assignee: 80, kind: 20, status: 20 }

function requireText(value: unknown, max: number, label: string, nonempty = false): asserts value is string {
  if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim())) throw new Error(`Invalid ${label}.`)
}
function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
export function validateWorkspace(doc: Workspace): void {
  if (!isObject(doc) || doc.schemaVersion !== SCHEMA_VERSION) throw new Error('Unsupported workspace version. Update BlackOut before importing.')
  requireText(doc.id, 80, 'workspace identifier', true)
  requireText(doc.name, 80, 'expedition name', true)
  requireText(doc.createdAt, 40, 'creation date', true)
  if (!isObject(doc.records) || Object.keys(doc.records).length > MAX_RECORDS) throw new Error(`This workspace exceeds the ${MAX_RECORDS}-record prototype limit.`)
  if (!isObject(doc.history) || Object.keys(doc.history).length > MAX_HISTORY) throw new Error('This workspace exceeds the prototype history limit.')
  for (const [id, record] of Object.entries(doc.records)) {
    if (!isObject(record) || id !== record.id) throw new Error('Invalid field record.')
    requireText(id, 80, 'record identifier', true)
    requireText(record.author, 80, 'author', true)
    requireText(record.createdAt, 40, 'record date', true)
    for (const field of editableFields) {
      requireText(record[field], limits[field], field, field === 'title')
      // Every concurrent value must be valid, not just Automerge's displayed winner.
      const alternatives = A.getConflicts(record, field)
      for (const value of Object.values(alternatives ?? {})) {
        requireText(value, limits[field], field, field === 'title')
        if (field === 'kind' && !kinds.includes(value as RecordKind)) throw new Error('Invalid record category.')
        if (field === 'status' && !statuses.includes(value as RecordStatus)) throw new Error('Invalid record status.')
      }
    }
    if (!kinds.includes(record.kind) || !statuses.includes(record.status)) throw new Error('Invalid record category or status.')
  }
  for (const [id, entry] of Object.entries(doc.history)) {
    if (!isObject(entry) || entry.id !== id) throw new Error('Invalid activity entry.')
    requireText(id, 80, 'activity identifier', true)
    requireText(entry.recordId, 80, 'activity record', true)
    requireText(entry.actor, 80, 'activity author', true)
    requireText(entry.at, 40, 'activity date', true)
    requireText(entry.message, 200, 'activity description', true)
  }
}

export function createWorkspace(name: string, actorId?: string): WorkspaceDoc {
  requireText(name, 80, 'expedition name', true)
  return A.from<Workspace>({ schemaVersion: SCHEMA_VERSION, id: crypto.randomUUID(), name: name.trim(), createdAt: new Date().toISOString(), records: {}, history: {} }, actorId)
}
function log(doc: Workspace, recordId: string, actor: string, message: string) {
  requireText(actor, 80, 'device name', true)
  if (Object.keys(doc.history).length >= MAX_HISTORY) throw new Error('History limit reached. Export a backup before starting a new expedition.')
  const id = crypto.randomUUID()
  doc.history[id] = { id, recordId, actor, at: new Date().toISOString(), message }
}
export function addRecord(doc: WorkspaceDoc, input: Pick<FieldRecord, 'title' | 'note' | 'location' | 'kind'>, author: string): WorkspaceDoc {
  if (Object.keys(doc.records).length >= MAX_RECORDS) throw new Error('Record limit reached. Export a backup before starting a new expedition.')
  const next = A.change(A.clone(doc), 'Add field record', draft => {
    const id = crypto.randomUUID()
    draft.records[id] = { ...input, title: input.title.trim(), id, assignee: '', status: 'open', author, createdAt: new Date().toISOString() }
    log(draft, id, author, 'Recorded a field update')
  })
  validateWorkspace(next)
  return next
}
export function editRecord(doc: WorkspaceDoc, id: string, edits: Partial<Pick<FieldRecord, EditableField>>, author: string): WorkspaceDoc {
  if (!doc.records[id]) throw new Error('This record no longer exists.')
  const next = A.change(A.clone(doc), 'Edit field record', draft => {
    const changed: string[] = []
    for (const field of editableFields) {
      const value = edits[field]
      if (value !== undefined && (doc.records[id][field] !== value || Object.keys(A.getConflicts(doc.records[id], field) ?? {}).length > 1)) {
        ;(draft.records[id] as unknown as Record<string, string>)[field] = value
        changed.push(field)
      }
    }
    if (changed.length) log(draft, id, author, `Updated ${changed.join(', ')}`)
  })
  validateWorkspace(next)
  return next
}
export function conflictsFor(record: FieldRecord): { field: EditableField; values: string[] }[] {
  return editableFields.flatMap(field => {
    const conflicts = A.getConflicts(record, field)
    const values = [...new Set(Object.values(conflicts ?? {}) as string[])]
    return values.length > 1 ? [{ field, values }] : []
  })
}
export function heads(doc: WorkspaceDoc): string { return A.getHeads(doc).sort().join(':') }
export function mergeWorkspace(local: WorkspaceDoc, incoming: WorkspaceDoc): WorkspaceDoc {
  validateWorkspace(incoming)
  if (local.id !== incoming.id) throw new Error('Different expedition. Switch to that expedition or import it as a new workspace.')
  // Matching IDs alone are not enough: refuse independently created documents with copied IDs.
  const incomingHashes = new Set(A.getAllChanges(incoming).map(change => A.decodeChange(change).hash))
  const shared = A.getAllChanges(local).some(change => incomingHashes.has(A.decodeChange(change).hash))
  if (!shared) throw new Error('These documents do not share an expedition origin.')
  const merged = A.merge(A.clone(local), incoming)
  validateWorkspace(merged)
  return merged
}

export { A }
