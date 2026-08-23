import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export interface ServerConfig {
  readonly host: string
  readonly port: number
  readonly dataDirectory: string
  readonly databasePath: string
  readonly publicBaseUrl: string
  readonly projectRoot: string
  readonly webDistPath: string
}

export function loadServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): ServerConfig {
  const host = environment['AGENTWOLF_HOST'] ?? '127.0.0.1'
  const port = Number(environment['AGENTWOLF_PORT'] ?? '4310')
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('AGENTWOLF_PORT must be an integer between 1 and 65535')
  }
  const projectRoot = resolve(
    environment['AGENTWOLF_PROJECT_ROOT'] ?? findProjectRoot(resolve(cwd)),
  )
  const dataDirectory = resolve(
    environment['AGENTWOLF_DATA_DIR'] ?? resolve(projectRoot, '.agentwolf'),
  )
  return {
    host,
    port,
    dataDirectory,
    databasePath:
      environment['AGENTWOLF_DATABASE_PATH'] ?? resolve(dataDirectory, 'agentwolf.sqlite'),
    publicBaseUrl: environment['AGENTWOLF_PUBLIC_BASE_URL'] ?? `http://${host}:${port}`,
    projectRoot,
    webDistPath: resolve(projectRoot, 'apps/web/dist'),
  }
}

function findProjectRoot(start: string): string {
  let current = start
  for (;;) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current
    const parent = dirname(current)
    if (parent === current) return start
    current = parent
  }
}
