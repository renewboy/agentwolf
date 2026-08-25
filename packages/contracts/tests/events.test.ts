import { describe, expect, it } from 'vitest'
import { GameEventPayloadSchema, coreGameEventTypes } from '../src/events.js'

describe('core event inventory', () => {
  it('enumerates every closed core event type for Prompt coverage', () => {
    const schemaTypes = GameEventPayloadSchema.options.map((option) => option.shape.type.value)
    expect(new Set(coreGameEventTypes)).toEqual(new Set(schemaTypes))
    expect(coreGameEventTypes).toHaveLength(schemaTypes.length)
  })
})
