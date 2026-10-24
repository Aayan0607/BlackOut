import { expect, it } from 'vitest'
import { advanceReplay, createReplay, replayFacts, teamIds } from './replay'
import { conflictsFor, heads } from './model'
import { summarizeImport } from './importSummary'
import { Repository } from '../storage/repository'

it.each(['Ridge Team', 'Valley Team'] as const)(
  'carries the %s decision through real encounters and converges every replica',
  (choice) => {
    const initial = createReplay(),
      initialHeads = heads(initial.docs.ridge)
    expect(replayFacts(initial).converged).toBe(true)
    let state = advanceReplay(initial)
    expect(replayFacts(state)).toEqual({ converged: false, reports: 4, conflicts: 0 })
    expect(heads(initial.docs.ridge)).toBe(initialHeads)
    state = advanceReplay(state)
    expect(conflictsFor(state.docs.valley.records[state.checkpointId])[0].values.sort()).toEqual([
      'Ridge Team',
      'Valley Team',
    ])
    expect(() => advanceReplay(state)).toThrow('Choose a team')
    const ridgeBefore = heads(state.docs.ridge)
    state = advanceReplay(state, choice)
    expect(heads(state.docs.ridge)).toBe(ridgeBefore)
    expect(state.docs.base.records[state.checkpointId].assignee).toBe('To be decided')
    state = advanceReplay(state)
    expect(Object.keys(state.docs.base.records)).toHaveLength(4)
    expect(Object.keys(state.docs.ridge.records)).toHaveLength(2)
    state = advanceReplay(advanceReplay(state))
    expect(replayFacts(state)).toEqual({ converged: true, reports: 4, conflicts: 0 })
    for (const id of teamIds) {
      expect(state.docs[id].records[state.checkpointId].assignee).toBe(choice)
      expect(Object.keys(state.docs[id].records)).toHaveLength(4)
    }
  },
)

it('summarizes new reports, conflict changes, resolutions, and duplicate imports without counting local-only data as new', async () => {
  let state = advanceReplay(createReplay())
  const before = state.docs.valley
  state = advanceReplay(state)
  const merged = state.docs.valley
  const summary = summarizeImport(before, merged)
  expect(summary.addedIds).toHaveLength(1)
  expect(summary.updatedIds).toEqual([state.checkpointId])
  expect(summary.conflicts).toBe(1)
  expect(summary.historyAdded).toBe(2)
  const resolved = advanceReplay(state, 'Valley Team').docs.valley
  expect(summarizeImport(merged, resolved).updatedIds).toEqual([state.checkpointId])
  expect(summarizeImport(merged, resolved).conflicts).toBe(0)
  expect(summarizeImport(resolved, resolved)).toEqual({
    addedIds: [],
    updatedIds: [],
    conflicts: 0,
    historyAdded: 0,
  })
  const repo = new Repository(`summary-${crypto.randomUUID()}`)
  await repo.insert(before)
  const receipt = await repo.import(state.docs.ridge, 'Courier')
  expect(receipt.summary).toEqual(summary)
  expect((await repo.getReceipt(before.id))?.summary).toEqual(summary)
  await repo.close()
})
