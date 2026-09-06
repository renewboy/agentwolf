import { useMemo } from 'react'
import { Select } from '@agent-arena/react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import { GameIcon } from './GameIcon.js'

const positionVariables = {
  left: '--aw-select-left',
  top: '--aw-select-top',
  width: '--aw-select-width',
  maxHeight: '--aw-select-max-height',
} as const

const classNames = {
  root: 'aw-game-select aw-day-navigator',
  trigger: 'aw-game-select__trigger aw-day-navigator__trigger',
  layer: 'aw-game-select-layer',
  listbox: 'aw-game-select__listbox aw-day-navigator__listbox',
  option: 'aw-choice aw-game-select__option aw-day-navigator__option',
  empty: 'aw-game-select__empty',
} as const

export function DayNavigator({
  days,
  day,
  disabled = false,
  onSelect,
}: {
  readonly days: readonly number[]
  readonly day: number
  readonly disabled?: boolean
  readonly onSelect?: ((day: number) => void) | undefined
}) {
  const options = useMemo(
    () => days.map((value) => ({ value: String(value), label: dayLabel(value) })),
    [days],
  )
  const unavailable = disabled || days.length === 0 || !onSelect
  return (
    <Select
      key={unavailable ? 'unavailable' : 'available'}
      ariaLabel={getCopy('dayNavigation.label')}
      classNames={classNames}
      disabled={unavailable}
      emptyLabel={getCopy('dayNavigation.unavailable')}
      options={options}
      placeholder={dayLabel(day)}
      positionVariables={positionVariables}
      selectedIndicator={<GameIcon name="check" size={18} />}
      triggerIndicator={<GameIcon name="down" size={18} />}
      value={String(day)}
      onChange={(value) => onSelect?.(Number(value))}
    />
  )
}

function dayLabel(day: number): string {
  return formatCopy(getCopy('match.day'), { day })
}
