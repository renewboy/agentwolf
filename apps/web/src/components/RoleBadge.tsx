import type { RoleId } from '@agentwolf/contracts'

export function RoleBadge({
  className,
  label,
  roleId,
}: {
  readonly className?: string
  readonly label: string
  readonly roleId?: RoleId | undefined
}) {
  return (
    <span
      className={className ? `aw-role-badge ${className}` : 'aw-role-badge'}
      data-role-id={roleId ?? 'hidden'}
    >
      {label}
    </span>
  )
}
