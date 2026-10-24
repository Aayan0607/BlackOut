import { describe, it, expect } from 'vitest'
import {
  A,
  addRecord,
  conflictsFor,
  createWorkspace,
  editRecord,
  heads,
  mergeWorkspace,
} from './model'

const input = (title: string) => ({
  title,
  note: '',
  location: 'Camp 1',
  kind: 'observation' as const,
})
describe('independent expedition replicas', () => {
  it('merges independent additions in either order without duplicates', () => {
    const base = createWorkspace('Ridge expedition')
    const alice = addRecord(A.clone(base), input('Bridge closed'), 'Alice')
    const bob = addRecord(A.clone(base), input('Water at camp'), 'Bob')
    const ab = mergeWorkspace(alice, bob),
      ba = mergeWorkspace(bob, alice)
    expect(heads(ab)).toBe(heads(ba))
    expect(
      Object.values(ab.records)
        .map((r) => r.title)
        .sort(),
    ).toEqual(['Bridge closed', 'Water at camp'])
    expect(heads(mergeWorkspace(ab, bob))).toBe(heads(ab))
  })
  it('retains conflicting edits and propagates an explicit resolution', () => {
    const base = addRecord(createWorkspace('Ridge expedition'), input('Next camp'), 'Base')
    const id = Object.keys(base.records)[0]
    const alice = editRecord(A.clone(base), id, { assignee: 'Ravi' }, 'Alice')
    const bob = editRecord(A.clone(base), id, { assignee: 'Neha' }, 'Bob')
    const merged = mergeWorkspace(alice, bob)
    expect(conflictsFor(merged.records[id])[0].values.sort()).toEqual(['Neha', 'Ravi'])
    const resolved = editRecord(merged, id, { assignee: 'Neha' }, 'Coordinator')
    const returned = mergeWorkspace(bob, resolved)
    expect(conflictsFor(returned.records[id])).toEqual([])
    expect(returned.records[id].assignee).toBe('Neha')
    expect(Object.values(returned.history).some((e) => e.actor === 'Coordinator')).toBe(true)
  })
  it('combines separate fields and preserves an archived record', () => {
    const base = addRecord(createWorkspace('Ridge expedition'), input('Tent'), 'Base')
    const id = Object.keys(base.records)[0]
    const merged = mergeWorkspace(
      editRecord(A.clone(base), id, { status: 'archived' }, 'A'),
      editRecord(A.clone(base), id, { note: 'Packed' }, 'B'),
    )
    expect(merged.records[id].status).toBe('archived')
    expect(merged.records[id].note).toBe('Packed')
  })
  it('supports a third-device relay without the origin device present', () => {
    const base = createWorkspace('Ridge expedition')
    const alice = addRecord(A.clone(base), input('Alice update'), 'Alice')
    const bob = addRecord(A.clone(base), input('Bob update'), 'Bob')
    const charlie = addRecord(A.clone(base), input('Charlie update'), 'Charlie')
    const relayed = mergeWorkspace(charlie, mergeWorkspace(alice, bob))
    expect(Object.keys(relayed.records)).toHaveLength(3)
    expect(heads(mergeWorkspace(alice, relayed))).toBe(heads(relayed))
  })
  it('rejects different workspaces and copied IDs without shared history', () => {
    const one = createWorkspace('One'),
      two = createWorkspace('Two')
    expect(() => mergeWorkspace(one, two)).toThrow('Different expedition')
    const spoof = A.change(A.clone(two), (draft) => {
      draft.id = one.id
    })
    expect(() => mergeWorkspace(one, spoof)).toThrow('origin')
  })
  it('rejects invalid edits without mutating the original', () => {
    const base = addRecord(createWorkspace('Ridge'), input('A'), 'Base')
    const id = Object.keys(base.records)[0],
      before = heads(base)
    expect(() => editRecord(base, id, { title: '' }, 'A')).toThrow()
    expect(heads(base)).toBe(before)
    expect(() => addRecord(base, input('x'.repeat(121)), 'A')).toThrow()
  })
})
