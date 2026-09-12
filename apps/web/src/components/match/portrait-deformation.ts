import type { CharacterPerformance } from '@agentwolf/assets'

type Polygon = readonly (readonly [number, number])[]

function smooth(value: number): number {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}

function distance(x: number, y: number, polygon: Polygon): number {
  let inside = false,
    nearest = Infinity
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[j]!,
      [bx, by] = polygon[i]!,
      dx = bx - ax,
      dy = by - ay
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
    nearest = Math.min(nearest, Math.hypot(x - ax - dx * t, y - ay - dy * t))
    if (ay > y !== by > y && x < (dx * (y - ay)) / dy + ax) inside = !inside
  }
  return inside ? nearest : -nearest
}

/** UVs and local triangle topology stay fixed; animation changes XY only. */
export class PortraitDeformation {
  readonly vertices: Float32Array
  readonly indices: Uint16Array
  readonly #weights: Float32Array
  readonly #breathing: Float32Array
  readonly #motion: Float32Array
  readonly #velocity: Float32Array
  #mouth = 0
  #energy = 0
  #startedAt: number | undefined
  #blink = 0

  public constructor(private readonly rig: CharacterPerformance) {
    const columns = 64,
      rows = 96,
      count = (columns + 1) * (rows + 1)
    this.vertices = new Float32Array(count * 4)
    this.indices = new Uint16Array(columns * rows * 6)
    this.#weights = new Float32Array(count * rig.regions.length)
    this.#breathing = new Float32Array(count)
    this.#motion = new Float32Array(rig.regions.length)
    this.#velocity = new Float32Array(rig.regions.length)
    for (let row = 0; row <= rows; row++)
      for (let column = 0; column <= columns; column++) {
        const index = row * (columns + 1) + column,
          x = (column / columns) * rig.width,
          y = (row / rows) * rig.height
        this.vertices.set([x, y, column / columns, row / rows], index * 4)
        // Feather outward from fixed areas so cloth stays tethered at the grip and collar.
        const unpinned = rig.pins.reduce(
          (weight, polygon) => Math.min(weight, smooth(-distance(x, y, polygon) / 32)),
          1,
        )
        const breath = rig.breathing
        this.#breathing[index] =
          unpinned * smooth((y - breath.startY) / (breath.fullY - breath.startY))
        rig.regions.forEach((region, part) => {
          const edge = smooth(distance(x, y, region.polygon) / region.feather)
          const anchor = smooth((y - region.fixedY) / (region.freeY - region.fixedY))
          this.#weights[index * rig.regions.length + part] = unpinned * edge * anchor
        })
        if (row < rows && column < columns) {
          const at = (row * columns + column) * 6,
            down = index + columns + 1
          this.indices.set([index, index + 1, down, index + 1, down + 1, down], at)
        }
      }
  }

  public get mouth(): number {
    return this.#mouth
  }
  public get blink(): number {
    return this.#blink
  }

  public step(time: number, delta: number, level: number): void {
    this.#startedAt ??= time
    const elapsed = time - this.#startedAt,
      dt = Math.max(0, Math.min(0.05, delta))
    const voice = Number.isFinite(level) ? Math.max(0, Math.min(1, (level - 0.008) * 5.2)) : 0
    this.#mouth += (voice - this.#mouth) * (1 - Math.exp(-dt * (voice > this.#mouth ? 22 : 15)))
    this.#energy += (voice - this.#energy) * (1 - Math.exp(-dt * 3.8))
    const rig = this.rig
    rig.regions.forEach((region, index) => {
      const phase = elapsed * region.frequency + region.phase
      const target =
        region.kind === 'hair'
          ? Math.sin(phase) * 0.72 + Math.sin(elapsed * 0.83 + region.phase + 0.4) * 0.28
          : Math.sin(phase) + this.#energy * Math.sin(elapsed * 2.7 + region.phase) * 0.18
      const steps = Math.max(1, Math.ceil(dt / 0.008)),
        substep = dt / steps
      for (let step = 0; step < steps; step++) {
        this.#velocity[index]! +=
          (region.stiffness * (target - this.#motion[index]!) -
            region.damping * this.#velocity[index]!) *
          substep
        this.#motion[index]! += this.#velocity[index]! * substep
      }
    })
    const breath = Math.sin(elapsed * rig.breathing.frequency)
    for (let index = 0; index < this.vertices.length / 4; index++) {
      const sourceX = this.vertices[index * 4 + 2]! * rig.width,
        sourceY = this.vertices[index * 4 + 3]! * rig.height,
        breathing = breath * this.#breathing[index]!
      let x = sourceX + (sourceX - rig.breathing.pivot[0]) * rig.breathing.amplitude[0] * breathing,
        y = sourceY + (sourceY - rig.breathing.pivot[1]) * rig.breathing.amplitude[1] * breathing
      rig.regions.forEach((region, part) => {
        const amount = this.#weights[index * rig.regions.length + part]! * this.#motion[part]!
        x += amount * region.amplitude[0]
        y += amount * region.amplitude[1]
      })
      this.vertices[index * 4] = x
      this.vertices[index * 4 + 1] = y
    }
    const cycle = (elapsed + 2.6) % 5.7
    this.#blink = cycle < 0.17 ? Math.sin((cycle / 0.17) * Math.PI) ** 0.7 : 0
  }
}
