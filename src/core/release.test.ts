import { describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  A,
  addRecord,
  conflictsFor,
  createWorkspace,
  editRecord,
  heads,
  mergeWorkspace,
  validateWorkspace,
  type WorkspaceDoc,
} from './model'
import { createDemoWorkspace } from './demo'
import {
  assembleFrames,
  collectFrame,
  EMPTY_RECEIVER,
  makeExchange,
  makeFrames,
  readExchange,
} from './transfer'
import { Repository } from '../storage/repository'

function randomText(seed: number, length: number) {
  let state = seed + 1
  return Array.from({ length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return 'abcdefghijklmnopqrstuvwxyz0123456789 '[state % 37]
  }).join('')
}
function record(index: number) {
  return {
    title: `Synthetic report ${index.toString().padStart(3, '0')} · हिमालय`,
    note: randomText(index, 1100),
    location: `Camp ${index % 10}`,
    kind: (['checkpoint', 'hazard', 'supply', 'observation'] as const)[index % 4],
    assignee: `Team ${index % 5}`,
  }
}

describe('release synthetic-data checks', () => {
  it('creates isolated demo documents with a genuine concurrent assignment', () => {
    const first = createDemoWorkspace(),
      second = createDemoWorkspace()
    expect(first.id).not.toBe(second.id)
    expect(Object.keys(first.records)).toHaveLength(8)
    expect(Object.values(first.records).filter((r) => conflictsFor(r).length)).toHaveLength(1)
    validateWorkspace(first)
  })

  it('converges three teams through all merge orders, replay and stale snapshots', async () => {
    let base = createWorkspace('SYNTHETIC · three-team relay')
    for (let i = 0; i < 12; i++) base = addRecord(base, record(i), 'Base')
    const shared = Object.keys(base.records)[0]
    const replicas = ['Ridge', 'Valley', 'Base'].map((name, team) => {
      let doc = editRecord(base, shared, { assignee: name }, name)
      for (let i = 0; i < 12; i++) doc = addRecord(doc, record(20 + team * 12 + i), name)
      return doc
    })
    let expected = ''
    for (const order of [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ]) {
      let merged = base
      for (const index of order)
        merged = mergeWorkspace(
          merged,
          (await readExchange(await makeExchange(replicas[index], 'Courier'))).doc,
        )
      expected ||= heads(merged)
      expect(heads(merged)).toBe(expected)
      expect(Object.keys(merged.records)).toHaveLength(48)
      expect(conflictsFor(merged.records[shared])[0].values.sort()).toEqual([
        'Base',
        'Ridge',
        'Valley',
      ])
      const resolved = editRecord(merged, shared, { assignee: 'Ridge' }, 'Coordinator')
      expect(conflictsFor(mergeWorkspace(resolved, replicas[2]).records[shared])).toEqual([])
      expect(heads(mergeWorkspace(resolved, base))).toBe(heads(resolved))
    }
  }, 60_000)

  it('round trips 300 records, exercises QR fallback, and preserves storage at capacity', async () => {
    const start = performance.now()
    let doc = createWorkspace('SYNTHETIC · 300 record endurance')
    for (let i = 0; i < 300; i++) doc = addRecord(doc, record(i), `Team ${i % 5}`)
    const original = heads(doc)
    expect(() => addRecord(doc, record(301), 'Base')).toThrow('limit')
    expect(heads(doc)).toBe(original)
    const text = await makeExchange(doc, 'Synthetic Generator')
    expect(heads((await readExchange(text)).doc)).toBe(original)
    await expect(makeFrames(text)).rejects.toThrow('exchange file')
    const repo = new Repository(`capacity-${crypto.randomUUID()}`)
    await repo.import(doc, 'Synthetic Generator')
    await expect(
      repo.mutate(doc.id, (current) => addRecord(current, record(301), 'Base')),
    ).rejects.toThrow('limit')
    expect(heads((await repo.load(doc.id))!)).toBe(original)
    const remote = addRecord(createWorkspace('Another'), record(0), 'Base')
    await repo.import(remote, 'Base')
    expect(await repo.list()).toHaveLength(2)
    await repo.close()
    await mkdir('artifacts/synthetic', { recursive: true })
    await writeFile('artifacts/synthetic/large.blackout.json', text)
    await writeFile(
      'artifacts/synthetic/demo.blackout.json',
      await makeExchange(createDemoWorkspace(), 'Synthetic Generator'),
    )
    await writeFile(
      'artifacts/synthetic/metrics.json',
      JSON.stringify(
        {
          records: 300,
          history: Object.keys(doc.history).length,
          snapshotBytes: A.save(doc).length,
          exchangeBytes: new TextEncoder().encode(text).length,
          elapsedMs: Math.round(performance.now() - start),
          qrFallback: true,
        },
        null,
        2,
      ),
    )
  }, 120_000)

  it('preserves a partial QR transfer across every frame boundary with duplicates', async () => {
    const text = await makeExchange(createDemoWorkspace(), 'Demo')
    const frames = await makeFrames(text)
    let state = EMPTY_RECEIVER
    const repo = new Repository(`frames-${crypto.randomUUID()}`)
    for (const frame of [...frames].reverse()) {
      state = collectFrame(state, frame)
      state = collectFrame(state, frame)
      await repo.saveReceiver(state)
      state = (await repo.getReceiver())!
    }
    expect(await assembleFrames(state)).toBe(text)
    await repo.close()
  })

  it('serializes 24 simultaneous tab edits and refuses an over-capacity merge atomically', async () => {
    const name = `burst-${crypto.randomUUID()}`,
      repo = new Repository(name),
      other = new Repository(name)
    const base = createWorkspace('Burst')
    await repo.insert(base)
    await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        (i % 2 ? repo : other).mutate(base.id, (d) => addRecord(d, record(i), `Team ${i}`)),
      ),
    )
    expect(Object.keys((await repo.load(base.id))!.records)).toHaveLength(24)
    await repo.close()
    await other.close()
    // A single seeded change isolates the merge boundary without 300 sequential UI operations.
    const full = A.change(A.clone(base), (d) => {
      for (let i = 0; i < 300; i++)
        d.records[`seed-${i}`] = {
          ...record(i),
          id: `seed-${i}`,
          author: 'Base',
          createdAt: base.createdAt,
          status: 'open',
        }
    })
    const target = new Repository(`overflow-${crypto.randomUUID()}`)
    await target.import(full, 'Base')
    const receipt = await target.getReceipt(base.id)
    await expect(target.import(addRecord(base, record(999), 'Remote'), 'Remote')).rejects.toThrow(
      '300-record',
    )
    expect(heads((await target.load(base.id))!)).toBe(heads(full))
    expect(await target.getReceipt(base.id)).toEqual(receipt)
    await target.close()
  }, 60_000)

  it('rejects orphan history, unsupported schemas, and invalid concurrent values', async () => {
    const base = addRecord(createWorkspace('Validation'), record(0), 'Base')
    const id = Object.keys(base.records)[0]
    const invalid: WorkspaceDoc[] = [
      A.change(A.clone(base), (d) => {
        d.schemaVersion = 999
      }),
      A.change(A.clone(base), (d) => {
        d.history.bad = {
          id: 'bad',
          recordId: 'missing',
          actor: 'A',
          at: base.createdAt,
          message: 'Invalid reference',
        }
      }),
      A.merge(
        A.change(A.clone(base), (d) => {
          d.records[id].note = 'x'.repeat(1201)
        }),
        editRecord(base, id, { note: 'valid' }, 'B'),
      ),
    ]
    for (const doc of invalid) expect(() => validateWorkspace(doc)).toThrow()
    await expect(makeExchange(base, '')).rejects.toThrow('device name')
    const atLimit = A.change(A.clone(base), (d) => {
      for (let i = Object.keys(d.history).length; i < 3000; i++)
        d.history[`h-${i}`] = {
          id: `h-${i}`,
          recordId: id,
          actor: 'Seed',
          at: base.createdAt,
          message: 'Synthetic history',
        }
    })
    expect(() => editRecord(atLimit, id, { note: 'one too many' }, 'Base')).toThrow('History limit')
    validateWorkspace(atLimit)
  }, 60_000)
})
