import {
  AbilityIdSchema,
  AgentProfileIdSchema,
  AgentProfileInputSchema,
  AgentProfileSchema,
  AgentToolIdSchema,
  AgentToolInputSchema,
  AgentToolSchema,
  MatchIdSchema,
  PlayerIdSchema,
} from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import { AgentCatalogService, agentConfiguration } from '../src/agent-catalog.js'
import { ActionMailbox } from '../src/action-mailbox.js'
import { SqliteRepository } from '../src/repository.js'

describe('Agent catalog and repository', () => {
  it('persists one global speech preference independently from Agent Profiles', () => {
    const repository = new SqliteRepository(':memory:')
    expect(repository.getGlobalSettings()).toEqual({ speechCharacterLimit: 300 })
    expect(repository.saveGlobalSettings({ speechCharacterLimit: 420 })).toEqual({
      speechCharacterLimit: 420,
    })
    expect(repository.getGlobalSettings()).toEqual({ speechCharacterLimit: 420 })
    repository.close()
  })

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
        reasoningEffort: 'high',
        promptTimeoutMs: 10_000,
        connection: { region: 'local' },
      }),
    )
    const secondProfile = catalog.createProfile(
      AgentProfileInputSchema.parse({
        name: 'Second player',
        toolId: tool.id,
        model: 'model-c',
        promptTimeoutMs: 15_000,
        connection: {},
      }),
    )
    expect(repository.getCustomTool(tool.id)?.id).toBe(tool.id)
    expect(repository.getCustomTool(AgentToolIdSchema.parse('tool-missing-direct'))).toBeNull()
    expect(() =>
      repository.saveCustomTool(
        AgentToolSchema.parse({
          ...tool,
          id: 'tool-built-in-direct',
          builtIn: true,
        }),
      ),
    ).toThrow(/read-only/)
    expect(repository.getCustomBoard('board-missing-direct' as never)).toBeNull()
    expect(() =>
      repository.reorderProfiles([AgentProfileIdSchema.parse('profile-missing-direct')]),
    ).toThrow(/Unknown Agent Profile/)
    repository.appendEvents([])
    expect(catalog.listTools().some((entry) => entry.id === tool.id)).toBe(true)
    expect(catalog.getProfile(profile.id)?.model).toBe('model-a')
    expect(catalog.getProfile(profile.id)?.reasoningEffort).toBe('high')
    expect(catalog.listProfiles().map((entry) => entry.id)).toEqual([profile.id, secondProfile.id])

    expect(
      catalog.reorderProfiles({ profileIds: [secondProfile.id, profile.id] }).map(({ id }) => id),
    ).toEqual([secondProfile.id, profile.id])
    expect(() => catalog.reorderProfiles({ profileIds: [secondProfile.id] })).toThrow(
      /every current profile/,
    )
    expect(() =>
      catalog.reorderProfiles({ profileIds: [secondProfile.id, secondProfile.id] }),
    ).toThrow(/duplicate IDs/)

    const updated = catalog.updateProfile(profile.id, {
      name: 'Updated player',
      toolId: tool.id,
      model: 'model-b',
      reasoningEffort: 'xhigh',
      promptTimeoutMs: 20_000,
      connection: {},
    })
    expect(updated.createdAt).toBe(profile.createdAt)
    expect(updated.model).toBe('model-b')
    expect(updated.reasoningEffort).toBe('xhigh')
    expect(catalog.listProfiles().map((entry) => entry.id)).toEqual([secondProfile.id, profile.id])
    expect(() => catalog.deleteTool(tool.id)).toThrow(/used/)
    catalog.deleteProfile(profile.id)
    catalog.deleteProfile(secondProfile.id)
    catalog.deleteTool(tool.id)
    expect(catalog.getTool(tool.id)).toBeNull()
    repository.close()
  })

  it('rejects missing and immutable catalog entries while exposing configuration summaries', () => {
    const repository = new SqliteRepository(':memory:')
    const catalog = new AgentCatalogService(repository)
    const input = AgentToolInputSchema.parse({
      name: 'Mutable tool',
      kind: 'custom',
      command: 'mutable-tool',
      args: [],
      environment: {},
      modelConfigKey: 'model',
    })
    const tool = catalog.createTool(input)
    expect(catalog.updateTool(tool.id, { ...input, name: 'Renamed tool' }).name).toBe(
      'Renamed tool',
    )
    expect(() => catalog.updateTool(AgentToolIdSchema.parse('tool-missing'), input)).toThrow(
      /Unknown Agent Tool/,
    )
    expect(() => catalog.updateTool(AgentToolIdSchema.parse('tool-trae-cli'), input)).toThrow(
      /read-only/,
    )
    expect(() => catalog.deleteTool(AgentToolIdSchema.parse('tool-missing'))).toThrow(
      /Unknown Agent Tool/,
    )
    expect(() => catalog.deleteTool(AgentToolIdSchema.parse('tool-trae-cli'))).toThrow(/read-only/)
    expect(
      catalog.getProfileConfiguration(AgentProfileIdSchema.parse('profile-missing')),
    ).toBeNull()
    expect(() =>
      catalog.createProfile({
        name: 'Missing tool profile',
        toolId: AgentToolIdSchema.parse('tool-missing'),
        model: 'model',
        promptTimeoutMs: 5_000,
        connection: {},
      }),
    ).toThrow(/Unknown Agent Tool/)
    expect(() =>
      catalog.updateProfile(AgentProfileIdSchema.parse('profile-missing'), {
        name: 'Missing profile',
        toolId: tool.id,
        model: 'model',
        promptTimeoutMs: 5_000,
        connection: {},
      }),
    ).toThrow(/Unknown Agent Profile/)
    expect(() => catalog.deleteProfile(AgentProfileIdSchema.parse('profile-missing'))).toThrow(
      /Unknown Agent Profile/,
    )

    const profile = AgentProfileSchema.parse({
      id: 'profile-configuration-summary',
      name: 'Configured profile',
      toolId: tool.id,
      model: 'model-a',
      promptTimeoutMs: 5_000,
      connection: {},
      createdAt: '2026-08-28T00:00:00.000Z',
      updatedAt: '2026-08-28T00:00:00.000Z',
    })
    repository.saveProfile(profile)
    expect(catalog.getProfileConfiguration(profile.id)).toEqual({
      name: 'Renamed tool',
      model: 'model-a',
      reasoningEffort: null,
    })
    expect(
      agentConfiguration(
        { ...profile, reasoningEffort: 'high' },
        AgentToolSchema.parse({
          ...input,
          id: 'tool-trae-summary',
          kind: 'trae-cli',
          builtIn: false,
        }),
      ),
    ).toEqual({ name: 'Trae', model: 'model-a', reasoningEffort: 'high' })
    catalog.deleteProfile(profile.id)
    catalog.deleteTool(tool.id)
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

    mailbox.expect({
      matchId,
      playerId,
      actionType: 'speech',
      speechKind: 'day',
      interruptAbilityIds: [AbilityIdSchema.parse('ability-werewolf-self-destruct')],
    })
    expect(() => mailbox.submitSkillTrigger(token, 'ability-detonate', null)).toThrow(/unavailable/)
    expect(mailbox.submitSkillTrigger(token, 'ability-werewolf-self-destruct', null).accepted).toBe(
      true,
    )
    expect(mailbox.take(matchId, playerId)).toMatchObject({
      type: 'skill-trigger',
      abilityId: 'ability-werewolf-self-destruct',
    })

    mailbox.expect({ matchId, playerId, actionType: 'speech', speechKind: 'day' })
    expect(() => mailbox.submitSpeech(token, '保持观察。')).toThrow(/直接将完整发言正文/)

    mailbox.expect({
      matchId,
      playerId,
      actionType: 'speech',
      speechKind: 'day',
      allowSpeechTool: true,
    })
    mailbox.submitSpeech(token, '保持观察。')
    expect(mailbox.take(matchId, playerId)?.type).toBe('speech')
    mailbox.revokeToken(token)
    expect(mailbox.binding(token)).toBeNull()
  })

  it('fails closed for incomplete mailbox expectations and revoked unknown tokens', () => {
    const mailbox = new ActionMailbox()
    const matchId = MatchIdSchema.parse('match-mailbox-errors')
    const playerId = PlayerIdSchema.parse('player-1')
    const token = mailbox.issueToken(matchId, playerId)
    mailbox.expect({ matchId, playerId, actionType: 'speech', allowSpeechTool: true })
    expect(() => mailbox.submitSpeech(token, 'missing kind')).toThrow(/Speech kind is missing/)
    mailbox.expect({ matchId, playerId, actionType: 'vote' })
    expect(() => mailbox.submitVote(token, null)).toThrow(/Vote kind is missing/)
    mailbox.clear(matchId, playerId)
    expect(() => mailbox.submitVote(token, null)).toThrow(/not waiting/)
    expect(() => mailbox.submitVote('invalid-token', null)).toThrow(/token is invalid/)
    mailbox.revokeToken('unknown-token')
  })
})
