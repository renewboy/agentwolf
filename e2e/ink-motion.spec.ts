import { expect, test } from '@playwright/test'
import type { MatchView, RoleEffectCue } from '@agentwolf/contracts'
import { roleEffectCatalog } from '../packages/assets/dist/index.js'
import {
  closedEyeFixture,
  ignoreLiveMessage,
  postgameMatchFixture,
  thinkingMatchFixture,
} from './fixtures/matches.js'
import roleMaterials from '../packages/assets/art/roles/manifest.json' with { type: 'json' }

test.use({
  viewport: { width: 1440, height: 900 },
  video: { mode: 'on', size: { width: 1440, height: 900 } },
})

test('reviews complete ink states, role variants and protected view changes', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const fixture = thinkingMatchFixture()
  const roles = [
    'role-werewolf',
    'role-seer',
    'role-witch',
    'role-guard',
    'role-hunter',
    'role-idiot',
    'role-cupid',
    'role-thief',
    'role-white-wolf-king',
    'role-magic-mirror-girl',
    'role-awakened-hidden-wolf',
    'role-villager',
  ]
  const names = [
    '山岚听雨',
    '雾隐枕石',
    '云岚守夜',
    '风眠知白',
    '长夜微光',
    '星垂观棋',
    '月渡寒江',
    '林深见鹿',
    '听雪归舟',
    '烟岚镜月',
    '青崖藏锋',
    '夜航临风',
  ]
  let current = {
    ...fixture,
    id: 'match-ink-motion-review',
    boardName: '12 人动效演示',
    status: 'starting',
    lastSequence: 30,
    effectCues: [],
    timeline: fixture.timeline.slice(0, 1),
    seats: roles.map((roleId, index) => ({
      ...fixture.seats[index % 6]!,
      playerId: `player-${index + 1}`,
      seat: index + 1,
      name: names[index]!,
      roleId,
      roleName: roleMaterials.roles.find((role) => role.id === roleId)!.label,
      faction: roleId.includes('wolf') ? 'werewolf' : 'village',
      sessionStatus: index === 0 ? 'starting' : index === 1 ? 'syncing' : 'ready',
      sheriff: index === 1,
      active: false,
    })),
  } as unknown as MatchView
  let view: 'god' | 'closed-eye' = 'god'
  let send = ignoreLiveMessage
  const visible = (): MatchView =>
    view === 'god' ? current : { ...closedEyeFixture(current), effectCues: [] }
  const publish = (): void => send({ type: 'snapshot', view: { kind: view }, data: visible() })
  await page.route('**/api/runtime-config', (route) =>
    route.fulfill({ json: { developerMode: false } }),
  )
  await page.route(`**/api/matches/${current.id}?*`, (route) => {
    view =
      new URL(route.request().url()).searchParams.get('view') === 'closed-eye'
        ? 'closed-eye'
        : 'god'
    return route.fulfill({ json: visible() })
  })
  await page.routeWebSocket('**/live?*', (socket) => {
    send = (message) => socket.send(JSON.stringify(message))
    view = new URL(socket.url()).searchParams.get('view') === 'closed-eye' ? 'closed-eye' : 'god'
    publish()
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw)) as { type: string; view?: { kind: string } }
      if (message.type === 'view.set' && message.view) {
        view = message.view.kind === 'closed-eye' ? 'closed-eye' : 'god'
        publish()
      }
    })
  })
  await page.goto(`/matches/${current.id}`)
  const player = page.locator('.aw-player-card[data-player-id="player-1"]')
  const shell = page.locator('.aw-match-shell')
  await expect(player).toHaveAttribute('data-activity', 'starting')
  await expect(page.locator('.aw-player-card')).toHaveCount(12)
  const materials = await player.evaluate((element) => {
    const style = getComputedStyle(element)
    return ['--aw-player-role-tag', '--aw-player-seat-ribbon', '--aw-player-landscape'].every(
      (name) => style.getPropertyValue(name).includes('url('),
    )
  })
  expect(materials).toBe(true)
  await page.waitForTimeout(1200)
  current = {
    ...current,
    status: 'running',
    seats: current.seats.map((seat, index) => ({
      ...seat,
      sessionStatus: index === 0 ? 'thinking' : 'ready',
    })),
  }
  publish()
  await expect(player).toHaveAttribute('data-activity', 'thinking')
  await page.waitForTimeout(1200)
  current = {
    ...current,
    seats: current.seats.map((seat) => ({ ...seat, sessionStatus: 'ready' })),
  }
  publish()
  await expect(page.locator('.aw-presence__signal')).toHaveAttribute('data-motion', 'waiting')
  await page.waitForTimeout(1000)
  current = { ...current, phaseId: 'phase-day-vote', phaseLabel: '放逐投票' }
  publish()
  await expect(page.locator('.aw-presence__signal')).toHaveAttribute('data-motion', 'voting')
  await page.waitForTimeout(1000)
  current = {
    ...current,
    phaseId: 'phase-day-speech',
    phaseLabel: '白天发言',
    seats: current.seats.map((seat, index) => ({
      ...seat,
      sessionStatus: index === 0 ? 'syncing' : 'ready',
    })),
  }
  publish()
  await expect(page.locator('.aw-presence__signal')).toHaveAttribute('data-motion', 'reconnecting')
  await page.waitForTimeout(1000)
  current = {
    ...current,
    activeSpeech: {
      speechId: 9000 as never,
      playerId: current.seats[0]!.playerId,
      text: '我先把发言和票型放在一起看。',
      final: false,
    },
    seats: current.seats.map((seat) => ({ ...seat, sessionStatus: 'ready' })),
  }
  publish()
  await expect(player).toHaveAttribute('data-activity', 'speaking')
  const voice = player.locator('.aw-player-card__activity .aw-ink-activity__voice > path').first()
  const before = await voice.evaluate(
    (element) => element.getAnimations()[0]?.currentTime as number,
  )
  await page.waitForTimeout(700)
  current = {
    ...current,
    activeSpeech: {
      ...current.activeSpeech!,
      text: current.activeSpeech!.text + '\n听完这一轮，再决定今天的选择。',
    },
  }
  publish()
  await expect(page.locator('.aw-speech-bubble[data-live="true"] p')).toContainText('听完这一轮')
  expect(
    await voice.evaluate((element) => element.getAnimations()[0]?.currentTime as number),
  ).toBeGreaterThan(before)
  await page.screenshot({ path: testInfo.outputPath('streaming-card.png') })

  for (const definition of Object.values(roleEffectCatalog)) {
    const source =
      current.seats.find((seat) => seat.roleId === definition.roleId) ?? current.seats[1]!
    const sequence = current.lastSequence + 1
    const targets =
      definition.id === 'idiot-reveal'
        ? [source.playerId]
        : definition.id === 'cupid-link'
          ? [current.seats[4]!.playerId, current.seats[7]!.playerId]
          : definition.id === 'awakened-hidden-wolf-double-attack'
            ? [current.seats[4]!.playerId, current.seats[11]!.playerId]
            : definition.id === 'thief-choose-card'
              ? []
              : [current.seats[11]!.playerId]
    const variant =
      definition.id === 'seer-inspect'
        ? 'village'
        : definition.id === 'thief-choose-card'
          ? 'role-seer'
          : definition.family === 'inspect'
            ? 'role-villager'
            : null
    const cue: RoleEffectCue = {
      cueId: `${sequence}:${definition.id}`,
      sequence,
      effectId: definition.id,
      roleId: definition.roleId,
      abilityId: definition.abilityId,
      sourcePlayerIds: [source.playerId],
      targetPlayerIds: targets,
      variant,
      tier: definition.tier,
      occurredAt: '2026-09-07T00:00:00.000Z',
    }
    current = { ...current, lastSequence: sequence, effectCues: [...current.effectCues, cue] }
    publish()
    const overlay = page.locator('.aw-role-effect-overlay')
    await expect(overlay).toHaveAttribute('data-effect', definition.id)
    await expect(overlay).toHaveAttribute('data-duration', String(definition.durationMs))
    if (definition.id === 'seer-inspect')
      await expect(page.locator('.aw-role-effect-caption__outcome')).toHaveText('好人阵营')
    if (definition.id === 'thief-choose-card')
      await expect(page.locator('.aw-role-effect-caption__outcome')).toHaveText('预言家')
    if (definition.id === 'cupid-linked-death')
      await expect(overlay).toHaveAttribute('data-variant', 'break')
    await page.waitForTimeout(800)
    await page.screenshot({ path: testInfo.outputPath(`${definition.id}.png`) })
    current = {
      ...current,
      activeSpeech: { ...current.activeSpeech!, text: current.activeSpeech!.text + ' ' },
    }
    publish()
    await page.waitForTimeout(1250)
    await expect(overlay).toHaveAttribute('data-effect', definition.id)
    await expect(overlay).toHaveCount(0, { timeout: 2500 })
  }
  current = {
    ...current,
    activeSpeech: {
      ...current.activeSpeech!,
      playerId: current.seats[6]!.playerId,
      text: '我来补充一下这一轮的判断。',
    },
  }
  publish()
  await expect(player).toHaveAttribute('data-activity', 'ready')
  await expect(page.locator('.aw-player-card[data-player-id="player-7"]')).toHaveAttribute(
    'data-activity',
    'speaking',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: testInfo.outputPath('mobile-speaking.png') })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(shell).toHaveAttribute('data-motion-mode', 'reduced')
  await expect(
    page
      .locator('.aw-player-card[data-player-id="player-7"] .aw-ink-activity__voice > path')
      .first(),
  ).toHaveCSS('animation-name', 'none')
  const sequence = current.lastSequence + 1
  current = {
    ...current,
    lastSequence: sequence,
    effectCues: [
      ...current.effectCues,
      { ...current.effectCues[0]!, cueId: `${sequence}:werewolf-attack`, sequence },
    ],
  }
  publish()
  await expect(page.locator('.aw-role-effect-overlay')).toHaveAttribute('data-mode', 'reduced')
  await page.waitForTimeout(900)
  await page.screenshot({ path: testInfo.outputPath('reduced-effect.png') })
  await page.getByRole('button', { name: '闭眼视角', exact: true }).click()
  await expect(page.locator('.aw-role-effect-overlay')).toHaveCount(0)
  await expect(page.locator('.aw-player-card[data-role-art="hidden"]')).toHaveCount(12)
  await page.getByRole('button', { name: '上帝视角', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  current = {
    ...postgameMatchFixture(current, current.id, 'countdown'),
    winningPlayerIds: [current.seats[11]!.playerId],
  }
  publish()
  await expect(page.locator('.aw-postgame-outcome-seal')).toBeVisible()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: testInfo.outputPath('outcome.png') })
})
