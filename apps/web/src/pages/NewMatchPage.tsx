import { ArrowLeft, DiceFive, Play, Shuffle } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatCopy, getCopy, NicknameGenerator } from '@agentwolf/assets'
import type {
  AgentProfile,
  BoardSummary,
  CharacterCard,
  CharacterId,
  RoleId,
  SeatAssignmentInput,
} from '@agentwolf/contracts'
import { AgentProfileIdSchema } from '@agentwolf/contracts'
import { api } from '../api.js'
import { ErrorState, LoadingState } from '../components/AsyncState.js'
import { GameSelect } from '../components/GameSelect.js'
import { RoleBadge } from '../components/RoleBadge.js'
import { characterPortraitUrl } from '../character-portraits.js'

interface SeatDraft {
  readonly seat: number
  readonly name: string
  readonly profileId: AgentProfile['id'] | ''
  readonly roleId: RoleId
  readonly characterId: CharacterId | null
}

const nicknameGenerator = new NicknameGenerator()
const preferredPlayerCount = 12

export function NewMatchPage() {
  const navigate = useNavigate()
  const [boards, setBoards] = useState<BoardSummary[] | null>(null)
  const [profiles, setProfiles] = useState<AgentProfile[] | null>(null)
  const [characters, setCharacters] = useState<CharacterCard[] | null>(null)
  const [playerCount, setPlayerCount] = useState(preferredPlayerCount)
  const [boardId, setBoardId] = useState<string>('')
  const [roleAssignment, setRoleAssignment] = useState<'random' | 'manual'>('random')
  const [seats, setSeats] = useState<SeatDraft[]>([])
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

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
      setPlayerCount((current) =>
        nextBoards.some((entry) => entry.playerCount === current)
          ? current
          : (nextBoards.find((entry) => entry.playerCount === preferredPlayerCount)?.playerCount ??
            nextBoards[0]?.playerCount ??
            preferredPlayerCount),
      )
      setBoardId((current) =>
        nextBoards.some((entry) => entry.id === current)
          ? current
          : (nextBoards.find((entry) => entry.playerCount === preferredPlayerCount)?.id ??
            nextBoards[0]?.id ??
            ''),
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])
  useEffect(() => void load(), [load])

  const board = useMemo(
    () => boards?.find((entry) => entry.id === boardId) ?? null,
    [boardId, boards],
  )
  const playerCounts = useMemo(
    () => [...new Set(boards?.map((entry) => entry.playerCount) ?? [])].sort((a, b) => a - b),
    [boards],
  )
  const visibleBoards = useMemo(
    () => boards?.filter((entry) => entry.playerCount === playerCount) ?? [],
    [boards, playerCount],
  )
  const profileOptions = useMemo(
    () =>
      (profiles ?? []).map((profile) => ({
        value: profile.id,
        label: formatCopy(getCopy('setup.profileOption'), {
          name: profile.name,
          model: profile.model,
        }),
      })),
    [profiles],
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
  const characterOptions = useMemo(
    () => [
      { value: 'none', label: getCopy('setup.noCharacter') },
      ...(characters ?? []).map((character) => ({
        value: character.id,
        label: `${character.name} · ${character.universe}`,
      })),
    ],
    [characters],
  )
  useEffect(() => {
    if (!board || !profiles || !characters) return
    const roleIds = board.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const characterById = new Map(characters.map((character) => [character.id, character]))
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
          profileId: profiles[0]?.id ?? '',
          roleId: roleIds[index]!,
          characterId,
        }
      }),
    )
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
    setPlayerCount(nextPlayerCount)
    setBoardId(nextBoard.id)
  }

  const swapSeatRole = (seatNumber: number, roleId: RoleId): void => {
    setSeats((current) => {
      const selected = current.find((seat) => seat.seat === seatNumber)
      if (!selected || selected.roleId === roleId) return current
      const swap = current.find((seat) => seat.seat !== seatNumber && seat.roleId === roleId)
      if (!swap) return current
      return current.map((seat) => {
        if (seat.seat === selected.seat) return { ...seat, roleId }
        if (seat.seat === swap.seat) return { ...seat, roleId: selected.roleId }
        return seat
      })
    })
  }

  const startMatch = async (): Promise<void> => {
    if (!board || !profiles || seats.some((seat) => !seat.profileId)) return
    if (duplicateNames(seats).size > 0) {
      setError(getCopy('setup.duplicateName'))
      return
    }
    setStarting(true)
    setError(null)
    try {
      const created = await api.createMatch({
        boardId: board.id,
        roleAssignment,
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
      await api.startMatch(created.id)
      void navigate(`/matches/${created.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStarting(false)
    }
  }

  if (error && (!boards || !profiles || !characters))
    return <ErrorState message={error} retry={() => void load()} />
  if (!boards || !profiles || !characters || !board) return <LoadingState />
  if (profiles.length === 0) {
    return (
      <main className="aw-page">
        <div className="aw-empty-state aw-panel">
          <DiceFive size={38} aria-hidden />
          <h1>{getCopy('setup.profilesRequired')}</h1>
          <p>{getCopy('setup.profilesRequiredHint')}</p>
          <Link className="aw-button aw-button--primary" to="/agents">
            {getCopy('setup.openSettings')}
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="aw-page">
      <Link className="aw-back-link" to="/">
        <ArrowLeft size={17} aria-hidden />
        {getCopy('common.back')}
      </Link>
      <div className="aw-page-heading">
        <h1>{getCopy('setup.title')}</h1>
        <p>{getCopy('setup.board')}</p>
      </div>
      <div className="aw-setup-layout">
        <section className="aw-board-picker aw-panel">
          <div className="aw-picker-block">
            <h2>{getCopy('setup.playerCount')}</h2>
            <div
              className="aw-segmented aw-player-count"
              role="group"
              aria-label={getCopy('setup.playerCount')}
            >
              {playerCounts.map((count) => (
                <button
                  className="aw-segmented__item"
                  aria-pressed={count === playerCount}
                  key={count}
                  type="button"
                  onClick={() => selectPlayerCount(count)}
                >
                  {formatCopy(getCopy('setup.playerCountOption'), { count })}
                </button>
              ))}
            </div>
          </div>
          <div className="aw-picker-block">
            <div className="aw-panel-heading">
              <h2>{getCopy('setup.board')}</h2>
              <Link className="aw-button aw-button--icon" to="/boards">
                {getCopy('setup.manageBoards')}
              </Link>
            </div>
            <div className="aw-board-list">
              {visibleBoards.map((entry) => (
                <button
                  className="aw-board-option"
                  data-selected={entry.id === board.id}
                  key={entry.id}
                  type="button"
                  onClick={() => setBoardId(entry.id)}
                >
                  <strong>
                    {entry.name}
                    {entry.source === 'custom' ? (
                      <em className="aw-board-custom-badge">{getCopy('setup.customBoard')}</em>
                    ) : null}
                  </strong>
                  <span>{entry.description}</span>
                  <small>
                    {formatCopy(getCopy('setup.playerCountOption'), { count: entry.playerCount })}
                  </small>
                  <span className="aw-board-option__roles">
                    {entry.roles.map((role) => (
                      <RoleBadge
                        key={role.roleId}
                        label={formatCopy(getCopy('setup.roleCount'), {
                          role: role.name,
                          count: role.count,
                        })}
                        roleId={role.roleId}
                      />
                    ))}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="aw-segmented aw-role-mode">
            <button
              className="aw-segmented__item"
              aria-pressed={roleAssignment === 'random'}
              type="button"
              onClick={() => setRoleAssignment('random')}
            >
              {getCopy('setup.randomRoles')}
            </button>
            <button
              className="aw-segmented__item"
              aria-pressed={roleAssignment === 'manual'}
              type="button"
              onClick={() => setRoleAssignment('manual')}
            >
              {getCopy('setup.manualRoles')}
            </button>
          </div>
        </section>

        <section className="aw-seat-editor aw-panel">
          <div className="aw-panel-heading">
            <h2>{getCopy('setup.seats')}</h2>
            <button className="aw-button aw-button--icon" type="button" onClick={rerollAll}>
              <Shuffle size={18} aria-hidden />
              {getCopy('setup.rerollAll')}
            </button>
          </div>
          <div className="aw-seat-config-list">
            {seats.map((seat) => {
              const character = characters.find((entry) => entry.id === seat.characterId) ?? null
              const duplicated = duplicateNames(seats).has(seat.name.trim())
              return (
                <article
                  className="aw-seat-config"
                  data-duplicate-name={duplicated}
                  key={seat.seat}
                >
                  <strong>{formatCopy(getCopy('setup.seat'), { seat: seat.seat })}</strong>
                  <label className="aw-field">
                    <span className="aw-field__label">{getCopy('setup.playerName')}</span>
                    <div className="aw-inline-field">
                      <input
                        className="aw-input"
                        value={seat.name}
                        onChange={(event) =>
                          setSeats((current) =>
                            current.map((entry) =>
                              entry.seat === seat.seat
                                ? { ...entry, name: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                      <button
                        className="aw-button aw-button--square"
                        title={getCopy('setup.reroll')}
                        type="button"
                        onClick={() => rerollSeat(seat.seat)}
                      >
                        <Shuffle size={18} aria-hidden />
                      </button>
                    </div>
                    {duplicated ? (
                      <small className="aw-field__hint aw-field__hint--error">
                        {getCopy('setup.duplicateName')}
                      </small>
                    ) : null}
                  </label>
                  <label className="aw-field aw-character-select-field">
                    <span className="aw-field__label">{getCopy('setup.character')}</span>
                    <div className="aw-character-select-row">
                      {character ? (
                        <img src={characterPortraitUrl(character.portraitAssetId)} alt="" />
                      ) : null}
                      <GameSelect
                        ariaLabel={getCopy('setup.character')}
                        options={characterOptions}
                        value={seat.characterId ?? 'none'}
                        onChange={(value) => {
                          const selected =
                            value === 'none'
                              ? null
                              : (characters.find((entry) => entry.id === value) ?? null)
                          const used = new Set(
                            seats
                              .filter((entry) => entry.seat !== seat.seat)
                              .map((entry) => entry.name),
                          )
                          setSeats((current) =>
                            current.map((entry) =>
                              entry.seat === seat.seat
                                ? {
                                    ...entry,
                                    characterId: selected?.id ?? null,
                                    name: selected?.name ?? nicknameGenerator.one(used),
                                  }
                                : entry,
                            ),
                          )
                        }}
                      />
                    </div>
                  </label>
                  <label className="aw-field">
                    <span className="aw-field__label">{getCopy('setup.agentProfile')}</span>
                    <GameSelect
                      ariaLabel={getCopy('setup.agentProfile')}
                      value={seat.profileId}
                      options={profileOptions}
                      onChange={(profileId) =>
                        setSeats((current) =>
                          current.map((entry) =>
                            entry.seat === seat.seat ? { ...entry, profileId } : entry,
                          ),
                        )
                      }
                    />
                  </label>
                  {roleAssignment === 'manual' ? (
                    <label className="aw-field">
                      <span className="aw-field__label">{getCopy('setup.role')}</span>
                      <GameSelect
                        ariaLabel={getCopy('setup.role')}
                        value={seat.roleId}
                        options={roleOptions}
                        onChange={(roleId) => swapSeatRole(seat.seat, roleId)}
                      />
                    </label>
                  ) : null}
                </article>
              )
            })}
          </div>
          {error ? <p className="aw-form-message aw-form-message--error">{error}</p> : null}
          <button
            className="aw-button aw-button--primary aw-start-button"
            disabled={
              starting ||
              duplicateNames(seats).size > 0 ||
              seats.some((seat) => !seat.name.trim() || !seat.profileId)
            }
            type="button"
            onClick={() => void startMatch()}
          >
            {starting ? (
              <Shuffle className="aw-spin" size={19} aria-hidden />
            ) : (
              <Play size={19} aria-hidden />
            )}
            {getCopy(starting ? 'setup.starting' : 'setup.start')}
          </button>
        </section>
      </div>
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
