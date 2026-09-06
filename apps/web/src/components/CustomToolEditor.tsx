import { GameIcon } from './GameIcon.js'
import { getCopy } from '@agentwolf/assets'
import { useId } from 'react'
import { FormField } from './FormField.js'
import { ModalDialog } from './ModalDialog.js'

export interface ToolDraft {
  readonly name: string
  readonly command: string
  readonly args: string
  readonly environment: string
  readonly initialMode: string
  readonly modelConfigKey: string
}

export const emptyToolDraft: ToolDraft = {
  name: '',
  command: '',
  args: '',
  environment: '{}',
  initialMode: '',
  modelConfigKey: 'model',
}

export function CustomToolEditor({
  draft,
  busy,
  error = null,
  onChange,
  onClose,
  onSave,
}: {
  readonly draft: ToolDraft
  readonly busy: boolean
  readonly error?: string | null
  readonly onChange: (draft: ToolDraft) => void
  readonly onClose: () => void
  readonly onSave: () => void
}) {
  const titleId = useId()
  return (
    <ModalDialog
      open
      busy={busy}
      className="aw-tool-editor aw-dialog"
      labelledBy={titleId}
      onClose={onClose}
    >
      <div className="aw-panel-heading">
        <h2 id={titleId}>{getCopy('configDesign.agents.connectionTitle')}</h2>
        <button
          className="aw-button aw-button--icon"
          data-dialog-action
          disabled={busy}
          type="button"
          onClick={onClose}
        >
          <GameIcon name="close" size={18} />
          {getCopy('common.close')}
        </button>
      </div>
      <p className="aw-catalog-note">{getCopy('configDesign.agents.toolHint')}</p>
      <div className="aw-editor-grid">
        <FormField label={getCopy('agentFields.toolName')}>
          <input
            className="aw-input"
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
          />
        </FormField>
        <FormField label={getCopy('agentFields.command')}>
          <input
            className="aw-input"
            value={draft.command}
            onChange={(event) => onChange({ ...draft, command: event.target.value })}
          />
        </FormField>
        <FormField
          label={getCopy('agentFields.arguments')}
          hint={getCopy('agentFields.argumentsHint')}
        >
          <textarea
            className="aw-textarea aw-code-input"
            value={draft.args}
            onChange={(event) => onChange({ ...draft, args: event.target.value })}
          />
        </FormField>
        <FormField
          label={getCopy('agentFields.environment')}
          hint={getCopy('agentFields.environmentHint')}
        >
          <textarea
            className="aw-textarea aw-code-input"
            value={draft.environment}
            onChange={(event) => onChange({ ...draft, environment: event.target.value })}
          />
        </FormField>
        <FormField label={getCopy('agentFields.mode')}>
          <input
            className="aw-input"
            value={draft.initialMode}
            onChange={(event) => onChange({ ...draft, initialMode: event.target.value })}
          />
        </FormField>
        <FormField label={getCopy('agentFields.modelConfigKey')}>
          <input
            className="aw-input"
            value={draft.modelConfigKey}
            onChange={(event) => onChange({ ...draft, modelConfigKey: event.target.value })}
          />
        </FormField>
      </div>
      {error ? (
        <p className="aw-form-message aw-form-message--error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="aw-button aw-button--primary"
        disabled={busy}
        data-dialog-action
        type="button"
        onClick={onSave}
      >
        {getCopy('agentFields.saveTool')}
      </button>
    </ModalDialog>
  )
}
