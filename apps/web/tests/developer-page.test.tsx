import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrajectoryDeltaSchema } from '@agentwolf/contracts'
import type {
  TrajectoryAuditReport,
  TrajectoryPage,
  TrajectoryPlayerDebug,
  TrajectorySummary,
} from '@agentwolf/contracts'

const apiMocks = vi.hoisted(() => ({
  getMatch: vi.fn(),
  trajectorySummary: vi.fn(),
  trajectoryAudit: vi.fn(),
  trajectoryPage: vi.fn(),
  trajectoryPlayerDebug: vi.fn(),
}))

vi.mock('../src/api.js', () => ({ api: apiMocks }))
vi.mock('../src/hooks/useRuntimeConfig.js', () => ({
  useRuntimeConfig: () => ({ developerMode: true }),
}))
vi.mock('../src/components/developer/TrajectoryPanels.js', () => ({
  TrajectoryMinimap: ({
    onSelect,
    selectedId,
  }: {
    onSelect: (id: string) => void
    selectedId: string | null
  }) => (
    <button data-testid="minimap" type="button" onClick={() => onSelect('record-1')}>
      minimap:{selectedId ?? 'none'}
    </button>
  ),
  TrajectoryLedger: ({
    onQuery,
    onSelect,
    page,
    query,
  }: {
    onQuery: (value: string) => void
    onSelect: (id: string) => void
    page: TrajectoryPage
    query: string
  }) => (
    <div data-testid="ledger">
      ledger:{page.ownerId}:{page.records.length}:{query}
      <button type="button" onClick={() => onQuery('needle')}>
        query
      </button>
      <button type="button" onClick={() => onSelect('turn-1')}>
        select turn
      </button>
    </div>
  ),
}))
vi.mock('../src/components/developer/TrajectoryInspectorTabs.js', () => ({
  TrajectoryInspectorTabs: ({
    activeTab,
    onTabChange,
    record,
    turn,
  }: {
    activeTab: string
    onTabChange: (tab: 'player' | 'record') => void
    record: { recordId: string } | null
    turn: { turnId: string } | null
  }) => (
    <div data-testid="inspector">
      inspector:{activeTab}:{record?.recordId ?? turn?.turnId ?? 'none'}
      <button type="button" onClick={() => onTabChange('player')}>
        player tab
      </button>
    </div>
  ),
}))
vi.mock('../src/components/developer/TrajectoryAuditOrb.js', () => ({
  TrajectoryAuditOrb: ({
    audit: report,
    onLocate,
  }: {
    audit: TrajectoryAuditReport | null
    onLocate: (issue: TrajectoryAuditReport['issues'][number]) => void
  }) =>
    report?.issues[0] ? (
      <button type="button" onClick={() => onLocate(report.issues[0]!)}>
        locate issue
      </button>
    ) : null,
}))

import { DeveloperPage } from '../src/pages/DeveloperPage.js'
import { matchView } from './fixtures/match.js'

class FakeWebSocket extends EventTarget {
  public static readonly instances: FakeWebSocket[] = []
  public readonly url: string
  public closed = false

  public constructor(url: string) {
    super()
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  public message(value: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) }))
  }

  public close(): void {
    this.closed = true
  }

  public disconnect(): void {
    this.dispatchEvent(new CloseEvent('close'))
  }
}

const firstTurn = {
  turnId: 'turn-1',
  ownerId: 'player-1',
  ordinal: 2,
  timelineGroup: { kind: 'setup' },
}
const olderTurn = {
  ...firstTurn,
  turnId: 'turn-older',
  ordinal: 1,
}
const secondTurn = {
  ...firstTurn,
  turnId: 'turn-2',
  ownerId: 'system',
  ordinal: 1,
}
const promptRecord = {
  recordId: 'record-1',
  turnId: 'turn-1',
  ownerId: 'player-1',
  ordinal: 2,
  kind: 'prompt',
}
const usageRecord = {
  ...promptRecord,
  recordId: 'record-usage',
  ordinal: 3,
  kind: 'usage',
}
const olderRecord = {
  ...promptRecord,
  recordId: 'record-older',
  turnId: 'turn-older',
  ordinal: 1,
}

function summary(overrides: Partial<TrajectorySummary> = {}): TrajectorySummary {
  return {
    matchId: 'match-test-abcdef',
    revision: 1,
    owners: [
      { ownerId: 'system', label: 'System', turnCount: 1, recordCount: 1 },
      { ownerId: 'player-2', label: 'Two', turnCount: 0, recordCount: 0 },
      { ownerId: 'player-1', label: 'One', turnCount: 2, recordCount: 3 },
      { ownerId: 'player-x', label: 'Invalid', turnCount: 0, recordCount: 0 },
    ],
    turns: [olderTurn, firstTurn, secondTurn],
    ...overrides,
  } as TrajectorySummary
}

