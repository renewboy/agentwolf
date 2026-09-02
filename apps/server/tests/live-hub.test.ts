import {
  AgentProfileIdSchema,
  MatchIdSchema,
  PlayerIdSchema,
  SpeechIdSchema,
  type LiveMessage,
} from '@agentwolf/contracts'
import { GameEngine, standardBoard } from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'
import { LiveHub } from '../src/live-hub.js'

describe('LiveHub speech visibility', () => {
  it('broadcasts public speech and keeps wolf council private to gods and pack members', () => {
    const roles = standardBoard.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const engine = GameEngine.create({
      matchId: MatchIdSchema.parse('match-live-hub'),
      board: standardBoard,
      roleAssignment: 'manual',
      seed: 1,
      players: roles.map((roleId, index) => ({
        id: PlayerIdSchema.parse(`player-${index + 1}`),
        seat: index + 1,
        name: `Live player ${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-live-${index + 1}`),
        roleId,
      })),
    })
    const wolfIds = [...engine.state.players.values()]
      .filter((player) => player.faction === 'werewolf')
      .map((player) => player.id)
    const villageId = [...engine.state.players.values()].find(
      (player) => player.faction === 'village',
    )!.id
    const hub = new LiveHub()
    const received = new Map<string, LiveMessage[]>()
    const subscribe = (name: string, view: Parameters<typeof hub.subscribe>[0]['view']) => {
      const messages: LiveMessage[] = []
      received.set(name, messages)
      return hub.subscribe({ view, send: (message) => messages.push(message) })
    }
    subscribe('god', { kind: 'god' })
    subscribe('closed', { kind: 'closed-eye' })
    subscribe('wolf', { kind: 'player', playerId: wolfIds[1]! })
    subscribe('village', { kind: 'player', playerId: villageId })
    const unsubscribeMissing = subscribe('missing', {
      kind: 'player',
      playerId: PlayerIdSchema.parse('player-99'),
    })

    const speechId = SpeechIdSchema.parse(1)
    hub.broadcastSpeechChunk(engine.state, speechId, wolfIds[0]!, 'day', 'public')
    for (const messages of received.values()) expect(messages).toHaveLength(1)
    expect(received.get('god')?.[0]).toMatchObject({ type: 'speech-chunk', speechId })

    hub.broadcastSpeechChunk(engine.state, speechId, wolfIds[0]!, 'wolf-council', 'private')
    expect(received.get('god')).toHaveLength(2)
    expect(received.get('wolf')).toHaveLength(2)
    expect(received.get('closed')).toHaveLength(1)
    expect(received.get('village')).toHaveLength(1)
    expect(received.get('missing')).toHaveLength(1)

    unsubscribeMissing()
    hub.broadcastSpeechChunk(
      engine.state,
      speechId,
      PlayerIdSchema.parse('player-99'),
      'wolf-council',
      'unknown actor',
    )
    expect(received.get('missing')).toHaveLength(1)
    expect(received.get('god')).toHaveLength(3)
  })
})
