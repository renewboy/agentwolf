import { buildServer } from './app.js'
import { loadServerConfig } from './config.js'

const config = loadServerConfig()
const server = await buildServer({ config, logger: true })

const shutdown = async (): Promise<void> => {
  await server.close()
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())

await server.app.listen({ host: config.host, port: config.port })
