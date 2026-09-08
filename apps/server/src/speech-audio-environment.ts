import { resolve } from 'node:path'

export function speechAudioEnvironment(
  projectRoot: string,
  dataDirectory: string,
  platform: NodeJS.Platform = process.platform,
  architecture = process.arch,
): {
  readonly root: string
  readonly python: string
  readonly requirements: string
  readonly marker: string
  readonly automaticTorch: boolean
} | null {
  const mac = platform === 'darwin' && architecture === 'arm64'
  const portable =
    (platform === 'linux' && (architecture === 'x64' || architecture === 'arm64')) ||
    (platform === 'win32' && architecture === 'x64')
  if (!mac && !portable) return null
  const profile = mac ? 'macos' : 'portable'
  const root = resolve(dataDirectory, 'tts-runtime', `.venv-qwen-${profile}`)
  return {
    root,
    python: resolve(root, platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    requirements: resolve(projectRoot, `scripts/tts/requirements-${profile}.txt`),
    marker: resolve(dataDirectory, 'tts-runtime', `dependencies-qwen-${profile}.sha256`),
    automaticTorch: portable,
  }
}
