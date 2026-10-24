import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import {
  addRecord,
  conflictsFor,
  createWorkspace,
  editRecord,
  heads,
  kinds,
  limits,
  statuses,
  type EditableField,
  type FieldRecord,
  type RecordKind,
  type WorkspaceDoc,
} from '../core/model'
import { Repository, type Receipt } from '../storage/repository'
import ExchangePanel from './ExchangePanel'
import { ActivityView, CheckpointBoard } from './ExpeditionViews'
import { filterRecords } from '../core/views'
import { createDemoWorkspace } from '../core/demo'
import ExpeditionReplay from './ExpeditionReplay'
import OfflineKit, { useOfflineReadiness } from './OfflineKit'
import MergeReveal from './MergeReveal'

const repository = new Repository()
type Page = 'log' | 'exchange' | 'device' | 'experience'
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

function Mountain({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 320 180" aria-hidden="true">
      <path d="M0 180 105 26 166 116 215 56 320 180" fill="currentColor" opacity=".15" />
      <path
        d="m25 180 100-138 94 138m-53-54 49-70 95 124"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="m99 78 26-36 31 46-27-11-13 14Z" fill="currentColor" opacity=".4" />
      <path
        d="M0 164c70-12 103 11 157-6s101-7 163-16M0 174c80-8 103 10 160-5s106-2 160-16"
        fill="none"
        stroke="currentColor"
        opacity=".25"
      />
      <circle cx="255" cy="30" r="14" fill="none" stroke="currentColor" />
    </svg>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>('experience')
  const [doc, setDoc] = useState<WorkspaceDoc | null>(null)
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([])
  const [deviceName, setDeviceName] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [expeditionName, setExpeditionName] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const offline = useOfflineReadiness()
  const [receivedIds, setReceivedIds] = useState<string[]>([])
  const [receipt, setReceipt] = useState<Receipt | undefined>()
  const [editing, setEditing] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [logView, setLogView] = useState<'records' | 'board' | 'activity'>('records')
  const [category, setCategory] = useState('all')
  const [recordStatus, setRecordStatus] = useState('all')
  const [assignee, setAssignee] = useState('all')
  const [newKind, setNewKind] = useState<RecordKind>('observation')
  const [persistent, setPersistent] = useState<boolean | null>(null)
  const activeRef = useRef<string | null>(null)
  const channel = useRef<BroadcastChannel | null>(null)
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      setError(`Offline cache could not be registered: ${message(error)}`)
    },
  })
  const refresh = useCallback(async (id: string | null = activeRef.current) => {
    const list = await repository.list()
    setWorkspaces(list)
    if (id) {
      const loaded = await repository.load(id)
      setDoc(loaded)
      activeRef.current = loaded?.id ?? null
      setReceipt(await repository.getReceipt(id))
    } else {
      setDoc(null)
      activeRef.current = null
      setReceipt(undefined)
    }
  }, [])
  useEffect(() => {
    let alive = true
    ;(async () => {
      const name = await repository.getSetting('deviceName')
      if (!alive) return
      setDeviceName(name ?? '')
      setNameDraft(name ?? '')
      const initialId = (await repository.getSetting('active')) ?? null
      await refresh(initialId)
      if (alive && initialId) setPage('log')
      if (alive) setReady(true)
      if (navigator.storage?.persisted) setPersistent(await navigator.storage.persisted())
    })().catch((e) => {
      if (alive) {
        setError(`Local storage could not be opened. ${message(e)}`)
        setReady(true)
      }
    })
    const connection = () => setOnline(navigator.onLine)
    const focus = () => {
      void refresh().catch((e) => setError(message(e)))
    }
    window.addEventListener('online', connection)
    window.addEventListener('offline', connection)
    window.addEventListener('focus', focus)
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel('blackout-workspaces')
      channel.current.onmessage = focus
    }
    return () => {
      alive = false
      window.removeEventListener('online', connection)
      window.removeEventListener('offline', connection)
      window.removeEventListener('focus', focus)
      channel.current?.close()
    }
  }, [refresh])
  useEffect(() => {
    if (!receivedIds.length) return
    const timer = setTimeout(() => setReceivedIds([]), 6000)
    return () => clearTimeout(timer)
  }, [receivedIds])
  async function action(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await fn()
      channel.current?.postMessage('changed')
      return true
    } catch (e) {
      setError(`Not saved: ${message(e)}`)
      return false
    } finally {
      setBusy(false)
    }
  }
  async function saveDevice(event: FormEvent) {
    event.preventDefault()
    await action(async () => {
      const name = nameDraft.trim()
      if (!name) throw new Error('Enter a device name.')
      await repository.setSetting('deviceName', name)
      setDeviceName(name)
      setNotice('Device name saved.')
    })
  }
  async function create(event: FormEvent) {
    event.preventDefault()
    await action(async () => {
      if (!deviceName.trim()) throw new Error('Name this device first.')
      const created = createWorkspace(expeditionName, repository.actorId)
      await repository.insert(created)
      await repository.setSetting('active', created.id)
      await refresh(created.id)
      setExpeditionName('')
      resetFilters()
      setLogView('records')
      setPage('log')
    })
  }
  async function select(id: string) {
    await action(async () => {
      await repository.setSetting('active', id)
      await refresh(id)
      setEditing(null)
      setShowNew(false)
      resetFilters()
      setLogView('records')
      setPage('log')
    })
  }
  async function join() {
    await action(async () => {
      await repository.setSetting('active', '')
      await refresh(null)
      setPage('exchange')
      setEditing(null)
      setShowNew(false)
    })
  }
  async function loadDemo() {
    await action(async () => {
      const created = createDemoWorkspace()
      await repository.insert(created)
      await repository.setSetting('active', created.id)
      await refresh(created.id)
      resetFilters()
      setEditing(null)
      setShowNew(false)
      setLogView('board')
      setPage('log')
      setNotice(
        'Synthetic demo created as a separate expedition. Your other expeditions are unchanged.',
      )
    })
  }
  async function imported(id: string, importedReceipt: Receipt) {
    await refresh(id)
    setReceivedIds([
      ...(importedReceipt.summary?.addedIds ?? []),
      ...(importedReceipt.summary?.updatedIds ?? []),
    ])
    channel.current?.postMessage('changed')
  }
  const records = doc ? Object.values(doc.records) : []
  const conflictCount = records.filter((r) => conflictsFor(r).length > 0).length
  function resetFilters() {
    setFilter('all')
    setSearch('')
    setCategory('all')
    setRecordStatus('all')
    setAssignee('all')
  }
  const visible = filterRecords(records, {
    scope: filter,
    kind: category,
    status: recordStatus,
    assignee,
    search,
  })
  const assignees = [
    ...new Set(records.map((r) => r.assignee).filter((name) => name.trim())),
  ].sort()
  const cacheReady = offline.ready
  const matchesReceived = !!doc && !!receipt?.matchedHeads && heads(doc) === receipt.matchedHeads

  return (
    <div
      className={`app-shell ${page === 'experience' && !workspaces.length ? 'replay-mode' : ''}`}
    >
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault()
            setPage('experience')
          }}
        >
          <img src="/icon.svg" alt="" />
          <span>
            BLACKOUT<small>EXPEDITION FIELD SYSTEM</small>
          </span>
        </a>
        <button
          className="sidebar-replay"
          aria-pressed={page === 'experience'}
          onClick={() => setPage('experience')}
        >
          <span>▷</span>
          <span>
            Experience BlackOut<small>An expedition in 60 seconds</small>
          </span>
          <span>↗</span>
        </button>
        <div className="sidebar-label">YOUR EXPEDITION</div>
        <label className="sr-only" htmlFor="workspace">
          Active expedition
        </label>
        <select
          id="workspace"
          value={doc?.id ?? ''}
          onChange={(e) => (e.target.value ? void select(e.target.value) : void join())}
          disabled={busy}
        >
          <option value="">Create or join expedition</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <nav aria-label="Main navigation">
          <button className={page === 'log' ? 'nav-active' : ''} onClick={() => setPage('log')}>
            <span>▤</span> Field log <small>{records.length || '—'}</small>
          </button>
          <button
            className={page === 'exchange' ? 'nav-active' : ''}
            onClick={() => setPage('exchange')}
          >
            <span>⇄</span> Exchange updates
          </button>
          <button
            className={page === 'device' ? 'nav-active' : ''}
            onClick={() => setPage('device')}
          >
            <span>◎</span> This device
          </button>
        </nav>
        <button className="sidebar-join" onClick={() => void join()} disabled={busy}>
          ＋ Create / join expedition
        </button>
        <div className="sidebar-bottom">
          <Mountain />
          <div className="sidebar-status">
            <span className={`dot ${cacheReady ? '' : 'amber'}`} />
            <div>
              {cacheReady ? 'Ready for offline use' : 'Offline setup pending'}
              <small>
                {cacheReady
                  ? 'App files saved on this device'
                  : import.meta.env.DEV
                    ? 'Use the production preview to test caching'
                    : 'Keep this page open while connected'}
              </small>
            </div>
          </div>
          <p>Carry the connection.</p>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            EXPEDITION /{' '}
            <strong>
              {page === 'exchange'
                ? 'EXCHANGE'
                : page === 'device'
                  ? 'DEVICE'
                  : page === 'experience'
                    ? 'THE EXPERIMENT'
                    : 'FIELD LOG'}
            </strong>
          </div>
          <div className="device-pill">
            <span className={`dot ${online ? '' : 'amber'}`} />
            {online ? 'Network available' : 'Network offline'}
            <span className="divider">/</span>
            <span>{deviceName || 'Unnamed device'}</span>
          </div>
        </header>
        <div className="page-content">
          {needRefresh && (
            <div className="notice">
              <span>A new BlackOut version is ready. Finish any transfer, then reload.</span>
              <button onClick={() => void updateServiceWorker(true)}>Update app</button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="success" role="status">
              {notice}
            </div>
          )}
          {!ready ? (
            <div className="panel">
              <h1>Opening your field log…</h1>
              <p>Reading this device’s saved expeditions.</p>
            </div>
          ) : (
            <>
              {page === 'experience' && (
                <ExpeditionReplay onOpenLog={() => setPage('log')} offlineReady={cacheReady} />
              )}
              {!deviceName && page !== 'experience' && page !== 'device' && (
                <section className="panel name-setup">
                  <div>
                    <span className="eyebrow">FIRST, YOUR CALL SIGN</span>
                    <h2>Name this device</h2>
                    <p className="muted">Use a team or device name, such as Ridge Team.</p>
                  </div>
                  <form onSubmit={saveDevice}>
                    <label>
                      Device name
                      <input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        maxLength={80}
                        required
                        placeholder="Ridge Team"
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      Save device name
                    </button>
                  </form>
                </section>
              )}
              {page === 'log' && (
                <>
                  {doc && (
                    <div className="knowledge-strip">
                      <span className="knowledge-icon" aria-hidden="true">
                        ◎
                      </span>
                      <div>
                        <h2>What this device knows.</h2>
                        <p>
                          {records.length} reports held locally · {conflictCount} needing review ·{' '}
                          {receipt
                            ? `Last carried by ${receipt.sender}`
                            : 'Ready for your first encounter'}
                        </p>
                      </div>
                      <button onClick={() => setPage('experience')}>
                        Watch how updates travel ↗
                      </button>
                    </div>
                  )}
                  <section className="page-heading">
                    <div>
                      <span className="eyebrow">BEYOND THE SIGNAL</span>
                      <h1>{doc?.name ?? 'Every journey needs a shared story.'}</h1>
                      <p className="muted">
                        {doc
                          ? 'Capture what you find. Bring everyone’s observations together at camp.'
                          : 'A field log that stays with your team, wherever the network ends.'}
                      </p>
                    </div>
                    {doc && (
                      <button
                        className="primary"
                        onClick={() => setShowNew(!showNew)}
                        disabled={!deviceName || busy}
                      >
                        ＋ Add field record
                      </button>
                    )}
                  </section>
                  {!doc ? (
                    <div className="welcome-grid">
                      <section className="panel welcome-create">
                        <span className="eyebrow">01 / START AN EXPEDITION</span>
                        <h2>Your team. Your field log.</h2>
                        <p className="muted">
                          Create it once, then share it with your team through Exchange. Everyone
                          must join the same expedition.
                        </p>
                        <form onSubmit={create}>
                          <label>
                            Expedition name
                            <input
                              value={expeditionName}
                              onChange={(e) => setExpeditionName(e.target.value)}
                              required
                              maxLength={80}
                              placeholder="Northern Ridge Survey"
                            />
                          </label>
                          <button className="primary" disabled={busy || !deviceName}>
                            Create expedition
                          </button>
                        </form>
                      </section>
                      <section className="panel welcome-join">
                        <Mountain />
                        <span className="eyebrow">02 / JOIN YOUR TEAM</span>
                        <h2>Already on the trail?</h2>
                        <p>
                          Receive an expedition snapshot from a teammate. It carries the records,
                          history, and shared origin your devices need.
                        </p>
                        <button disabled={!deviceName} onClick={() => setPage('exchange')}>
                          Receive expedition →
                        </button>
                      </section>
                    </div>
                  ) : (
                    <>
                      <section className="stats">
                        <div>
                          <span>FIELD RECORDS</span>
                          <strong>
                            {records
                              .filter((r) => r.status !== 'archived')
                              .length.toString()
                              .padStart(2, '0')}
                          </strong>
                          <small>Saved on this device</small>
                        </div>
                        <div>
                          <span>NEEDS A DECISION</span>
                          <strong className={conflictCount ? 'orange-text' : ''}>
                            {conflictCount.toString().padStart(2, '0')}
                          </strong>
                          <small>Records with conflicting edits</small>
                        </div>
                        <div>
                          <span>LAST RECEIVED</span>
                          <strong className="stat-label">
                            {receipt?.sender ?? 'No exchange yet'}
                          </strong>
                          <small>
                            {receipt
                              ? matchesReceived
                                ? 'Matches their received snapshot'
                                : 'Send your combined updates back'
                              : 'Meet, scan, and exchange'}
                          </small>
                        </div>
                      </section>
                      <MergeReveal receipt={receipt} />
                      {showNew && (
                        <RecordForm
                          key={newKind}
                          initialKind={newKind}
                          busy={busy}
                          onCancel={() => setShowNew(false)}
                          onSave={async (input) => {
                            await action(async () => {
                              await repository.mutate(doc.id, (current) =>
                                addRecord(current, input, deviceName),
                              )
                              await refresh()
                              setShowNew(false)
                            })
                          }}
                        />
                      )}
                      <div className="quick-capture" aria-label="Quick capture">
                        <span className="small muted">Record at the stop</span>
                        {kinds.map((kind) => (
                          <button
                            key={kind}
                            disabled={busy || !deviceName || showNew}
                            onClick={() => {
                              setNewKind(kind)
                              setShowNew(true)
                            }}
                          >
                            ＋ {kind}
                          </button>
                        ))}
                      </div>
                      <div className="view-tabs" aria-label="Field log views">
                        {(['records', 'board', 'activity'] as const).map((view) => (
                          <button
                            key={view}
                            aria-pressed={logView === view}
                            onClick={() => setLogView(view)}
                          >
                            {view === 'records'
                              ? 'All records'
                              : view === 'board'
                                ? 'Checkpoint board'
                                : 'Activity'}
                          </button>
                        ))}
                      </div>
                      {logView === 'board' && (
                        <CheckpointBoard records={records} onOpen={setEditing} />
                      )}
                      {logView === 'activity' && (
                        <ActivityView key={doc.id} doc={doc} onOpen={setEditing} />
                      )}
                      {logView === 'records' && (
                        <>
                          <div className="log-toolbar">
                            <div className="filter-buttons">
                              <button
                                className={filter === 'all' ? 'active' : ''}
                                onClick={() => setFilter('all')}
                              >
                                Active records
                              </button>
                              <button
                                className={filter === 'conflicts' ? 'active' : ''}
                                onClick={() => setFilter('conflicts')}
                              >
                                Needs review {conflictCount > 0 && <b>{conflictCount}</b>}
                              </button>
                              <button
                                className={filter === 'archived' ? 'active' : ''}
                                onClick={() => setFilter('archived')}
                              >
                                Archived
                              </button>
                            </div>
                            <input
                              className="search"
                              aria-label="Search records"
                              placeholder="Search your field log…"
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                            />
                          </div>
                          <div className="record-filters">
                            <label>
                              Record category
                              <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                              >
                                <option value="all">All categories</option>
                                {kinds.map((kind) => (
                                  <option key={kind}>{kind}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Record status
                              <select
                                value={recordStatus}
                                onChange={(e) => setRecordStatus(e.target.value)}
                              >
                                <option value="all">All statuses</option>
                                {statuses.map((status) => (
                                  <option key={status}>{status}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Assigned team
                              <select
                                value={assignee}
                                onChange={(e) => setAssignee(e.target.value)}
                              >
                                <option value="all">All assignments</option>
                                <option value="unassigned">Unassigned</option>
                                {assignees.map((name) => (
                                  <option key={name} value={`name:${name}`}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button onClick={resetFilters}>Clear filters</button>
                          </div>
                          <p className="small muted" role="status">
                            Showing {visible.length} of {records.length} records
                          </p>
                          {!visible.length ? (
                            <section className="empty-state">
                              <Mountain />
                              <h2>
                                {records.length ? 'No matching records.' : 'The trail starts here.'}
                              </h2>
                              <p className="muted">
                                {records.length
                                  ? 'Try another filter or search.'
                                  : 'Add your first observation, hazard, supply note, or checkpoint.'}
                              </p>
                              {!records.length && (
                                <button onClick={() => setShowNew(true)} disabled={!deviceName}>
                                  Add your first record →
                                </button>
                              )}
                            </section>
                          ) : (
                            <div className="record-grid">
                              {visible.map((record) => (
                                <article
                                  className={`record-card ${conflictsFor(record).length ? 'has-conflict' : ''} ${receivedIds.includes(record.id) ? 'just-received' : ''}`}
                                  key={record.id}
                                >
                                  <div className="spread">
                                    <span className={`tag ${record.kind}`}>{record.kind}</span>
                                    <span className="small muted">{record.status}</span>
                                  </div>
                                  <h3>{record.title}</h3>
                                  <p className="record-note">
                                    {record.note || 'No additional notes.'}
                                  </p>
                                  <div className="record-meta">
                                    <span>⌖ {record.location || 'Location not recorded'}</span>
                                    <span>◎ {record.assignee || 'Unassigned'}</span>
                                  </div>
                                  {conflictsFor(record).length > 0 && (
                                    <div className="conflict-flag">
                                      ↗ Conflicting edits need review
                                    </div>
                                  )}
                                  <div className="record-footer">
                                    <span>Recorded by {record.author}</span>
                                    <button onClick={() => setEditing(record.id)}>
                                      Open record →
                                    </button>
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      <div className="field-footer">
                        <span className="mono">EXPEDITION {doc.id.slice(0, 8).toUpperCase()}</span>
                        <span>Updates travel when people meet.</span>
                      </div>
                    </>
                  )}
                </>
              )}
              {page === 'exchange' && (
                <>
                  <section className="page-heading">
                    <div>
                      <span className="eyebrow">PASS IT FORWARD</span>
                      <h1>Exchange at the rendezvous.</h1>
                      <p className="muted">
                        {doc ? doc.name : 'Join an expedition by receiving its snapshot.'}
                      </p>
                    </div>
                    <span className="badge">CAMERA + SCREEN. THAT’S ALL.</span>
                  </section>
                  <ExchangePanel
                    key={doc?.id ?? 'join'}
                    doc={doc}
                    deviceName={deviceName}
                    repository={repository}
                    onImported={imported}
                    receipt={receipt}
                    onOpenLog={() => setPage('log')}
                  />
                </>
              )}
              {page === 'device' && (
                <>
                  <section className="page-heading">
                    <div>
                      <span className="eyebrow">YOUR LOCAL BASE</span>
                      <h1>Prepared for the disconnect.</h1>
                      <p className="muted">Your records live in this browser on this device.</p>
                    </div>
                  </section>
                  <div className="device-grid">
                    <OfflineKit state={offline} />
                    <section className="panel">
                      <span className="eyebrow">PRACTICE BEFORE DEPARTURE</span>
                      <h2>Try a synthetic expedition</h2>
                      <p className="small muted">
                        Create eight fictional reports, including checkpoints, a hazard, supply
                        observations, and a conflicting assignment. Each demo is separate from your
                        real records.
                      </p>
                      <button disabled={busy || !deviceName} onClick={() => void loadDemo()}>
                        Create demo expedition
                      </button>
                    </section>
                    <section className="panel">
                      <h2>Device identity</h2>
                      <form onSubmit={saveDevice}>
                        <label>
                          Device name
                          <input
                            value={nameDraft}
                            onChange={(e) => setNameDraft(e.target.value)}
                            required
                            maxLength={80}
                          />
                        </label>
                        <button className="primary" disabled={busy}>
                          Save device name
                        </button>
                      </form>
                      <p className="small muted">
                        Names are self-reported labels. They do not verify a person’s identity.
                      </p>
                    </section>
                    <section className="panel">
                      <h2>Offline readiness</h2>
                      <ul className="readiness">
                        <li>
                          <span>App files</span>
                          <strong>{cacheReady ? 'Cached' : 'Pending'}</strong>
                        </li>
                        <li>
                          <span>Expeditions saved</span>
                          <strong>{workspaces.length}</strong>
                        </li>
                        <li>
                          <span>Browser storage protection</span>
                          <strong>
                            {persistent === true
                              ? 'Granted'
                              : persistent === false
                                ? 'Standard'
                                : 'Unknown'}
                          </strong>
                        </li>
                      </ul>
                      <button
                        onClick={() =>
                          void action(async () => {
                            if (!navigator.storage?.persist)
                              throw new Error(
                                'This browser does not support storage protection requests.',
                              )
                            const granted = await navigator.storage.persist()
                            setPersistent(granted)
                            setNotice(
                              granted
                                ? 'Storage protection granted. Keep backups too.'
                                : 'The browser kept standard storage. Export backups regularly.',
                            )
                          })
                        }
                      >
                        Request storage protection
                      </button>
                      <p className="small muted">
                        Clearing browser data removes local records. Export an exchange file from
                        each expedition as a backup.
                      </p>
                    </section>
                    <section className="panel">
                      <h2>Before you leave</h2>
                      <ol className="checklist">
                        <li>Load BlackOut while connected and wait for cached app files.</li>
                        <li>Join the same expedition on every device.</li>
                        <li>Test one two-way exchange and an offline reload.</li>
                        <li>Keep a backup of your expedition.</li>
                      </ol>
                      <p className="small muted">
                        QR updates are readable by anyone who scans them. This prototype does not
                        provide emergency messaging or verified identities.
                      </p>
                    </section>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
      {editing && doc?.records[editing] && (
        <RecordEditor
          record={doc.records[editing]}
          doc={doc}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (edits) => {
            return action(async () => {
              await repository.mutate(doc.id, (current) =>
                editRecord(current, editing, edits, deviceName),
              )
              await refresh()
              setNotice('Record saved on this device.')
            })
          }}
        />
      )}
    </div>
  )
}

function RecordForm({
  busy,
  initialKind,
  onSave,
  onCancel,
}: {
  busy: boolean
  initialKind: RecordKind
  onSave: (
    input: Pick<FieldRecord, 'title' | 'note' | 'location' | 'kind' | 'assignee'>,
  ) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(''),
    [note, setNote] = useState(''),
    [location, setLocation] = useState(''),
    [kind, setKind] = useState<RecordKind>(initialKind),
    [assignee, setAssignee] = useState('')
  return (
    <form
      className="panel record-form"
      onSubmit={(e) => {
        e.preventDefault()
        void onSave({ title, note, location, kind, assignee })
      }}
    >
      <div className="spread">
        <h2>New field record</h2>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="form-grid">
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
            placeholder="What did you find?"
          />
        </label>
        <label>
          Category
          <select value={kind} onChange={(e) => setKind(e.target.value as RecordKind)}>
            {kinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Location / checkpoint
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={100}
            placeholder="North ridge / Camp 2"
          />
        </label>
        <label className="wide">
          Assigned team / person
          <input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            maxLength={80}
            placeholder="Who should follow up?"
          />
        </label>
        <label className="wide">
          Field notes
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1200}
            rows={3}
            placeholder="Details your team should know…"
          />
        </label>
      </div>
      <button className="primary" disabled={busy}>
        Save field record
      </button>
    </form>
  )
}

function RecordEditor({
  record,
  doc,
  busy,
  onSave,
  onClose,
}: {
  record: FieldRecord
  doc: WorkspaceDoc
  busy: boolean
  onSave: (edits: Partial<Pick<FieldRecord, EditableField>>) => Promise<boolean>
  onClose: () => void
}) {
  const [edits, setEdits] = useState<Partial<Pick<FieldRecord, EditableField>>>({})
  const conflicts = conflictsFor(record)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const history = Object.values(doc.history)
    .filter((h) => h.recordId === record.id)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12)
  function set(field: EditableField, value: string) {
    setEdits((previous) => ({ ...previous, [field]: value }))
  }
  return (
    <dialog ref={dialog} className="record-dialog" onCancel={onClose} onClose={onClose}>
      <div className="spread">
        <span className="eyebrow">FIELD RECORD</span>
        <button onClick={onClose} aria-label="Close record">
          ✕
        </button>
      </div>
      <h2>{record.title}</h2>
      {conflicts.length > 0 && (
        <section className="conflict-review">
          <h3>Different decisions were recorded.</h3>
          <p>Review each field. Choosing a value records a resolution on this device.</p>
          {conflicts.map((conflict) => (
            <div key={conflict.field}>
              <strong>{conflict.field}</strong>
              <div className="conflict-options">
                {conflict.values.map((value) => (
                  <button
                    disabled={busy}
                    key={value}
                    onClick={() => {
                      void onSave({ [conflict.field]: value }).then((saved) => {
                        if (saved) setEdits({})
                      })
                    }}
                  >
                    Use: {value || '(empty)'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void onSave(edits).then((saved) => {
            if (saved) setEdits({})
          })
        }}
      >
        <div className="form-grid">
          {(['title', 'location', 'assignee'] as const).map((field) => (
            <label key={field}>
              {field}
              <input
                value={edits[field] ?? record[field]}
                onChange={(e) => set(field, e.target.value)}
                required={field === 'title'}
                maxLength={limits[field]}
              />
            </label>
          ))}
          <label>
            Status
            <select
              value={edits.status ?? record.status}
              onChange={(e) => set('status', e.target.value)}
            >
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label className="wide">
            Notes
            <textarea
              value={edits.note ?? record.note}
              onChange={(e) => set('note', e.target.value)}
              maxLength={1200}
              rows={4}
            />
          </label>
        </div>
        <button className="primary" disabled={busy || !Object.keys(edits).length}>
          Save changes
        </button>
      </form>
      <section className="history">
        <h3>Record history</h3>
        <p className="small muted">
          Device names and times are self-reported. Times do not decide conflicting edits.
        </p>
        {history.map((entry) => (
          <div key={entry.id}>
            <strong>{entry.actor}</strong>
            <span>{entry.message}</span>
            <small>{new Date(entry.at).toLocaleString()}</small>
          </div>
        ))}
      </section>
    </dialog>
  )
}
