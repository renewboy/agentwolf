import { z } from 'zod'
import { SpectatorViewSchema } from './game.js'
import { SpeechIdSchema } from './ids.js'

export const SPEECH_AUDIO_CONTENT_TYPE = 'audio/L16;rate=24000;channels=1'
export const DEFAULT_SPEECH_CONTENT_TYPE = 'audio/mpeg'
export const DEFAULT_SPEECH_VOICE = 'zh-CN-YunxiNeural'

export const SpeechAudioSourceSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('qwen3-tts-0.6b') }),
  z.object({
    provider: z.literal('edge-tts'),
    voice: z.literal(DEFAULT_SPEECH_VOICE),
    reason: z.enum(['preparing', 'loading', 'error', 'disabled', 'no-voice', 'browser']),
  }),
])
export type SpeechAudioSource = z.infer<typeof SpeechAudioSourceSchema>

export const SpeechAudioRequestSchema = z
  .object({
    speechId: SpeechIdSchema,
    view: SpectatorViewSchema,
    text: z.string().trim().min(1).max(2_000),
    preferDefault: z.boolean().optional(),
  })
  .strict()
export type SpeechAudioRequest = z.infer<typeof SpeechAudioRequestSchema>

export const SpeechAudioErrorSchema = z.object({
  code: z.enum([
    'tts-not-ready',
    'tts-unavailable',
    'tts-no-voice',
    'tts-default-unavailable',
    'speech-audio-not-visible',
    'speech-audio-invalid-text',
  ]),
  message: z.string(),
})
export type SpeechAudioError = z.infer<typeof SpeechAudioErrorSchema>

export const SpeechAudioBackendSchema = z.object({
  id: z.enum(['macos', 'cuda', 'rocm', 'xpu', 'cpu']),
  device: z.enum(['metal', 'cuda', 'xpu', 'cpu']),
  engine: z.enum(['mlx-audio', 'faster-qwen3-tts', 'qwen-tts']),
  precision: z.enum(['float32', 'float16', 'bfloat16']),
  codecPrecision: z.enum(['float32', 'float16', 'bfloat16']),
  streaming: z.boolean(),
  optimization: z.enum(['mlx', 'cuda-graphs', 'sdpa']),
})
export type SpeechAudioBackend = z.infer<typeof SpeechAudioBackendSchema>

export const SpeechAudioStatusSchema = z.object({
  state: z.enum(['disabled', 'preparing', 'loading', 'ready', 'error']),
  model: z.literal('qwen3-tts-0.6b'),
  message: z.string().nullable(),
  voices: z.number().int().nonnegative(),
  backend: SpeechAudioBackendSchema.optional(),
})
export type SpeechAudioStatus = z.infer<typeof SpeechAudioStatusSchema>
