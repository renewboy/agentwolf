type Point = readonly [number, number]
type Polygon = readonly Point[]

export interface PortraitTrack {
  readonly keys: readonly Point[]
}

export interface PortraitGesture extends PortraitTrack {
  readonly name: string
  readonly polygon: Polygon
  readonly feather: number
  readonly pivot: Point
  readonly translation: Point
  readonly rotation: number
}

export interface PortraitActing {
  readonly firstCue: number
  readonly cueInterval: number
  readonly cueDuration: number
  readonly blink: {
    readonly first: number
    readonly intervals: readonly number[]
    readonly duration: number
    readonly hold: number
  }
  readonly gestures: readonly PortraitGesture[]
  readonly squint?: PortraitTrack & { readonly amount: Point }
  readonly reflection?: PortraitTrack & {
    readonly polygons: readonly Polygon[]
    readonly color: string
    readonly opacity: number
    readonly width: number
    readonly slant: number
  }
}

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
  readonly acting?: PortraitActing
}
