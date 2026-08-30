import { FloppyDisk, Plus, Pulse, Robot, Trash, Wrench } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import {
  AGENT_PROMPT_TIMEOUT_DEFAULT_MS,
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
import { AgentProfileList } from '../components/AgentProfileList.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { CustomToolEditor, emptyToolDraft, type ToolDraft } from '../components/CustomToolEditor.js'
import { FormField } from '../components/FormField.js'
import { GameSelect } from '../components/GameSelect.js'
import { useProfileOrdering } from '../hooks/useProfileOrdering.js'
import { parseRecordInput } from '../input.js'

interface ProfileDraft {
  readonly id: AgentProfileId | null
  readonly name: string
  readonly toolId: AgentToolId | ''
  readonly model: string
  readonly reasoningEffort: string
  readonly mode: string
  readonly promptTimeoutMs: number
  readonly connection: string
}

const agentDefaultReasoning = '__agentwolf_agent_default__'

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
  const discoverySequence = useRef(0)
  const discoveryCache = useRef(new Map<string, Promise<AgentProbeResult>>())
  const profileOrdering = useProfileOrdering({
    profiles,
    busy,
    onProfilesChange: setProfiles,
    onError: setError,
  })

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
  const reasoningOptions = useMemo(
    () => [
      {
        value: agentDefaultReasoning,
        label: capabilities?.currentReasoningEffort
          ? formatCopy(getCopy('agentFields.reasoningDefaultCurrent'), {
              effort: capabilities.currentReasoningEffort,
            })
          : getCopy('agentFields.reasoningDefault'),
      },
      ...(capabilities?.reasoningEfforts.map((effort) => ({
        value: effort,
        label: effort,
      })) ?? []),
    ],
    [capabilities],
  )

  const discoverCapabilities = useCallback(
    async (toolId: AgentToolId, preferredModel?: string): Promise<void> => {
      const sequence = ++discoverySequence.current
      setDiscovering(true)
      setCapabilities(null)
      setDiscoveryError(null)
      try {
        const discover = async (model?: string): Promise<AgentProbeResult> => {
          const key = `${toolId}\u0000${model ?? ''}`
          const cached = discoveryCache.current.get(key)
          if (cached) return cached
          const pending = api.discoverTool(toolId, model ? { model } : {})
          discoveryCache.current.set(key, pending)
          try {
            const result = await pending
            if (!result.ok) discoveryCache.current.delete(key)
            return result
          } catch (cause) {
            discoveryCache.current.delete(key)
            throw cause
          }
        }
        let result = await discover(preferredModel)
        if (!result.ok && preferredModel) result = await discover()
        if (sequence !== discoverySequence.current) return
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
            : result.currentModel && result.models.includes(result.currentModel)
              ? result.currentModel
              : (result.models[0] ?? '')
          const reasoningEffort = result.reasoningEfforts.includes(current.reasoningEffort)
            ? current.reasoningEffort
            : ''
          return { ...current, model, reasoningEffort }
        })
      } catch (cause) {
        if (sequence !== discoverySequence.current) return
        setCapabilities(null)
        setDiscoveryError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (sequence === discoverySequence.current) setDiscovering(false)
      }
    },
    [],
  )

  useEffect(() => {
    const toolId = draft?.toolId
    if (!toolId) {
      discoverySequence.current += 1
      setCapabilities(null)
      setDiscoveryError(null)
      setDiscovering(false)
    } else {
      const savedProfile = profiles?.find((profile) => profile.id === draft?.id)
      const savedModel = savedProfile?.toolId === toolId ? savedProfile.model : undefined
      void discoverCapabilities(toolId, savedModel)
    }
  }, [discoverCapabilities, draft?.id, draft?.toolId, profiles])

  const selectProfile = (profile: AgentProfile): void => {
    setNotice(null)
    setDraft({
      id: profile.id,
      name: profile.name,
      toolId: profile.toolId,
      model: profile.model,
      reasoningEffort: profile.reasoningEffort ?? '',
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
        ...(draft.reasoningEffort ? { reasoningEffort: draft.reasoningEffort } : {}),
        ...(draft.mode.trim() ? { mode: draft.mode.trim() } : {}),
        promptTimeoutMs: draft.promptTimeoutMs,
        connection: parseRecordInput(draft.connection),
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
          environment: parseRecordInput(toolDraft.environment),
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
            <AgentProfileList
              busy={busy}
              ordering={profileOrdering}
              profiles={profiles}
              selectedProfileId={draft.id}
              onSelect={selectProfile}
            />
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
                    reasoningEffort: '',
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
                onChange={(model) => {
                  setDraft({ ...draft, model, reasoningEffort: '' })
                  if (draft.toolId) void discoverCapabilities(draft.toolId, model)
                }}
              />
            </FormField>
            <FormField
              label={getCopy('agentFields.reasoningEffort')}
              hint={
                discovering
                  ? getCopy('agentFields.reasoningLoading')
                  : capabilities?.reasoningEfforts.length
                    ? formatCopy(getCopy('agentFields.reasoningReady'), {
                        count: capabilities.reasoningEfforts.length,
                      })
                    : getCopy('agentFields.reasoningUnavailable')
              }
            >
              <GameSelect
                ariaLabel={getCopy('agentFields.reasoningEffort')}
                disabled={
                  discovering || !capabilities?.ok || capabilities.reasoningEfforts.length === 0
                }
                value={draft.reasoningEffort || agentDefaultReasoning}
                options={reasoningOptions}
                onChange={(reasoningEffort) =>
                  setDraft({
                    ...draft,
                    reasoningEffort:
                      reasoningEffort === agentDefaultReasoning ? '' : reasoningEffort,
                  })
                }
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
                !capabilities?.models.includes(draft.model) ||
                (Boolean(draft.reasoningEffort) &&
                  !capabilities.reasoningEfforts.includes(draft.reasoningEffort))
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
    reasoningEffort: '',
    mode: '',
    promptTimeoutMs: AGENT_PROMPT_TIMEOUT_DEFAULT_MS,
    connection: '{}',
  }
}