function trajectoryPage(
  ownerId: TrajectoryPage['ownerId'] = 'player-1' as TrajectoryPage['ownerId'],
  before: number | null = null,
): TrajectoryPage {
  if (ownerId === 'system') {
    return {
      matchId: 'match-test-abcdef' as TrajectoryPage['matchId'],
      ownerId,
      revision: 2,
      turns: [secondTurn],
      records: [],
      nextBeforeTurn: null,
    } as unknown as TrajectoryPage
  }
  if (ownerId !== 'player-1') {
    return {
      matchId: 'match-test-abcdef' as TrajectoryPage['matchId'],
      ownerId,
      revision: 2,
      turns: [],
      records: [],
      nextBeforeTurn: null,
    } as unknown as TrajectoryPage
  }
  return {
    matchId: 'match-test-abcdef' as TrajectoryPage['matchId'],
    ownerId,
    revision: before ? 3 : 2,
    turns: before ? [olderTurn] : [firstTurn],
    records: before ? [olderRecord] : [promptRecord, usageRecord],
    nextBeforeTurn: before ? null : 2,
  } as TrajectoryPage
}

function audit(code = 'missing-prompt'): TrajectoryAuditReport {
  return {
    auditedTurns: 1,
    issues: [{ turnId: 'turn-1', code, detail: 'issue' }],
  } as TrajectoryAuditReport
}

