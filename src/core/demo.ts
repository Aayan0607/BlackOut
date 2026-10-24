import { addRecord, createWorkspace, editRecord, mergeWorkspace, type RecordKind } from './model'

/** Synthetic data only. Always creates a separate expedition with a fresh ID. */
export function createDemoWorkspace() {
  let doc = createWorkspace('DEMO · Northern Ridge Expedition')
  const items: [RecordKind, string, string, string, string][] = [
    [
      'checkpoint',
      'Reach the ridge camp',
      'Camp 2',
      'Base Team',
      'Demo: confirm arrival at the rendezvous.',
    ],
    [
      'hazard',
      'Loose rocks on the eastern approach',
      'Camp 2',
      'Scout Team',
      'Demo: mark the approach for review before the next team arrives.',
    ],
    [
      'supply',
      'Water cache reported',
      'Camp 1',
      'Valley Team',
      'Demo observation: six sealed bottles reported. This is not a live stock count.',
    ],
    [
      'observation',
      'Trail marker needs replacing',
      'Camp 1',
      '',
      'Demo: blue marker faded near the fork.',
    ],
    [
      'checkpoint',
      'Equipment check at base',
      'Base camp',
      'Base Team',
      'Demo: verify batteries and paper route notes.',
    ],
    [
      'observation',
      'Weather observation · बादल',
      'North ridge',
      'Ridge Team',
      'Demo: cloud cover increased. No weather service is connected.',
    ],
    [
      'supply',
      'Spare battery handover',
      'Base camp',
      'Base Team',
      'Demo: confirm the handover in person.',
    ],
    ['observation', 'Unlocated field note', '', '', 'Demo: add a location when known.'],
  ]
  for (const [kind, title, location, assignee, note] of items)
    doc = addRecord(doc, { kind, title, location, assignee, note }, 'Demo Base')
  const checkpoint = Object.values(doc.records).find((r) => r.title === 'Reach the ridge camp')!.id
  const completed = Object.values(doc.records).find(
    (r) => r.title === 'Equipment check at base',
  )!.id
  doc = editRecord(doc, completed, { status: 'done' }, 'Demo Base')
  return mergeWorkspace(
    editRecord(doc, checkpoint, { assignee: 'Ridge Team' }, 'Demo Ridge'),
    editRecord(doc, checkpoint, { assignee: 'Valley Team' }, 'Demo Valley'),
  )
}
