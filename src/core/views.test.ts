import { expect, it } from 'vitest'
import { addRecord, createWorkspace, editRecord, mergeWorkspace } from './model'
import { activityEntries, filterRecords, locationGroups } from './views'

it('combines filters, searches assignments, and keeps reserved-looking team names distinct', () => {
  let doc = addRecord(
    createWorkspace('Test'),
    { title: 'Water', note: '', location: 'Camp 1', kind: 'supply', assignee: ' all ' },
    'Base',
  )
  doc = addRecord(doc, { title: 'Bridge', note: '', location: 'Camp 2', kind: 'hazard' }, 'Base')
  const filters = {
    scope: 'all',
    kind: 'supply',
    status: 'open',
    assignee: 'name:all',
    search: ' ALL ',
  }
  expect(filterRecords(Object.values(doc.records), filters).map((r) => r.title)).toEqual(['Water'])
  expect(
    filterRecords(Object.values(doc.records), {
      ...filters,
      kind: 'all',
      search: '',
      assignee: 'unassigned',
    }).map((r) => r.title),
  ).toEqual(['Bridge'])
})

it('groups locations without hiding unresolved archive decisions or prioritizing completed hazards', () => {
  let doc = addRecord(
    createWorkspace('Test'),
    { title: 'Camp', note: '', location: ' Camp 1 ', kind: 'checkpoint' },
    'Base',
  )
  const checkpoint = Object.keys(doc.records)[0]
  doc = addRecord(doc, { title: 'Bridge', note: '', location: 'camp 1', kind: 'hazard' }, 'Base')
  const hazard = Object.keys(doc.records).find((id) => id !== checkpoint)!
  const merged = mergeWorkspace(
    editRecord(doc, checkpoint, { status: 'archived' }, 'A'),
    editRecord(doc, checkpoint, { status: 'done' }, 'B'),
  )
  const groups = locationGroups(Object.values(merged.records))
  expect(groups).toHaveLength(1)
  expect(groups[0].records.map((r) => r.id)).toEqual([checkpoint, hazard])
  const archived = editRecord(merged, checkpoint, { status: 'archived' }, 'Base')
  expect(locationGroups(Object.values(archived.records))[0].records.map((r) => r.id)).toEqual([
    hazard,
  ])
})

it('activity includes imported history with actor and record searches', () => {
  const base = addRecord(
    createWorkspace('Test'),
    { title: 'Bridge', note: '', location: '', kind: 'hazard' },
    'Base',
  )
  const id = Object.keys(base.records)[0]
  const merged = mergeWorkspace(
    editRecord(base, id, { note: 'Closed' }, 'Ridge'),
    editRecord(base, id, { assignee: 'Scout' }, 'Valley'),
  )
  expect(activityEntries(merged, 'bridge', 'Valley')).toHaveLength(1)
  expect(
    activityEntries(merged, '', '')
      .map((h) => h.actor)
      .sort(),
  ).toEqual(['Base', 'Ridge', 'Valley'])
  expect(activityEntries(merged, 'missing', '')).toEqual([])
})
