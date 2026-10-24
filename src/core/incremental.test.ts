import { expect, it } from 'vitest'
import { A, addRecord, createWorkspace, heads, mergeWorkspace } from './model'
import {
  makeExchange,
  makeFrames,
  makeReceiverRequest,
  makeRequestedExchange,
  readExchange,
  sha256,
  toBase64,
} from './transfer'

it('sends a smaller delta, preserves concurrent receiver edits, and safely retries', async () => {
  let base = createWorkspace('Delta expedition')
  for (let i = 0; i < 30; i++)
    base = addRecord(
      base,
      {
        title: `Checkpoint ${i}`,
        note: crypto.randomUUID(),
        location: 'Ridge',
        kind: 'checkpoint',
      },
      'Alice',
    )
  const sender = addRecord(
    A.clone(base),
    { title: 'New water', note: '', location: '', kind: 'supply' },
    'Alice',
  )
  const request = makeReceiverRequest(base)
  const delta = await makeRequestedExchange(sender, 'Alice', request)
  expect(delta.incremental).toBe(true)
  const small = (await makeFrames(delta.text)).length
  const full = (await makeFrames(await makeExchange(sender, 'Alice'))).length
  expect(small).toBeLessThan(full)
  console.log(`Incremental QR: ${small} frames versus ${full} full frames`)
  const receiver = addRecord(
    A.clone(base),
    { title: 'Local hazard', note: '', location: '', kind: 'hazard' },
    'Bob',
  )
  const incoming = await readExchange(delta.text, receiver)
  expect(heads(incoming.doc)).toBe(heads(sender))
  const merged = mergeWorkspace(receiver, incoming.doc)
  expect(Object.keys(merged.records)).toHaveLength(32)
  expect(heads(mergeWorkspace(merged, (await readExchange(delta.text, merged)).doc))).toBe(
    heads(merged),
  )
  await expect(readExchange(delta.text)).rejects.toThrow('base history')
  await expect(readExchange(delta.text, createWorkspace('Wrong'))).rejects.toThrow('base history')
  const fallback = await makeRequestedExchange(sender, 'Alice', makeReceiverRequest(receiver))
  expect(fallback.incremental).toBe(false)
  const corrupt = JSON.parse(delta.text)
  corrupt.payload = toBase64(new TextEncoder().encode('[]'))
  corrupt.sha256 = await sha256(new TextEncoder().encode('[]'))
  await expect(readExchange(JSON.stringify(corrupt), base)).rejects.toThrow('metadata')
  const repeat = await makeRequestedExchange(sender, 'Alice', makeReceiverRequest(sender))
  expect(heads((await readExchange(repeat.text, sender)).doc)).toBe(heads(sender))
})

it('rejects malformed and unrelated receiver requests', async () => {
  const doc = createWorkspace('A')
  for (const request of [
    'wrong',
    'BOREQ1|null',
    'BOREQ1|{}',
    makeReceiverRequest(createWorkspace('B')),
    'x'.repeat(1500),
  ]) {
    await expect(makeRequestedExchange(doc, 'Alice', request)).rejects.toThrow()
  }
})
