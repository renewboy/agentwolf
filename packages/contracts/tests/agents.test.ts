import { describe, expect, it } from 'vitest'
import {
  AGENT_PROMPT_TIMEOUT_DEFAULT_MS,
  AgentProfileInputSchema,
  AgentProfileSchema,
} from '../src/agents.js'

describe('Agent Profile contracts', () => {
  it('defaults new Profiles to a ten-minute Prompt timeout', () => {
    expect(
      AgentProfileInputSchema.parse({
        name: 'Test Profile',
        toolId: 'tool-test',
        model: 'model-test',
        connection: {},
      }).promptTimeoutMs,
    ).toBe(AGENT_PROMPT_TIMEOUT_DEFAULT_MS)
    expect(
      AgentProfileSchema.parse({
        id: 'profile-test',
        name: 'Test Profile',
        toolId: 'tool-test',
        model: 'model-test',
        connection: {},
        createdAt: '2026-08-30T00:00:00.000Z',
        updatedAt: '2026-08-30T00:00:00.000Z',
      }).promptTimeoutMs,
    ).toBe(AGENT_PROMPT_TIMEOUT_DEFAULT_MS)
  })
})
