import { FloppyDisk, Plus, Pulse, Robot, Trash, Wrench } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import {
  AgentProfileInputSchema,
  AgentToolInputSchema,
  type AgentProfile,
  type AgentProfileId,
  type AgentProbeResult,
  type AgentTool,
  type AgentToolId,
} from '@agentwolf/contracts'
import { api } from '../api.js'
import { ErrorState, LoadingState } from '../components/AsyncState.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { CustomToolEditor, emptyToolDraft, type ToolDraft } from '../components/CustomToolEditor.js'
import { FormField } from '../components/FormField.js'
import { GameSelect } from '../components/GameSelect.js'

interface ProfileDraft {
  readonly id: AgentProfileId | null
  readonly name: string
  readonly toolId: AgentToolId | ''
  readonly model: string
  readonly mode: string
  readonly promptTimeoutMs: number
  readonly connection: string
}

export function AgentsPage() {
  const [tools, setTools] = useState<AgentTool[] | null>(null)
  const [profiles, setProfiles] = useState<AgentProfile[] | null>(null)
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [toolDraft, setToolDraft] = useState<ToolDraft>(emptyToolDraft)
  const [showToolEditor, setShowToolEditor] = useState(false)
  const [capabilities, setCapabilities] = useState<AgentProbeResult | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [nextTools, nextProfiles] = await Promise.all([api.listTools(), api.listProfiles()])
      setTools(nextTools)
      setProfiles(nextProfiles)
      setDraft((current) => current ?? createEmptyProfile(nextTools[0]?.id ?? ''))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])
  useEffect(() => void load(), [load])

  const selectedTool = useMemo(
    () => tools?.find((tool) => tool.id === draft?.toolId) ?? null,
    [draft?.toolId, tools],
  )
  const toolOptions = useMemo(
    () => tools?.map((tool) => ({ value: tool.id, label: tool.name })) ?? [],
    [tools],
  )
  const modelOptions = useMemo(
    () => capabilities?.models.map((model) => ({ value: model, label: model })) ?? [],
    [capabilities],
  )

  useEffect(() => {
    const toolId = draft?.toolId
    let active = true
    if (!toolId) {
      setCapabilities(null)
      setDiscoveryError(null)
    } else {
      setDiscovering(true)
      setCapabilities(null)
      setDiscoveryError(null)
      const discover = async (): Promise<void> => {
        try {
          const result = await api.discoverTool(toolId)
          if (!active) return
          setCapabilities(result)
          const failure = result.ok
            ? result.models.length === 0
              ? getCopy('agentFields.modelsUnavailable')
              : null
            : result.message
          setDiscoveryError(failure)
          setDraft((current) => {
            if (!current || current.toolId !== toolId) return current
            const model = result.models.includes(current.model)
              ? current.model
              : (result.models[0] ?? '')
            return { ...current, model }
          })
        } catch (cause) {
          if (!active) return
          setCapabilities(null)
          setDiscoveryError(cause instanceof Error ? cause.message : String(cause))
        } finally {
          if (active) setDiscovering(false)
        }
      }
      void discover()
    }
    return () => {
      active = false
    }
  }, [draft?.id, draft?.toolId])

  const selectProfile = (profile: AgentProfile): void => {
    setNotice(null)
    setDraft({
      id: profile.id,
      name: profile.name,
      toolId: profile.toolId,
      model: profile.model,
      mode: profile.mode ?? '',
      promptTimeoutMs: profile.promptTimeoutMs,
      connection: JSON.stringify(profile.connection, null, 2),
    })
  }

  const saveProfile = async (): Promise<void> => {
    if (!draft || !draft.toolId) return
    setBusy(true)
    setError(null)
    try {
      const input = AgentProfileInputSchema.parse({
        name: draft.name,
        toolId: draft.toolId,
        model: draft.model,
        ...(draft.mode.trim() ? { mode: draft.mode.trim() } : {}),
        promptTimeoutMs: draft.promptTimeoutMs,
        connection: parseRecord(draft.connection),
      })
      const profile = draft.id
        ? await api.updateProfile(draft.id, input)
        : await api.createProfile(input)
      await load()
      selectProfile(profile)
      setNotice(getCopy('common.saveSuccess'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const deleteProfile = async (): Promise<void> => {
    if (!draft?.id) return
    setBusy(true)
    try {
      await api.deleteProfile(draft.id)
      await load()
      setDraft(createEmptyProfile(tools?.[0]?.id ?? ''))
      setDeleteOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const probeProfile = async (): Promise<void> => {
    if (!draft?.id) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await api.probeProfile(draft.id)
      setNotice(
        formatCopy(getCopy('agentFields.probeResult'), {
          status: getCopy(result.ok ? 'agentFields.probeSuccess' : 'agentFields.probeFailure'),
          message: result.message,
        }),
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const saveCustomTool = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await api.createTool(
        AgentToolInputSchema.parse({
          name: toolDraft.name,
          kind: 'custom',
          command: toolDraft.command,
          args: toolDraft.args
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          environment: parseRecord(toolDraft.environment),
          ...(toolDraft.initialMode.trim() ? { initialMode: toolDraft.initialMode.trim() } : {}),
          modelConfigKey: toolDraft.modelConfigKey,
        }),
      )
      setToolDraft(emptyToolDraft)
      setShowToolEditor(false)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  if (error && (!tools || !profiles))
    return <ErrorState message={error} retry={() => void load()} />
  if (!tools || !profiles || !draft) return <LoadingState />

  return (
    <main className="aw-page">
      <div className="aw-page-heading">
        <h1>{getCopy('agents.title')}</h1>
        <p>{getCopy('agents.emptyHint')}</p>
      </div>
      <div className="aw-settings-layout">
        <aside className="aw-agent-list aw-panel">
          <div className="aw-panel-heading">
            <h2>{getCopy('agents.title')}</h2>
            <button
              className="aw-button aw-button--icon"
              type="button"
              onClick={() => setDraft(createEmptyProfile(tools[0]?.id ?? ''))}
            >
              <Plus size={18} aria-hidden />
              {getCopy('agents.create')}
            </button>
          </div>
          {profiles.length === 0 ? (
            <div className="aw-empty-state aw-empty-state--compact">
              <Robot size={32} aria-hidden />
              <strong>{getCopy('agents.empty')}</strong>
              <p>{getCopy('agents.emptyHint')}</p>
            </div>
          ) : (
            <div className="aw-profile-list">
              {profiles.map((profile) => (
                <button
                  className="aw-profile-item"
                  data-selected={draft.id === profile.id}
                  key={profile.id}
                  type="button"
                  onClick={() => selectProfile(profile)}
                >
                  <Robot size={22} aria-hidden />
                  <span>
                    <strong>{profile.name}</strong>
                    <small>{profile.model}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="aw-tool-summary">
            <div className="aw-panel-heading">
              <h3>{getCopy('agentFields.customTools')}</h3>
              <button
                className="aw-button aw-button--icon"
                type="button"
                onClick={() => setShowToolEditor((current) => !current)}
              >
                <Wrench size={17} aria-hidden />
                {getCopy('agentFields.newTool')}
              </button>
            </div>
            {tools.map((tool) => (
              <div className="aw-tool-row" key={tool.id}>
                <span>{tool.name}</span>
                <small>
                  {getCopy(tool.builtIn ? 'agentFields.builtIn' : 'agentFields.custom')}
                </small>
              </div>
            ))}
          </div>
        </aside>

        <section className="aw-agent-editor aw-panel">
          <div className="aw-editor-grid">
            <FormField label={getCopy('agentFields.profileName')}>
              <input
                className="aw-input"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </FormField>
            <FormField label={getCopy('agents.tool')}>
              <GameSelect
                ariaLabel={getCopy('agents.tool')}
                value={draft.toolId}
                options={toolOptions}
                onChange={(toolId) =>
                  setDraft({
                    ...draft,
                    toolId,
                    model: '',
                    mode: '',
                  })
                }
              />
            </FormField>
            <FormField
              label={getCopy('agents.model')}
              hint={
                discovering
                  ? getCopy('agentFields.modelsLoading')
                  : capabilities?.ok
                    ? formatCopy(getCopy('agentFields.modelsReady'), {
                        count: capabilities.models.length,
                      })
                    : getCopy('agentFields.modelsSource')
              }
            >
              <GameSelect
                ariaLabel={getCopy('agents.model')}
                disabled={discovering || !capabilities?.ok || capabilities.models.length === 0}
                value={draft.model}
                options={modelOptions}
                placeholder={getCopy(
                  discovering ? 'agentFields.modelsLoading' : 'agentFields.modelSelect',
                )}
                onChange={(model) => setDraft({ ...draft, model })}
              />
            </FormField>
            <FormField label={getCopy('agentFields.mode')}>
              <input
                className="aw-input"
                placeholder={selectedTool?.initialMode ?? getCopy('agentFields.modePlaceholder')}
                value={draft.mode}
                onChange={(event) => setDraft({ ...draft, mode: event.target.value })}
              />
            </FormField>
            <FormField label={getCopy('agents.timeout')}>
              <input
                className="aw-input"
                min={5_000}
                max={600_000}
                step={1_000}
                type="number"
                value={draft.promptTimeoutMs}
                onChange={(event) =>
                  setDraft({ ...draft, promptTimeoutMs: Number(event.target.value) })
                }
              />
            </FormField>
            <FormField
              label={getCopy('agentFields.connection')}
              hint={getCopy('agentFields.connectionHint')}
              wide
            >
              <textarea
                className="aw-textarea aw-code-input"
                value={draft.connection}
                onChange={(event) => setDraft({ ...draft, connection: event.target.value })}
              />
            </FormField>
          </div>
          {discoveryError ? (
            <p className="aw-form-message aw-form-message--error">
              {formatCopy(getCopy('agentFields.modelsLoadFailed'), {
                message: discoveryError,
              })}
            </p>
          ) : null}
          {error ? <p className="aw-form-message aw-form-message--error">{error}</p> : null}
          {notice ? <p className="aw-form-message aw-form-message--success">{notice}</p> : null}
          <div className="aw-editor-actions">
            <button
              className="aw-button aw-button--primary"
              disabled={
                busy ||
                discovering ||
                Boolean(discoveryError) ||
                !draft.name.trim() ||
                !capabilities?.models.includes(draft.model)
              }
              type="button"
              onClick={() => void saveProfile()}
            >
              <FloppyDisk size={18} aria-hidden />
              {getCopy('agents.save')}
            </button>
            <button
              className="aw-button"
              disabled={busy || !draft.id}
              type="button"
              onClick={() => void probeProfile()}
            >
              <Pulse size={18} aria-hidden />
              {getCopy('agents.probe')}
            </button>
            <button
              className="aw-button aw-button--danger"
              disabled={busy || !draft.id}
              type="button"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash size={18} aria-hidden />
              {getCopy('agents.delete')}
            </button>
          </div>
          <div className="aw-reserved-mode">
            <div>
              <strong>{getCopy('agents.developerMode')}</strong>
              <p>{getCopy('agents.developerModeHint')}</p>
            </div>
            <button className="aw-button" disabled type="button">
              {getCopy('common.notAvailable')}
            </button>
          </div>
        </section>
      </div>

      {showToolEditor ? (
        <CustomToolEditor
          busy={busy}
          draft={toolDraft}
          onChange={setToolDraft}
          onClose={() => setShowToolEditor(false)}
          onSave={() => void saveCustomTool()}
        />
      ) : null}
      <ConfirmDialog
        busy={busy}
        confirmLabel={getCopy('agents.delete')}
        description={getCopy('common.deleteConfirm')}
        open={deleteOpen}
        title={getCopy('common.deleteTitle')}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void deleteProfile()}
      />
    </main>
  )
}

function createEmptyProfile(toolId: AgentToolId | ''): ProfileDraft {
  return {
    id: null,
    name: '',
    toolId,
    model: '',
    mode: '',
    promptTimeoutMs: 180_000,
    connection: '{}',
  }
}

function parseRecord(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(getCopy('errors.jsonObjectRequired'))
  }
  return parsed as Record<string, unknown>
}
