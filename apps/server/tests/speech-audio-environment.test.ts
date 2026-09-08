import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { speechAudioEnvironment } from '../src/speech-audio-environment.js'

describe('speech Python platform environment', () => {
  it.each([
    ['darwin', 'arm64', 'macos', false, 'bin/python'],
    ['linux', 'x64', 'portable', true, 'bin/python'],
    ['linux', 'arm64', 'portable', true, 'bin/python'],
    ['win32', 'x64', 'portable', true, 'Scripts/python.exe'],
  ] as const)(
    'selects the packaged runtime for %s/%s',
    (platform, arch, profile, automaticTorch, executable) => {
      const result = speechAudioEnvironment('/project', '/data', platform, arch)!
      expect(result).toEqual({
        root: resolve('/data', `tts-runtime/.venv-qwen-${profile}`),
        python: resolve('/data', `tts-runtime/.venv-qwen-${profile}`, executable),
        requirements: resolve('/project', `scripts/tts/requirements-${profile}.txt`),
        marker: resolve('/data', `tts-runtime/dependencies-qwen-${profile}.sha256`),
        automaticTorch,
      })
    },
  )
  it.each([
    ['darwin', 'x64'],
    ['win32', 'arm64'],
    ['freebsd', 'x64'],
  ] as const)('rejects unsupported %s/%s', (platform, architecture) => {
    expect(speechAudioEnvironment('/project', '/data', platform, architecture)).toBeNull()
  })
})
