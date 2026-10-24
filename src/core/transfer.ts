import { A, heads, validateWorkspace, type WorkspaceDoc } from './model'

export const MAX_FILE_BYTES = 1_500_000
export const MAX_SNAPSHOT_BYTES = 900_000
export const FRAME_CHARS = 650
export const MAX_FRAMES = 200
const PREFIX = 'BO1'
export interface Exchange {
  format: 'blackout-exchange'
  version: 1
  workspaceId: string
  sender: string
  createdAt: string
  payload: string
  sha256: string
  heads: string
}
export interface Frame {
  transferId: string
  index: number
  total: number
  chunk: string
}
export interface ReceiverState {
  transferId: string
  total: number
  chunks: Record<string, string>
  startedAt: number
}
export const EMPTY_RECEIVER: ReceiverState = { transferId: '', total: 0, chunks: {}, startedAt: 0 }

export function toBase64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(text)
}
export function fromBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    throw new Error('Invalid transfer encoding.')
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  if (!crypto.subtle) throw new Error('A secure connection (HTTPS or localhost) is required.')
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
export async function makeExchange(doc: WorkspaceDoc, sender: string): Promise<string> {
  const bytes = A.save(doc)
  if (bytes.length > MAX_SNAPSHOT_BYTES)
    throw new Error(
      'This workspace is too large for this prototype. Export smaller expeditions in future versions.',
    )
  const envelope: Exchange = {
    format: 'blackout-exchange',
    version: 1,
    workspaceId: doc.id,
    sender,
    createdAt: new Date().toISOString(),
    payload: toBase64(bytes),
    sha256: await sha256(bytes),
    heads: heads(doc),
  }
  return JSON.stringify(envelope)
}
export async function readExchange(
  text: string,
): Promise<{ doc: WorkspaceDoc; envelope: Exchange }> {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES)
    throw new Error('Transfer file is too large.')
  let e: Exchange
  try {
    e = JSON.parse(text)
  } catch {
    throw new Error('This is not a valid BlackOut exchange file.')
  }
  if (!e || e.format !== 'blackout-exchange' || e.version !== 1)
    throw new Error('Unsupported transfer version or file type.')
  if (
    typeof e.workspaceId !== 'string' ||
    e.workspaceId.length > 80 ||
    typeof e.sender !== 'string' ||
    !e.sender.trim() ||
    e.sender.length > 80 ||
    typeof e.createdAt !== 'string' ||
    e.createdAt.length > 40 ||
    typeof e.payload !== 'string' ||
    e.payload.length > 1_200_000 ||
    typeof e.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(e.sha256) ||
    typeof e.heads !== 'string' ||
    e.heads.length > 100_000
  )
    throw new Error('Malformed exchange metadata.')
  const bytes = fromBase64(e.payload)
  if (bytes.length > MAX_SNAPSHOT_BYTES || (await sha256(bytes)) !== e.sha256)
    throw new Error('Transfer integrity check failed. Please send it again.')
  let doc: WorkspaceDoc
  try {
    doc = A.load(bytes)
  } catch {
    throw new Error('The transferred workspace could not be decoded.')
  }
  validateWorkspace(doc)
  if (doc.id !== e.workspaceId || heads(doc) !== e.heads)
    throw new Error('Transfer metadata does not match the workspace.')
  return { doc, envelope: e }
}
export async function makeFrames(text: string): Promise<string[]> {
  const encoded = toBase64(new TextEncoder().encode(text))
  const total = Math.ceil(encoded.length / FRAME_CHARS)
  if (total > MAX_FRAMES)
    throw new Error('This expedition is too large for QR exchange. Use the exchange file instead.')
  const id = await sha256(new TextEncoder().encode(encoded))
  return Array.from(
    { length: total },
    (_, i) =>
      `${PREFIX}|${id}|${i}|${total}|${encoded.slice(i * FRAME_CHARS, (i + 1) * FRAME_CHARS)}`,
  )
}
export function parseFrame(text: string): Frame {
  if (text.length > FRAME_CHARS + 100) throw new Error('QR frame is too large.')
  const parts = text.split('|')
  if (
    parts.length !== 5 ||
    parts[0] !== PREFIX ||
    !/^[a-f0-9]{64}$/.test(parts[1]) ||
    !/^\d+$/.test(parts[2]) ||
    !/^\d+$/.test(parts[3])
  )
    throw new Error('This is not a BlackOut update QR. Scan a code shown inside BlackOut.')
  const index = Number(parts[2]),
    total = Number(parts[3])
  if (
    total < 1 ||
    total > MAX_FRAMES ||
    index < 0 ||
    index >= total ||
    !/^[A-Za-z0-9+/=]+$/.test(parts[4]) ||
    parts[4].length > FRAME_CHARS
  )
    throw new Error('Invalid QR frame.')
  return { transferId: parts[1], index, total, chunk: parts[4] }
}
export function collectFrame(state: ReceiverState, text: string): ReceiverState {
  const frame = parseFrame(text)
  if (state.transferId && frame.transferId !== state.transferId)
    throw new Error(
      'A different transfer is already in progress. Reset the receiver before scanning a new transfer.',
    )
  if (state.total && frame.total !== state.total)
    throw new Error('Inconsistent transfer frame count.')
  if (state.chunks[frame.index] && state.chunks[frame.index] !== frame.chunk)
    throw new Error('Conflicting data for this QR frame.')
  return {
    transferId: frame.transferId,
    total: frame.total,
    chunks: { ...state.chunks, [frame.index]: frame.chunk },
    startedAt: state.startedAt || Date.now(),
  }
}
export async function assembleFrames(state: ReceiverState): Promise<string> {
  if (!state.total || Object.keys(state.chunks).length !== state.total)
    throw new Error('Some QR frames are still missing.')
  const joined = Array.from({ length: state.total }, (_, i) => state.chunks[i] ?? '').join('')
  if ((await sha256(new TextEncoder().encode(joined))) !== state.transferId)
    throw new Error('QR transfer failed its integrity check. Reset and scan again.')
  return new TextDecoder('utf-8', { fatal: true }).decode(fromBase64(joined))
}
