import { describe, expect, it } from 'vitest'
import { builtInCharacterCards, characterPerformance } from '@agentwolf/assets'
import {
  PortraitActingState,
  samplePortraitTrack,
} from '../src/components/match/portrait-acting.js'
import { PortraitDeformation } from '../src/components/match/portrait-deformation.js'

const performances = builtInCharacterCards.map((card) => characterPerformance(card)!)
const get = (id: string) => performances.find((rig) => rig.id === id)!

describe('character-specific portrait acting', () => {
  it('plays a first gesture, settles exactly and waits for audible speech before a reprise', () => {
    const rig = get('kaito-kid'),
      acting = rig.acting!,
      state = new PortraitActingState(acting)
    state.step(0, 0)
    expect(state.cue).toBe(-1)
    state.step(acting.firstCue, 0)
    state.step(acting.firstCue + acting.cueDuration * 0.34, 0.15)
    expect(state.gestures[0]).toBeGreaterThan(0.8)
    expect(state.gestures[1]).toBeCloseTo(1)
    const next = acting.firstCue + acting.cueInterval + 1
    state.step(next, 0)
    expect(state.cue).toBe(-1)
    expect(state.gestures).toEqual([0, 0])
    state.step(next + 1, 0.1)
    expect(state.cue).toBe(0)
    const replay = new PortraitActingState(acting)
    replay.step(acting.firstCue, 0.1)
    expect(replay.cue).toBe(0)
  })

  it('gives each character a distinct blink cadence and keeps the reference blink intact', () => {
    const reference = new PortraitActingState(undefined)
    reference.step(3.185, 0)
    expect(reference.eyes[0]).toBeCloseTo(1)
    const ai = get('haibara-ai').acting!,
      conan = get('edogawa-conan').acting!
    const slow = new PortraitActingState(ai),
      fast = new PortraitActingState(conan)
    slow.step(ai.blink.first + ai.blink.duration * 0.5, 0)
    fast.step(conan.blink.first + conan.blink.duration + 0.02, 0)
    expect(slow.eyes[0]).toBeGreaterThan(0.8)
    expect(fast.eyes).toEqual([0, 0])
    const signatures = performances
      .filter((rig) => rig.acting)
      .map((rig) => JSON.stringify(rig.acting!.blink))
    expect(new Set(signatures).size).toBe(signatures.length)
    slow.step(10_000, 0)
    expect(slow.eyes.every(Number.isFinite)).toBe(true)
  })

  it('supports asymmetric scrutiny, bounded highlights and quiet settled tracks', () => {
    const acting = get('haibara-ai').acting!,
      state = new PortraitActingState(acting)
    state.step(acting.firstCue, 0.1)
    state.step(acting.firstCue + acting.cueDuration * 0.43, 0.1)
    expect(state.eyes[1]).toBeGreaterThan(state.eyes[0])
    const reflection = get('edogawa-conan').acting!.reflection!
    expect(samplePortraitTrack(reflection, -1)).toBe(0)
    expect(samplePortraitTrack(reflection, 0.5)).toBe(1)
    expect(samplePortraitTrack(reflection, 2)).toBe(0)
    expect(samplePortraitTrack({ keys: [] }, 2)).toBe(0)
  })

  for (const [id, a, b] of [
    ['hattori-heiji', [192, 320], [128, 1040]],
    ['amuro-toru', [448, 1056], [640, 1056]],
    ['kaito-kid', [320, 640], [336, 704]],
  ] as const) {
    it(`keeps ${id} grip and prop rigid throughout its gesture`, () => {
      const rig = get(id),
        mesh = new PortraitDeformation(rig)
      const at = ([x, y]: readonly [number, number]) => ((y / 16) * 65 + x / 16) * 4
      const first = at(a),
        second = at(b),
        original = Math.hypot(a[0] - b[0], a[1] - b[1])
      let travel = 0
      for (let frame = 0; frame < 160; frame++) {
        mesh.step(frame / 30, 1 / 30, 0.12)
        const v = mesh.vertices
        expect(Math.hypot(v[first]! - v[second]!, v[first + 1]! - v[second + 1]!)).toBeCloseTo(
          original,
          3,
        )
        travel = Math.max(travel, Math.hypot(v[first]! - a[0], v[first + 1]! - a[1]))
      }
      expect(travel).toBeGreaterThan(4)
    })
  }

  it('preserves texture coordinates and unfolded local triangles for every character', () => {
    for (const rig of performances) {
      const mesh = new PortraitDeformation(rig),
        original = mesh.vertices.slice()
      for (let frame = 0; frame < 180; frame++) {
        mesh.step(frame / 30, 1 / 30, 0.12)
        if (frame % 9) continue
        const v = mesh.vertices
        for (let i = 0; i < v.length; i += 4) {
          if (v[i + 2] !== original[i + 2] || v[i + 3] !== original[i + 3])
            throw new Error(`${rig.id}: UV changed`)
        }
        for (let i = 0; i < mesh.indices.length; i += 3) {
          const a = mesh.indices[i]! * 4,
            b = mesh.indices[i + 1]! * 4,
            c = mesh.indices[i + 2]! * 4
          const area =
            (v[b]! - v[a]!) * (v[c + 1]! - v[a + 1]!) - (v[b + 1]! - v[a + 1]!) * (v[c]! - v[a]!)
          if (!Number.isFinite(area) || area < 80 || area > 510)
            throw new Error(`${rig.id}: distorted triangle (${area})`)
        }
      }
    }
  })
})