function renderPage(matchId = 'match-test-abcdef') {
  return render(
    <MemoryRouter initialEntries={[`/matches/${matchId}/trajectory`]}>
      <Routes>
        <Route path="/matches/:matchId/trajectory" element={<DeveloperPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  FakeWebSocket.instances.length = 0
  vi.stubGlobal('WebSocket', FakeWebSocket)
  for (const mock of Object.values(apiMocks)) mock.mockReset()
  apiMocks.getMatch.mockResolvedValue(matchView())
  apiMocks.trajectorySummary.mockResolvedValue(summary())
  apiMocks.trajectoryAudit.mockResolvedValue(audit())
  apiMocks.trajectoryPage.mockImplementation(
    async (_matchId: string, ownerId: TrajectoryPage['ownerId'], before: number | null) =>
      trajectoryPage(ownerId, before),
  )
  apiMocks.trajectoryPlayerDebug.mockResolvedValue({ profile: {} } as TrajectoryPlayerDebug)
  vi.spyOn(TrajectoryDeltaSchema, 'parse').mockImplementation((value) => value as never)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('DeveloperPage', () => {
  it('rejects an invalid Match ID and retries without API calls', async () => {
    renderPage('bad')
    expect(await screen.findByRole('alert')).toHaveTextContent('轨迹')
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(apiMocks.getMatch).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: '切换到游戏主界面' })).not.toBeInTheDocument()
  })

  it('renders root loading errors from Error and non-Error causes and retries', async () => {
    apiMocks.getMatch
      .mockRejectedValueOnce(new Error('load failed'))
      .mockRejectedValueOnce('string failure')
      .mockResolvedValueOnce(matchView())
    const { unmount } = renderPage()
    expect(await screen.findByText('load failed')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('string failure')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: '玩家行动轨迹' })).toBeVisible()
    unmount()
  })

  it('loads ordered owners, complete histories, debugging, query, records, and live deltas', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: '玩家行动轨迹' })).toBeVisible()
    expect(apiMocks.trajectoryPage).toHaveBeenCalledWith('match-test-abcdef', 'player-1', null)
    expect(apiMocks.trajectoryPage).toHaveBeenCalledWith('match-test-abcdef', 'player-1', 2)
    expect(apiMocks.trajectoryPlayerDebug).toHaveBeenCalledWith('match-test-abcdef', 'player-1')
    const owners = document.querySelectorAll<HTMLButtonElement>('.aw-trajectory-owner')
    expect(owners[0]).toHaveTextContent('1号玩家')
    expect(owners[owners.length - 1]).toHaveTextContent('裁判与运行时')
    await waitFor(() => expect(FakeWebSocket.instances[0]?.url).toContain('afterRevision=3'))

    await userEvent.click(screen.getByRole('button', { name: 'query' }))
    expect(screen.getByTestId('ledger')).toHaveTextContent('needle')
    await userEvent.click(screen.getByTestId('minimap'))
    expect(screen.getByTestId('inspector')).toHaveTextContent('record:record-1')
    await userEvent.click(screen.getByRole('button', { name: 'select turn' }))
    expect(screen.getByTestId('inspector')).toHaveTextContent('record:turn-1')
    await userEvent.click(screen.getByRole('button', { name: 'player tab' }))
    expect(screen.getByTestId('inspector')).toHaveTextContent('player')

    const socket = FakeWebSocket.instances[0]!
    act(() =>
      socket.message({
        type: 'trajectory.delta',
        revision: 4,
        turns: [{ ...firstTurn, ordinal: 3 }],
        records: [{ ...promptRecord, recordId: 'record-live', ordinal: 4 }],
      }),
    )
    expect(screen.getByTestId('ledger')).toHaveTextContent(':4:')
  })

  it('switches system/player owners and reports debug failures', async () => {
    renderPage()
    await screen.findByRole('heading', { name: '玩家行动轨迹' })
    const ownerButtons = [...document.querySelectorAll<HTMLButtonElement>('.aw-trajectory-owner')]
    const system = ownerButtons[2]!
    await userEvent.click(system)
    await waitFor(() =>
      expect(apiMocks.trajectoryPage).toHaveBeenCalledWith('match-test-abcdef', 'system', null),
    )
    expect(screen.getByTestId('inspector')).toHaveTextContent('record')

    apiMocks.trajectoryPlayerDebug.mockRejectedValueOnce('debug failed')
    await userEvent.click(system)
    const playerOne = [
      ...document.querySelectorAll<HTMLButtonElement>('.aw-trajectory-owner'),
    ].find((button) => button.textContent?.includes('1号玩家'))!
    await userEvent.click(playerOne)
    expect(await screen.findByText('debug failed')).toBeVisible()
  })

  it('reports initial and older-page failures while loading a complete history', async () => {
    apiMocks.trajectoryPage.mockRejectedValueOnce(new Error('page failed'))
    const first = renderPage()
    expect(await screen.findByText('page failed')).toBeVisible()
    first.unmount()

    apiMocks.trajectoryPage.mockImplementationOnce(async (_matchId, ownerId) =>
      trajectoryPage(ownerId, null),
    )
    apiMocks.trajectoryPage.mockRejectedValueOnce('older failed')
    renderPage()
    expect(await screen.findByText('older failed')).toBeVisible()
  })

  it.each([
    ['missing-prompt', 'record-1'],
    ['context-budget-exceeded', 'record-usage'],
    ['actor-mismatch', 'record-1'],
  ])('focuses %s audit issues on %s', async (code, expectedRecord) => {
    apiMocks.trajectoryAudit.mockResolvedValueOnce(audit(code))
    renderPage()
    await screen.findByRole('heading', { name: '玩家行动轨迹' })
    await userEvent.click(screen.getByRole('button', { name: 'locate issue' }))
    expect(screen.getByTestId('inspector')).toHaveTextContent(`record:${expectedRecord}`)
  })

  it('focuses an audit turn without records after loading its owner history', async () => {
    apiMocks.trajectoryAudit.mockResolvedValueOnce({
      auditedTurns: 1,
      issues: [{ turnId: 'turn-2', code: 'actor-mismatch', detail: 'issue' }],
    })
    renderPage()
    await screen.findByRole('heading', { name: '玩家行动轨迹' })

    await userEvent.click(screen.getByRole('button', { name: 'locate issue' }))

    await waitFor(() =>
      expect(apiMocks.trajectoryPage).toHaveBeenCalledWith('match-test-abcdef', 'system', null),
    )
    expect(screen.getByTestId('inspector')).toHaveTextContent('record:turn-2')
  })

  it('ignores unknown audit turns and reconnects a closed live socket', async () => {
    vi.useFakeTimers()
    apiMocks.trajectoryAudit.mockResolvedValueOnce({
      auditedTurns: 1,
      issues: [{ turnId: 'unknown-turn', code: 'actor-mismatch', detail: 'issue' }],
    })
    renderPage()
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    const pageCalls = apiMocks.trajectoryPage.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'locate issue' }))
    expect(apiMocks.trajectoryPage).toHaveBeenCalledTimes(pageCalls)
    act(() => FakeWebSocket.instances[0]!.disconnect())
    void act(() => vi.advanceTimersByTime(700))
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it('falls back to system when no owner has turns', async () => {
    apiMocks.trajectorySummary.mockResolvedValueOnce(
      summary({ owners: [{ ownerId: 'system', label: 'System', turnCount: 0, recordCount: 0 }] }),
    )
    renderPage()
    await waitFor(() =>
      expect(apiMocks.trajectoryPage).toHaveBeenCalledWith('match-test-abcdef', 'system', null),
    )
  })
})
