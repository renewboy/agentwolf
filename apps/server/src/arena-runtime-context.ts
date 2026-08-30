import { AgentWolfGameModule } from '@agentwolf/game-engine'
import type { MatchRuntimeOptions } from './match-runtime-types.js'
import { AgentWolfSessionBindingStore } from './arena-session-store.js'

export class AgentWolfArenaRuntimeContext {
  public readonly module: AgentWolfGameModule
  public readonly sessions: AgentWolfSessionBindingStore

  public constructor(options: MatchRuntimeOptions) {
    this.module = new AgentWolfGameModule(options.board, options.ruleset)
    this.sessions = new AgentWolfSessionBindingStore(options.repository)
  }
}
