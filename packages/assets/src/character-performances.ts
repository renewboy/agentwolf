import type { CharacterCardSnapshot } from '@agentwolf/contracts'

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

const gin: CharacterPerformance = {
  id: 'gin',
  width: 1024,
  height: 1536,
  mirrorOnRight: true,
  face: {
    colors: {
      eyelid: '#514943',
      mouth: '#51413d',
      teeth: '#d3c5b2',
      tongue: '#8d655b',
      lip: '#564941',
    },
    bounds: [450, 308, 216, 174],
    eyes: [
      {
        center: [502, 336],
        angle: 0.2,
        skinSample: [479, 341, 47, 3],
        polygons: [
          [
            [482, 318],
            [500, 321],
            [517, 326],
            [527, 333],
            [529, 338],
            [511, 339],
            [489, 336],
            [474, 331],
            [476, 327],
          ],
        ],
        lid: [
          [476, 330],
          [503, 342],
          [530, 336],
        ],
      },
      {
        center: [630, 348],
        angle: -0.16,
        skinSample: [603, 355, 51, 3],
        polygons: [
          [
            [610, 336],
            [629, 333],
            [629, 349],
            [628, 354],
            [612, 352],
            [601, 348],
            [601, 344],
          ],
          [
            [637, 333],
            [650, 330],
            [657, 332],
            [654, 341],
            [645, 349],
            [635, 354],
          ],
        ],
        lid: [
          [602, 345],
          [629, 358],
          [655, 339],
        ],
      },
    ],
    mouth: {
      center: [552, 447],
      angle: 0.065,
      halfWidth: 33,
      opening: 15,
      polygon: [
        [516, 440],
        [536, 437],
        [560, 438],
        [582, 443],
        [591, 448],
        [591, 454],
        [572, 455],
        [548, 454],
        [527, 451],
        [516, 448],
      ],
      skinOffset: [0, -11],
    },
  },
  breathing: {
    pivot: [540, 1470],
    startY: 535,
    fullY: 720,
    amplitude: [0.0018, 0.004],
    frequency: 1.35,
  },
  pins: [
    [
      [225, 0],
      [852, 0],
      [852, 312],
      [684, 332],
      [674, 422],
      [620, 503],
      [571, 543],
      [488, 525],
      [417, 427],
      [407, 328],
      [225, 284],
    ],
    [
      [616, 1040],
      [722, 1045],
      [782, 1082],
      [808, 1148],
      [839, 1160],
      [835, 1259],
      [752, 1269],
      [622, 1233],
      [589, 1188],
      [592, 1096],
    ],
  ],
  regions: [
    {
      name: 'hair-back',
      kind: 'hair',
      polygon: [
        [339, 278],
        [441, 310],
        [398, 347],
        [351, 482],
        [292, 555],
        [172, 637],
        [137, 648],
        [234, 491],
        [302, 348],
      ],
      fixedY: 288,
      freeY: 615,
      feather: 18,
      amplitude: [9, 1.6],
      frequency: 1.7,
      phase: 0,
      stiffness: 37,
      damping: 8,
    },
    {
      name: 'hair-outer',
      kind: 'hair',
      polygon: [
        [61, 772],
        [102, 790],
        [75, 955],
        [51, 1045],
        [82, 1137],
        [57, 1174],
        [4, 1110],
        [0, 990],
      ],
      fixedY: 775,
      freeY: 1110,
      feather: 10,
      amplitude: [8, 1.4],
      frequency: 1.5,
      phase: -0.65,
      stiffness: 29,
      damping: 7.8,
    },
    {
      name: 'hair-front',
      kind: 'hair',
      polygon: [
        [662, 315],
        [710, 313],
        [731, 416],
        [727, 487],
        [688, 537],
        [633, 550],
        [669, 490],
        [681, 424],
      ],
      fixedY: 320,
      freeY: 518,
      feather: 12,
      amplitude: [-6.5, 1.2],
      frequency: 1.7,
      phase: 0.5,
      stiffness: 45,
      damping: 9,
    },
    {
      name: 'hair-lower',
      kind: 'hair',
      polygon: [
        [231, 1080],
        [280, 1116],
        [314, 1212],
        [352, 1313],
        [331, 1356],
        [298, 1330],
        [241, 1275],
      ],
      fixedY: 1080,
      freeY: 1335,
      feather: 12,
      amplitude: [7, 1],
      frequency: 1.5,
      phase: -0.9,
      stiffness: 32,
      damping: 8,
    },
    {
      name: 'shoulder-left',
      kind: 'cloth',
      polygon: [
        [67, 644],
        [292, 562],
        [347, 631],
        [322, 816],
        [223, 842],
        [59, 778],
      ],
      fixedY: 545,
      freeY: 685,
      feather: 28,
      amplitude: [-4, -4.2],
      frequency: 1.35,
      phase: 0,
      stiffness: 56,
      damping: 11,
    },
    {
      name: 'shoulder-right',
      kind: 'cloth',
      polygon: [
        [713, 600],
        [872, 650],
        [917, 730],
        [944, 864],
        [814, 909],
        [732, 755],
      ],
      fixedY: 605,
      freeY: 785,
      feather: 30,
      amplitude: [4.4, -4],
      frequency: 1.35,
      phase: 0,
      stiffness: 56,
      damping: 11,
    },
    {
      name: 'sleeve-left',
      kind: 'cloth',
      polygon: [
        [54, 701],
        [139, 647],
        [261, 771],
        [281, 1068],
        [244, 1293],
        [211, 1494],
        [112, 1428],
        [20, 1308],
        [42, 998],
      ],
      fixedY: 690,
      freeY: 1270,
      feather: 26,
      amplitude: [6, 1.8],
      frequency: 1.35,
      phase: -0.5,
      stiffness: 35,
      damping: 8.2,
    },
    {
      name: 'sleeve-right',
      kind: 'cloth',
      polygon: [
        [838, 735],
        [915, 759],
        [948, 992],
        [1024, 1184],
        [1024, 1283],
        [977, 1376],
        [785, 1370],
        [784, 1260],
        [836, 1182],
      ],
      fixedY: 740,
      freeY: 1240,
      feather: 26,
      amplitude: [5.4, 1.5],
      frequency: 1.35,
      phase: -0.75,
      stiffness: 32,
      damping: 7.8,
    },
    {
      name: 'lapel-left',
      kind: 'cloth',
      polygon: [
        [319, 449],
        [463, 470],
        [449, 620],
        [517, 666],
        [657, 1033],
        [581, 1005],
        [483, 928],
        [366, 731],
        [350, 591],
      ],
      fixedY: 530,
      freeY: 900,
      feather: 22,
      amplitude: [-3.8, -1.4],
      frequency: 1.35,
      phase: -0.22,
      stiffness: 53,
      damping: 10,
    },
    {
      name: 'lapel-right',
      kind: 'cloth',
      polygon: [
        [811, 498],
        [763, 609],
        [798, 711],
        [744, 1035],
        [690, 1121],
        [660, 1035],
        [688, 802],
        [679, 673],
      ],
      fixedY: 540,
      freeY: 960,
      feather: 18,
      amplitude: [3.4, -1.1],
      frequency: 1.35,
      phase: -0.4,
      stiffness: 51,
      damping: 10,
    },
    {
      name: 'scarf',
      kind: 'cloth',
      polygon: [
        [452, 542],
        [643, 550],
        [695, 701],
        [662, 981],
        [555, 880],
        [465, 695],
      ],
      fixedY: 560,
      freeY: 780,
      feather: 26,
      amplitude: [0.6, 3.2],
      frequency: 1.35,
      phase: -0.18,
      stiffness: 48,
      damping: 10,
    },
    {
      name: 'coat-lower',
      kind: 'cloth',
      polygon: [
        [330, 1170],
        [558, 1177],
        [803, 1271],
        [863, 1536],
        [211, 1536],
        [285, 1350],
      ],
      fixedY: 1140,
      freeY: 1480,
      feather: 32,
      amplitude: [5.8, 0.5],
      frequency: 1.35,
      phase: -1,
      stiffness: 26,
      damping: 6.4,
    },
  ],
}

export function characterPerformance(
  character: Pick<CharacterCardSnapshot, 'id' | 'portraitAssetId'> | null | undefined,
): CharacterPerformance | null {
  return character?.id === 'character-gin' && character.portraitAssetId === 'portrait-gin'
    ? gin
    : null
}
