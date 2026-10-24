import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { conflictsFor, heads } from '../core/model'
import {
  advanceReplay,
  createReplay,
  nextEncounter,
  replayFacts,
  teamIds,
  teams,
  type Replay,
  type TeamId,
} from '../core/replay'
import './experience.css'

const scenes = [
  {
    chapter: 'THE BRIEFING',
    title: 'One expedition. Three copies of the story.',
    body: 'Everyone leaves with the same checkpoint. Then the teams split up—and the signal disappears.',
    action: 'Start the blackout',
  },
  {
    chapter: 'OUT OF REACH',
    title: 'Three teams. Three different stories.',
    body: 'Ridge spots a hazard. Valley finds water. Base records the weather. Two teams also volunteer for the same crossing.',
    action: 'Let Ridge meet Valley',
  },
  {
    chapter: 'THE ENCOUNTER',
    title: 'The reports arrive. The disagreement stays visible.',
    body: 'Valley now holds both field reports. But who checks the crossing? You make the call; the app keeps both choices until you do.',
    action: 'Choose a team below',
  },
  {
    chapter: 'A HUMAN DECISION',
    title: 'A decision worth carrying forward.',
    body: 'Your choice is recorded in Valley’s copy. Ridge and Base still have their earlier information. The next encounter matters.',
    action: 'Carry it to Base Camp',
  },
  {
    chapter: 'THE COURIER',
    title: 'Base knows something Ridge never told it directly.',
    body: 'Valley carried Ridge’s hazard and your decision to Base. Base also has its own weather report—so the exchange needs a return journey.',
    action: 'Bring Base’s report to Valley',
  },
  {
    chapter: 'THE RETURN JOURNEY',
    title: 'One last encounter closes the gap.',
    body: 'Valley and Base now hold the same story. Return Valley’s combined snapshot to Ridge so the first team gets the missing reports too.',
    action: 'Return the full story to Ridge',
  },
  {
    chapter: 'BACK TOGETHER',
    title: 'Four reports. One decision. Everyone caught up.',
    body: 'All three simulated devices now hold identical saved changes. No report was overwritten, and the assignment you chose travelled with them.',
    action: 'Open your field log',
  },
]
const points: Record<TeamId, [number, number]> = {
  ridge: [176, 245],
  valley: [493, 345],
  base: [785, 215],
}
function route(from: TeamId, to: TeamId) {
  const [x, y] = points[from],
    [tx, ty] = points[to]
  return `M ${x} ${y} Q ${(x + tx) / 2} ${Math.min(y, ty) - 80} ${tx} ${ty}`
}

