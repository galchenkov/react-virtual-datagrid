export function Spinner() {
  return (
    <div className="spinnerWrap">
      <div className="lds-dual-ring" />
      <span>Загружаем 10 000 записей…</span>
    </div>
  )
}
