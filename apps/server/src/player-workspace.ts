import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { MatchId, PlayerId } from '@agentwolf/contracts'

export async function preparePlayerWorkspace(
  dataDirectory: string,
  projectRoot: string,
  matchId: MatchId,
  playerId: PlayerId,
): Promise<string> {
  const workspace = resolve(dataDirectory, 'matches', matchId, 'players', playerId, 'workspace')
  const sourceSkill = resolve(projectRoot, '.agents', 'skills', 'agentwolf-player')
  const agentSkill = resolve(workspace, '.agents', 'skills', 'agentwolf-player')
  const claudeSkill = resolve(workspace, '.claude', 'skills', 'agentwolf-player')
  await mkdir(workspace, { recursive: true })
  await cp(sourceSkill, agentSkill, { recursive: true, force: true })
  await cp(sourceSkill, claudeSkill, { recursive: true, force: true })
  return workspace
}
