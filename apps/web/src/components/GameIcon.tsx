const gameIconSources = {
  battle: new URL(
    '../../../../packages/assets/art/icons/woodcut-battle-3aca3563.webp',
    import.meta.url,
  ).href,
  back: new URL('../../../../packages/assets/art/icons/woodcut-back-3c482090.webp', import.meta.url)
    .href,
  forward: new URL(
    '../../../../packages/assets/art/icons/woodcut-forward-2418afd8.webp',
    import.meta.url,
  ).href,
  down: new URL('../../../../packages/assets/art/icons/woodcut-down-4b8c4e32.webp', import.meta.url)
    .href,
  refresh: new URL(
    '../../../../packages/assets/art/icons/woodcut-refresh-8743741d.webp',
    import.meta.url,
  ).href,
  swap: new URL('../../../../packages/assets/art/icons/woodcut-swap-3ff0023c.webp', import.meta.url)
    .href,
  cards: new URL(
    '../../../../packages/assets/art/icons/woodcut-cards-308d1856.webp',
    import.meta.url,
  ).href,
  check: new URL(
    '../../../../packages/assets/art/icons/woodcut-check-185a268a.webp',
    import.meta.url,
  ).href,
  copy: new URL('../../../../packages/assets/art/icons/woodcut-copy-d8f7ddaa.webp', import.meta.url)
    .href,
  target: new URL(
    '../../../../packages/assets/art/icons/woodcut-target-626ca9f2.webp',
    import.meta.url,
  ).href,
  crown: new URL(
    '../../../../packages/assets/art/icons/woodcut-crown-bc4bf254.webp',
    import.meta.url,
  ).href,
  dice: new URL('../../../../packages/assets/art/icons/woodcut-dice-44a9dbc7.webp', import.meta.url)
    .href,
  grip: new URL('../../../../packages/assets/art/icons/woodcut-grip-c60ce9c8.webp', import.meta.url)
    .href,
  more: new URL('../../../../packages/assets/art/icons/woodcut-more-e2769894.webp', import.meta.url)
    .href,
  drop: new URL('../../../../packages/assets/art/icons/woodcut-drop-28a82852.webp', import.meta.url)
    .href,
  eye: new URL('../../../../packages/assets/art/icons/woodcut-eye-be7a07c9.webp', import.meta.url)
    .href,
  'eye-closed': new URL(
    '../../../../packages/assets/art/icons/woodcut-eye-closed-0cc5c996.webp',
    import.meta.url,
  ).href,
  flask: new URL(
    '../../../../packages/assets/art/icons/woodcut-flask-bdbd6bf9.webp',
    import.meta.url,
  ).href,
  save: new URL('../../../../packages/assets/art/icons/woodcut-save-a0365300.webp', import.meta.url)
    .href,
  settings: new URL(
    '../../../../packages/assets/art/icons/woodcut-settings-bea19bfc.webp',
    import.meta.url,
  ).href,
  hand: new URL('../../../../packages/assets/art/icons/woodcut-hand-afcc2177.webp', import.meta.url)
    .href,
  heart: new URL(
    '../../../../packages/assets/art/icons/woodcut-heart-6eb1f741.webp',
    import.meta.url,
  ).href,
  award: new URL(
    '../../../../packages/assets/art/icons/woodcut-award-ed3c80fd.webp',
    import.meta.url,
  ).href,
  minus: new URL(
    '../../../../packages/assets/art/icons/woodcut-minus-6f26100b.webp',
    import.meta.url,
  ).href,
  moon: new URL('../../../../packages/assets/art/icons/woodcut-moon-6fca9994.webp', import.meta.url)
    .href,
  pause: new URL(
    '../../../../packages/assets/art/icons/woodcut-pause-f2f721a6.webp',
    import.meta.url,
  ).href,
  edit: new URL('../../../../packages/assets/art/icons/woodcut-edit-2c895ffc.webp', import.meta.url)
    .href,
  play: new URL('../../../../packages/assets/art/icons/woodcut-play-7008278a.webp', import.meta.url)
    .href,
  plus: new URL('../../../../packages/assets/art/icons/woodcut-plus-d0673e72.webp', import.meta.url)
    .href,
  pulse: new URL(
    '../../../../packages/assets/art/icons/woodcut-pulse-6ace50f0.webp',
    import.meta.url,
  ).href,
  pawn: new URL('../../../../packages/assets/art/icons/woodcut-pawn-eb626bd5.webp', import.meta.url)
    .href,
  scales: new URL(
    '../../../../packages/assets/art/icons/woodcut-scales-32a25d9d.webp',
    import.meta.url,
  ).href,
  shield: new URL(
    '../../../../packages/assets/art/icons/woodcut-shield-19a1bccd.webp',
    import.meta.url,
  ).href,
  shuffle: new URL(
    '../../../../packages/assets/art/icons/woodcut-shuffle-addb20e9.webp',
    import.meta.url,
  ).href,
  skip: new URL('../../../../packages/assets/art/icons/woodcut-skip-8c2b2f76.webp', import.meta.url)
    .href,
  skull: new URL(
    '../../../../packages/assets/art/icons/woodcut-skull-f7e59ce1.webp',
    import.meta.url,
  ).href,
  smile: new URL(
    '../../../../packages/assets/art/icons/woodcut-smile-765a6352.webp',
    import.meta.url,
  ).href,
  sparkle: new URL(
    '../../../../packages/assets/art/icons/woodcut-sparkle-c191768c.webp',
    import.meta.url,
  ).href,
  sound: new URL(
    '../../../../packages/assets/art/icons/woodcut-sound-79aa818b.webp',
    import.meta.url,
  ).href,
  mute: new URL('../../../../packages/assets/art/icons/woodcut-mute-e53ecd5e.webp', import.meta.url)
    .href,
  stop: new URL('../../../../packages/assets/art/icons/woodcut-stop-e617e82a.webp', import.meta.url)
    .href,
  sun: new URL('../../../../packages/assets/art/icons/woodcut-sun-cd6c6de2.webp', import.meta.url)
    .href,
  text: new URL('../../../../packages/assets/art/icons/woodcut-text-c2e0991f.webp', import.meta.url)
    .href,
  trash: new URL(
    '../../../../packages/assets/art/icons/woodcut-trash-c9d3c27c.webp',
    import.meta.url,
  ).href,
  upload: new URL(
    '../../../../packages/assets/art/icons/woodcut-upload-fc78e816.webp',
    import.meta.url,
  ).href,
  group: new URL(
    '../../../../packages/assets/art/icons/woodcut-group-8be52a44.webp',
    import.meta.url,
  ).href,
  warning: new URL(
    '../../../../packages/assets/art/icons/woodcut-warning-8b9457d4.webp',
    import.meta.url,
  ).href,
  wifi: new URL('../../../../packages/assets/art/icons/woodcut-wifi-3d82da77.webp', import.meta.url)
    .href,
  close: new URL(
    '../../../../packages/assets/art/icons/woodcut-close-5e262061.webp',
    import.meta.url,
  ).href,
} as const

export type GameIconName = keyof typeof gameIconSources

export function GameIconInk() {
  return (
    <svg className="aw-icon-ink" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <filter id="aw-selection-ink" colorInterpolationFilters="sRGB">
          <feFlood floodColor="var(--aw-color-selection)" result="ink" />
          <feComposite in="ink" in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
    </svg>
  )
}

export function GameIcon({
  name,
  size = 20,
  className,
}: {
  readonly name: GameIconName
  readonly size?: number
  readonly className?: string | undefined
}) {
  return (
    <img
      className={className ? `aw-icon ${className}` : 'aw-icon'}
      src={gameIconSources[name]}
      data-icon={name}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
