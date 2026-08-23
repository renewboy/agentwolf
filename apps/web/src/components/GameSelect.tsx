import { CaretDown, Check } from '@phosphor-icons/react'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getCopy } from '@agentwolf/assets'

export interface GameSelectOption<Value extends string> {
  readonly value: Value
  readonly label: string
  readonly disabled?: boolean
}

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
  const listboxId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listboxRef = useRef<HTMLDivElement>(null)
  const typeaheadRef = useRef('')
  const typeaheadTimerRef = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const selectedIndex = options.findIndex((option) => option.value === value)
  const [activeIndex, setActiveIndex] = useState(Math.max(0, selectedIndex))
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined
  const enabledIndexes = useMemo(
    () => options.flatMap((option, index) => (option.disabled ? [] : [index])),
    [options],
  )

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  const moveActive = (direction: 1 | -1): void => {
    if (enabledIndexes.length === 0) return
    const currentPosition = enabledIndexes.indexOf(activeIndex)
    const start = currentPosition >= 0 ? currentPosition : direction > 0 ? -1 : 0
    const nextPosition = (start + direction + enabledIndexes.length) % enabledIndexes.length
    setActiveIndex(enabledIndexes[nextPosition]!)
  }

  const selectIndex = (index: number): void => {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(option.value)
    close()
  }

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const listbox = listboxRef.current
    if (!trigger || !listbox) return
    const rect = trigger.getBoundingClientRect()
    const viewportPadding = 12
    const gap = 7
    const maxHeight = Math.min(360, window.innerHeight - viewportPadding * 2)
    const expectedHeight = Math.min(maxHeight, Math.max(72, options.length * 44 + 12))
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding
    const openBelow = availableBelow >= Math.min(expectedHeight, 220)
    const width = Math.min(Math.max(rect.width, 220), window.innerWidth - viewportPadding * 2)
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      window.innerWidth - width - viewportPadding,
    )
    const top = openBelow
      ? Math.min(rect.bottom + gap, window.innerHeight - expectedHeight - viewportPadding)
      : Math.max(viewportPadding, rect.top - expectedHeight - gap)
    listbox.style.setProperty('--aw-select-left', `${left}px`)
    listbox.style.setProperty('--aw-select-top', `${top}px`)
    listbox.style.setProperty('--aw-select-width', `${width}px`)
    listbox.style.setProperty('--aw-select-max-height', `${maxHeight}px`)
  }, [options.length])

  useLayoutEffect(() => {
    if (!open) return undefined
    const nextIndex = selectedIndex >= 0 ? selectedIndex : (enabledIndexes[0] ?? 0)
    setActiveIndex(nextIndex)
    updatePosition()
    const frame = window.requestAnimationFrame(() => {
      updatePosition()
      listboxRef.current?.focus()
      listboxRef.current
        ?.querySelector<HTMLElement>(`[data-option-index="${nextIndex}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    })
    const onLayoutChange = (): void => updatePosition()
    window.addEventListener('resize', onLayoutChange)
    document.addEventListener('scroll', onLayoutChange, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', onLayoutChange)
      document.removeEventListener('scroll', onLayoutChange, true)
    }
  }, [enabledIndexes, open, selectedIndex, updatePosition])

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (triggerRef.current?.contains(target) || listboxRef.current?.contains(target)) return
      close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [close, open])

  useEffect(() => {
    if (!open) return
    listboxRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  useEffect(
    () => () => {
      if (typeaheadTimerRef.current !== null) window.clearTimeout(typeaheadTimerRef.current)
    },
    [],
  )

  const handleTypeahead = (key: string): void => {
    if (key.length !== 1 || key.trim().length === 0) return
    typeaheadRef.current += key.toLocaleLowerCase()
    if (typeaheadTimerRef.current !== null) window.clearTimeout(typeaheadTimerRef.current)
    typeaheadTimerRef.current = window.setTimeout(() => {
      typeaheadRef.current = ''
    }, 650)
    const query = typeaheadRef.current
    const match = options.findIndex(
      (option) => !option.disabled && option.label.toLocaleLowerCase().includes(query),
    )
    if (match >= 0) setActiveIndex(match)
  }

  return (
    <div className="aw-game-select" data-disabled={disabled} data-open={open}>
      <button
        ref={triggerRef}
        className="aw-game-select__trigger"
        aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        data-value={value}
        disabled={disabled}
        role="combobox"
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) setOpen(true)
            else moveActive(event.key === 'ArrowDown' ? 1 : -1)
          } else if (event.key === 'Home' && open) {
            event.preventDefault()
            setActiveIndex(enabledIndexes[0] ?? 0)
          } else if (event.key === 'End' && open) {
            event.preventDefault()
            setActiveIndex(enabledIndexes.at(-1) ?? 0)
          } else if (event.key === 'Escape' && open) {
            event.preventDefault()
            close()
          } else {
            handleTypeahead(event.key)
          }
        }}
      >
        <span data-placeholder={!selected}>
          {selected?.label ?? placeholder ?? getCopy('common.none')}
        </span>
        <CaretDown size={17} aria-hidden />
      </button>
      {open
        ? createPortal(
            <div className="aw-game-select-layer">
              <div
                ref={listboxRef}
                className="aw-game-select__listbox"
                id={listboxId}
                aria-label={ariaLabel}
                aria-activedescendant={`${listboxId}-option-${activeIndex}`}
                role="listbox"
                tabIndex={-1}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault()
                    moveActive(event.key === 'ArrowDown' ? 1 : -1)
                  } else if (event.key === 'Home') {
                    event.preventDefault()
                    setActiveIndex(enabledIndexes[0] ?? 0)
                  } else if (event.key === 'End') {
                    event.preventDefault()
                    setActiveIndex(enabledIndexes.at(-1) ?? 0)
                  } else if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectIndex(activeIndex)
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    close()
                  } else if (event.key === 'Tab') {
                    close(false)
                  } else {
                    handleTypeahead(event.key)
                  }
                }}
              >
                {options.length === 0 ? (
                  <div className="aw-game-select__empty">{getCopy('common.noOptions')}</div>
                ) : (
                  options.map((option, index) => (
                    <div
                      className="aw-game-select__option"
                      id={`${listboxId}-option-${index}`}
                      aria-disabled={option.disabled}
                      aria-selected={option.value === value}
                      data-active={index === activeIndex}
                      data-disabled={option.disabled}
                      data-option-index={index}
                      key={option.value}
                      role="option"
                      onClick={() => selectIndex(index)}
                      onPointerDown={(event) => event.preventDefault()}
                      onPointerEnter={() => {
                        if (!option.disabled) setActiveIndex(index)
                      }}
                    >
                      <span>{option.label}</span>
                      {option.value === value ? (
                        <Check size={17} weight="bold" aria-hidden />
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
