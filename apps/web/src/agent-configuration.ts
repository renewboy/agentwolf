import { formatCopy, getCopy } from '@agentwolf/assets'
import type { AgentConfigurationSummary } from '@agentwolf/contracts'

export function formatAgentConfiguration(agent: AgentConfigurationSummary | null): string {
  if (!agent) return getCopy('match.agentUnavailable')
  return formatCopy(getCopy('agentFields.agentSummary'), {
    agent: agent.name,
    model: agent.model,
    reasoning: agent.reasoningEffort ?? getCopy('agentFields.reasoningDefault'),
  })
}
