import type { Receipt } from '../storage/repository'

export default function MergeReveal({
  receipt,
  onOpenLog,
}: {
  receipt?: Receipt
  onOpenLog?: () => void
}) {
  const summary = receipt?.summary
  if (!receipt || !summary) return null
  const unchanged = !summary.addedIds.length && !summary.updatedIds.length && !summary.historyAdded
  return (
    <section className="merge-reveal" aria-label="Last exchange result">
      <div className="merge-reveal-title">
        <span>✓</span>
        <h3>
          {unchanged ? 'Already part of your story.' : `Updates carried by ${receipt.sender}.`}
        </h3>
      </div>
      <div className="merge-reveal-grid">
        <div>
          <strong>{summary.addedIds.length}</strong>
          <small>new reports</small>
        </div>
        <div>
          <strong>{summary.updatedIds.length}</strong>
          <small>updated reports</small>
        </div>
        <div>
          <strong>{summary.conflicts}</strong>
          <small>needing review after import</small>
        </div>
      </div>
      <p>
        {unchanged
          ? 'This import added no new changes.'
          : `${summary.historyAdded} activity events added to this device.`}{' '}
        This summarizes the last saved import.
      </p>
      {onOpenLog && <button onClick={onOpenLog}>See the field log →</button>}
    </section>
  )
}
