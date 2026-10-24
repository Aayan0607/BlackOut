import {
  A,
  addRecord,
  conflictsFor,
  createWorkspace,
  editRecord,
  heads,
  mergeWorkspace,
  type WorkspaceDoc,
} from './model'

export const teamIds = ['ridge', 'valley', 'base'] as const
export type TeamId = (typeof teamIds)[number]
export const teams: Record<TeamId, { name: string; label: string; color: string }> = {
  ridge: { name: 'Ridge Team', label: 'NORTH RIDGE', color: '#f0a182' },
  valley: { name: 'Valley Team', label: 'RIVER CROSSING', color: '#9edbc1' },
  base: { name: 'Base Camp', label: 'LOWER CAMP', color: '#e4c786' },
}
export interface Replay {
  stage: number
  checkpointId: string
  docs: Record<TeamId, WorkspaceDoc>
  choice?: 'Ridge Team' | 'Valley Team'
}
export function createReplay(): Replay {
  const doc = addRecord(
    createWorkspace('SIMULATION · Northern Ridge'),
    {
      title: 'Who checks the river crossing?',
      note: 'Agree who checks the crossing when teams meet.',
      location: 'River crossing',
      kind: 'checkpoint',
      assignee: 'To be decided',
    },
    'Shared briefing',
  )
  return {
    stage: 0,
    checkpointId: Object.keys(doc.records)[0],
    docs: { ridge: A.clone(doc), valley: A.clone(doc), base: A.clone(doc) },
  }
}
/** Every stage uses the same edit/merge functions as the real field log. No repository writes. */
export function advanceReplay(state: Replay, choice?: Replay['choice']): Replay {
  const docs = { ...state.docs }
  switch (state.stage) {
    case 0:
      docs.ridge = addRecord(
        editRecord(docs.ridge, state.checkpointId, { assignee: 'Ridge Team' }, 'Ridge Team'),
        {
          title: 'Rockfall on the east trail',
          note: 'Loose stones above the approach. Review before continuing.',
          kind: 'hazard',
          location: 'East trail',
        },
        'Ridge Team',
      )
      docs.valley = addRecord(
        editRecord(docs.valley, state.checkpointId, { assignee: 'Valley Team' }, 'Valley Team'),
        {
          title: 'Water cache at the crossing',
          note: 'Six sealed bottles reported at the marker.',
          kind: 'supply',
          location: 'River crossing',
        },
        'Valley Team',
      )
      docs.base = addRecord(
        docs.base,
        {
          title: 'Cloud cover increasing',
          note: 'A field observation from the lower camp.',
          kind: 'observation',
          location: 'Lower camp',
        },
        'Base Camp',
      )
      break
    case 1:
      docs.valley = mergeWorkspace(docs.valley, docs.ridge)
      break
    case 2:
      if (choice !== 'Ridge Team' && choice !== 'Valley Team')
        throw new Error('Choose a team to resolve the assignment.')
      docs.valley = editRecord(docs.valley, state.checkpointId, { assignee: choice }, 'Valley Team')
      break
    case 3:
      docs.base = mergeWorkspace(docs.base, docs.valley)
      break
    case 4:
      docs.valley = mergeWorkspace(docs.valley, docs.base)
      break
    case 5:
      docs.ridge = mergeWorkspace(docs.ridge, docs.valley)
      break
    default:
      return state
  }
  return { ...state, docs, stage: state.stage + 1, choice: choice ?? state.choice }
}
export function replayFacts(state: Replay) {
  const values = teamIds.map((id) => state.docs[id])
  return {
    converged: new Set(values.map(heads)).size === 1,
    reports: new Set(values.flatMap((doc) => Object.keys(doc.records))).size,
    conflicts: values.reduce(
      (n, doc) => n + Object.values(doc.records).filter((r) => conflictsFor(r).length).length,
      0,
    ),
  }
}
export function nextEncounter(stage: number): [TeamId, TeamId] | null {
  return (
    (
      {
        1: ['ridge', 'valley'],
        3: ['valley', 'base'],
        4: ['base', 'valley'],
        5: ['valley', 'ridge'],
      } as Record<number, [TeamId, TeamId]>
    )[stage] ?? null
  )
}
