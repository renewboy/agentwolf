import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  TrajectoryAuditReport,
  TrajectoryPage,
  TrajectoryPlayerDebug,
  TrajectoryRecord,
  TrajectoryRecordKind,
  TrajectoryTurn,
} from '@agentwolf/contracts'

const virtual = vi.hoisted(() => ({
  scrollToIndex: vi.fn(),
  measureElement: vi.fn(),
  options: [] as Array<{ count: number }>,
}))

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number }) => {
    virtual.options.push(options)
    return {
      getTotalSize: () => options.count * 40,
      getVirtualItems: () =>
        Array.from({ length: options.count }, (_, index) => ({
          index,
          key: index,
          start: index * 40,
        })),
      scrollToIndex: virtual.scrollToIndex,
      measureElement: virtual.measureElement,
    }
  },
}))

import { TrajectoryAuditOrb } from '../src/components/developer/TrajectoryAuditOrb.js'
import { TrajectoryInspectorTabs } from '../src/components/developer/TrajectoryInspectorTabs.js'
import {
  TrajectoryInspector,
  TrajectoryLedger,
  TrajectoryMinimap,
} from '../src/components/developer/TrajectoryPanels.js'
import { matchView } from './fixtures/match.js'

function turn(
  ordinal: number,
  ownerId = 'player-1',
  actionType = 'speech',
  group: 'setup' | 'night' | 'day' = ordinal === 1 ? 'setup' : 'night',
): TrajectoryTurn {
  return {
    turnId: `turn-${ordinal}`,
    ownerId,
    ordinal,
    kind: 'action',
    phaseId: 'phase-day-speech',
    actionType,
    timelineGroup: group === 'setup' ? { kind: 'setup' } : { kind: group, index: 1 },
    fromSequence: ordinal,
    toSequence: ordinal + 1,
    sessionId: `session-${ordinal}`,
    sessionGeneration: 1,
    attempt: 1,
    status: ordinal === 2 ? 'failed' : 'completed',
    startedAt: '2026-08-28T12:34:56.789Z',
    durationMs: ordinal === 1 ? 500 : 1_500,
    error: ordinal === 2 ? 'turn failed' : null,
  } as TrajectoryTurn
}

function record(
  ordinal: number,
  kind: TrajectoryRecordKind,
  overrides: Partial<TrajectoryRecord> = {},
): TrajectoryRecord {
  return {
    recordId: `record-${ordinal}`,
    turnId: ordinal <= 5 ? 'turn-1' : 'turn-2',
    ownerId: 'player-1',
    ordinal,
    kind,
    title: kind === 'tool' ? 'Tool: lookup' : `${kind} title`,
    status: kind === 'permission' ? 'allowed' : 'completed',
    startedAt: '2026-08-28T12:34:56.789Z',
    durationMs: ordinal % 3 === 0 ? null : ordinal % 2 === 0 ? 1_500 : 250,
    text: kind === 'message' ? 'message text' : null,
    input: kind === 'action' ? '{"action":{"type":"vote"}}' : null,
    output: kind === 'diagnostic' ? 'diagnostic output' : null,
    usage: kind === 'usage' ? { used: 20, size: 100, cost: null } : null,
    truncatedFields: kind === 'prompt' ? ['text'] : [],
    ...overrides,
  } as TrajectoryRecord
}

const allKinds: readonly TrajectoryRecordKind[] = [
  'prompt',
  'reasoning',
  'message',
  'usage',
  'tool',
  'permission',
  'action',
  'diagnostic',
  'lifecycle',
  'error',
]

function page(ownerId = 'player-1'): TrajectoryPage {
  return {
    ownerId,
    revision: 2,
    turns: [turn(2), turn(1)],
    records: allKinds.map((kind, index) =>
      record(index + 1, kind, kind === 'lifecycle' ? { title: 'session_started' } : {}),
    ),
    nextBeforeTurn: 1,
  } as TrajectoryPage
}

beforeEach(() => {
  virtual.scrollToIndex.mockReset()
  virtual.measureElement.mockReset()
  virtual.options.length = 0
})