export default function ExpeditionReplay({
  onOpenLog,
  offlineReady,
}: {
  onOpenLog: () => void
  offlineReady: boolean
}) {
  const [session, setSession] = useState(createReplay)
  const [selected, setSelected] = useState<TeamId>('ridge')
  const [playing, setPlaying] = useState(false)
  const [travelling, setTravelling] = useState<[TeamId, TeamId] | null>(null)
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const terrainRef = useRef<HTMLDivElement>(null)
  const locked = useRef(false)
  const facts = replayFacts(session),
    scene = scenes[session.stage]
  const selectedDoc = session.docs[selected]
  const records = Object.values(selectedDoc.records)

  useEffect(
    () => () => {
      clearTimeout(timer.current)
    },
    [],
  )
  function advance(choice?: Replay['choice']) {
    if (locked.current || session.stage === 6 || (session.stage === 2 && !choice)) return
    const encounter = nextEncounter(session.stage)
    const apply = () => {
      try {
        const next = advanceReplay(session, choice)
        setSession(next)
        if (encounter) setSelected(encounter[1])
        if (next.stage === 2 || next.stage === 3) setSelected('valley')
        if (next.stage === 6) setPlaying(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The replay could not advance.')
        setPlaying(false)
      } finally {
        locked.current = false
        setTravelling(null)
      }
    }
    locked.current = true
    if (encounter) {
      setTravelling(encounter)
      timer.current = setTimeout(
        apply,
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 1300,
      )
    } else apply()
  }
  useEffect(() => {
    if (!playing || travelling || session.stage === 0 || session.stage === 2 || session.stage === 6)
      return
    const tick = setTimeout(() => advance(), 6500)
    return () => clearTimeout(tick)
    // advance intentionally closes over this stage; every stage change restarts the reading interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, travelling, session])
  function reset() {
    clearTimeout(timer.current)
    locked.current = false
    setTravelling(null)
    setPlaying(false)
    setError('')
    setSelected('ridge')
    setSession(createReplay())
  }

  return (
    <section className="experience" aria-label="Interactive expedition replay">
      <div className="experience-heading">
        <div>
          <span className="experience-kicker">
            <i /> A FIELD EXPERIMENT / BLACKOUT
          </span>
          <h1>
            The signal ends.
            <br />
            <em>The story doesn’t.</em>
          </h1>
          <p>
            When people carry the connection, knowledge finds a way.
            <br className="desktop-break" /> Follow three teams beyond the network.
          </p>
        </div>
        <div className="experience-intro-side">
          <span className="experience-coordinate">30° N / NORTHERN RIDGE</span>
          <p>
            A fictional expedition.
            <br />A working merge engine.
            <br />
            <strong>Your decision in the middle.</strong>
          </p>
          {session.stage === 0 && (
            <button
              className="experience-launch"
              onClick={() => {
                setPlaying(true)
                advance()
                terrainRef.current?.scrollIntoView({
                  block: 'start',
                  behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? 'auto'
                    : 'smooth',
                })
              }}
            >
              Begin the expedition <span>↓</span>
            </button>
          )}
          <button onClick={onOpenLog}>
            Open your field log <span>↗</span>
          </button>
        </div>
      </div>

      <div
        ref={terrainRef}
        className={`replay-stage stage-${session.stage} ${travelling ? 'in-transit' : ''}`}
      >
        <div className="terrain-topline">
          <span>
            <i className={session.stage ? 'radio-off' : ''} />
            {session.stage === 0 ? 'SIMULATION / TEAMS BRIEFED' : 'SIMULATION / RADIOS OFFLINE'}
          </span>
          <span>SELECT A CAMP TO INSPECT ITS COPY</span>
        </div>
        <div className="terrain-frame">
          <svg
            className="terrain"
            viewBox="0 0 960 490"
            role="group"
            aria-label="Fictional terrain with three simulated teams"
          >
            <defs>
              <radialGradient id="terrain-glow">
                <stop stopColor="#48685c" stopOpacity=".38" />
                <stop offset="1" stopColor="#102b27" stopOpacity="0" />
              </radialGradient>
              <pattern id="terrain-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                <path d="M48 0H0V48" fill="none" stroke="#b2cfbd" strokeOpacity=".055" />
              </pattern>
            </defs>
            <rect width="960" height="490" fill="url(#terrain-grid)" />
            <ellipse cx="450" cy="240" rx="470" ry="260" fill="url(#terrain-glow)" />
            <g className="contour-lines" fill="none" stroke="#83aa94">
              {Array.from({ length: 11 }, (_, i) => (
                <path
                  key={i}
                  d={`M ${-90 + i * 12} ${370 - i * 16} C ${80 + i * 8} ${210 - i * 17}, ${170 + i * 9} ${405 - i * 19}, ${300 + i * 10} ${220 - i * 18} S ${570 + i * 7} ${70 - i * 12}, ${650 + i * 14} ${170 - i * 14} S 920 ${290 - i * 19}, 1040 ${60 - i * 9}`}
                  opacity={0.07 + i * 0.009}
                />
              ))}
              {Array.from({ length: 8 }, (_, i) => (
                <ellipse
                  key={`e${i}`}
                  cx="759"
                  cy="427"
                  rx={80 + i * 36}
                  ry={26 + i * 20}
                  transform="rotate(-16 759 427)"
                  opacity=".12"
                />
              ))}
            </g>
            <path
              d="M450 -10 C380 135 610 205 490 345 S500 470 570 510"
              fill="none"
              stroke="#89b8bc"
              strokeOpacity=".18"
              strokeWidth="12"
            />
            <path
              d="M450 -10 C380 135 610 205 490 345 S500 470 570 510"
              fill="none"
              stroke="#a7d2ce"
              strokeOpacity=".33"
              strokeWidth="1"
            />
            <g className="terrain-annotations">
              <text x="80" y="74">
                NORTH RIDGE / 3,240 M
              </text>
              <text x="622" y="464">
                LOWER VALLEY
              </text>
              <text x="910" y="72">
                N
              </text>
              <path d="M915 105V82m-5 7 5-7 5 7" stroke="currentColor" fill="none" />
            </g>
            {session.stage >= 2 && (
              <path d={route('ridge', 'valley')} className="encounter-trace" />
            )}
            {session.stage >= 4 && <path d={route('valley', 'base')} className="encounter-trace" />}
            {travelling && (
              <g
                className="packet-trail"
                style={{ '--packet-color': teams[travelling[0]].color } as CSSProperties}
              >
                <path
                  d={route(...travelling)}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity=".4"
                  strokeDasharray="4 8"
                />
                {[0, 0.18, 0.36].map((delay) => (
                  <circle key={delay} r={delay === 0 ? 5 : 3} className="travelling-packet">
                    <animateMotion
                      dur="1.1s"
                      begin={`${delay}s`}
                      repeatCount="indefinite"
                      path={route(...travelling)}
                    />
                  </circle>
                ))}
              </g>
            )}
            {teamIds.map((id) => {
              const [x, y] = points[id],
                doc = session.docs[id]
              const count = Object.keys(doc.records).length
              const conflict = Object.values(doc.records).some((r) => conflictsFor(r).length)
              return (
                <g
                  key={id}
                  transform={`translate(${x},${y})`}
                  className={`camp-node ${selected === id ? 'selected' : ''} ${conflict ? 'camp-conflict' : ''}`}
                  style={{ '--camp-color': teams[id].color } as CSSProperties}
                  role="button"
                  tabIndex={0}
                  aria-label={`Inspect ${teams[id].name}: ${count} reports${conflict ? ', needs a decision' : ''}`}
                  aria-pressed={selected === id}
                  onClick={() => setSelected(id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelected(id)
                    }
                  }}
                >
                  <circle r="48" className="camp-halo" />
                  <circle r="34" className="camp-orbit" />
                  <circle r="25" className="camp-core" />
                  <path d="m-14 9 14-24 14 24Zm14-24v24" className="camp-tent" />
                  <rect x="-74" y="53" width="148" height="54" rx="7" className="camp-label-bg" />
                  <text y="73" textAnchor="middle" className="camp-name">
                    {teams[id].name}
                  </text>
                  <text y="92" textAnchor="middle" className="camp-count">
                    {count} REPORT{count === 1 ? '' : 'S'}
                    {conflict ? ' / DECISION' : session.stage === 6 ? ' / MATCHED' : ''}
                  </text>
                  <g transform="translate(-24,-52)">
                    {Object.values(doc.records).map((record, i) => (
                      <rect
                        key={record.id}
                        x={i * 13}
                        width="8"
                        height="8"
                        rx="2"
                        fill={
                          record.author === 'Shared briefing'
                            ? '#f1eddf'
                            : teams[
                                teamIds.find((key) => teams[key].name === record.author) ?? 'base'
                              ].color
                        }
                      />
                    ))}
                  </g>
                </g>
              )
            })}
          </svg>
        </div>
        <div className="terrain-bottomline">
          <span className="terrain-legend">
            <i /> Each square is a report held by that camp
          </span>
          <span>
            {session.stage === 6
              ? 'ALL THREE COPIES MATCH'
              : travelling
                ? `CARRYING A SNAPSHOT → ${teams[travelling[1]].name.toUpperCase()}`
                : 'UPDATES TRAVEL AT ENCOUNTERS'}
          </span>
        </div>
      </div>

      <div className="replay-console">
        <div className="replay-story" aria-live="polite" aria-atomic="true">
          <div className="chapter-line">
            <span>
              0{session.stage + 1} / {scene.chapter}
            </span>
            <div className="chapter-progress" aria-label={`Step ${session.stage + 1} of 7`}>
              {scenes.map((_, i) => (
                <i className={i <= session.stage ? 'filled' : ''} key={i} />
              ))}
            </div>
          </div>
          <h2>{scene.title}</h2>
          <p>{scene.body}</p>
          {session.stage === 2 ? (
            <div className="decision-box">
              <span>WHO CHECKS THE CROSSING?</span>
              <div>
                {(['Ridge Team', 'Valley Team'] as const).map((choice) => (
                  <button key={choice} onClick={() => advance(choice)}>
                    {choice} <span>↗</span>
                  </button>
                ))}
              </div>
              <small>Choose either. Your decision is written into the simulated field log.</small>
            </div>
          ) : (
            <div className="replay-actions">
              <button
                className="replay-primary"
                disabled={!!travelling}
                onClick={() => {
                  if (session.stage === 6) onOpenLog()
                  else {
                    if (session.stage === 0) setPlaying(true)
                    advance()
                  }
                }}
              >
                {travelling ? 'Carrying the update…' : scene.action}
                <span aria-hidden="true">{travelling ? '⋯' : '→'}</span>
              </button>
              {session.stage === 0 && (
                <button className="replay-text-button" onClick={() => advance()}>
                  Explore at my pace
                </button>
              )}
            </div>
          )}
          <div className="replay-controls">
            {session.stage > 0 && session.stage < 6 && (
              <button onClick={() => setPlaying(!playing)}>
                {playing ? 'Ⅱ Pause autoplay' : '▷ Resume autoplay'}
              </button>
            )}
            <button onClick={reset}>↺ Restart</button>
            <span>
              {session.stage === 2
                ? 'Waiting for your decision'
                : session.stage === 6
                  ? 'Replay complete'
                  : playing
                    ? 'Autoplay · you can step ahead'
                    : 'You control the pace'}
            </span>
          </div>
        </div>
        <aside
          className="camp-inspector"
          style={{ '--camp-color': teams[selected].color } as CSSProperties}
        >
          <div className="inspector-heading">
            <div>
              <span>WHAT THIS CAMP KNOWS</span>
              <h3>{teams[selected].name}</h3>
            </div>
            <span className="inspector-record-count">
              {records.length.toString().padStart(2, '0')}
            </span>
          </div>
          <ul>
            {records.map((record) => (
              <li key={record.id}>
                <span className={`inspector-kind ${record.kind}`} />{' '}
                <div>
                  <strong>{record.title}</strong>
                  <small>
                    {record.kind === 'checkpoint'
                      ? conflictsFor(record).length
                        ? 'Ridge Team or Valley Team? Decision needed.'
                        : `Assigned to ${record.assignee}`
                      : `Recorded by ${record.author}`}
                  </small>
                </div>
                {conflictsFor(record).length > 0 && <span className="inspector-alert">!</span>}
              </li>
            ))}
          </ul>
          <div className="inspector-proof">
            <span>Saved state</span>
            <code>
              {heads(selectedDoc)
                .split(':')
                .map((head) => head.slice(0, 6))
                .join(' · ')}
            </code>
          </div>
          {session.stage === 6 && (
            <p className="convergence-proof">✓ Same saved state on all three camps</p>
          )}
        </aside>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="experience-footnote">
        <span>
          <i className={offlineReady ? 'kit-ready-dot' : 'kit-pending-dot'} />
          {offlineReady ? 'This experience is ready offline' : 'Offline assets are being prepared'}
        </span>
        <p>
          Interactive simulation using BlackOut’s real merge engine. It does not switch your network
          off or contact real devices. {facts.reports} unique reports in this replay.
        </p>
      </div>
      <div className="experience-pillars">
        <div>
          <span>01</span>
          <h3>Record beyond the signal.</h3>
          <p>Your field log lives on your device. Load it once before you leave.</p>
        </div>
        <div>
          <span>02</span>
          <h3>Meet. Scan. Carry it forward.</h3>
          <p>In the field, QR codes move snapshots between a screen and a camera.</p>
        </div>
        <div>
          <span>03</span>
          <h3>Keep every side of the story.</h3>
          <p>Independent reports come together. Conflicting decisions stay yours to make.</p>
        </div>
      </div>
    </section>
  )
}
