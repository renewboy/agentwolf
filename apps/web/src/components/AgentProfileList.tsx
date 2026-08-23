import { DotsSixVertical, Robot } from '@phosphor-icons/react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type { AgentProfile, AgentProfileId } from '@agentwolf/contracts'
import type { ProfileOrderingController } from '../hooks/useProfileOrdering.js'

export function AgentProfileList({
  profiles,
  selectedProfileId,
  busy,
  ordering,
  onSelect,
}: {
  readonly profiles: AgentProfile[]
  readonly selectedProfileId: AgentProfileId | null
  readonly busy: boolean
  readonly ordering: ProfileOrderingController
  readonly onSelect: (profile: AgentProfile) => void
}) {
  return (
    <div
      className="aw-profile-list"
      data-drag-active={ordering.draggingProfileId !== null}
      data-reordering={ordering.reordering}
      onDragOver={ordering.allowProfileDrop}
      onDrop={ordering.finishProfileDrop}
    >
      {profiles.length > 1 ? (
        <p className="aw-profile-order-hint">{getCopy('agents.orderHint')}</p>
      ) : null}
      {profiles.map((profile) => (
        <div
          className="aw-profile-item"
          data-dragging={ordering.draggingProfileId === profile.id}
          data-drop-position={
            ordering.dropTarget?.profileId === profile.id ? ordering.dropTarget.position : undefined
          }
          data-profile-id={profile.id}
          data-selected={selectedProfileId === profile.id}
          draggable={!busy && !ordering.reordering}
          key={profile.id}
          onDragEnd={ordering.cancelProfileDrag}
          onDragOver={(event) => ordering.updateProfileDropTarget(event, profile.id)}
          onDragStart={(event) => ordering.startProfileDrag(event, profile.id)}
        >
          <button
            aria-label={formatCopy(getCopy('agents.reorderProfile'), { name: profile.name })}
            aria-disabled={busy || ordering.reordering}
            className="aw-profile-item__handle"
            title={getCopy('agents.orderHandleHint')}
            type="button"
            onKeyDown={(event) => ordering.moveProfileWithKeyboard(event, profile.id)}
          >
            <DotsSixVertical size={20} aria-hidden />
          </button>
          <button
            className="aw-profile-item__select"
            type="button"
            onClick={() => onSelect(profile)}
          >
            <Robot size={22} aria-hidden />
            <span className="aw-profile-item__copy">
              <strong>{profile.name}</strong>
              <small>{profile.model}</small>
            </span>
          </button>
        </div>
      ))}
    </div>
  )
}