describe('Trajectory panels', () => {
  it('maps every record kind into minimap lanes and selects nodes', async () => {
    const onSelect = vi.fn()
    render(<TrajectoryMinimap onSelect={onSelect} page={page()} selectedId="record-3" />)
    expect(document.querySelectorAll('.aw-trajectory-minimap__lane')).toHaveLength(4)
    expect(document.querySelectorAll('.aw-trajectory-minimap__node')).toHaveLength(allKinds.length)
    expect(document.querySelector('[data-selected="true"]')).toHaveAttribute('data-kind', 'message')
    await userEvent.click(screen.getByRole('button', { name: /^#1 注入/u }))
    expect(onSelect).toHaveBeenCalledWith('record-1')
  })

  it('renders, searches, collapses, selects, scrolls, and restores owner positions', async () => {
    const onQuery = vi.fn()
    const onSelect = vi.fn()
    const onLoadOlder = vi.fn()
    const first = page()
    const { rerender } = render(
      <TrajectoryLedger
        followLatest
        loading={false}
        onLoadOlder={onLoadOlder}
        onQuery={onQuery}
        onSelect={onSelect}
        page={first}
        query=""
        selectedId={null}
      />,
    )
    expect(document.querySelector('.aw-trajectory-virtual')).toHaveStyle({ height: '480px' })
    expect(screen.getByRole('button', { name: '加载更早回合' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '加载更早回合' }))
    expect(onLoadOlder).toHaveBeenCalledOnce()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'message' } })
    expect(onQuery).toHaveBeenCalledWith('message')
    await userEvent.click(document.querySelector<HTMLButtonElement>('.aw-trajectory-record')!)
    expect(onSelect).toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '折叠全部阶段' }))
    expect(screen.getByRole('button', { name: '展开全部阶段' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '展开全部阶段' }))
    const groups = document.querySelectorAll<HTMLButtonElement>('.aw-trajectory-group')
    await userEvent.click(groups[0]!)
    await userEvent.click(groups[0]!)

    const scroller = document.querySelector<HTMLElement>('.aw-trajectory-scroll')!
    Object.defineProperties(scroller, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, writable: true, value: 300 },
    })
    fireEvent.wheel(scroller, { deltaY: -1 })
    fireEvent.scroll(scroller)
    scroller.scrollTop = 800
    fireEvent.scroll(scroller)
    fireEvent.pointerDown(scroller)
    fireEvent.keyDown(scroller, { key: 'Home' })
    fireEvent.keyDown(scroller, { key: 'ArrowDown' })

    rerender(
      <TrajectoryLedger
        followLatest={false}
        loading
        onLoadOlder={onLoadOlder}
        onQuery={onQuery}
        onSelect={onSelect}
        page={{ ...first, ownerId: 'system', nextBeforeTurn: null }}
        query="message"
        selectedId="record-3"
      />,
    )
    expect(document.querySelector('.aw-trajectory-ledger')).toHaveAttribute('aria-busy', 'true')
    expect(virtual.scrollToIndex).toHaveBeenCalledWith(expect.any(Number), { align: 'center' })
    rerender(
      <TrajectoryLedger
        followLatest
        loading={false}
        onLoadOlder={onLoadOlder}
        onQuery={onQuery}
        onSelect={onSelect}
        page={first}
        query="no-match"
        selectedId={null}
      />,
    )
    expect(document.querySelectorAll('.aw-trajectory-record')).toHaveLength(0)
  })

  it('orders merged records and collapses the group containing the selected record', async () => {
    const current = page()
    render(
      <TrajectoryLedger
        followLatest={false}
        loading={false}
        onLoadOlder={vi.fn()}
        onQuery={vi.fn()}
        onSelect={vi.fn()}
        page={{ ...current, records: [...current.records].reverse() }}
        query=""
        selectedId="record-1"
      />,
    )

    const ordinals = [...document.querySelectorAll('.aw-trajectory-record > span:first-child')].map(
      (node) => node.textContent,
    )
    expect(ordinals).toEqual(allKinds.map((_, index) => `#${index + 1}`))

    await userEvent.click(screen.getByRole('button', { name: '折叠全部阶段' }))
    const groups = [...document.querySelectorAll<HTMLButtonElement>('.aw-trajectory-group')]
    expect(groups).toHaveLength(2)
    expect(groups.every((group) => group.getAttribute('aria-expanded') === 'false')).toBe(true)
    expect(document.querySelectorAll('.aw-trajectory-record')).toHaveLength(0)
  })

  it('renders all preview formats and action labels', () => {
    const actionTypes = [
      'bootstrap',
      'speech',
      'vote',
      'night-action',
      'sheriff-action',
      'skill-trigger',
      'domain-events',
      'postgame-review',
      'postgame-reflection',
      'custom-action',
    ]
    const actions = actionTypes.map((type, index) =>
      record(index + 20, 'action', {
        turnId: 'turn-1',
        input: index % 2 === 0 ? JSON.stringify({ action: { type } }) : JSON.stringify({ type }),
      }),
    )
    const variants = [
      record(40, 'permission', { turnId: 'turn-1', status: 'denied' }),
      record(41, 'action', { turnId: 'turn-1', input: '{' }),
      record(42, 'action', { turnId: 'turn-1', input: 'null' }),
      record(43, 'action', { turnId: 'turn-1', input: null, title: 'fallback action' }),
      record(44, 'message', { turnId: 'turn-1', text: null, output: 'output fallback' }),
    ]
    const customPage = { ...page(), records: [...page().records, ...actions, ...variants] }
    render(
      <TrajectoryLedger
        followLatest={false}
        loading={false}
        onLoadOlder={vi.fn()}
        onQuery={vi.fn()}
        onSelect={vi.fn()}
        page={customPage}
        query=""
        selectedId={null}
      />,
    )
    expect(document.querySelectorAll('.aw-trajectory-record')).toHaveLength(
      customPage.records.length,
    )
    expect(document.body).toHaveTextContent('fallback action')
    expect(document.body).toHaveTextContent('output fallback')
  })

  it('renders empty, turn, and record inspector states', () => {
    const { rerender } = render(<TrajectoryInspector record={null} turn={null} />)
    expect(screen.getByText(/选择任意一条记录/u)).toBeVisible()
    const failed = turn(2, 'player-1', 'night-action')
    rerender(<TrajectoryInspector record={null} turn={failed} />)
    expect(screen.getByText('turn failed')).toBeVisible()
    expect(screen.getByText(/1.5s/)).toBeVisible()
    rerender(<TrajectoryInspector record={record(1, 'prompt')} turn={null} />)
    expect(screen.getByText(/当前记录已明确截断/u)).toBeVisible()
    rerender(
      <TrajectoryInspector
        record={record(4, 'usage', {
          status: null,
          text: 'text',
          input: 'input',
          output: 'output',
        })}
        turn={null}
      />,
    )
    expect(screen.getByText('20 / 100')).toBeVisible()
    expect(screen.getByText('text')).toBeVisible()
    expect(screen.getByText('input')).toBeVisible()
    expect(screen.getByText('output')).toBeVisible()
  })
})

