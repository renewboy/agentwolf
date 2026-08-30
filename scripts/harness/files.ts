import { resolve } from 'node:path'
import { discoverRepositoryFiles, readRepositoryText, repositoryPath } from '@agent-arena/harness'

export const projectRoot = resolve(import.meta.dirname, '..', '..')

const ignoredNames = new Set([
  '.agentwolf',
  '.git',
  'coverage',
  'dist',
  'dist-types',
  'node_modules',
])

export function sourceFiles(
  roots: readonly string[],
  extensions: ReadonlySet<string>,
  baseRoot = projectRoot,
): Promise<string[]> {
  return discoverRepositoryFiles({
    projectRoot: baseRoot,
    roots,
    extensions,
    ignoredNames,
  })
}

export function text(path: string): Promise<string> {
  return readRepositoryText(path)
}

export function localPath(path: string): string {
  return repositoryPath(projectRoot, path)
}

export function failIfErrors(errors: readonly string[], title: string): void {
  if (errors.length === 0) {
    process.stdout.write(`${title}: ok\n`)
    return
  }
  process.stderr.write(`${title} failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`)
  process.exitCode = 1
}
