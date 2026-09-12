type Point = readonly [number, number]
type Polygon = readonly Point[]

export interface PortraitMotionRegion {
  readonly name: string
  readonly kind: 'hair' | 'cloth'
  readonly polygon: Polygon
  readonly fixedY: number
  readonly freeY: number
  readonly feather: number
  readonly amplitude: Point
  readonly frequency: number
  readonly phase: number
  readonly stiffness: number
  readonly damping: number
}

export interface PortraitEye {
  readonly center: Point
  readonly angle: number
  readonly polygons: readonly Polygon[]
  readonly skinSample: readonly [number, number, number, number]
  readonly lid: readonly [Point, Point, Point]
}

export interface CharacterPerformance {
  readonly id: string
  readonly width: number
  readonly height: number
  readonly mirrorOnRight: boolean
  readonly face: {
    readonly colors: {
      readonly eyelid: string
      readonly mouth: string
      readonly teeth: string
      readonly tongue: string
      readonly lip: string
    }
    readonly bounds: readonly [number, number, number, number]
    readonly eyes: readonly PortraitEye[]
    readonly mouth: {
      readonly center: Point
      readonly angle: number
      readonly polygon: Polygon
      readonly skinOffset: Point
      readonly halfWidth: number
      readonly opening: number
    }
  }
  readonly breathing: {
    readonly pivot: Point
    readonly startY: number
    readonly fullY: number
    readonly amplitude: Point
    readonly frequency: number
  }
  readonly pins: readonly Polygon[]
  readonly regions: readonly PortraitMotionRegion[]
}