describe('TrajectoryInspectorTabs', () => {
  const seat = matchView().seats[0]!

  it('switches tabs with clicks and arrow keys and renders loading/unavailable states', async () => {
    const onTabChange = vi.fn()
    const { rerender } = render(
      <TrajectoryInspectorTabs
        activeTab="player"
        debug={null}
        debugLoading
        onTabChange={onTabChange}
        record={null}
        seat={seat}
        turn={null}
      />,
    )
    expect(screen.getByText(/正在读取玩家调试信息/u)).toBeVisible()
    fireEvent.keyDown(screen.getByRole('tab', { name: '玩家配置' }), { key: 'ArrowRight' })
    expect(onTabChange).toHaveBeenCalledWith('record')
    fireEvent.keyDown(screen.getByRole('tab', { name: '玩家配置' }), { key: 'Enter' })
    await userEvent.click(screen.getByRole('tab', { name: '记录详情' }))
    expect(onTabChange).toHaveBeenCalledWith('record')

    rerender(
      <TrajectoryInspectorTabs
        activeTab="player"
        debug={null}
        debugLoading={false}
        onTabChange={onTabChange}
        record={null}
        seat={null}
        turn={null}
      />,
    )
    expect(screen.getByText(/没有玩家 Session 配置/u)).toBeVisible()
    rerender(
      <TrajectoryInspectorTabs
        activeTab="record"
        debug={null}
        debugLoading={false}
        onTabChange={onTabChange}
        record={null}
        seat={null}
        turn={turn(1)}
      />,
    )
    fireEvent.keyDown(screen.getByRole('tab', { name: '记录详情' }), { key: 'ArrowLeft' })
    expect(onTabChange).toHaveBeenCalledWith('player')
  })

  it('renders complete and sparse player debugging data', () => {
    const complete = debugFixture()
    const { rerender } = render(
      <TrajectoryInspectorTabs
        activeTab="player"
        debug={complete}
        debugLoading={false}
        onTabChange={vi.fn()}
        record={null}
        seat={seat}
        turn={null}
      />,
    )
    expect(screen.getByText(/Tool Name · model-x · high/)).toBeVisible()
    expect(screen.getByText(/10 \/ 100 · 0.02 USD/)).toBeVisible()
    expect(screen.getByText(/delivery-1.*pending/u)).toBeVisible()
    expect(screen.getByText(/vote.*delivery-1/u)).toBeVisible()
    expect(screen.getByText(/TOKEN ← process:API_TOKEN/)).toBeVisible()
    expect(screen.getByText(/PLAIN ← literal/u)).toBeVisible()
    expect(screen.getByText('latest error')).toBeVisible()

    rerender(
      <TrajectoryInspectorTabs
        activeTab="player"
        debug={{
          ...complete,
          profile: { ...complete.profile, reasoningEffort: null, mode: null },
          session: {
            ...complete.session,
            generation: null,
            pendingActionType: 'speech',
            pendingDeliveryId: null,
          },
          delivery: { ...complete.delivery, activeAttempt: null },
          context: { ...complete.context, latest: null },
          launch: { ...complete.launch, args: [], environment: [], connectionKeys: [] },
          latestTurn: null,
        }}
        debugLoading={false}
        onTabChange={vi.fn()}
        record={null}
        seat={seat}
        turn={null}
      />,
    )
    expect(screen.getByText('speech')).toBeVisible()
    expect(screen.getAllByText('无').length).toBeGreaterThan(2)
  })
})

