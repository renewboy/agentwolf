import type { CharacterCardSnapshot } from '@agentwolf/contracts'
import type { CharacterPerformance } from './character-performance-types.js'
import { portraitPerformance as gin } from './character-performances/gin.js'
import { portraitPerformance as edogawaConan } from './character-performances/edogawa-conan.js'
import { portraitPerformance as kudoShinichi } from './character-performances/kudo-shinichi.js'
import { portraitPerformance as mouriRan } from './character-performances/mouri-ran.js'
import { portraitPerformance as mouriKogoro } from './character-performances/mouri-kogoro.js'
import { portraitPerformance as haibaraAi } from './character-performances/haibara-ai.js'
import { portraitPerformance as agasaHiroshi } from './character-performances/agasa-hiroshi.js'
import { portraitPerformance as hattoriHeiji } from './character-performances/hattori-heiji.js'
import { portraitPerformance as toyamaKazuha } from './character-performances/toyama-kazuha.js'
import { portraitPerformance as kaitoKid } from './character-performances/kaito-kid.js'
import { portraitPerformance as akaiShuichi } from './character-performances/akai-shuichi.js'
import { portraitPerformance as amuroToru } from './character-performances/amuro-toru.js'
export type {
  CharacterPerformance,
  PortraitEye,
  PortraitMotionRegion,
} from './character-performance-types.js'

const performances: ReadonlyMap<string, CharacterPerformance> = new Map(
  [
    gin,
    edogawaConan,
    kudoShinichi,
    mouriRan,
    mouriKogoro,
    haibaraAi,
    agasaHiroshi,
    hattoriHeiji,
    toyamaKazuha,
    kaitoKid,
    akaiShuichi,
    amuroToru,
  ].map((rig) => [`character-${rig.id}`, rig]),
)

export function characterPerformance(
  character: Pick<CharacterCardSnapshot, 'id' | 'portraitAssetId'> | null | undefined,
): CharacterPerformance | null {
  if (!character) return null
  const rig = performances.get(character.id)
  return rig && character.portraitAssetId === `portrait-${rig.id}` ? rig : null
}
