import { useState } from 'react'
import { conflictsFor, type FieldRecord, type WorkspaceDoc } from '../core/model'
import { activityEntries, locationGroups } from '../core/views'

export function CheckpointBoard({
  records,
  onOpen,
}: {
  records: FieldRecord[]
  onOpen: (id: string) => void
}) {
  const groups = locationGroups(records)
  const checkpoints = records.filter((r) => r.kind === 'checkpoint' && r.status !== 'archived')
  const confirmed = checkpoints.filter((r) => r.status === 'done' && !conflictsFor(r).length).length
  return (
    <section aria-label="Checkpoint board">
      <div className="board-intro panel">
        <div>
          <span className="eyebrow">AT A GLANCE</span>
          <h2>What’s happening at each stop?</h2>
          <p className="muted">
            Grouped by the location written on each record. Locations are listed alphabetically, not
            as a navigation route.
          </p>
        </div>
        <div className="checkpoint-count">
          <strong>
            {confirmed} / {checkpoints.length}
          </strong>
          <span>checkpoints completed without conflicts</span>
        </div>
      </div>
      {!groups.length && (
        <p className="panel">Add a checkpoint or field record to begin your board.</p>
      )}
      <div className="checkpoint-grid">
        {groups.map((group) => (
          <section className="panel checkpoint-group" key={group.key}>
            <h3>⌖ {group.label}</h3>
            <p className="small muted">{group.records.length} records on this device</p>
            {group.records.map((record) => (
              <button className="checkpoint-item" key={record.id} onClick={() => onOpen(record.id)}>
                <span className="spread">
                  <span className={`tag ${record.kind}`}>{record.kind}</span>
                  <span className="small">
                    {conflictsFor(record).length ? 'Needs review' : record.status}
                  </span>
                </span>
                <strong>{record.title}</strong>
                <span className="small muted">
                  {record.assignee || 'Unassigned'} · {record.note || 'Open to add details'}
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </section>
  )
}

export function ActivityView({ doc, onOpen }: { doc: WorkspaceDoc; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [actor, setActor] = useState('')
  const [count, setCount] = useState(30)
  const entries = activityEntries(doc, query, actor)
  const actors = [...new Set(Object.values(doc.history).map((h) => h.actor))].sort()
  return (
    <section className="panel activity-panel" aria-label="Expedition activity">
      <h2>The story carried between devices.</h2>
      <p className="muted small">
        Recorded edits from this device and imported snapshots. Times and names are reported by each
        device; this is not a live team feed.
      </p>
      <div className="record-filters">
        <label>
          Search activity
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCount(30)
            }}
            placeholder="Record, device, or change…"
          />
        </label>
        <label>
          Recorded by
          <select
            value={actor}
            onChange={(e) => {
              setActor(e.target.value)
              setCount(30)
            }}
          >
            <option value="">All device labels</option>
            {actors.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="small muted" role="status">
        {entries.length} matching events
      </p>
      <ol className="activity-list">
        {entries.slice(0, count).map((entry) => (
          <li key={entry.id}>
            <div>
              <strong>{entry.actor}</strong>
              <time dateTime={entry.at}>
                {Number.isNaN(Date.parse(entry.at))
                  ? 'Time unavailable'
                  : new Date(entry.at).toLocaleString()}
              </time>
            </div>
            <p>{entry.message}</p>
            <button onClick={() => onOpen(entry.recordId)}>
              {doc.records[entry.recordId]?.title ?? 'Open record'} →
            </button>
          </li>
        ))}
      </ol>
      {!entries.length && <p>No activity matches these filters.</p>}
      {entries.length > count && (
        <button onClick={() => setCount((previous) => previous + 30)}>Show more activity</button>
      )}
    </section>
  )
}
