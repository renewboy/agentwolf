import { detachedPlayerWorkspace, noPlayerProviderState } from '../player-isolation.js'
import {
  definePlayerProvider,
  playerActionToolNames,
  playerKnowledgeToolNames,
} from '../player-provider-contracts.js'

export const claudePlayerProvider = definePlayerProvider({
  id: 'claude',
  selector: { type: 'kind', kind: 'claude' },
  workspace: detachedPlayerWorkspace(['.agents', '.claude']),
  state: noPlayerProviderState,
  session: {
    approvedToolNames: playerActionToolNames,
    mcpTransport: 'session',
    resume: 'advertised',
    permissions: 'declared',
    metadata: (playerContract) => ({
      claudeCode: {
        options: {
          settingSources: [],
          systemPrompt: playerContract,
          tools: [...playerKnowledgeToolNames],
          allowedTools: [...playerKnowledgeToolNames],
          skills: ['agentwolf-player', 'werewolf-strategy'],
          sandbox: {
            enabled: true,
            failIfUnavailable: true,
            autoAllowBashIfSandboxed: true,
            allowUnsandboxedCommands: false,
            network: {
              allowedDomains: [],
              deniedDomains: ['*'],
              strictAllowlist: true,
              allowUnixSockets: [],
              allowAllUnixSockets: false,
              allowLocalBinding: false,
            },
            filesystem: { denyWrite: ['/**'] },
          },
        },
      },
    }),
  },
  launch: (context) => context.launch,
})