describe('TrajectoryAuditOrb', () => {
  const seats = matchView().seats
  const turns = [turn(1), turn(2, 'player-99')]
  const issues = [
    { turnId: 'turn-1', code: 'prompt-missing', detail: 'prompt detail' },
    { turnId: 'turn-2', code: 'usage-missing', detail: 'usage detail' },
    { turnId: 'turn-404', code: 'unknown', detail: 'unknown detail' },
  ]
  const audit = { auditedTurns: 3, issues } as TrajectoryAuditReport

  it('hides empty audits and opens, locates, and closes issue details', async () => {
    const onLocate = vi.fn()
    const { rerender } = render(
      <TrajectoryAuditOrb audit={null} onLocate={onLocate} seats={seats} turns={turns} />,
    )
    expect(document.querySelector('.aw-trajectory-audit-orb')).toBeNull()
    rerender(
      <TrajectoryAuditOrb
        audit={{ auditedTurns: 0, issues: [] } as never}
        onLocate={onLocate}
        seats={seats}
        turns={turns}
      />,
    )
    expect(document.querySelector('.aw-trajectory-audit-orb')).toBeNull()
    rerender(<TrajectoryAuditOrb audit={audit} onLocate={onLocate} seats={seats} turns={turns} />)
    const orb = document.querySelector<HTMLButtonElement>('.aw-trajectory-audit-orb')!
    await userEvent.click(orb)
    expect(screen.getByText('prompt detail')).toBeVisible()
    expect(screen.getByText(/1.*一号玩家.*#1/u)).toBeVisible()
    expect(screen.getByText(/调用 #2/u)).toBeVisible()
    expect(screen.getByText('未找到对应模型调用')).toBeVisible()
    const locate = screen.getAllByRole('button', { name: '定位轨迹' })[0]!
    await userEvent.click(locate)
    expect(onLocate).toHaveBeenCalledWith(issues[0])
    await userEvent.click(orb)
    await userEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByText('prompt detail')).not.toBeInTheDocument()
  })

  it('loads, clamps, drags, saves, suppresses click, resizes, and tolerates storage failures', () => {
    window.localStorage.setItem(
      'agentwolf.trajectory-audit-orb-position',
      JSON.stringify({ x: -20, y: 9999 }),
    )
    const manyIssues = Array.from({ length: 101 }, (_, index) => ({
      turnId: `missing-${index}`,
      code: 'unknown',
      detail: `issue-${index}`,
    }))
    render(
      <TrajectoryAuditOrb
        audit={{ auditedTurns: 1, issues: manyIssues } as never}
        onLocate={vi.fn()}
        seats={[]}
        turns={[]}
      />,
    )
    const orb = document.querySelector<HTMLButtonElement>('.aw-trajectory-audit-orb')!
    orb.getBoundingClientRect = () =>
      ({ x: 10, y: 10, width: 40, height: 40, right: 50, bottom: 50 }) as DOMRect
    Object.defineProperties(orb, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    })
    expect(orb).toHaveTextContent('99+')
    fireEvent.pointerDown(orb, { button: 1, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerDown(orb, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(orb, { pointerId: 2, clientX: 50, clientY: 50 })
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 12, clientY: 12 })
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 1000, clientY: 1000 })
    fireEvent.pointerUp(orb, { pointerId: 1 })
    expect(window.localStorage.getItem('agentwolf.trajectory-audit-orb-position')).toContain('"x"')
    fireEvent.click(orb)
    expect(screen.queryByText('issue-0')).not.toBeInTheDocument()
    fireEvent.click(orb)
    expect(screen.getByText('issue-0')).toBeVisible()
    fireEvent(window, new Event('resize'))

    vi.spyOn(window.localStorage, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota')
    })
    fireEvent.pointerDown(orb, { button: 0, pointerId: 3, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(orb, { pointerId: 3, clientX: 30, clientY: 30 })
    fireEvent.pointerCancel(orb, { pointerId: 3 })
    window.localStorage.setItem('agentwolf.trajectory-audit-orb-position', '{')
  })
})

function debugFixture(): TrajectoryPlayerDebug {
  return {
    profile: {
      name: 'Profile',
      toolName: 'Tool Name',
      model: 'model-x',
      reasoningEffort: 'high',
      mode: 'read-only',
      promptTimeoutMs: 5000,
    },
    session: {
      id: 'session-1',
      generation: 2,
      state: 'active',
      bootstrapState: 'ready',
      pendingActionType: 'vote',
      pendingDeliveryId: 'delivery-1',
      updatedAt: '2026-08-28T00:00:00.000Z',
    },
    delivery: {
      acknowledgedSequence: 9,
      activeAttempt: {
        id: 'delivery-1',
        state: 'pending',
        fromSequence: 5,
        toSequence: 9,
      },
    },
    context: {
      latest: { used: 10, size: 100, cost: { amount: 0.02, currency: 'USD' } },
      peakUsed: 20,
      turnsWithUsage: 2,
    },
    launch: {
      command: 'agent',
      args: ['--flag'],
      environment: [
        { name: 'TOKEN', source: 'process', reference: 'API_TOKEN' },
        { name: 'PLAIN', source: 'literal', reference: null },
      ],
      connectionKeys: ['endpoint'],
    },
    latestTurn: {
      ordinal: 2,
      actionType: 'vote',
      status: 'failed',
      fromSequence: 5,
      toSequence: 9,
      error: 'latest error',
    },
  } as unknown as TrajectoryPlayerDebug
}
