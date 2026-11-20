interface Props {
  search: string
  onChange: (v: string) => void
  onReset: () => void
  onExport: () => void
  canExport: boolean
  onResetLayout: () => void
  layoutChanged: boolean
}

export function Toolbar({ search, onChange, onReset, onExport, canExport, onResetLayout, layoutChanged }: Props) {
  return (
    <div className="toolbar">
      <input
        className="search"
        type="search"
        placeholder="Поиск по клиенту, городу, категории, статусу…"
        value={search}
        onChange={e => onChange(e.target.value)}
        aria-label="Поиск"
      />
      {search && (
        <button onClick={onReset} className="btn">
          Сбросить
        </button>
      )}
      <div className="toolbarSpacer" />
      <button
        onClick={onResetLayout}
        className="btn"
        disabled={!layoutChanged}
        title="Вернуть исходные ширины и порядок колонок"
      >
        Сбросить колонки
      </button>
      <button onClick={onExport} className="btn" disabled={!canExport}>
        Экспорт CSV
      </button>
    </div>
  )
}
