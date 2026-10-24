import { describe, it, expect } from 'vitest'
import { Repository } from './repository'
import { A, addRecord, createWorkspace, heads } from '../core/model'
import { collectFrame, EMPTY_RECEIVER, makeExchange, makeFrames } from '../core/transfer'

const input = (title: string) => ({ title, note: '', location: '', kind: 'observation' as const })
describe('durable local storage', () => {
  it('survives reopening with a new actor and restores an interrupted transfer', async () => {
    const name = `test-${crypto.randomUUID()}`, repo = new Repository(name)
    const doc = addRecord(createWorkspace('Ridge'), input('Saved'), 'Alice')
    await repo.insert(doc)
    const frames = await makeFrames(await makeExchange(doc, 'Alice'))
    await repo.saveReceiver(collectFrame(EMPTY_RECEIVER, frames[0]))
    await repo.setSetting('deviceName', 'Alice')
    await repo.close()
    const reopened = new Repository(name)
    expect(heads((await reopened.load(doc.id))!)).toBe(heads(doc))
    expect(await reopened.getSetting('deviceName')).toBe('Alice')
    expect(Object.keys((await reopened.getReceiver())!.chunks)).toHaveLength(1)
    await reopened.close()
  })
  it('serializes writes from two tabs without losing either update', async () => {
    const name = `test-${crypto.randomUUID()}`, a = new Repository(name), b = new Repository(name)
    const doc = createWorkspace('Ridge'); await a.insert(doc)
    await Promise.all([a.mutate(doc.id, d => addRecord(d, input('A'), 'Alice')), b.mutate(doc.id, d => addRecord(d, input('B'), 'Bob'))])
    expect(Object.keys((await a.load(doc.id))!.records)).toHaveLength(2)
    await a.close(); await b.close()
  })
  it('makes imports idempotent and distinguishes matching from diverged snapshots', async () => {
    const repo = new Repository(`test-${crypto.randomUUID()}`), base = createWorkspace('Ridge')
    await repo.insert(base)
    const incoming = addRecord(A.clone(base), input('A'), 'Alice')
    expect((await repo.import(incoming, 'Alice')).matchedHeads).toBe(heads(incoming))
    expect((await repo.import(incoming, 'Alice')).sameBefore).toBe(true)
    await repo.mutate(base.id, d => addRecord(d, input('B'), 'Bob'))
    expect((await repo.import(incoming, 'Alice')).matchedHeads).toBe('')
    expect(Object.keys((await repo.load(base.id))!.records)).toHaveLength(2)
    await repo.close()
  })
  it('keeps stored data intact when a write fails validation', async () => {
    const repo = new Repository(`test-${crypto.randomUUID()}`), base = createWorkspace('Ridge')
    await repo.insert(base)
    await expect(repo.mutate(base.id, d => addRecord(d, input(''), 'Alice'))).rejects.toThrow()
    expect(heads((await repo.load(base.id))!)).toBe(heads(base))
    await repo.close()
  })
})
