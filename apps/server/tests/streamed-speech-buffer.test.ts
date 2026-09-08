import {
  GameEventSchema,
  MatchViewSchema,
  PlayerIdSchema,
  SpeechIdSchema,
  type GameEvent,
  type MatchView,
} from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import { StreamedSpeechBuffer } from '../src/streamed-speech-buffer.js'

const playerId = PlayerIdSchema.parse('player-1')
const speechId = SpeechIdSchema.parse(31)
const active = { playerId, speechId, text: '', final: false }

function projection(activeSpeech: MatchView['activeSpeech'] = active): MatchView {
  return MatchViewSchema.parse({
    id: 'match-streamed-buffer-test',
    boardId: 'board-quick-6',
    boardName: '语音投影测试',
    status: 'running',
    day: 1,
    phaseId: 'phase-day-speech',
    phaseLabel: '白天发言',
    lastSequence: 31,
    seats: [],
    timeline: [],
    activeSpeech,
    winner: null,
    pausedReason: null,
  })
}

function event(payload: GameEvent['payload']): GameEvent {
  return GameEventSchema.parse({
    matchId: 'match-streamed-buffer-test',
    sequence: 32,
    occurredAt: '2026-09-07T00:00:00.000Z',
    visibility: { kind: 'public' },
    payload,
  })
}

describe('StreamedSpeechBuffer', () => {
  it('does not add speech when no attempt or authorized active speech exists', () => {
    const buffer = new StreamedSpeechBuffer()
    const projected = projection()
    expect(buffer.project(projected)).toBe(projected)
    expect(buffer.begin(null, playerId)).toBeNull()
    expect(buffer.append(null, '没有发言尝试')).toBe(false)
    const attempt = buffer.begin(speechId, playerId)
    expect(buffer.append(attempt, '只属于已授权发言的内容')).toBe(true)
    const hidden = projection(null)
    expect(buffer.project(hidden)).toBe(hidden)
  })

  it('only augments a matching unfinished projection and leaves committed text authoritative', () => {
    const buffer = new StreamedSpeechBuffer()
    const attempt = buffer.begin(speechId, playerId)
    buffer.append(attempt, '第一句。')
    buffer.append(attempt, '第二句。')
    const projected = projection()
    expect(buffer.project(projected).activeSpeech?.text).toBe('第一句。第二句。')
    expect(projected.activeSpeech?.text).toBe('')
    for (const excluded of [
      projection({ ...active, speechId: SpeechIdSchema.parse(32) }),
      projection({ ...active, playerId: PlayerIdSchema.parse('player-2') }),
      projection({ ...active, final: true, text: '提交后的权威文本' }),
    ]) {
      expect(buffer.project(excluded)).toBe(excluded)
    }
  })

  it('isolates retries by attempt identity and ignores stale appends and cleanup', () => {
    const buffer = new StreamedSpeechBuffer()
    const previous = buffer.begin(speechId, playerId)
    buffer.append(previous, '上次尝试的内容')
    const current = buffer.begin(speechId, playerId)
    expect(buffer.project(projection()).activeSpeech?.text).toBe('')
    expect(buffer.append(previous, '迟到内容')).toBe(false)
    buffer.append(current, '重试中的内容')
    buffer.clear(previous)
    buffer.clear(null)
    expect(buffer.project(projection()).activeSpeech?.text).toBe('重试中的内容')
    buffer.clear(current)
    expect(buffer.append(current, '清理后的内容')).toBe(false)
    expect(buffer.project(projection()).activeSpeech?.text).toBe('')
  })

  it('clears on speech boundaries while retaining text across unrelated events', () => {
    const buffer = new StreamedSpeechBuffer()
    const attempt = buffer.begin(speechId, playerId)
    buffer.append(attempt, '尚未提交')
    buffer.clearOnBoundary([event({ type: 'speech.sanitized', playerId, replacements: 1 })])
    expect(buffer.project(projection()).activeSpeech?.text).toBe('尚未提交')
    buffer.clearOnBoundary([event({ type: 'speech.started', playerId, kind: 'day' })])
    expect(buffer.append(attempt, '旧发言')).toBe(false)
    const next = buffer.begin(speechId, playerId)
    buffer.append(next, '提交前')
    buffer.clearOnBoundary([
      event({ type: 'speech.committed', playerId, kind: 'day', text: '提交后', sanitized: true }),
    ])
    expect(buffer.append(next, '提交后的迟到内容')).toBe(false)
    expect(
      buffer.project(projection({ ...active, final: true, text: '提交后' })).activeSpeech?.text,
    ).toBe('提交后')
  })
})
