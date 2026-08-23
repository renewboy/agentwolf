import { readdir, readFile } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'

export const projectRoot = resolve(import.meta.dirname, '..', '..')

export async function sourceFiles(
  roots: readonly string[],
  extensions: ReadonlySet<string>,
): Promise<string[]> {
  const files: string[] = []
  for (const root of roots) await walk(resolve(projectRoot, root), files, extensions)
  return files.sort()
}

async function walk(path: string, files: string[], extensions: ReadonlySet<string>): Promise<void> {
  const entries = await readdir(path, { withFileTypes: true })
  for (const entry of entries) {
    if (
      entry.name === '.agentwolf' ||
      entry.name === '.git' ||
      entry.name === 'dist' ||
      entry.name === 'dist-types' ||
      entry.name === 'node_modules'
    )
      continue
    const child = resolve(path, entry.name)
    if (entry.isDirectory()) await walk(child, files, extensions)
    else if (extensions.has(extname(entry.name))) files.push(child)
  }
}

export async function text(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

export function localPath(path: string): string {
  return relative(projectRoot, path).replaceAll('\\', '/')
}

export function failIfErrors(errors: readonly string[], title: string): void {
  if (errors.length === 0) {
    process.stdout.write(`${title}: ok\n`)
    return
  }
  process.stderr.write(`${title} failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`)
  process.exitCode = 1
}
