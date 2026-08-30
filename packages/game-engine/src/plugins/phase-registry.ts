import {
  PhaseGraphRegistry as CorePhaseGraphRegistry,
  type PhaseInsertion as CorePhaseInsertion,
} from '@agent-arena/ruleset'
import type { PhaseId } from '@agentwolf/contracts'
import type { PhaseNode } from '../types.js'
import type { SemanticOwnershipRecorder } from './semantic-ownership.js'

export type PhaseInsertion = CorePhaseInsertion<PhaseId, PhaseNode>

export class PhaseGraphRegistry extends CorePhaseGraphRegistry<PhaseId, PhaseNode> {
  public constructor(ownership?: SemanticOwnershipRecorder) {
    super((phaseId) => ownership?.phase(phaseId))
  }
}
