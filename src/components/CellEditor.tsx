import React from 'react'
import type { ColumnConfig } from '../lib/model'

interface Props {
  col: ColumnConfig
  draft: string
  invalid: boolean
  onChange: (value: string) => void
  onCommit: (value?: string) => void
  onBlur: () => void
  onCancel: () => void
}

/**
 * Редактор одной ячейки по типу колонки: строка, число, дата, дата-время,
 * статус (список) и справочник (значения подгружаются и предлагаются в подсказке).
 */
export function CellEditor({ col, draft, invalid, onChange, onCommit, onBlur, onCancel }: Props) {
  const [options, setOptions] = React.useState<string[]>(col.options ?? [])
  const inputRef = React.useRef<HTMLInputElement & HTMLSelectElement>(null)

  // справочник запрашивается при открытии редактора, один раз на колонку
  React.useEffect(() => {
    if (col.editor !== 'lookup' || !col.lookup) return
    let alive = true
    col.lookup().then(list => {
      if (alive) setOptions(list)
    })
    return () => {
      alive = false
    }
  }, [col])

  React.useEffect(() => {
    const el = inputRef.current
    el?.focus()
    if (el instanceof HTMLInputElement) el.select()
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation() // стрелки и Enter не должны двигать выделение таблицы
    if (e.key === 'Enter') {
      e.preventDefault()
      onCommit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      onCommit()
    }
  }

  const common = {
    className: invalid ? 'cellEditor invalid' : 'cellEditor',
    // цифры в колонке справа — и в редакторе тоже
    style: { textAlign: col.align === 'right' ? ('right' as const) : ('left' as const) },
    onKeyDown,
    onBlur,
  }

  if (col.editor === 'status') {
    return (
      <select
        {...common}
        ref={inputRef}
        value={draft}
        onChange={e => onCommit(e.target.value)}
      >
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }

  const listId = `lookup-${col.key}`
  const type = col.editor === 'date' ? 'date' : col.editor === 'datetime' ? 'datetime-local' : col.editor === 'number' ? 'number' : 'text'

  return (
    <>
      <input
        {...common}
        ref={inputRef}
        type={type}
        value={draft}
        list={col.editor === 'lookup' ? listId : undefined}
        min={col.min}
        max={col.max}
        step={col.step}
        autoComplete="off"
        onChange={e => onChange(e.target.value)}
      />
      {col.editor === 'lookup' && (
        <datalist id={listId}>
          {options.map(option => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </>
  )
}
