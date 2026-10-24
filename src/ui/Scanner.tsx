import { useEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'

export default function Scanner({ onCode }: { onCode: (value: string) => Promise<void> }) {
  const video = useRef<HTMLVideoElement>(null)
  const callback = useRef(onCode)
  callback.current = onCode
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  useEffect(() => {
    if (!running || !video.current) return
    let busy = false,
      cancelled = false
    const scanner = new QrScanner(
      video.current,
      async (result) => {
        if (busy || cancelled) return
        busy = true
        try {
          await callback.current(result.data)
        } finally {
          busy = false
        }
      },
      {
        preferredCamera: facing,
        maxScansPerSecond: 5,
        highlightScanRegion: true,
        highlightCodeOutline: true,
        returnDetailedScanResult: true,
      },
    )
    scanner
      .start()
      .then(() => {
        if (cancelled) scanner.destroy()
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            'Camera unavailable. Allow camera access, use HTTPS, or import an exchange file.',
          )
          setRunning(false)
        }
      })
    return () => {
      cancelled = true
      scanner.destroy()
    }
  }, [running, facing])
  return (
    <div className="scanner">
      <div className={`camera-window ${running ? 'active' : ''}`}>
        <video ref={video} muted playsInline aria-label="QR camera preview" />
        {!running && (
          <div className="camera-placeholder">
            <span className="scan-mark">⌗</span>
            <strong>Receive through your camera</strong>
            <p>Point at the other device’s BlackOut code.</p>
          </div>
        )}
      </div>
      <div className="button-row">
        <button
          className="primary"
          onClick={() => {
            setError('')
            setRunning(!running)
          }}
        >
          {running ? 'Stop camera' : 'Start camera'}
        </button>
        {running && (
          <button onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')}>
            Switch camera
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  )
}
