import { writeFileSync } from 'node:fs'
import { builtInCharacterCards } from '../packages/assets/src/characters.js'
import { characterPerformance } from '../packages/assets/src/character-performances.js'
import { expect, test } from './fixtures/test.js'

const focus: Readonly<Record<string, { signature: readonly number[]; cloth: readonly number[] }>> =
  {
    'edogawa-conan': { signature: [310, 400, 390, 215], cloth: [390, 860, 240, 325] },
    'kudo-shinichi': { signature: [680, 480, 265, 310], cloth: [350, 720, 170, 350] },
    'mouri-ran': { signature: [300, 300, 450, 540], cloth: [690, 760, 190, 330] },
    'mouri-kogoro': { signature: [300, 160, 300, 450], cloth: [670, 570, 230, 325] },
    'haibara-ai': { signature: [250, 400, 470, 360], cloth: [165, 890, 210, 275] },
    'agasa-hiroshi': { signature: [260, 640, 340, 285], cloth: [65, 880, 200, 320] },
    'hattori-heiji': { signature: [90, 180, 155, 760], cloth: [800, 770, 220, 320] },
    'toyama-kazuha': { signature: [350, 700, 210, 350], cloth: [590, 830, 160, 295] },
    'kaito-kid': { signature: [215, 570, 210, 410], cloth: [865, 815, 150, 360] },
    'akai-shuichi': { signature: [355, 260, 350, 350], cloth: [295, 800, 145, 380] },
    'amuro-toru': { signature: [365, 960, 450, 260], cloth: [780, 800, 185, 285] },
  }

for (const card of builtInCharacterCards.filter((entry) => entry.id !== 'character-gin')) {
  test(`${card.name} has visible character acting and independent cloth motion at 600px`, async ({
    page,
  }, info) => {
    await page.goto('/')
    const rig = characterPerformance(card)!
    const result = await page.evaluate(
      async ({ rig: definition, regions }) => {
        const meshPath = '/src/components/match/portrait-mesh.ts',
          imagePath = '/src/components/match/CharacterPortrait.tsx'
        const { PortraitMesh } = (await import(
          meshPath
        )) as typeof import('../apps/web/src/components/match/portrait-mesh.js')
        const { loadPortraitImages } = (await import(
          imagePath
        )) as typeof import('../apps/web/src/components/match/CharacterPortrait.js')
        const images = await loadPortraitImages(definition.id)
        const { acting, ...withoutActing } = definition
        const signatureOnly = {
          ...definition,
          breathing: { ...definition.breathing, amplitude: [0, 0] as const },
          regions: definition.regions.map((region) => ({ ...region, amplitude: [0, 0] as const })),
          acting: { ...acting!, blink: { ...acting!.blink, first: 100 } },
        }
        function surface() {
          const canvas = document.createElement('canvas')
          canvas.width = 400
          canvas.height = 600
          const gl = canvas.getContext('webgl', {
            alpha: true,
            premultipliedAlpha: true,
            antialias: false,
            depth: false,
            stencil: false,
          })!
          return { canvas, gl }
        }
        function pixels(gl: WebGLRenderingContext) {
          const bytes = new Uint8Array(400 * 600 * 4)
          gl.readPixels(0, 0, 400, 600, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
          return bytes
        }
        function changed(a: Uint8Array, b: Uint8Array, box: readonly number[]) {
          const [x, y, width, height] = box as [number, number, number, number],
            scale = 600 / 1536
          let count = 0,
            total = 0
          for (let row = Math.floor(y * scale); row < (y + height) * scale; row++)
            for (let col = Math.floor(x * scale); col < Math.min(400, (x + width) * scale); col++) {
              const offset = ((599 - row) * 400 + col) * 4
              if (a[offset + 3]! < 100 && b[offset + 3]! < 100) continue
              let difference = 0
              for (let channel = 0; channel < 3; channel++)
                difference += Math.abs(a[offset + channel]! - b[offset + channel]!)
              if (difference > 36) count++
              total++
            }
          return { count, fraction: count / Math.max(1, total) }
        }
        const first = surface(),
          motion = new PortraitMesh(first.canvas, signatureOnly, images)
        motion.draw(0, 1 / 30, 0)
        const rest = pixels(first.gl),
          peakFrame = Math.round((acting!.firstCue + acting!.cueDuration * 0.4) * 30)
        let peak = rest,
          peakImage = '',
          settled = rest
        for (
          let frame = 1;
          frame <= Math.ceil((acting!.firstCue + acting!.cueDuration + 0.2) * 30);
          frame++
        ) {
          motion.draw(frame / 30, 1 / 30, 0)
          if (frame === peakFrame) {
            peak = pixels(first.gl)
            peakImage = first.canvas.toDataURL()
          }
        }
        settled = pixels(first.gl)
        motion.dispose()
        const second = surface(),
          cloth = new PortraitMesh(second.canvas, withoutActing, images)
        let before = rest,
          after = rest
        for (let frame = 0; frame <= 80; frame++) {
          cloth.draw(frame / 30, 1 / 30, 0)
          if (frame === 30) before = pixels(second.gl)
          if (frame === 80) after = pixels(second.gl)
        }
        cloth.dispose()
        return {
          signature: changed(rest, peak, regions.signature),
          cloth: changed(before, after, regions.cloth),
          settled: settled.reduce((sum, value, i) => sum + Number(value !== rest[i]), 0),
          peakImage,
        }
      },
      { rig, regions: focus[rig.id]! },
    )
    expect(
      result.signature.count,
      'character feature changes visible pixels without mouth or cloth motion',
    ).toBeGreaterThan(80)
    expect(result.signature.fraction).toBeGreaterThan(0.025)
    expect(
      result.cloth.fraction,
      'cloth changes above the subtitle fade without any facial or signature animation',
    ).toBeGreaterThan(0.04)
    expect(result.settled, 'the signature returns to the exact original pose').toBe(0)
    writeFileSync(
      info.outputPath(`${rig.id}-signature.png`),
      Buffer.from(result.peakImage.split(',')[1]!, 'base64'),
    )
    await info.attach('visible-motion', {
      body: JSON.stringify(result, (key, value: unknown) =>
        key === 'peakImage' ? undefined : value,
      ),
      contentType: 'application/json',
    })
  })
}
