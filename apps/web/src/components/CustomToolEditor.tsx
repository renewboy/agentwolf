import { CheckCircle, XCircle } from '@phosphor-icons/react'
import { getCopy } from '@agentwolf/assets'
import { FormField } from './FormField.js'

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
  onChange,
  onClose,
  onSave,
}: {
  readonly draft: ToolDraft
  readonly busy: boolean
  readonly onChange: (draft: ToolDraft) => void
  readonly onClose: () => void
  readonly onSave: () => void
}) {
  return (
    <section className="aw-tool-editor aw-panel">
      <div className="aw-panel-heading">
        <h2>{getCopy('agentFields.newTool')}</h2>
        <button className="aw-button aw-button--icon" type="button" onClick={onClose}>
          <XCircle size={18} aria-hidden />
          {getCopy('common.close')}
        </button>
      </div>
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
      <button
        className="aw-button aw-button--primary"
        disabled={busy}
        type="button"
        onClick={onSave}
      >
        <CheckCircle size={18} aria-hidden />
        {getCopy('agentFields.saveTool')}
      </button>
    </section>
  )
}
