import { conflictsFor, editableFields, type WorkspaceDoc } from './model'

export interface ImportSummary {
  addedIds: string[]
  updatedIds: string[]
  historyAdded: number
  conflicts: number
}
function signature(doc: WorkspaceDoc, id: string) {
  const record = doc.records[id]
  return JSON.stringify([
    editableFields.map((field) => record[field]),
    conflictsFor(record).map((conflict) => [conflict.field, [...conflict.values].sort()]),
  ])
}
export function summarizeImport(before: WorkspaceDoc | null, after: WorkspaceDoc): ImportSummary {
  const addedIds: string[] = [],
    updatedIds: string[] = []
  for (const id of Object.keys(after.records)) {
    if (!before?.records[id]) addedIds.push(id)
    else if (signature(before, id) !== signature(after, id)) updatedIds.push(id)
  }
  return {
    addedIds,
    updatedIds,
    historyAdded: Object.keys(after.history).filter((id) => !before?.history[id]).length,
    conflicts: Object.values(after.records).filter((r) => conflictsFor(r).length > 0).length,
  }
}
