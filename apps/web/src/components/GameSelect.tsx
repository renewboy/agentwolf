import { GameIcon } from './GameIcon.js'
import { Select, type SelectOption } from '@agent-arena/react'
import { getCopy } from '@agentwolf/assets'

export type GameSelectOption<Value extends string> = SelectOption<Value>

const positionVariables = {
  left: '--aw-select-left',
  top: '--aw-select-top',
  width: '--aw-select-width',
  maxHeight: '--aw-select-max-height',
} as const

const classNames = {
  root: 'aw-game-select',
  trigger: 'aw-game-select__trigger',
  layer: 'aw-game-select-layer',
  listbox: 'aw-game-select__listbox',
  option: 'aw-game-select__option aw-choice',
  empty: 'aw-game-select__empty',
} as const

const classNamesByDensity = {
  comfortable: { ...classNames, root: 'aw-game-select aw-game-select--comfortable' },
  compact: { ...classNames, root: 'aw-game-select aw-game-select--compact' },
} as const

export function GameSelect<Value extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
  placeholder,
  density = 'comfortable',
}: {
  readonly ariaLabel: string
  readonly value: Value | ''
  readonly options: readonly GameSelectOption<Value>[]
  readonly onChange: (value: Value) => void
  readonly disabled?: boolean
  readonly placeholder?: string
  readonly density?: 'comfortable' | 'compact'
}) {
  return (
    <Select
      ariaLabel={ariaLabel}
      classNames={classNamesByDensity[density]}
      disabled={disabled}
      emptyLabel={getCopy('common.noOptions')}
      options={options}
      placeholder={placeholder ?? getCopy('common.none')}
      positionVariables={positionVariables}
      selectedIndicator={<GameIcon name="check" size={17} />}
      triggerIndicator={<GameIcon name="down" size={17} />}
      value={value}
      onChange={onChange}
    />
  )
}
