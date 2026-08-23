export function FormField({
  label,
  hint,
  wide = false,
  children,
}: {
  readonly label: string
  readonly hint?: string
  readonly wide?: boolean
  readonly children: React.ReactNode
}) {
  return (
    <label className="aw-field" data-wide={wide}>
      <span className="aw-field__label">{label}</span>
      {children}
      {hint ? <small className="aw-field__hint">{hint}</small> : null}
    </label>
  )
}
