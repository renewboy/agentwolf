import {
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { AgentProfile, AgentProfileId } from '@agentwolf/contracts'
import { api } from '../api.js'

interface ProfileDragState {
  readonly profileId: AgentProfileId
  readonly originalProfiles: AgentProfile[]
  dropTarget: ProfileDropTarget | null
}

interface ProfileDropTarget {
  readonly profileId: AgentProfileId
  readonly position: 'before' | 'after'
}

export interface ProfileOrderingController {
  readonly reordering: boolean
  readonly draggingProfileId: AgentProfileId | null
  readonly dropTarget: ProfileDropTarget | null
  readonly startProfileDrag: (
    event: ReactDragEvent<HTMLDivElement>,
    profileId: AgentProfileId,
  ) => void
  readonly updateProfileDropTarget: (
    event: ReactDragEvent<HTMLDivElement>,
    profileId: AgentProfileId,
  ) => void
  readonly allowProfileDrop: (event: ReactDragEvent<HTMLDivElement>) => void
  readonly finishProfileDrop: (event: ReactDragEvent<HTMLDivElement>) => void
  readonly cancelProfileDrag: () => void
  readonly moveProfileWithKeyboard: (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    profileId: AgentProfileId,
  ) => void
}

export function useProfileOrdering({
  profiles,
  busy,
  onProfilesChange,
  onError,
}: {
  readonly profiles: AgentProfile[] | null
  readonly busy: boolean
  readonly onProfilesChange: (profiles: AgentProfile[]) => void
  readonly onError: (error: string | null) => void
}): ProfileOrderingController {
  const [reordering, setReordering] = useState(false)
  const [draggingProfileId, setDraggingProfileId] = useState<AgentProfileId | null>(null)
  const [dropTarget, setDropTarget] = useState<ProfileDropTarget | null>(null)
  const dragState = useRef<ProfileDragState | null>(null)
  const orderSaving = useRef(false)

  const persistProfileOrder = async (
    nextProfiles: AgentProfile[],
    previousProfiles: AgentProfile[],
  ): Promise<void> => {
    if (orderSaving.current) return
    orderSaving.current = true
    setReordering(true)
    onError(null)
    try {
      onProfilesChange(await api.reorderProfiles({ profileIds: nextProfiles.map(({ id }) => id) }))
    } catch (cause) {
      onProfilesChange(previousProfiles)
      onError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      orderSaving.current = false
      setReordering(false)
    }
  }

  const startProfileDrag = (
    event: ReactDragEvent<HTMLDivElement>,
    profileId: AgentProfileId,
  ): void => {
    if (!profiles || busy || orderSaving.current) {
      event.preventDefault()
      return
    }
    dragState.current = {
      profileId,
      originalProfiles: profiles,
      dropTarget: null,
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', profileId)
    const bounds = event.currentTarget.getBoundingClientRect()
    event.dataTransfer.setDragImage(
      event.currentTarget,
      event.clientX - bounds.left,
      event.clientY - bounds.top,
    )
    setDraggingProfileId(profileId)
  }

  const updateProfileDropTarget = (
    event: ReactDragEvent<HTMLDivElement>,
    profileId: AgentProfileId,
  ): void => {
    const currentDrag = dragState.current
    if (!currentDrag) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (profileId === currentDrag.profileId) {
      currentDrag.dropTarget = null
      setDropTarget(null)
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const nextTarget: ProfileDropTarget = {
      profileId,
      position: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
    }
    if (
      currentDrag.dropTarget?.profileId === nextTarget.profileId &&
      currentDrag.dropTarget.position === nextTarget.position
    ) {
      return
    }
    currentDrag.dropTarget = nextTarget
    setDropTarget(nextTarget)
  }

  const allowProfileDrop = (event: ReactDragEvent<HTMLDivElement>): void => {
    if (!dragState.current) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const finishProfileDrop = (event: ReactDragEvent<HTMLDivElement>): void => {
    const currentDrag = dragState.current
    if (!currentDrag) return
    event.preventDefault()
    clearProfileDrag()
    if (!currentDrag.dropTarget) return
    const nextProfiles = moveProfileRelative(
      currentDrag.originalProfiles,
      currentDrag.profileId,
      currentDrag.dropTarget,
    )
    if (nextProfiles === currentDrag.originalProfiles) return
    onProfilesChange(nextProfiles)
    void persistProfileOrder(nextProfiles, currentDrag.originalProfiles)
  }

  const cancelProfileDrag = (): void => {
    if (!dragState.current) return
    clearProfileDrag()
  }

  const clearProfileDrag = (): void => {
    dragState.current = null
    setDraggingProfileId(null)
    setDropTarget(null)
  }

  const moveProfileWithKeyboard = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    profileId: AgentProfileId,
  ): void => {
    if (!profiles || busy || orderSaving.current) return
    const currentIndex = profiles.findIndex(({ id }) => id === profileId)
    const targetIndex = keyboardTargetIndex(event.key, currentIndex, profiles.length)
    if (targetIndex === null || targetIndex === currentIndex) return
    event.preventDefault()
    const nextProfiles = moveProfileToIndex(profiles, profileId, targetIndex)
    onProfilesChange(nextProfiles)
    void persistProfileOrder(nextProfiles, profiles)
  }

  return {
    reordering,
    draggingProfileId,
    dropTarget,
    startProfileDrag,
    updateProfileDropTarget,
    allowProfileDrop,
    finishProfileDrop,
    cancelProfileDrag,
    moveProfileWithKeyboard,
  }
}

function moveProfileRelative(
  profiles: AgentProfile[],
  profileId: AgentProfileId,
  target: ProfileDropTarget,
): AgentProfile[] {
  const profile = profiles.find(({ id }) => id === profileId)
  if (!profile) return profiles
  const remainingProfiles = profiles.filter(({ id }) => id !== profileId)
  const targetIndex = remainingProfiles.findIndex(({ id }) => id === target.profileId)
  if (targetIndex < 0) return profiles
  const nextProfiles = [...remainingProfiles]
  nextProfiles.splice(targetIndex + (target.position === 'after' ? 1 : 0), 0, profile)
  return nextProfiles.every(({ id }, index) => id === profiles[index]?.id) ? profiles : nextProfiles
}

function moveProfileToIndex(
  profiles: AgentProfile[],
  profileId: AgentProfileId,
  targetIndex: number,
): AgentProfile[] {
  const currentIndex = profiles.findIndex(({ id }) => id === profileId)
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= profiles.length) return profiles
  if (currentIndex === targetIndex) return profiles
  const nextProfiles = [...profiles]
  const [profile] = nextProfiles.splice(currentIndex, 1)
  nextProfiles.splice(targetIndex, 0, profile!)
  return nextProfiles
}

function keyboardTargetIndex(
  key: string,
  currentIndex: number,
  profileCount: number,
): number | null {
  if (currentIndex < 0) return null
  switch (key) {
    case 'ArrowUp':
      return Math.max(0, currentIndex - 1)
    case 'ArrowDown':
      return Math.min(profileCount - 1, currentIndex + 1)
    case 'Home':
      return 0
    case 'End':
      return profileCount - 1
    default:
      return null
  }
}
