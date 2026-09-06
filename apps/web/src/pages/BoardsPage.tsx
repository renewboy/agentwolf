import { GameIcon } from '../components/GameIcon.js'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import {
  CustomBoardInputSchema,
  type AgentProfile,
  type BoardSummary,
  type CharacterCard,
  type RoleId,
  type RoleSummary,
} from '@agentwolf/contracts'
import { api } from '../api.js'
import { ErrorState, LoadingState } from '../components/AsyncState.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { CatalogPanelSwitch, type CatalogPanel } from '../components/catalog/CatalogPanelSwitch.js'
import { BoardEditor, type BoardDraft } from '../components/catalog/BoardEditor.js'
import { BoardOverview } from '../components/catalog/BoardOverview.js'

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
  const [editing, setEditing] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<CatalogPanel>('list')

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

  const cardCount = useMemo(
    () => Object.values(draft?.roles ?? {}).reduce((total, count) => total + count, 0),
    [draft?.roles],
  )
  const playerCount = cardCount - (draft?.reserveCount ?? 0)
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
    setMobilePanel('detail')
    setNotice(null)
    setError(null)
    setEditing(false)
    setDraft(boardToDraft(board, board.editable))
  }

  const createEmpty = (): void => {
    setMobilePanel('detail')
    if (!roles) return
    setNotice(null)
    setError(null)
    setEditing(true)
    setDraft({
      id: null,
      name: '',
      description: getCopy('boardManagement.emptyDescription'),
      roles: Object.fromEntries(roles.map((role) => [role.id, 0])),
      reserveCount: 0,
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
    setEditing(true)
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
    const requiredReserveCount = roles?.find((role) => role.id === roleId)?.requiredReserveCount
    const nextReserveCount =
      next > 0 && requiredReserveCount !== undefined ? requiredReserveCount : draft.reserveCount
    const nextPlayerCount =
      Object.values(nextRoles).reduce((total, count) => total + count, 0) - nextReserveCount
    setDraft({
      ...draft,
      roles: nextRoles,
      reserveCount: nextReserveCount,
      characters: Array.from(
        { length: Math.max(0, nextPlayerCount) },
        (_, index) => draft.characters[index] ?? null,
      ),
      agentProfiles: Array.from(
        { length: Math.max(0, nextPlayerCount) },
        (_, index) => draft.agentProfiles[index] ?? null,
      ),
    })
  }

  const updateReserveCount = (delta: number): void => {
    if (!draft?.editable) return
    const reserveCount = Math.max(0, Math.min(2, draft.reserveCount + delta))
    const nextPlayerCount = cardCount - reserveCount
    setDraft({
      ...draft,
      reserveCount,
      characters: Array.from(
        { length: Math.max(0, nextPlayerCount) },
        (_, index) => draft.characters[index] ?? null,
      ),
      agentProfiles: Array.from(
        { length: Math.max(0, nextPlayerCount) },
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
        reserveCount: draft.reserveCount,
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
      setEditing(false)
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
      setEditing(false)
      setDeleteOpen(false)
      setMobilePanel('list')
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

  const selectedBoard = boards.find((board) => board.id === draft.id)
  const cancelEdit = (): void => {
    const board = selectedBoard ?? boards[0]!
    setDraft(boardToDraft(board, board.editable))
    setEditing(false)
    setError(null)
  }

  return (
    <main className="aw-page aw-workspace-page aw-boards-page">
      <div className="aw-page-heading">
        <h1>{getCopy('boardManagement.title')}</h1>
        <p>{getCopy('boardManagement.subtitle')}</p>
      </div>
      <CatalogPanelSwitch
        panel={mobilePanel}
        listLabel={getCopy('configDesign.catalog.boardList')}
        detailLabel={getCopy('configDesign.catalog.boardDetail')}
        onChange={setMobilePanel}
      />
      <div className="aw-catalog-layout aw-board-management" data-panel={mobilePanel}>
        <aside className="aw-catalog-sidebar aw-panel">
          <div className="aw-panel-heading">
            <h2>{getCopy('configDesign.catalog.boards')}</h2>
            <button className="aw-button aw-button--icon" type="button" onClick={createEmpty}>
              <GameIcon name="plus" size={18} />
              {getCopy('boardManagement.create')}
            </button>
          </div>
          <div className="aw-board-directory">
            {boards.map((board) => (
              <button
                className="aw-board-management__item aw-choice"
                data-selected={draft.id === board.id}
                aria-pressed={draft.id === board.id}
                key={board.id}
                type="button"
                onClick={() => selectBoard(board)}
              >
                <GameIcon name="cards" size={22} />
                <span>
                  <strong className="aw-choice__label">{board.name}</strong>
                  <small className="aw-choice__meta">
                    {getCopy(
                      board.source === 'built-in'
                        ? 'boardManagement.builtIn'
                        : 'boardManagement.custom',
                    )}{' '}
                    ·{' '}
                    {formatCopy(getCopy('boardManagement.playerCount'), {
                      count: board.playerCount,
                    })}
                    {board.reserveCount > 0
                      ? ` · ${formatCopy(getCopy('boardManagement.reserveCount'), { count: board.reserveCount })}`
                      : ''}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="aw-catalog-detail aw-panel">
          {!editing && selectedBoard ? (
            <>
              <BoardOverview
                board={selectedBoard}
                characters={characters}
                profiles={profiles}
                busy={busy}
                onEdit={() => setEditing(true)}
                onClone={cloneCurrent}
                onDelete={() => setDeleteOpen(true)}
              />
              {error ? <p className="aw-form-message aw-form-message--error">{error}</p> : null}
              {notice ? <p className="aw-form-message aw-form-message--success">{notice}</p> : null}
            </>
          ) : (
            <BoardEditor
              draft={draft}
              roles={roles}
              characters={characters}
              profileOptions={profileOptions}
              characterOptions={characterOptions}
              cardCount={cardCount}
              playerCount={playerCount}
              busy={busy}
              error={error}
              notice={notice}
              onChange={setDraft}
              onRoleChange={updateRole}
              onReserveChange={updateReserveCount}
              onCancel={cancelEdit}
              onSave={() => void save()}
              onDelete={() => setDeleteOpen(true)}
            />
          )}
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
    id: board.id,
    name: board.name,
    description: board.description,
    roles: Object.fromEntries(board.roles.map((role) => [role.roleId, role.count])),
    reserveCount: board.reserveCount ?? 0,
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
