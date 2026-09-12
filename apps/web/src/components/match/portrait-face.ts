import type { CharacterPerformance } from '@agentwolf/assets'
import { samplePortraitTrack } from './portrait-acting.js'

type Polygon = readonly (readonly [number, number])[]

function clipPolygons(ctx: CanvasRenderingContext2D, polygons: readonly Polygon[]): void {
  ctx.beginPath()
  for (const polygon of polygons) {
    polygon.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
  }
  ctx.clip()
}

/** Eye compression, sampled skin and procedural lips share the source image coordinates. */
export class PortraitFace {
  readonly canvas: HTMLCanvasElement
  readonly #ctx: CanvasRenderingContext2D
  readonly #skin: readonly HTMLCanvasElement[]

  public constructor(
    private readonly rig: CharacterPerformance,
    private readonly image: HTMLImageElement,
  ) {
    const [x, y, width, height] = rig.face.bounds
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    const context = this.canvas.getContext('2d')
    if (!context) throw new Error('Portrait face graphics unavailable')
    this.#ctx = context
    this.#skin = [
      ...rig.face.eyes.map((eye) => ({
        polygons: eye.polygons,
        sample: eye.skinSample,
        offset: null,
      })),
      { polygons: [rig.face.mouth.polygon], sample: null, offset: rig.face.mouth.skinOffset },
    ].map(({ polygons, offset, sample }) => {
      const patch = document.createElement('canvas')
      patch.width = width
      patch.height = height
      const ctx = patch.getContext('2d')!
      ctx.translate(-x, -y)
      clipPolygons(ctx, polygons)
      if (sample) {
        const points = polygons.flat(),
          left = Math.min(...points.map((p) => p[0])),
          top = Math.min(...points.map((p) => p[1])),
          right = Math.max(...points.map((p) => p[0])),
          bottom = Math.max(...points.map((p) => p[1]))
        ctx.drawImage(image, ...sample, left, top, right - left, bottom - top)
      } else ctx.drawImage(image, -offset![0], -offset![1])
      return patch
    })
    this.draw(0, 0)
  }

  public draw(blink: number | readonly [number, number], mouth: number, cue = -1): void {
    const ctx = this.#ctx,
      face = this.rig.face,
      [x, y, width, height] = face.bounds
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(this.image, -x, -y)
    ctx.translate(-x, -y)
    if (typeof blink !== 'number' || blink > 0.015) {
      face.eyes.forEach((eye, index) => {
        const closure = typeof blink === 'number' ? blink : blink[index]!
        if (closure <= 0.015) return
        ctx.drawImage(this.#skin[index]!, x, y)
        ctx.save()
        // Keep foreground hair and eyebrows outside the eye deformation.
        clipPolygons(ctx, eye.polygons)
        ctx.save()
        ctx.translate(...eye.center)
        ctx.rotate(eye.angle)
        ctx.scale(1, Math.max(0.025, 1 - closure))
        ctx.rotate(-eye.angle)
        ctx.translate(-eye.center[0], -eye.center[1])
        clipPolygons(ctx, eye.polygons)
        ctx.globalAlpha = Math.min(1, Math.max(0, (1 - closure) / 0.15))
        ctx.drawImage(this.image, 0, 0)
        ctx.restore()
        ctx.globalAlpha = Math.min(1, Math.max(0, (closure - 0.42) / 0.5))
        ctx.beginPath()
        ctx.moveTo(...eye.lid[0])
        ctx.quadraticCurveTo(...eye.lid[1], ...eye.lid[2])
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.strokeStyle = face.colors.eyelid
        ctx.stroke()
        ctx.restore()
      })
    }
    this.drawReflection(cue)
    if (mouth <= 0.012) return
    ctx.save()
    ctx.globalAlpha = Math.min(1, mouth * 18)
    ctx.drawImage(this.#skin.at(-1)!, x, y)
    const lips = face.mouth
    ctx.translate(...lips.center)
    ctx.rotate(lips.angle)
    const w = lips.halfWidth + mouth * 1.5,
      h = 0.5 + mouth * lips.opening
    const mouthPath = new Path2D()
    mouthPath.moveTo(-w, 0)
    mouthPath.bezierCurveTo(-w * 0.55, -1.2, w * 0.55, -1.1, w, 0)
    mouthPath.bezierCurveTo(w * 0.65, h * 1.15, -w * 0.55, h * 1.2, -w, 0)
    mouthPath.closePath()
    ctx.fillStyle = face.colors.mouth
    // oxlint-disable-next-line unicorn/no-array-fill-with-reference-type -- Canvas path filling.
    ctx.fill(mouthPath)
    ctx.save()
    ctx.clip(mouthPath)
    ctx.fillStyle = face.colors.teeth
    ctx.beginPath()
    ctx.moveTo(-w + 2, 0)
    ctx.lineTo(w - 2, 0)
    ctx.quadraticCurveTo(w * 0.45, 2.2, -w * 0.6, 1.8)
    ctx.closePath()
    ctx.fill()
    if (mouth > 0.28) {
      ctx.fillStyle = face.colors.tongue
      ctx.beginPath()
      ctx.ellipse(0, h * 0.94, w * 0.5, h * 0.23, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    ctx.strokeStyle = face.colors.lip
    ctx.lineWidth = 1.3
    ctx.stroke(mouthPath)
    ctx.restore()
  }

  private drawReflection(cue: number): void {
    const reflection = this.rig.acting?.reflection
    if (!reflection || cue < 0) return
    const strength = samplePortraitTrack(reflection, cue)
    if (strength <= 0) return
    const ctx = this.#ctx,
      points = reflection.polygons.flat()
    const left = Math.min(...points.map(([x]) => x)),
      right = Math.max(...points.map(([x]) => x))
    const top = Math.min(...points.map(([, y]) => y)),
      bottom = Math.max(...points.map(([, y]) => y))
    const center = left - reflection.width + cue * (right - left + reflection.width * 2)
    const gradient = ctx.createLinearGradient(
      center - reflection.width,
      top,
      center + reflection.width,
      top + reflection.slant,
    )
    gradient.addColorStop(0, 'transparent')
    gradient.addColorStop(0.42, reflection.color)
    gradient.addColorStop(0.58, reflection.color)
    gradient.addColorStop(1, 'transparent')
    ctx.save()
    clipPolygons(ctx, reflection.polygons)
    ctx.globalAlpha = strength * reflection.opacity
    ctx.fillStyle = gradient
    ctx.fillRect(left, top, right - left, bottom - top)
    ctx.restore()
  }
}
