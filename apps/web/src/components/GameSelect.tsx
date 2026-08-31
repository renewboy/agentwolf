import { CaretDown, Check } from '@phosphor-icons/react'
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
  option: 'aw-game-select__option',
  empty: 'aw-game-select__empty',
} as const

export function GameSelect<Value extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
  placeholder,
}: {
  readonly ariaLabel: string
  readonly value: Value | ''
  readonly options: readonly GameSelectOption<Value>[]
  readonly onChange: (value: Value) => void
  readonly disabled?: boolean
  readonly placeholder?: string
}) {
  return (
    <Select
      ariaLabel={ariaLabel}
      classNames={classNames}
      disabled={disabled}
      emptyLabel={getCopy('common.noOptions')}
      options={options}
      placeholder={placeholder ?? getCopy('common.none')}
      positionVariables={positionVariables}
      selectedIndicator={<Check size={17} weight="bold" aria-hidden />}
      triggerIndicator={<CaretDown size={17} aria-hidden />}
      value={value}
      onChange={onChange}
    />
  )
}
