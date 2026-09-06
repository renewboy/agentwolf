import { getCopy } from '@agentwolf/assets'

export function MatchErrorDetails({ message }: { readonly message: string }) {
  return (
    <div className="aw-match-error">
      <p role="alert">{getCopy('tableDesign.actionFailed')}</p>
      <details>
        <summary>{getCopy('tableDesign.errorDetails')}</summary>
        <pre>{message}</pre>
      </details>
    </div>
  )
}
