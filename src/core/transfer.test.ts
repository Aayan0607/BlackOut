import { describe, it, expect } from 'vitest'
import { addRecord, createWorkspace, heads } from './model'
import {
  assembleFrames,
  collectFrame,
  EMPTY_RECEIVER,
  fromBase64,
  makeExchange,
  makeFrames,
  MAX_FILE_BYTES,
  parseFrame,
  readExchange,
} from './transfer'

describe('versioned exchange protocol', () => {
  it('round trips a real snapshot through reversed and repeated QR frames', async () => {
    const doc = addRecord(
      createWorkspace('हिमालय / Ridge'),
      { title: 'Water 💧', note: 'Unicode survives', location: 'Camp 2', kind: 'supply' },
      'Ridge team',
    )
    const text = await makeExchange(doc, 'Ridge team'),
      frames = await makeFrames(text)
    expect(frames.length).toBeGreaterThan(1)
    let received = EMPTY_RECEIVER
    for (const frame of [...frames].reverse()) {
      received = collectFrame(received, frame)
      received = collectFrame(received, frame)
    }
    expect(Object.keys(received.chunks)).toHaveLength(frames.length)
    const incoming = await readExchange(await assembleFrames(received))
    expect(heads(incoming.doc)).toBe(heads(doc))
    expect(incoming.doc.name).toBe('हिमालय / Ridge')
  })
  it('refuses partial, mixed, and corrupt transfers', async () => {
    const a = await makeFrames(await makeExchange(createWorkspace('A'), 'Alice'))
    const b = await makeFrames(await makeExchange(createWorkspace('B'), 'Bob'))
    const partial = collectFrame(EMPTY_RECEIVER, a[0])
    await expect(assembleFrames(partial)).rejects.toThrow('missing')
    expect(() => collectFrame(partial, b[0])).toThrow('different transfer')
    let received = EMPTY_RECEIVER
    for (const frame of a) received = collectFrame(received, frame)
    received.chunks['0'] = 'AAAA' + received.chunks['0'].slice(4)
    await expect(assembleFrames(received)).rejects.toThrow('integrity')
  })
  it('rejects corrupted payloads and mismatched metadata', async () => {
    const original = JSON.parse(await makeExchange(createWorkspace('A'), 'Alice'))
    await expect(
      readExchange(JSON.stringify({ ...original, sha256: '0'.repeat(64) })),
    ).rejects.toThrow('integrity')
    await expect(
      readExchange(JSON.stringify({ ...original, workspaceId: 'wrong' })),
    ).rejects.toThrow('metadata')
    await expect(readExchange(JSON.stringify({ ...original, heads: 'wrong' }))).rejects.toThrow(
      'metadata',
    )
    await expect(readExchange(JSON.stringify({ ...original, version: 999 }))).rejects.toThrow(
      'version',
    )
  })
  it('bounds malformed and oversized inputs before decoding', async () => {
    await expect(readExchange('x'.repeat(MAX_FILE_BYTES + 1))).rejects.toThrow('large')
    await expect(readExchange('{')).rejects.toThrow('valid')
    expect(() => parseFrame(`BO1|${'a'.repeat(64)}|0|999999|AAAA`)).toThrow('Invalid')
    expect(() => parseFrame('https://example.com')).toThrow('not a BlackOut')
    expect(() => fromBase64('not base64!')).toThrow('encoding')
  })
})
