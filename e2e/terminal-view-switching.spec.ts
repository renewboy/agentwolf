import type { MatchView, SpectatorView } from '@agentwolf/contracts'
import {
  ignoreLiveMessage,
  postgameMatchFixture,
  thinkingMatchFixture,
} from './fixtures/matches.js'
import { expect, test } from './fixtures/test.js'

for (const state of ['completed', 'skipped'] as const) {
  test(`switches views and reveals private night actions after postgame ${state}`, async ({
    page,
    resources: _resources,
  }) => {
    const base = thinkingMatchFixture()
    const matchId = `match-terminal-view-${state}`
    const review = postgameMatchFixture(base, matchId, 'collecting')
    const nightAction = {
      sequence: 2,
      kind: 'vote.resolved',
      title: '狼人选择袭击 3 号玩家。',
      detail: '投3号：6号',
      playerIds: ['player-6', 'player-3'],
      occurredAt: '2026-08-23T00:00:01.000Z',
    } as MatchView['timeline'][number]
    let terminal = state === 'skipped'
    let sendLive: (message: unknown) => void = ignoreLiveMessage
    let connections = 0
    let closedConnections = 0
    const projection = (view: SpectatorView): MatchView => ({
      ...review,
      timeline:
        view.kind === 'god' || (view.kind === 'player' && view.playerId === 'player-6')
          ? [base.timeline[0]!, nightAction]
          : [base.timeline[0]!],
      postgameReview: { ...review.postgameReview!, state: terminal ? state : 'collecting' },
    })
    await page.route(`**/api/matches/${matchId}?*`, async (route) => {
      const url = new URL(route.request().url())
      const view = {
        kind: url.searchParams.get('view'),
        playerId: url.searchParams.get('playerId'),
      } as SpectatorView
      await route.fulfill({ json: projection(view) })
    })
    await page.routeWebSocket(`**/api/matches/${matchId}/live?*`, (socket) => {
      connections += 1
      socket.onClose(() => {
        closedConnections += 1
      })
      sendLive = (message) => socket.send(JSON.stringify(message))
      sendLive({
        type: 'snapshot',
        view: { kind: 'closed-eye' },
        data: projection({ kind: 'closed-eye' }),
      })
    })

    await page.goto(`/matches/${matchId}`)
    await expect(page.getByRole('button', { name: '闭眼视角', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.locator('.aw-projection-veil')).toHaveCount(0)
    const privateAction = page.getByText(nightAction.title, { exact: true })
    await expect(privateAction).toHaveCount(0)
    const switchView = async (view: SpectatorView, select: () => Promise<void>) => {
      const snapshotResponse = page.waitForResponse((response) => {
        const url = new URL(response.url())
        return (
          url.pathname === `/api/matches/${matchId}` &&
          url.searchParams.get('view') === view.kind &&
          (view.kind !== 'player' || url.searchParams.get('playerId') === view.playerId)
        )
      })
      await select()
      expect((await snapshotResponse).ok()).toBe(true)
      await expect(page.locator('.aw-projection-veil')).toHaveCount(0)
      const day = page.getByRole('button', { name: /^(展开|折叠)第 1 天$/ })
      await expect(day).toBeVisible()
      if ((await day.getAttribute('aria-expanded')) !== 'true') await day.click()
      await expect(day).toHaveAttribute('aria-expanded', 'true')
      if (view.kind === 'god' || (view.kind === 'player' && view.playerId === 'player-6')) {
        await expect(privateAction).toBeVisible()
      } else {
        await expect(privateAction).toHaveCount(0)
      }
    }
    if (!terminal) {
      await expect(page.getByText('已完成 0 / 6')).toBeVisible()
      terminal = true
      sendLive({
        type: 'snapshot',
        view: { kind: 'closed-eye' },
        data: projection({ kind: 'closed-eye' }),
      })
    }
    await expect.poll(() => closedConnections).toBe(1)

    const selectGod = () => page.getByRole('button', { name: '上帝视角', exact: true }).click()
    await switchView({ kind: 'god' }, selectGod)
    const playerSelect = page.getByRole('combobox', { name: '玩家视角' })
    for (const seat of [6, 1, 6]) {
      await switchView({ kind: 'player', playerId: base.seats[seat - 1]!.playerId }, async () => {
        await playerSelect.click()
        await page
          .getByRole('option', { name: `${seat} 号玩家 测试玩家${seat}`, exact: true })
          .click()
      })
    }
    await switchView({ kind: 'closed-eye' }, () =>
      page.getByRole('button', { name: '闭眼视角', exact: true }).click(),
    )
    await switchView({ kind: 'god' }, selectGod)
    expect(connections).toBe(1)
  })
}
