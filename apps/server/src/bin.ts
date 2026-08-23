import { buildServer } from './app.js'
import { loadServerConfig } from './config.js'

const config = loadServerConfig()
const server = await buildServer({ config, logger: true })
let shutdownPromise: Promise<void> | null = null

const shutdown = (): Promise<void> => {
  shutdownPromise ??= server.close()
  return shutdownPromise
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.once(signal, () => {
    void shutdown().catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
      process.exitCode = 1
    })
  })
}

await server.app.listen({ host: config.host, port: config.port })
