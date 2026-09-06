import { GameIcon } from '../components/GameIcon.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { formatCopy, getCopy, NicknameGenerator } from '@agentwolf/assets'
import type {
  AgentProfile,
  BoardSummary,
  CharacterCard,
  CharacterId,
  MatchId,
  RoleId,
  SeatAssignmentInput,
} from '@agentwolf/contracts'
import { AgentProfileIdSchema } from '@agentwolf/contracts'
import { api } from '../api.js'
import { ErrorState, LoadingState } from '../components/AsyncState.js'
import { GameSelect } from '../components/GameSelect.js'
import { RoleBadge } from '../components/RoleBadge.js'
import { SeatRosterEditor, type SeatDraft } from '../components/setup/SeatRosterEditor.js'
import { SetupBoardSelection } from '../components/setup/SetupBoardSelection.js'
import { SetupActionBar } from '../components/setup/SetupActionBar.js'

const nicknameGenerator = new NicknameGenerator()
const preferredPlayerCount = 12

export function NewMatchPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedBoardId = searchParams.get('board')
  const [step, setStep] = useState<'board' | 'seats'>('board')
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const [boards, setBoards] = useState<BoardSummary[] | null>(null)
  const [profiles, setProfiles] = useState<AgentProfile[] | null>(null)
  const [characters, setCharacters] = useState<CharacterCard[] | null>(null)
  const [boardId, setBoardId] = useState<string>('')
  const [roleAssignment, setRoleAssignment] = useState<'random' | 'manual'>('random')
  const [seats, setSeats] = useState<SeatDraft[]>([])
  const [manualReserveRoleIds, setManualReserveRoleIds] = useState<RoleId[]>([])
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [pendingMatchId, setPendingMatchId] = useState<MatchId | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [nextBoards, nextProfiles, nextCharacters] = await Promise.all([
        api.listBoards(),
        api.listProfiles(),
        api.listCharacters(),
      ])
      setBoards(nextBoards)
      setProfiles(nextProfiles)
      setCharacters(nextCharacters)
      setBoardId(
        (current) =>
          nextBoards.find((entry) => entry.id === requestedBoardId)?.id ??
          nextBoards.find((entry) => entry.id === current)?.id ??
          nextBoards.find((entry) => entry.playerCount === preferredPlayerCount)?.id ??
          nextBoards[0]?.id ??
          '',
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [requestedBoardId])
  useEffect(() => void load(), [load])
  useEffect(() => {
    stepHeading.current?.focus({ preventScroll: true })
    stepHeading.current?.scrollIntoView?.({ block: 'start' })
  }, [step])

  const board = useMemo(
    () => boards?.find((entry) => entry.id === boardId) ?? null,
    [boardId, boards],
  )
  const playerCount = board?.playerCount ?? preferredPlayerCount
  const playerCounts = useMemo(
    () => [...new Set(boards?.map((entry) => entry.playerCount) ?? [])].sort((a, b) => a - b),
    [boards],
  )
  const visibleBoards = useMemo(
    () => boards?.filter((entry) => entry.playerCount === playerCount) ?? [],
    [boards, playerCount],
  )
  const roleOptions = useMemo(
    () =>
      board?.roles.map((role) => ({
        value: role.roleId,
        label: role.name,
        content: <RoleBadge label={role.name} roleId={role.roleId} />,
      })) ?? [],
    [board],
  )
  useEffect(() => {
    if (!board || !profiles || !characters) return
    const roleIds = board.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const characterById = new Map(characters.map((character) => [character.id, character]))
    const profileIds = [...board.agentProfiles]
      .sort((left, right) => left.seat - right.seat)
      .map(({ profileId }) => profileId)
    const characterIds = [...board.characters]
      .sort((left, right) => left.seat - right.seat)
      .map(({ characterId }) => characterId)
    const reservedNames = new Set(
      characterIds.flatMap((characterId) => {
        const name = characterId ? characterById.get(characterId)?.name : null
        return name ? [name] : []
      }),
    )
    const generatedNames = nicknameGenerator.many(
      characterIds.filter((characterId) => characterId === null).length,
      reservedNames,
    )
    let generatedIndex = 0
    setSeats(
      Array.from({ length: board.playerCount }, (_, index) => {
        const characterId = characterIds[index] ?? null
        const character = characterId ? characterById.get(characterId) : null
        const name = character?.name ?? generatedNames[generatedIndex++]!
        return {
          seat: index + 1,
          name,
          profileId: profileIds[index] ?? profiles[0]?.id ?? '',
          roleId: roleIds[index]!,
          characterId,
        }
      }),
    )
    setManualReserveRoleIds(roleIds.slice(board.playerCount))
  }, [board, characters, profiles])

  const rerollSeat = (seatNumber: number): void => {
    const used = new Set(seats.filter((seat) => seat.seat !== seatNumber).map((seat) => seat.name))
    setSeats((current) =>
      current.map((seat) =>
        seat.seat === seatNumber ? { ...seat, name: nicknameGenerator.one(used) } : seat,
      ),
    )
  }

  const rerollAll = (): void => {
    if (!board) return
    const names = nicknameGenerator.many(board.playerCount)
    setSeats((current) => current.map((seat, index) => ({ ...seat, name: names[index]! })))
  }

  const selectPlayerCount = (nextPlayerCount: number): void => {
    const nextBoard = boards?.find((entry) => entry.playerCount === nextPlayerCount)
    if (!nextBoard) return
    setBoardId(nextBoard.id)
  }

  const updateSeat = (
    seatNumber: number,
    update: Partial<Pick<SeatDraft, 'name' | 'profileId'>>,
  ): void => {
    setSeats((current) =>
      current.map((seat) => (seat.seat === seatNumber ? { ...seat, ...update } : seat)),
    )
  }

  const selectCharacter = (seatNumber: number, characterId: CharacterId | null): void => {
    const character = characters?.find((entry) => entry.id === characterId)
    const used = new Set(seats.filter((seat) => seat.seat !== seatNumber).map((seat) => seat.name))
    setSeats((current) =>
      current.map((seat) =>
        seat.seat === seatNumber
          ? {
              ...seat,
              characterId,
              name: character?.name ?? nicknameGenerator.one(used),
            }
          : seat,
      ),
    )
  }

  const swapSeatRole = (seatNumber: number, roleId: RoleId): void => {
    const selected = seats.find((seat) => seat.seat === seatNumber)
    if (!selected || selected.roleId === roleId) return
    const swap = seats.find((seat) => seat.seat !== seatNumber && seat.roleId === roleId)
    if (swap) {
      setSeats((current) =>
        current.map((seat) => {
          if (seat.seat === selected.seat) return { ...seat, roleId }
          if (seat.seat === swap.seat) return { ...seat, roleId: selected.roleId }
          return seat
        }),
      )
      return
    }
    const reserveIndex = manualReserveRoleIds.findIndex((entry) => entry === roleId)
    if (reserveIndex < 0) return
    setSeats((current) =>
      current.map((seat) => (seat.seat === selected.seat ? { ...seat, roleId } : seat)),
    )
    setManualReserveRoleIds((current) =>
      current.map((entry, index) => (index === reserveIndex ? selected.roleId : entry)),
    )
  }

  const swapReserveRole = (reserveIndex: number, roleId: RoleId): void => {
    const selected = manualReserveRoleIds[reserveIndex]
    if (!selected || selected === roleId) return
    const otherReserveIndex = manualReserveRoleIds.findIndex(
      (entry, index) => index !== reserveIndex && entry === roleId,
    )
    if (otherReserveIndex >= 0) {
      setManualReserveRoleIds((current) =>
        current.map((entry, index) => {
          if (index === reserveIndex) return roleId
          if (index === otherReserveIndex) return selected
          return entry
        }),
      )
      return
    }
    const swap = seats.find((seat) => seat.roleId === roleId)
    if (!swap) return
    setSeats((current) =>
      current.map((seat) => (seat.seat === swap.seat ? { ...seat, roleId: selected } : seat)),
    )
    setManualReserveRoleIds((current) =>
      current.map((entry, index) => (index === reserveIndex ? roleId : entry)),
    )
  }

  const startMatch = async (): Promise<void> => {
    if (
      !board ||
      !profiles ||
      starting ||
      seats.some((seat) => !seat.profileId || !seat.name.trim())
    )
      return
    if (duplicateNames(seats).size > 0) {
      setError(getCopy('setup.duplicateName'))
      return
    }
    setStarting(true)
    setError(null)
    try {
      let matchId = pendingMatchId
      if (!matchId) {
        const created = await api.createMatch({
          boardId: board.id,
          roleAssignment,
          manualReserveRoleIds: roleAssignment === 'manual' ? manualReserveRoleIds : [],
          seats: seats.map(
            (seat): SeatAssignmentInput => ({
              seat: seat.seat,
              name: seat.name,
              profileId: AgentProfileIdSchema.parse(seat.profileId),
              characterId: seat.characterId,
              ...(roleAssignment === 'manual' ? { roleId: seat.roleId } : {}),
            }),
          ),
        })
        matchId = created.id
        setPendingMatchId(matchId)
      }
      await api.startMatch(matchId)
      void navigate(`/matches/${matchId}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStarting(false)
    }
  }

  if (error && (!boards || !profiles || !characters))
    return <ErrorState message={error} retry={() => void load()} />
  if (!boards || !profiles || !characters) return <LoadingState />
  if (!board)
    return (
      <main className="aw-page">
        <div className="aw-empty-state aw-panel">
          <GameIcon name="dice" size={38} />
          <h1>{getCopy('tableDesign.setupNoBoards')}</h1>
          <p>{getCopy('tableDesign.setupNoBoardsHint')}</p>
          <Link className="aw-button aw-button--primary" to="/boards">
            {getCopy('tableDesign.boardsLink')}
          </Link>
        </div>
      </main>
    )
  if (profiles.length === 0) {
    return (
      <main className="aw-page">
        <div className="aw-empty-state aw-panel">
          <GameIcon name="dice" size={38} />
          <h1>{getCopy('setup.profilesRequired')}</h1>
          <p>{getCopy('setup.profilesRequiredHint')}</p>
          <Link className="aw-button aw-button--primary" to="/agents">
            {getCopy('setup.openSettings')}
          </Link>
        </div>
      </main>
    )
  }

  const duplicatedNames = duplicateNames(seats)
  const readyCount = seats.filter(
    (seat) => seat.name.trim() && seat.profileId && !duplicatedNames.has(seat.name.trim()),
  ).length
  const ready = readyCount === board.playerCount

  return (
    <main className="aw-page aw-setup-page" aria-busy={starting}>
      <header className="aw-setup-heading">
        <div>
          <Link className="aw-back-link" to="/">
            <GameIcon name="back" size={17} />
            {getCopy('navigation.lobby')}
          </Link>
          <h1>{getCopy('tableDesign.setupTitle')}</h1>
          <p>{getCopy('tableDesign.setupHint')}</p>
        </div>
        <ol className="aw-setup-steps" aria-label={getCopy('tableDesign.setupTitle')}>
          {(['board', 'seats'] as const).map((entry, index) => (
            <li key={entry}>
              <button
                className="aw-step-choice"
                type="button"
                disabled={starting || pendingMatchId !== null}
                aria-current={step === entry ? 'step' : undefined}
                onClick={() => setStep(entry)}
              >
                <span className="aw-step-choice__index" aria-hidden>
                  {step === 'seats' && entry === 'board' ? (
                    <GameIcon name="check" size={17} />
                  ) : (
                    `0${index + 1}`
                  )}
                </span>
                {getCopy(
                  entry === 'board' ? 'tableDesign.selectBoard' : 'tableDesign.arrangeSeats',
                )}
              </button>
            </li>
          ))}
        </ol>
      </header>
      <fieldset className="aw-setup-content" disabled={starting || pendingMatchId !== null}>
        {step === 'board' ? (
          <SetupBoardSelection
            board={board}
            boards={visibleBoards}
            playerCount={playerCount}
            playerCounts={playerCounts}
            headingRef={stepHeading}
            onPlayerCount={selectPlayerCount}
            onBoardChange={setBoardId}
          />
        ) : (
          <section className="aw-setup-seat-stage" aria-labelledby="setup-seats-heading">
            <div className="aw-setup-section-heading">
              <div>
                <h2 id="setup-seats-heading" ref={stepHeading} tabIndex={-1}>
                  {getCopy('tableDesign.arrangeSeats')}
                </h2>
                <p>{getCopy('tableDesign.seatsHint')}</p>
              </div>
              <span className="aw-setup-ready" data-ready={ready}>
                <GameIcon name="group" size={18} />
                {formatCopy(getCopy('tableDesign.ready'), { count: readyCount })}
              </span>
            </div>
            <div className="aw-setup-deal">
              <div>
                <h3>{getCopy('tableDesign.setupRoleMode')}</h3>
                <p>{getCopy('tableDesign.setupRoleHint')}</p>
              </div>
              <div
                className="aw-segmented aw-role-mode"
                role="group"
                aria-label={getCopy('tableDesign.setupRoleMode')}
              >
                <button
                  className="aw-segmented__item aw-choice"
                  aria-pressed={roleAssignment === 'random'}
                  type="button"
                  onClick={() => setRoleAssignment('random')}
                >
                  {getCopy('setup.randomRoles')}
                </button>
                <button
                  className="aw-segmented__item aw-choice"
                  aria-pressed={roleAssignment === 'manual'}
                  type="button"
                  onClick={() => setRoleAssignment('manual')}
                >
                  {getCopy('setup.manualRoles')}
                </button>
              </div>
              {roleAssignment === 'manual' && board.reserveCount > 0 ? (
                <div className="aw-reserve-role-picker">
                  <div>
                    <h3>{getCopy('setup.reserveCards')}</h3>
                    <p>{getCopy('setup.reserveCardsHint')}</p>
                  </div>
                  <div className="aw-reserve-role-list">
                    {manualReserveRoleIds.map((roleId, index) => (
                      <label className="aw-field" key={`reserve-${index + 1}`}>
                        <span className="aw-field__label">
                          {formatCopy(getCopy('setup.reserveCard'), { index: index + 1 })}
                        </span>
                        <GameSelect
                          ariaLabel={formatCopy(getCopy('setup.reserveCard'), { index: index + 1 })}
                          value={roleId}
                          options={roleOptions}
                          onChange={(nextRoleId) => swapReserveRole(index, nextRoleId)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <SeatRosterEditor
              seats={seats}
              profiles={profiles}
              characters={characters}
              roleOptions={roleOptions}
              manualRoles={roleAssignment === 'manual'}
              duplicatedNames={duplicatedNames}
              onChange={updateSeat}
              onCharacterChange={selectCharacter}
              onRoleChange={swapSeatRole}
              onReroll={rerollSeat}
              onRerollAll={rerollAll}
              onApplyProfile={(profileId) =>
                setSeats((current) => current.map((seat) => ({ ...seat, profileId })))
              }
            />
          </section>
        )}
      </fieldset>
      <SetupActionBar
        board={board}
        step={step}
        starting={starting}
        pendingMatchId={pendingMatchId}
        error={error}
        readyCount={readyCount}
        onNext={() => setStep('seats')}
        onPrevious={() => setStep('board')}
        onStart={() => void startMatch()}
      />
    </main>
  )
}

function duplicateNames(seats: readonly SeatDraft[]): ReadonlySet<string> {
  const counts = new Map<string, number>()
  for (const seat of seats) {
    const name = seat.name.trim()
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name))
}
