import { Copy, FloppyDisk, Minus, Plus, SquaresFour, Trash } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import {
  CustomBoardInputSchema,
  type AgentProfile,
  type AgentProfileId,
  type BoardId,
  type BoardSummary,
  type BoardVictory,
  type CharacterCard,
  type CharacterId,
  type RoleId,
  type RoleSummary,
} from '@agentwolf/contracts'
import { api } from '../api.js'
import { ErrorState, LoadingState } from '../components/AsyncState.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { FormField } from '../components/FormField.js'
import { RoleBadge } from '../components/RoleBadge.js'
import { GameSelect } from '../components/GameSelect.js'
import { characterPortraitUrl } from '../character-portraits.js'

interface BoardDraft {
  readonly id: BoardId | null
  readonly name: string
  readonly description: string
  readonly roles: Readonly<Record<string, number>>
  readonly characters: readonly (CharacterId | null)[]
  readonly agentProfiles: readonly (AgentProfileId | null)[]
  readonly sheriff: boolean
  readonly victory: BoardVictory
  readonly editable: boolean
}

const boardSeats = Array.from({ length: 24 }, (_, index) => index + 1)

export function BoardsPage() {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null)
  const [roles, setRoles] = useState<RoleSummary[] | null>(null)
  const [characters, setCharacters] = useState<CharacterCard[] | null>(null)
  const [profiles, setProfiles] = useState<AgentProfile[] | null>(null)
  const [draft, setDraft] = useState<BoardDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [nextBoards, nextRoles, nextCharacters, nextProfiles] = await Promise.all([
        api.listBoards(),
        api.listRoles(),
        api.listCharacters(),
        api.listProfiles(),
      ])
      setBoards(nextBoards)
      setRoles(nextRoles)
      setCharacters(nextCharacters)
      setProfiles(nextProfiles)
      setDraft((current) => current ?? boardToDraft(nextBoards[0]!, false))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])
  useEffect(() => void load(), [load])

  const playerCount = useMemo(
    () => Object.values(draft?.roles ?? {}).reduce((total, count) => total + count, 0),
    [draft?.roles],
  )
  const characterOptions = useMemo(
    () => [
      { value: 'none' as const, label: getCopy('setup.noCharacter') },
      ...(characters ?? []).map((character) => ({
        value: character.id,
        label: `${character.name} · ${character.universe}`,
      })),
    ],
    [characters],
  )
  const profileOptions = useMemo(
    () => [
      { value: 'none' as const, label: getCopy('boardManagement.noDefaultAgent') },
      ...(profiles ?? []).map((profile) => ({
        value: profile.id,
        label: formatCopy(getCopy('setup.profileOption'), {
          name: profile.name,
          model: profile.model,
          reasoning: profile.reasoningEffort ?? getCopy('agentFields.reasoningDefault'),
        }),
      })),
    ],
    [profiles],
  )

  const selectBoard = (board: BoardSummary): void => {
    setNotice(null)
    setDraft(boardToDraft(board, board.editable))
  }

  const createEmpty = (): void => {
    if (!roles) return
    setNotice(null)
    setDraft({
      id: null,
      name: '',
      description: getCopy('boardManagement.emptyDescription'),
      roles: Object.fromEntries(roles.map((role) => [role.id, 0])),
      characters: [],
      agentProfiles: [],
      sheriff: false,
      victory: 'slaughter-all',
      editable: true,
    })
  }

  const cloneCurrent = (): void => {
    if (!draft) return
    setNotice(null)
    setDraft({
      ...draft,
      id: null,
      name: `${draft.name} · ${getCopy('boardManagement.custom')}`,
      editable: true,
    })
  }

  const updateRole = (roleId: RoleId, delta: number): void => {
    if (!draft?.editable) return
    const next = Math.max(0, Math.min(24, (draft.roles[roleId] ?? 0) + delta))
    const nextRoles = { ...draft.roles, [roleId]: next }
    const nextPlayerCount = Object.values(nextRoles).reduce((total, count) => total + count, 0)
    setDraft({
      ...draft,
      roles: nextRoles,
      characters: Array.from(
        { length: nextPlayerCount },
        (_, index) => draft.characters[index] ?? null,
      ),
      agentProfiles: Array.from(
        { length: nextPlayerCount },
        (_, index) => draft.agentProfiles[index] ?? null,
      ),
    })
  }

  const save = async (): Promise<void> => {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      const input = CustomBoardInputSchema.parse({
        name: draft.name,
        description: draft.description,
        roles: Object.entries(draft.roles)
          .filter((entry) => entry[1] > 0)
          .map(([roleId, count]) => ({ roleId, count })),
        characters: draft.characters.map((characterId, index) => ({
          seat: index + 1,
          characterId,
        })),
        agentProfiles: draft.agentProfiles.map((profileId, index) => ({
          seat: index + 1,
          profileId,
        })),
        sheriff: draft.sheriff,
        victory: draft.victory,
      })
      const saved = draft.id ? await api.updateBoard(draft.id, input) : await api.createBoard(input)
      await load()
      setDraft(boardToDraft(saved, true))
      setNotice(getCopy('boardManagement.saved'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const deleteBoard = async (): Promise<void> => {
    if (!draft?.id || !draft.editable) return
    setBusy(true)
    setError(null)
    try {
      await api.deleteBoard(draft.id)
      const nextBoards = await api.listBoards()
      setBoards(nextBoards)
      setDraft(boardToDraft(nextBoards[0]!, false))
      setDeleteOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  if (error && (!boards || !roles || !characters || !profiles)) {
    return <ErrorState message={error} retry={() => void load()} />
  }
  if (!boards || !roles || !characters || !profiles || !draft) return <LoadingState />

  return (
    <main className="aw-page">
      <div className="aw-page-heading">
        <h1>{getCopy('boardManagement.title')}</h1>
        <p>{getCopy('boardManagement.subtitle')}</p>
      </div>
      <div className="aw-settings-layout aw-board-management">
        <aside className="aw-agent-list aw-panel">
          <div className="aw-panel-heading">
            <h2>{getCopy('boardManagement.title')}</h2>
            <button className="aw-button aw-button--icon" type="button" onClick={createEmpty}>
              <Plus size={18} aria-hidden />
              {getCopy('boardManagement.create')}
            </button>
          </div>
          <div className="aw-profile-list">
            {boards.map((board) => (
              <button
                className="aw-profile-item aw-board-management__item"
                data-selected={draft.id === board.id}
                key={board.id}
                type="button"
                onClick={() => selectBoard(board)}
              >
                <SquaresFour size={22} aria-hidden />
                <span>
                  <strong>{board.name}</strong>
                  <small>
                    {getCopy(
                      board.source === 'built-in'
                        ? 'boardManagement.builtIn'
                        : 'boardManagement.custom',
                    )}{' '}
                    ·{' '}
                    {formatCopy(getCopy('boardManagement.playerCount'), {
                      count: board.playerCount,
                    })}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="aw-agent-editor aw-panel">
          {!draft.editable ? (
            <p className="aw-form-message">{getCopy('boardManagement.readOnly')}</p>
          ) : null}
          <div className="aw-editor-grid">
            <FormField label={getCopy('boardManagement.name')}>
              <input
                className="aw-input"
                disabled={!draft.editable}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </FormField>
            <FormField label={getCopy('boardManagement.description')} wide>
              <textarea
                className="aw-textarea"
                disabled={!draft.editable}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </FormField>
          </div>

          <div className="aw-board-role-editor">
            <div className="aw-panel-heading">
              <h3>{getCopy('boardManagement.roles')}</h3>
              <strong>
                {formatCopy(getCopy('boardManagement.playerCount'), { count: playerCount })}
              </strong>
            </div>
            <div className="aw-board-role-grid">
              {roles.map((role) => (
                <div className="aw-board-role-row" key={role.id}>
                  <span>
                    <RoleBadge label={role.name} roleId={role.id} />
                    <small>
                      {getCopy(
                        role.faction === 'werewolf'
                          ? 'boardManagement.werewolfFaction'
                          : 'boardManagement.goodFaction',
                      )}
                    </small>
                  </span>
                  <div className="aw-counter">
                    <button
                      className="aw-button aw-button--square"
                      aria-label={formatCopy(getCopy('boardManagement.decrease'), {
                        role: role.name,
                      })}
                      disabled={!draft.editable || (draft.roles[role.id] ?? 0) === 0}
                      type="button"
                      onClick={() => updateRole(role.id, -1)}
                    >
                      <Minus size={16} aria-hidden />
                    </button>
                    <output>{draft.roles[role.id] ?? 0}</output>
                    <button
                      className="aw-button aw-button--square"
                      aria-label={formatCopy(getCopy('boardManagement.increase'), {
                        role: role.name,
                      })}
                      disabled={!draft.editable || playerCount >= 24}
                      type="button"
                      onClick={() => updateRole(role.id, 1)}
                    >
                      <Plus size={16} aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="aw-board-character-editor">
            <div className="aw-panel-heading">
              <span>
                <h3>{getCopy('boardManagement.characters')}</h3>
                <small>{getCopy('boardManagement.charactersHint')}</small>
              </span>
            </div>
            <div className="aw-board-character-grid">
              {boardSeats.slice(0, draft.characters.length).map((seat) => {
                const characterId = draft.characters[seat - 1] ?? null
                const profileId = draft.agentProfiles[seat - 1] ?? null
                const character = characters.find((entry) => entry.id === characterId) ?? null
                return (
                  <div className="aw-board-character-slot" key={seat}>
                    {character ? (
                      <img src={characterPortraitUrl(character.portraitAssetId)} alt="" />
                    ) : (
                      <span className="aw-board-character-slot__empty" aria-hidden />
                    )}
                    <div className="aw-board-seat-defaults">
                      <GameSelect
                        ariaLabel={formatCopy(getCopy('boardManagement.agentSeat'), { seat })}
                        disabled={!draft.editable}
                        options={profileOptions}
                        value={profileId ?? 'none'}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            agentProfiles: draft.agentProfiles.map((entry, seatIndex) =>
                              seatIndex === seat - 1 ? (value === 'none' ? null : value) : entry,
                            ),
                          })
                        }
                      />
                      <GameSelect
                        ariaLabel={formatCopy(getCopy('boardManagement.characterSeat'), {
                          seat,
                        })}
                        disabled={!draft.editable}
                        options={characterOptions}
                        value={characterId ?? 'none'}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            characters: draft.characters.map((entry, seatIndex) =>
                              seatIndex === seat - 1 ? (value === 'none' ? null : value) : entry,
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="aw-board-rules">
            <button
              className="aw-rule-toggle"
              aria-checked={draft.sheriff}
              disabled={!draft.editable}
              role="switch"
              type="button"
              onClick={() => setDraft({ ...draft, sheriff: !draft.sheriff })}
            >
              <span>
                <strong>{getCopy('boardManagement.sheriff')}</strong>
                <small>{getCopy('boardManagement.sheriffHint')}</small>
              </span>
              <i aria-hidden />
            </button>
            <div>
              <strong>{getCopy('boardManagement.victory')}</strong>
              <div className="aw-segmented aw-board-victory">
                {(['slaughter-all', 'slaughter-edge'] as const).map((victory) => (
                  <button
                    className="aw-segmented__item"
                    aria-pressed={draft.victory === victory}
                    disabled={!draft.editable}
                    key={victory}
                    type="button"
                    onClick={() => setDraft({ ...draft, victory })}
                  >
                    {getCopy(
                      victory === 'slaughter-all'
                        ? 'boardManagement.slaughterAll'
                        : 'boardManagement.slaughterEdge',
                    )}
                  </button>
                ))}
              </div>
              <small>
                {getCopy(
                  draft.victory === 'slaughter-all'
                    ? 'boardManagement.slaughterAllHint'
                    : 'boardManagement.slaughterEdgeHint',
                )}
              </small>
            </div>
          </div>

          {error ? <p className="aw-form-message aw-form-message--error">{error}</p> : null}
          {notice ? <p className="aw-form-message aw-form-message--success">{notice}</p> : null}
          <div className="aw-editor-actions">
            {draft.editable ? (
              <button
                className="aw-button aw-button--primary"
                disabled={busy || !draft.name.trim() || playerCount < 6 || playerCount > 24}
                type="button"
                onClick={() => void save()}
              >
                <FloppyDisk size={18} aria-hidden />
                {getCopy('boardManagement.save')}
              </button>
            ) : (
              <button className="aw-button aw-button--primary" type="button" onClick={cloneCurrent}>
                <Copy size={18} aria-hidden />
                {getCopy('boardManagement.clone')}
              </button>
            )}
            <button
              className="aw-button aw-button--danger"
              disabled={busy || !draft.editable || !draft.id}
              type="button"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash size={18} aria-hidden />
              {getCopy('boardManagement.delete')}
            </button>
          </div>
        </section>
      </div>
      <ConfirmDialog
        busy={busy}
        confirmLabel={getCopy('boardManagement.delete')}
        description={getCopy('boardManagement.deleteConfirm')}
        open={deleteOpen}
        title={getCopy('boardManagement.deleteTitle')}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void deleteBoard()}
      />
    </main>
  )
}

function boardToDraft(board: BoardSummary, editable: boolean): BoardDraft {
  return {
    id: editable ? board.id : board.id,
    name: board.name,
    description: board.description,
    roles: Object.fromEntries(board.roles.map((role) => [role.roleId, role.count])),
    characters: [...board.characters]
      .sort((left, right) => left.seat - right.seat)
      .map(({ characterId }) => characterId),
    agentProfiles: [...board.agentProfiles]
      .sort((left, right) => left.seat - right.seat)
      .map(({ profileId }) => profileId),
    sheriff: board.sheriff,
    victory: board.victory,
    editable,
  }
}
