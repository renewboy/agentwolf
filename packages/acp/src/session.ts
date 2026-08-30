import { AcpSession, type AcpSessionStartOptions } from '@agent-arena/acp-runtime'

export type AcpPlayerSession = AcpSession

export const AcpPlayerSession = {
  start(options: AcpSessionStartOptions): Promise<AcpSession> {
    return AcpSession.start({
      ...options,
      clientInfo: options.clientInfo ?? { name: 'agentwolf', version: '0.1.0' },
      sessionLabel: options.sessionLabel ?? 'ACP player session',
    })
  },
}

export type { AcpPromptCallbacks, AcpPromptResult } from '@agent-arena/acp-runtime'
export type { AcpSessionStartOptions }
