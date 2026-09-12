import { writeFileSync } from 'node:fs'
import { builtInCharacterCards } from '../packages/assets/src/characters.js'
import { characterPerformance } from '../packages/assets/src/character-performances.js'
import { expect, test } from './fixtures/test.js'
import { renderPortrait } from './fixtures/portrait-render.js'
import { playbackBar, setup } from './fixtures/portrait.js'

for (const character of builtInCharacterCards) {
  test(`renders ${character.id} from one image with reversible expressions`, async ({
    page,
  }, info) => {
    test.setTimeout(45_000)
    await page.goto('/')
    const rig = characterPerformance(character)!
    expect(rig).toBeTruthy()
    const result = await page.evaluate(renderPortrait, rig)
    expect(result.sourceCount).toBe(1)
    expect([result.width, result.height]).toEqual([rig.width, rig.height])
    expect(result.blinkChanges).toBeGreaterThan(50)
    expect(result.mouthChanges).toBeGreaterThan(50)
    expect(result.restoredChanges).toBe(0)
    expect(result.movingPixels).toBeGreaterThan(100)
    for (const [name, png] of [
      ['face', result.face],
      ...result.captures.map((capture, i) => [`frame-${i}`, capture]),
    ])
      writeFileSync(
        info.outputPath(`${rig.id}-${name}.png`),
        Buffer.from(png!.split(',')[1]!, 'base64'),
      )
  })
}

for (const [side, id] of [
  ['left', 'character-edogawa-conan'],
  ['right', 'character-kaito-kid'],
] as const) {
  test(`plays ${id} on the ${side} using its own portrait`, async ({ page }, info) => {
    const match = await setup(page, side)
    const character = builtInCharacterCards.find((card) => card.id === id)!
    match.update({ ...match.view, seats: match.view.seats.map((seat) => ({ ...seat, character })) })
    match.publish()
    const stage = page.getByRole('region', { name: '角色播报' })
    await expect(stage).toBeVisible()
    await expect(stage).toHaveCSS('opacity', '1')
    await expect(stage.locator('.aw-speaking-portrait')).toHaveAttribute(
      'data-portrait',
      characterPerformance(character)!.id,
    )
    await expect(stage.locator('.aw-speaking-portrait')).toHaveAttribute('data-mirrored', 'false')
    await expect(stage.locator('canvas')).toHaveAttribute('data-ready', 'true')
    await page.screenshot({ path: info.outputPath(`${id}-${side}.png`) })
    await playbackBar(page).getByRole('button', { name: '跳过', exact: true }).click()
    await expect(stage).not.toBeVisible()
  })
}
