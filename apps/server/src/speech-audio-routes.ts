import type { FastifyInstance } from 'fastify'
import { getCopy } from '@agentwolf/assets'
import {
  MatchIdSchema,
  DEFAULT_SPEECH_CONTENT_TYPE,
  DEFAULT_SPEECH_VOICE,
  SPEECH_AUDIO_CONTENT_TYPE,
  SpeechAudioRequestSchema,
  SpeechAudioStatusSchema,
  type CharacterId,
  type MatchView,
  type SpeechAudioRequest,
  type SpeechAudioSource,
} from '@agentwolf/contracts'
import type { MatchManager } from './match-manager.js'
import { SpeechAudioUnavailableError, type SpeechAudioProvider } from './speech-audio-service.js'
import type { DefaultSpeechProvider } from './edge-speech-service.js'

export function registerSpeechAudioRoutes(
  app: FastifyInstance,
  matches: Pick<MatchManager, 'getMatch'>,
  audio: SpeechAudioProvider,
  defaultSpeech?: DefaultSpeechProvider,
): void {
  app.get('/api/speech-audio/status', async () => SpeechAudioStatusSchema.parse(audio.status()))
  app.post('/api/matches/:id/speech-audio', async (request, reply) => {
    const matchId = MatchIdSchema.parse((request.params as { id: string }).id)
    const input = SpeechAudioRequestSchema.parse(request.body)
    const view = matches.getMatch(matchId, input.view)
    const speech = visibleSpeech(view, input)
    if (!speech) {
      return reply
        .code(404)
        .send({ code: 'speech-audio-not-visible', message: getCopy('speechAudio.notVisible') })
    }
    if (!speech.text.includes(input.text)) {
      return reply
        .code(400)
        .send({ code: 'speech-audio-invalid-text', message: getCopy('speechAudio.invalidText') })
    }
    const status = audio.status()
    const reason = input.preferDefault
      ? ('browser' as const)
      : !speech.characterId || !audio.hasVoice(speech.characterId)
        ? ('no-voice' as const)
        : status.state === 'ready'
          ? null
          : status.state
    if (reason !== null && !defaultSpeech) {
      const code =
        reason === 'no-voice'
          ? 'tts-no-voice'
          : status.state === 'error' || status.state === 'disabled'
            ? 'tts-unavailable'
            : 'tts-not-ready'
      return reply
        .code(503)
        .send({ code, message: status.message ?? getCopy('speechAudio.notReady') })
    }
    const abort = new AbortController()
    const cancel = () => {
      if (!reply.raw.writableFinished) abort.abort()
    }
    request.raw.once('aborted', cancel)
    reply.raw.once('close', cancel)
    reply.raw.once('finish', () => {
      request.raw.off('aborted', cancel)
      reply.raw.off('close', cancel)
    })
    const modelInput = {
      matchId,
      speechId: input.speechId,
      characterId: speech.characterId!,
      text: input.text,
      signal: abort.signal,
    }
    try {
      let source: SpeechAudioSource = { provider: 'qwen3-tts-0.6b' }
      let stream
      if (reason !== null) {
        audio.start()
        source = { provider: 'edge-tts', voice: DEFAULT_SPEECH_VOICE, reason }
        stream = await defaultSpeech!.openAudio(modelInput)
      } else {
        try {
          stream = await audio.openAudio(modelInput)
        } catch (error) {
          if (!defaultSpeech || abort.signal.aborted) throw error
          audio.start()
          source = { provider: 'edge-tts', voice: DEFAULT_SPEECH_VOICE, reason: 'error' }
          stream = await defaultSpeech.openAudio(modelInput)
        }
      }
      return reply
        .type(
          source.provider === 'edge-tts' ? DEFAULT_SPEECH_CONTENT_TYPE : SPEECH_AUDIO_CONTENT_TYPE,
        )
        .header('X-AgentWolf-Speech-Source', JSON.stringify(source))
        .header('Cache-Control', 'private, no-store')
        .send(stream)
    } catch (error) {
      request.raw.off('aborted', cancel)
      reply.raw.off('close', cancel)
      if (error instanceof SpeechAudioUnavailableError || defaultSpeech) {
        return reply.code(503).send({
          code: defaultSpeech ? 'tts-default-unavailable' : 'tts-unavailable',
          message: getCopy(
            defaultSpeech ? 'speechAudio.defaultUnavailable' : 'speechAudio.unavailable',
          ),
        })
      }
      throw error
    }
  })
}

function visibleSpeech(
  view: MatchView,
  input: SpeechAudioRequest,
): {
  readonly text: string
  readonly characterId: CharacterId | null
} | null {
  const item = view.timeline.find(
    (entry) =>
      entry.kind === 'speech.committed' && (entry.speechId ?? entry.sequence) === input.speechId,
  )
  const active = view.activeSpeech?.speechId === input.speechId ? view.activeSpeech : null
  const playerId = item?.playerIds[0] ?? active?.playerId
  const text = item?.title ?? active?.text
  if (!playerId || text === undefined) return null
  const player = view.seats.find((entry) => entry.playerId === playerId)
  return { text, characterId: player?.character?.id ?? null }
}
