import { useEffect, useState } from 'react'

type Group = { label: string; saved: number; total: number }
export type OfflineState = {
  ready: boolean
  checking: boolean
  unavailable: boolean
  groups: Group[]
}
const empty: OfflineState = {
  ready: false,
  checking: true,
  unavailable: false,
  groups: [
    { label: 'App & field log', saved: 0, total: 0 },
    { label: 'Merge engine', saved: 0, total: 0 },
    { label: 'QR scanner', saved: 0, total: 0 },
  ],
}

export function useOfflineReadiness(): OfflineState {
  const [state, setState] = useState<OfflineState>(empty)
  useEffect(() => {
    let alive = true,
      checking = false
    async function check() {
      if (checking || document.visibilityState === 'hidden') return
      checking = true
      try {
        if (!('caches' in window) || !('serviceWorker' in navigator)) {
          if (alive) setState({ ...empty, checking: false, unavailable: true })
          return
        }
        const manifest = await caches.match(new URL('/offline-assets.json', location.origin).href, {
          ignoreSearch: true,
        })
        if (!manifest) {
          if (alive) setState({ ...empty, checking: false })
          return
        }
        const { files } = (await manifest.json()) as { files: string[] }
        if (
          !Array.isArray(files) ||
          files.length > 200 ||
          !files.every(
            (file) => typeof file === 'string' && file.startsWith('/') && !file.startsWith('//'),
          )
        )
          throw new Error('Invalid cache manifest')
        // An old build's manifest must not claim readiness for this page's current JS.
        const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src
        if (entry && !files.includes(new URL(entry).pathname)) {
          if (alive) setState({ ...empty, checking: false })
          return
        }
        const groups = empty.groups.map((group) => ({ ...group }))
        await Promise.all(
          files.map(async (file) => {
            const group =
              groups[file.endsWith('.wasm') ? 1 : file.includes('qr-scanner-worker') ? 2 : 0]
            group.total++
            if (await caches.match(new URL(file, location.origin).href, { ignoreSearch: true }))
              group.saved++
          }),
        )
        const registration = await navigator.serviceWorker.getRegistration()
        if (alive)
          setState({
            groups,
            checking: false,
            unavailable: false,
            ready:
              !!registration?.active &&
              !!navigator.serviceWorker.controller &&
              groups.every((group) => group.total > 0 && group.saved === group.total),
          })
      } catch {
        if (alive) setState({ ...empty, checking: false, unavailable: true })
      } finally {
        checking = false
      }
    }
    void check()
    const timer = setInterval(() => void check(), 3000)
    navigator.serviceWorker?.addEventListener('controllerchange', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      alive = false
      clearInterval(timer)
      navigator.serviceWorker?.removeEventListener('controllerchange', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return state
}

export default function OfflineKit({ state }: { state: OfflineState }) {
  const complete = state.groups.filter(
    (group) => group.total > 0 && group.saved === group.total,
  ).length
  return (
    <section className="panel offline-kit" aria-label="Offline kit">
      <div className="kit-heading">
        <div>
          <span className="eyebrow">PACKED ON THIS DEVICE</span>
          <h2>Your offline kit.</h2>
        </div>
        <div className="kit-ring" aria-hidden="true">
          <svg viewBox="0 0 70 70">
            <circle cx="35" cy="35" r="29" />
            <circle
              className="kit-ring-progress"
              cx="35"
              cy="35"
              r="29"
              strokeDasharray="182.2"
              strokeDashoffset={182.2 * (1 - complete / 3)}
            />
          </svg>
          <span>{complete}/3</span>
        </div>
      </div>
      <p>
        The tools you’ll need when the signal disappears. Checked against the app files saved in
        this browser.
      </p>
      {state.groups.map((group) => (
        <div
          key={group.label}
          className={`kit-asset ${group.total > 0 && group.saved === group.total ? 'complete' : ''}`}
        >
          <span>
            <i />
            {group.label}
          </span>
          <small>
            {group.total
              ? `${group.saved}/${group.total} files cached`
              : state.unavailable
                ? 'Cannot check'
                : 'Waiting for cache'}
          </small>
        </div>
      ))}
      <p className="kit-status">
        {state.ready
          ? '✓ Ready for offline use. Your expedition records are saved separately on this device.'
          : state.unavailable
            ? 'Cache access is unavailable. Reopen while connected and check your browser settings.'
            : import.meta.env.DEV
              ? 'Use the production preview to prepare offline files.'
              : 'Keep this page open while connected until every tool is packed.'}
      </p>
    </section>
  )
}
