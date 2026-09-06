export type CatalogPanel = 'list' | 'detail'

export function CatalogPanelSwitch({
  panel,
  listLabel,
  detailLabel,
  onChange,
}: {
  readonly panel: CatalogPanel
  readonly listLabel: string
  readonly detailLabel: string
  readonly onChange: (panel: CatalogPanel) => void
}) {
  return (
    <div className="aw-catalog-panel-switch aw-segmented">
      <button
        className="aw-segmented__item aw-choice"
        type="button"
        aria-pressed={panel === 'list'}
        onClick={() => onChange('list')}
      >
        {listLabel}
      </button>
      <button
        className="aw-segmented__item aw-choice"
        type="button"
        aria-pressed={panel === 'detail'}
        onClick={() => onChange('detail')}
      >
        {detailLabel}
      </button>
    </div>
  )
}
