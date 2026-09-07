import type { RoleEffectDefinition } from '@agentwolf/assets'
import { effectGlyph } from '../../motion/effect-art.js'
import { useId, useMemo } from 'react'

export function InkEffectGlyph({ family }: { readonly family: RoleEffectDefinition['family'] }) {
  const instance = useId().replaceAll(':', '')
  const markup = useMemo(
    () => ({ __html: effectGlyph(family).replaceAll('__INSTANCE__', instance) }),
    [family, instance],
  )
  return <span className="aw-role-effect-art" dangerouslySetInnerHTML={markup} />
}
