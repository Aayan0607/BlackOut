import { conflictsFor, type FieldRecord, type WorkspaceDoc } from './model'

export interface LogFilters {
  scope: string
  kind: string
  status: string
  assignee: string
  search: string
}

export function filterRecords(records: FieldRecord[], filters: LogFilters) {
  const query = filters.search.trim().toLocaleLowerCase()
  return records
    .filter((record) => {
      const conflict = conflictsFor(record).length > 0
      const inScope =
        filters.scope === 'conflicts'
          ? conflict
          : filters.scope === 'archived'
            ? record.status === 'archived'
            : record.status !== 'archived'
      return (
        inScope &&
        (filters.kind === 'all' || record.kind === filters.kind) &&
        (filters.status === 'all' || record.status === filters.status) &&
        (filters.assignee === 'all' ||
          (filters.assignee === 'unassigned'
            ? !record.assignee.trim()
            : `name:${record.assignee}` === filters.assignee)) &&
        [record.title, record.note, record.location, record.assignee, record.author]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query)
      )
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}

export function locationGroups(records: FieldRecord[]) {
  const groups = new Map<string, { key: string; label: string; records: FieldRecord[] }>()
  for (const record of records) {
    // An archived display winner must not hide an unresolved concurrent decision.
    if (record.status === 'archived' && !conflictsFor(record).length) continue
    const label = record.location.trim()
    const key = label.toLocaleLowerCase()
    const group = groups.get(key) ?? { key, label: label || 'Location not recorded', records: [] }
    group.records.push(record)
    groups.set(key, group)
  }
  return [...groups.values()]
    .sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : a.key.localeCompare(b.key)))
    .map((group) => ({
      ...group,
      records: group.records.sort(
        (a, b) =>
          Number(conflictsFor(b).length > 0) - Number(conflictsFor(a).length > 0) ||
          Number(b.kind === 'hazard' && b.status === 'open') -
            Number(a.kind === 'hazard' && a.status === 'open') ||
          Number(b.kind === 'checkpoint') - Number(a.kind === 'checkpoint') ||
          a.title.localeCompare(b.title) ||
          a.id.localeCompare(b.id),
      ),
    }))
}

export function activityEntries(doc: WorkspaceDoc, query: string, actor: string) {
  return Object.values(doc.history)
    .filter(
      (entry) =>
        (actor === '' || entry.actor === actor) &&
        `${entry.actor} ${entry.message} ${doc.records[entry.recordId]?.title ?? ''}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
}
