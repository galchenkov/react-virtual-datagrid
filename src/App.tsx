import React from 'react'
import { DataTable } from './components/DataTable'
import { Spinner } from './components/Spinner'
import { setFailSaves } from './lib/api'
import { COLUMNS } from './lib/model'
import { useGridData } from './lib/useGridData'

const sizes = [10_000, 50_000, 100_000]

export default function App() {
  const [count, setCount] = React.useState(10_000)
  const [failSaves, setFail] = React.useState(false)
  const [rowNumbers, setRowNumbers] = React.useState(true)

  const grid = useGridData(count)

  React.useEffect(() => {
    setFailSaves(failSaves)
  }, [failSaves])

  return (
    <div className="page">
      <header className="head">
        <div>
          <h1>Виртуальный датагрид с правкой ячеек</h1>
          <p className="sub">
            React + TanStack Table + TanStack Virtual: 10 000 строк, 11 колонок. Выделение прямоугольником, правка
            одной ячейки, копирование выделенного. Данные и сохранение — вне таблицы.
          </p>
        </div>
        <div className="controls">
          <label className="field">
            Записей:
            <select value={count} onChange={e => setCount(Number(e.target.value))}>
              {sizes.map(n => (
                <option key={n} value={n}>
                  {n.toLocaleString('ru-RU')}
                </option>
              ))}
            </select>
          </label>
          <label className="field check">
            <input type="checkbox" checked={rowNumbers} onChange={e => setRowNumbers(e.target.checked)} />
            Номера строк
          </label>
          <button className="btn" onClick={grid.refetch}>
            Перезагрузить
          </button>
          <button
            className={failSaves ? 'btn danger' : 'btn'}
            onClick={() => setFail(v => !v)}
            title="Следующие сохранения будут падать — видно откат значения"
          >
            {failSaves ? 'Сохранение падает: вкл' : 'Сбой сохранения: выкл'}
          </button>
        </div>
      </header>

      {grid.isLoading && <Spinner />}

      {grid.isError && (
        <div className="errorBox">
          <div className="errorTitle">{grid.error?.message}</div>
          <p>Данные не загрузились — таблица показывает состояние ошибки, а не пустой экран.</p>
          <button className="btn primary" onClick={grid.refetch}>
            Повторить
          </button>
        </div>
      )}

      {!grid.isLoading && !grid.isError && (
        <DataTable
          rows={grid.rows}
          columns={COLUMNS}
          saving={grid.saving}
          onSaveCell={grid.saveCell}
          showRowNumbers={rowNumbers}
        />
      )}

      <div className="legend">
        <div>
          <b>Номер строки</b> слева всегда на экране; клик по нему выделяет строку целиком.
          Колонку можно <b>закрепить</b> кнопкой-закрепкой в заголовке — она останется слева при горизонтальной прокрутке.
        </div>
        <div>
          <b>Ширина колонки</b> — потяните за край заголовка, двойной клик по краю вернёт исходную.{' '}
          <b>Порядок</b> — перетащите заголовок влево или вправо. Кнопка «Сбросить колонки» вернёт всё как было.
        </div>
        <div>
          <b>Клик</b> — выбрать ячейку, <b>Shift+клик</b> или протаскивание мышью — прямоугольник,{' '}
          <b>Ctrl/Cmd+C</b> — скопировать его в буфер (TSV, вставляется в Excel и Google Таблицы).
        </div>
        <div>
          <b>Двойной клик</b>, <b>Enter</b> или просто начните печатать — правка ячейки. <b>Enter</b> сохраняет,{' '}
          <b>Esc</b> отменяет. Стрелки двигают выделение.
        </div>
        <div>
          Типы правки: строка, число, дата, дата-время, статус из списка, город из справочника (значения грузятся при
          открытии). «Сумма» не редактируется — считается из количества, цены и скидки, пересчитывается после
          сохранения.
        </div>
        <div>
          Сохранение — запрос с задержкой 500 мс: значение меняется сразу (оптимистично), при ошибке возвращается
          прежнее.
        </div>
      </div>
    </div>
  )
}
