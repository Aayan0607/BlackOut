import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import QrScanner from 'qr-scanner'
import type { Repository, Receipt } from '../storage/repository'
import { heads, type WorkspaceDoc } from '../core/model'
import {
  assembleFrames,
  collectFrame,
  EMPTY_RECEIVER,
  makeExchange,
  makeFrames,
  MAX_FILE_BYTES,
  readExchange,
  type ReceiverState,
  type Exchange,
} from '../core/transfer'
import Scanner from './Scanner'
import MergeReveal from './MergeReveal'

export function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
export default function ExchangePanel({
  doc,
  deviceName,
  repository,
  onImported,
  receipt,
  onOpenLog,
}: {
  doc: WorkspaceDoc | null
  deviceName: string
  repository: Repository
  onImported: (id: string, receipt: Receipt) => Promise<void>
  receipt?: Receipt
  onOpenLog: () => void
}) {
  const [tab, setTab] = useState<'send' | 'receive'>(doc ? 'send' : 'receive')
  const [frames, setFrames] = useState<string[]>([])
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [qr, setQr] = useState('')
  const [outgoing, setOutgoing] = useState('')
  const [sentHeads, setSentHeads] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [receiver, setReceiver] = useState<ReceiverState>(EMPTY_RECEIVER)
  const receiverRef = useRef(receiver)
  const scanLock = useRef(false)
  const pendingRef = useRef(false)
  const [pending, setPending] = useState<{ doc: WorkspaceDoc; envelope: Exchange } | null>(null)
  const [pasted, setPasted] = useState('')
  const [receiverReady, setReceiverReady] = useState(false)
  const fingerprint = doc ? heads(doc) : ''
  const stale =
    !!outgoing &&
    (fingerprint !== sentHeads || (doc && JSON.parse(outgoing).workspaceId !== doc.id))

  useEffect(() => {
    repository
      .getReceiver()
      .then((saved) => {
        if (saved) {
          receiverRef.current = saved
          setReceiver(saved)
        }
        setReceiverReady(true)
      })
      .catch(() => {
        setError('Could not restore the pending transfer. Check browser storage.')
        setReceiverReady(true)
      })
  }, [repository])
  useEffect(() => {
    if (!frames.length) {
      setQr('')
      return
    }
    let alive = true
    QRCode.toDataURL(frames[frameIndex], {
      width: 480,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#10221d', light: '#ffffff' },
    })
      .then((url) => {
        if (alive) setQr(url)
      })
      .catch(() => setError('Could not render this QR code. Use an exchange file.'))
    return () => {
      alive = false
    }
  }, [frames, frameIndex])
  useEffect(() => {
    if (!playing || frames.length < 2 || stale || tab !== 'send') return
    const timer = setInterval(() => setFrameIndex((i) => (i + 1) % frames.length), 1400)
    return () => clearInterval(timer)
  }, [playing, frames.length, stale, tab])

  async function prepare() {
    if (!doc) return
    setBusy(true)
    setError('')
    setNotice('')
    setPlaying(false)
    setFrames([])
    setQr('')
    setOutgoing('')
    setSentHeads('')
    try {
      const latest = await repository.load(doc.id)
      if (!latest) throw new Error('Expedition unavailable.')
      const text = await makeExchange(latest, deviceName)
      setOutgoing(text)
      setSentHeads(heads(latest))
      setFrameIndex(0)
      try {
        setFrames(await makeFrames(text))
      } catch (e) {
        setNotice((e as Error).message)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function inspect(text: string) {
    const result = await readExchange(text)
    if (doc && result.doc.id !== doc.id)
      throw new Error(
        'This belongs to a different expedition. Switch expeditions, or choose “Join expedition” from the sidebar first.',
      )
    pendingRef.current = true
    setPending(result)
    setNotice('Transfer verified. Review it below before saving.')
    setError('')
  }
  async function scan(value: string) {
    if (scanLock.current || pendingRef.current || !receiverReady) return
    scanLock.current = true
    try {
      const next = collectFrame(receiverRef.current, value.trim())
      const changed =
        Object.keys(next.chunks).length !== Object.keys(receiverRef.current.chunks).length
      if (changed) await repository.saveReceiver(next)
      receiverRef.current = next
      setReceiver(next)
      setError('')
      if (Object.keys(next.chunks).length === next.total) await inspect(await assembleFrames(next))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      scanLock.current = false
    }
  }
  async function resume() {
    try {
      await inspect(await assembleFrames(receiverRef.current))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  async function resetReceiver() {
    await repository.clearReceiver()
    receiverRef.current = EMPTY_RECEIVER
    setReceiver(EMPTY_RECEIVER)
    pendingRef.current = false
    setPending(null)
    setNotice('')
    setError('')
  }
  async function accept() {
    if (!pending) return
    setBusy(true)
    setError('')
    try {
      const receipt = await repository.import(pending.doc, pending.envelope.sender)
      await resetReceiver()
      await onImported(pending.doc.id, receipt)
      setNotice(
        receipt.sameBefore
          ? 'Already received. No duplicate records were created.'
          : receipt.matchedHeads
            ? `Saved. This device now matches the snapshot from ${receipt.sender}. Return your snapshot to confirm on their device.`
            : `Saved updates from ${receipt.sender}. Send your combined snapshot back so they receive your changes too.`,
      )
    } catch (e) {
      setError(`Import was not completed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  async function importFile(file?: File) {
    if (!file) return
    setError('')
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('File is too large for this prototype.')
      await inspect(await file.text())
    } catch (e) {
      setError((e as Error).message)
    }
  }
  async function importQrImage(file?: File) {
    if (!file) return
    setError('')
    try {
      if (file.size > 10_000_000)
        throw new Error('QR image is too large. Use a smaller screenshot.')
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true })
      await scan(result.data)
    } catch (e) {
      setError(`Could not read the QR image. ${String(e)}`)
    }
  }
  const received = Object.keys(receiver.chunks).length
  return (
    <section className="exchange-layout">
      <div className="panel exchange-main">
        <MergeReveal receipt={receipt} onOpenLog={onOpenLog} />
        <div className="rendezvous-summary">
          <span className="eyebrow">TWO-WAY EXCHANGE</span>
          <p>Receive their updates → merge → send a fresh combined snapshot back.</p>
          {receipt && doc && (
            <p className="small">
              Last received from <strong>{receipt.sender}</strong>.{' '}
              {receipt.matchedHeads === fingerprint
                ? 'Your records match that received snapshot.'
                : 'Your local state differs from that received snapshot.'}{' '}
              Their device may have changed since then.
            </p>
          )}
          <p className="small muted">
            Showing a code or downloading a file does not confirm delivery. Ask the other person to
            confirm their import.
          </p>
        </div>
        <div className="tab-bar">
          <button
            className={tab === 'send' ? 'selected' : ''}
            disabled={!doc}
            onClick={() => setTab('send')}
          >
            Send updates
          </button>
          <button className={tab === 'receive' ? 'selected' : ''} onClick={() => setTab('receive')}>
            Receive updates
          </button>
        </div>
        {tab === 'send' ? (
          <>
            <h2>Let your updates travel.</h2>
            <p className="muted">
              The other device scans these codes inside BlackOut. No connection needed.
            </p>
            <button
              className="primary"
              disabled={busy || !doc || !deviceName.trim()}
              onClick={prepare}
            >
              {outgoing ? 'Refresh outgoing snapshot' : 'Prepare update codes'}
            </button>
            {stale && (
              <p className="warning">
                Your expedition changed. Refresh the snapshot before sending.
              </p>
            )}
            {qr && !stale && (
              <div className="qr-stage">
                <img
                  src={qr}
                  alt={`BlackOut transfer frame ${frameIndex + 1} of ${frames.length}`}
                />
                <p className="mono">
                  FRAME {frameIndex + 1} / {frames.length}
                </p>
                <div className="button-row">
                  <button
                    aria-label="Previous QR frame"
                    onClick={() => {
                      setPlaying(false)
                      setFrameIndex((i) => (i - 1 + frames.length) % frames.length)
                    }}
                  >
                    ←
                  </button>
                  <button onClick={() => setPlaying(!playing)}>
                    {playing ? 'Pause rotation' : 'Rotate codes'}
                  </button>
                  <button
                    aria-label="Next QR frame"
                    onClick={() => {
                      setPlaying(false)
                      setFrameIndex((i) => (i + 1) % frames.length)
                    }}
                  >
                    →
                  </button>
                </div>
                <p className="muted small">
                  Keep the screen bright. Frames can arrive in any order.
                </p>
              </div>
            )}
            {outgoing && (
              <div className="export-actions">
                <button
                  disabled={!!stale}
                  onClick={() =>
                    downloadText(outgoing, `blackout-${doc?.id.slice(0, 8)}.blackout.json`)
                  }
                >
                  Download exchange file
                </button>
                <span className="small muted">
                  Contains the complete expedition and its history.
                </span>
              </div>
            )}
            {frames.length > 12 && (
              <p className="warning">
                This snapshot has {frames.length} frames. File exchange may be easier for a larger
                expedition.
              </p>
            )}
            {frames.length > 0 && !stale && (
              <details>
                <summary>Manual transfer fallback</summary>
                <p className="small muted">
                  Copy a frame into the receiver’s manual input if camera access is unavailable.
                </p>
                <textarea
                  aria-label="Outgoing QR frame"
                  readOnly
                  value={frames[frameIndex]}
                  rows={4}
                />
              </details>
            )}
          </>
        ) : (
          <>
            <h2>Bring the field log together.</h2>
            <p className="muted">
              Scan every frame. Partial transfers stay on this device if you close the app.
            </p>
            {!pending && receiverReady && <Scanner onCode={scan} />}
            {receiver.total > 0 && (
              <div className="transfer-progress">
                <div className="spread">
                  <strong>
                    {received} / {receiver.total} frames received
                  </strong>
                  <span className="small mono">
                    {Math.round((received / receiver.total) * 100)}%
                  </span>
                </div>
                <progress value={received} max={receiver.total} />
                <div className="button-row">
                  {received === receiver.total && !pending && (
                    <button onClick={resume}>Review completed transfer</button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => resetReceiver().catch((e) => setError(String(e)))}
                  >
                    Reset receiver
                  </button>
                </div>
              </div>
            )}
            <label className="file-button">
              Import exchange file
              <input
                type="file"
                accept=".json,.blackout.json,application/json"
                disabled={busy}
                onChange={(e) => {
                  void importFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
            <label className="file-button">
              Read QR image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy || !!pending || !receiverReady}
                onChange={(e) => {
                  void importQrImage(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
            <details>
              <summary>Manual transfer fallback</summary>
              <label>
                Paste one BlackOut QR frame
                <textarea
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  maxLength={800}
                  rows={4}
                />
              </label>
              <button
                disabled={!pasted || !!pending}
                onClick={() => {
                  void scan(pasted)
                  setPasted('')
                }}
              >
                Receive pasted frame
              </button>
            </details>
          </>
        )}
        {pending && (
          <div className="import-preview">
            <span className="eyebrow">VERIFIED TRANSFER</span>
            <h3>{pending.doc.name}</h3>
            <p>
              {Object.keys(pending.doc.records).length} records · Sent by {pending.envelope.sender}
            </p>
            {doc && (
              <p className="small">
                {Object.keys(pending.doc.records).filter((id) => !doc.records[id]).length} new
                record IDs in this snapshot. Shared records will be merged; your local-only records
                are kept.
              </p>
            )}
            <p className="small muted">
              The sender name is self-reported. Integrity checks detect damaged data, not a trusted
              identity.
            </p>
            <div className="button-row">
              <button className="primary" disabled={busy || !deviceName.trim()} onClick={accept}>
                {busy ? 'Saving…' : doc ? 'Merge into expedition' : 'Join this expedition'}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  pendingRef.current = false
                  setPending(null)
                  setNotice('')
                }}
              >
                Cancel review
              </button>
            </div>
          </div>
        )}
        {notice && (
          <p role="status" className="success">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
      <aside className="panel exchange-guide">
        <span className="eyebrow">AT THE RENDEZVOUS</span>
        <h3>
          Two devices.
          <br />
          One shared story.
        </h3>
        <ol>
          <li>
            <strong>Show & scan</strong>
            <p>One device displays its update codes. The other scans all frames.</p>
          </li>
          <li>
            <strong>Review & save</strong>
            <p>Check the expedition, then merge the incoming records.</p>
          </li>
          <li>
            <strong>Return the updates</strong>
            <p>Switch roles. Send the combined snapshot back to the first device.</p>
          </li>
        </ol>
        <div className="note">
          Updates only travel when you exchange them. Other team members may still hold newer
          information.
        </div>
      </aside>
    </section>
  )
}
