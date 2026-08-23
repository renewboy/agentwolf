import {
  AgentProfileInputSchema,
  AgentToolInputSchema,
  MatchIdSchema,
  PlayerIdSchema,
} from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import { AgentCatalogService } from '../src/agent-catalog.js'
import { ActionMailbox } from '../src/action-mailbox.js'
import { SqliteRepository } from '../src/repository.js'

describe('Agent catalog and repository', () => {
  it('maintains custom tools and reusable Agent Profiles', () => {
    const repository = new SqliteRepository(':memory:')
    const catalog = new AgentCatalogService(repository)
    const tool = catalog.createTool(
      AgentToolInputSchema.parse({
        name: 'Custom ACP',
        kind: 'custom',
        command: 'custom-acp',
        args: ['serve'],
        environment: {},
        modelConfigKey: 'model',
      }),
    )
    const profile = catalog.createProfile(
      AgentProfileInputSchema.parse({
        name: 'Custom player',
        toolId: tool.id,
        model: 'model-a',
        promptTimeoutMs: 10_000,
        connection: { region: 'local' },
      }),
    )
    expect(catalog.listTools().some((entry) => entry.id === tool.id)).toBe(true)
    expect(catalog.getProfile(profile.id)?.model).toBe('model-a')

    const updated = catalog.updateProfile(profile.id, {
      name: 'Updated player',
      toolId: tool.id,
      model: 'model-b',
      promptTimeoutMs: 20_000,
      connection: {},
    })
    expect(updated.createdAt).toBe(profile.createdAt)
    expect(updated.model).toBe('model-b')
    expect(() => catalog.deleteTool(tool.id)).toThrow(/used/)
    catalog.deleteProfile(profile.id)
    catalog.deleteTool(tool.id)
    expect(catalog.getTool(tool.id)).toBeNull()
    repository.close()
  })

  it('keeps exactly one mailbox action per expectation', () => {
    const mailbox = new ActionMailbox()
    const matchId = MatchIdSchema.parse('match-mailbox-001')
    const playerId = PlayerIdSchema.parse('player-1')
    const token = mailbox.issueToken(matchId, playerId)
    const acceptedTargets: Array<string | null> = []
    mailbox.expect({
      matchId,
      playerId,
      actionType: 'vote',
      voteKind: 'exile',
      onAccepted: (action) => {
        if (action.type === 'vote') acceptedTargets.push(action.targetId)
      },
    })
    expect(mailbox.submitVote(token, 'player-2').accepted).toBe(true)
    expect(acceptedTargets).toEqual(['player-2'])
    expect(() => mailbox.submitVote(token, 'player-3')).toThrow(/already submitted/)
    expect(mailbox.take(matchId, playerId)).toMatchObject({
      type: 'vote',
      targetId: 'player-2',
    })
    expect(mailbox.take(matchId, playerId)).toBeNull()

    mailbox.expect({ matchId, playerId, actionType: 'speech', speechKind: 'day' })
    mailbox.submitSpeech(token, '保持观察。')
    expect(mailbox.take(matchId, playerId)?.type).toBe('speech')
    mailbox.revokeToken(token)
    expect(mailbox.binding(token)).toBeNull()
  })
})
