import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyPlayerSkills } from '../../packages/assets/src/player-skills.js'

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const dataDirectory = resolve(
  process.env['AGENTWOLF_DATA_DIR'] ?? resolve(projectRoot, '.agentwolf'),
)
const outputRoot = await copyPlayerSkills({
  dataDirectory,
  sourceRoot: resolve(projectRoot, 'packages/assets/player-skills'),
})

process.stdout.write(`已复制玩家技能到 ${outputRoot}\n`)
