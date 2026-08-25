import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { MatchId, PlayerId } from '@agentwolf/contracts'
import { loadPromptCore } from '@agentwolf/assets/prompts'

export async function preparePlayerWorkspace(
  dataDirectory: string,
  projectRoot: string,
  matchId: MatchId,
  playerId: PlayerId,
): Promise<string> {
  const workspace = resolve(dataDirectory, 'matches', matchId, 'players', playerId, 'workspace')
  const agentSkill = resolve(workspace, '.agents', 'skills', 'agentwolf-player')
  const claudeSkill = resolve(workspace, '.claude', 'skills', 'agentwolf-player')
  await Promise.all([
    mkdir(agentSkill, { recursive: true }),
    mkdir(claudeSkill, { recursive: true }),
  ])
  let contract: string
  try {
    contract = `${loadPromptCore({ root: resolve(projectRoot, 'packages/assets/prompts') }).playerContract()}\n`
  } catch (error) {
    throw new Error(`agentwolf-player Prompt assets are unavailable under ${projectRoot}`, {
      cause: error,
    })
  }
  await Promise.all([
    writeFile(resolve(agentSkill, 'SKILL.md'), contract, 'utf8'),
    writeFile(resolve(claudeSkill, 'SKILL.md'), contract, 'utf8'),
  ])
  return workspace
}
