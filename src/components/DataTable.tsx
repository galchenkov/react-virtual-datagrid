import React from 'react'
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef, ColumnSizingState, SortingState } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SaleRow } from '../types'
import { draftOf, formatCell, parseValue, rawCell } from '../lib/model'
import type { ColumnConfig } from '../lib/model'
import { copyText } from '../lib/clipboard'
import { downloadCSV } from '../lib/csv'
import { useDebounce } from '../hooks/useDebounce'
import { Toolbar } from './Toolbar'
import { CellEditor } from './CellEditor'

type Pos = { row: number; col: number }
type Selection = { a: Pos; b: Pos }
type Notice = { kind: 'ok' | 'err'; text: string }

interface Props {
  rows: SaleRow[]
  columns: ColumnConfig[]
  saving: Set<string> // "rowId:column"
  onSaveCell: (rowId: number, column: string, value: unknown) => Promise<void>
  showRowNumbers?: boolean
}

const ROW_HEIGHT = 38
const MIN_COLUMN_WIDTH = 60
const ROWNUM_WIDTH = 56

const statusClass: Record<string, string> = {
  новый: 'badge new',
  'в работе': 'badge work',
  отправлен: 'badge sent',
  отменён: 'badge canceled',
}

/**
 * Таблица ничего не знает ни про источник данных, ни про сохранение:
 * строки приходят пропсом, запись уходит через onSaveCell.
 * Здесь только показ, выделение (прямоугольное — на будущее копирование пачкой),
 * правка одной ячейки, копирование выделенного, ширина, порядок и закрепление колонок.
 */
export function DataTable({ rows, columns, saving, onSaveCell, showRowNumbers = true }: Props) {
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'id', desc: false }])
  const [search, setSearch] = React.useState('')
  const debounced = useDebounce(search, 250)
  const [selection, setSelection] = React.useState<Selection | null>(null)
  const [editing, setEditing] = React.useState<{ pos: Pos; draft: string; error: string | null } | null>(null)
  const [notice, setNotice] = React.useState<Notice | null>(null)
  const [focused, setFocused] = React.useState(false)
  const [scrollLeft, setScrollLeft] = React.useState(0)
  const [viewportWidth, setViewportWidth] = React.useState(0)

  // ширина, порядок и закрепление колонок — состояние вида, а не данных
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({})
  const [columnOrder, setColumnOrder] = React.useState<string[]>(() => columns.map(col => col.key))
  const [pinned, setPinned] = React.useState<string[]>([])
  const [dragCol, setDragCol] = React.useState<number | null>(null)
  const [dropCol, setDropCol] = React.useState<number | null>(null)

  const filtered = React.useMemo(() => {
    const q = debounced.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      r => r.customerLC.includes(q) || r.cityLC.includes(q) || r.categoryLC.includes(q) || r.statusLC.includes(q),
    )
  }, [rows, debounced])

  const configByKey = React.useMemo(() => new Map<string, ColumnConfig>(columns.map(col => [col.key, col])), [columns])

  const tableColumns = React.useMemo<ColumnDef<SaleRow, any>[]>(
    () =>
      columns.map(col => ({
        id: col.key,
        accessorFn: (row: SaleRow) => row[col.key],
        header: col.header,
        size: col.width,
        minSize: MIN_COLUMN_WIDTH,
      })),
    [columns],
  )

  const table = useReactTable({
    data: filtered,
    columns: tableColumns,
    state: { sorting, columnSizing, columnOrder },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    onColumnOrderChange: setColumnOrder,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: row => String(row.id),
  })

  const sortedRows = table.getRowModel().rows

  // колонки в том порядке, в котором их видно: и показ, и выделение, и копирование идут по нему
  const leafColumns = table.getVisibleLeafColumns()
  const visualColumns = React.useMemo(
    () => leafColumns.map(leaf => configByKey.get(leaf.id)).filter((col): col is ColumnConfig => Boolean(col)),
    [leafColumns, configByKey],
  )

  const pinnedSet = React.useMemo(() => new Set(pinned), [pinned])
  const pinnedCount = visualColumns.filter(col => pinnedSet.has(col.key)).length
  const gutterWidth = showRowNumbers ? ROWNUM_WIDTH : 0

  // закреплённые колонки прижаты к левому краю: их left = номер строки + ширины предыдущих закреплённых
  const stickyLeft = React.useMemo(() => {
    const map = new Map<string, number>()
    let left = gutterWidth
    for (const leaf of leafColumns) {
      if (!pinnedSet.has(leaf.id)) break
      map.set(leaf.id, left)
      left += leaf.getSize()
    }
    return map
  }, [leafColumns, pinnedSet, gutterWidth, columnSizing])

  const resizingColumn = table.getState().columnSizingInfo.isResizingColumn

  const scrollRef = React.useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const items = virtualizer.getVirtualItems()
  const paddingTop = items.length > 0 ? items[0].start : 0
  const paddingBottom = items.length > 0 ? items[items.length - 1].end : 0
  const tailPadding = items.length > 0 ? virtualizer.getTotalSize() - paddingBottom : 0

  const rect = React.useMemo(() => {
    if (!selection) return null
    return {
      r0: Math.min(selection.a.row, selection.b.row),
      r1: Math.max(selection.a.row, selection.b.row),
      c0: Math.min(selection.a.col, selection.b.col),
      c1: Math.max(selection.a.col, selection.b.col),
    }
  }, [selection])

  const layoutChanged =
    Object.keys(columnSizing).length > 0 ||
    pinned.length > 0 ||
    columnOrder.join() !== columns.map(col => col.key).join()

  // смена сортировки или фильтра делает старые индексы выделения бессмысленными
  React.useEffect(() => {
    setSelection(null)
    setEditing(null)
  }, [debounced, sorting, rows.length, columnOrder])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [debounced, rows.length])

  // ширина окна таблицы: от неё зависит, есть ли горизонтальная прокрутка
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setViewportWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  // ------------------------------------------- ширина, порядок и закрепление

  const resetLayout = React.useCallback(() => {
    setColumnSizing({})
    setColumnOrder(columns.map(col => col.key))
    setPinned([])
  }, [columns])

  const togglePin = React.useCallback(
    (key: string) => {
      const isPinned = pinned.includes(key)
      const nextPinned = isPinned ? pinned.filter(k => k !== key) : [...pinned, key]
      const rest = columnOrder.filter(k => k !== key && !nextPinned.includes(k))
      // закреплённые всегда идут первыми: откреплённая встаёт в начало незакреплённых
      setPinned(nextPinned)
      setColumnOrder(isPinned ? [...nextPinned, key, ...rest] : [...nextPinned, ...rest])
    },
    [pinned, columnOrder],
  )

  const moveColumn = React.useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0) return
      const order = leafColumns.map(leaf => leaf.id)
      if (!order[from]) return
      // закреплённые переставляются только внутри своей группы, остальные — только после неё
      const groupStart = pinnedSet.has(order[from]) ? 0 : pinnedCount
      const groupEnd = pinnedSet.has(order[from]) ? pinnedCount - 1 : order.length - 1
      const target = Math.max(groupStart, Math.min(groupEnd, to))
      if (target === from) return
      const [moved] = order.splice(from, 1)
      order.splice(target, 0, moved)
      setColumnOrder(order)
    },
    [leafColumns, pinnedCount, pinnedSet],
  )

  // ------------------------------------------------------------------ правка

  // Одна сессия правки сохраняется один раз: blur при уходе из ячейки и клик
  // по другой ячейке могут вызвать commit дважды.
  const editSession = React.useRef(0)
  const committedSession = React.useRef(-1)

  const tryCommit = React.useCallback(
    (raw?: string): boolean => {
      if (!editing) return true
      if (committedSession.current === editSession.current) return true
      const row = sortedRows[editing.pos.row]
      const col = visualColumns[editing.pos.col]
      if (!row || !col) {
        setEditing(null)
        return true
      }
      const draft = raw ?? editing.draft
      const parsed = parseValue(col, draft)
      if (parsed.error) {
        setEditing({ ...editing, draft, error: parsed.error })
        return false
      }
      committedSession.current = editSession.current
      setEditing(null)
      if (row.original[col.key] === parsed.value) return true
      onSaveCell(row.original.id, col.key, parsed.value).catch((e: Error) =>
        setNotice({ kind: 'err', text: `Не сохранилось, значение возвращено: ${e.message}` }),
      )
      return true
    },
    [editing, sortedRows, visualColumns, onSaveCell],
  )

  const beginEdit = React.useCallback(
    (row: number, col: number, initial?: string) => {
      const r = sortedRows[row]
      const c = visualColumns[col]
      if (!r || !c || c.editor === 'readonly') return
      editSession.current += 1
      setSelection({ a: { row, col }, b: { row, col } })
      setEditing({ pos: { row, col }, draft: initial ?? draftOf(c, r.original[c.key]), error: null })
      virtualizer.scrollToIndex(row, { align: 'auto' })
    },
    [sortedRows, visualColumns, virtualizer],
  )

  /** Отмена ввода: Esc, клик мимо или уход фокуса при неверном значении. */
  const cancelEdit = React.useCallback(() => {
    committedSession.current = editSession.current
    setEditing(null)
  }, [])

  /** Уход из редактора: верное значение сохраняем, неверное — просто отменяем. */
  const commitOrCancel = React.useCallback(() => {
    if (!tryCommit()) cancelEdit()
  }, [tryCommit, cancelEdit])

  // -------------------------------------------------------------- выделение

  const dragging = React.useRef(false)
  // протягивание началось с номера строки — тогда тянем целые строки, а не колонку
  const dragWholeRows = React.useRef(false)
  React.useEffect(() => {
    const stop = () => {
      dragging.current = false
      dragWholeRows.current = false
    }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  const lastCol = Math.max(0, visualColumns.length - 1)

  const onCellMouseDown = (e: React.MouseEvent, row: number, col: number) => {
    if (e.button !== 0) return
    if (editing) {
      if (editing.pos.row === row && editing.pos.col === col) return // клик внутри редактора
      // ушли в другую ячейку: верное значение сохраняется, неверное — отменяется
      commitOrCancel()
    }
    scrollRef.current?.focus({ preventScroll: true })
    setSelection(prev => (e.shiftKey && prev ? { ...prev, b: { row, col } } : { a: { row, col }, b: { row, col } }))
    dragging.current = true
    dragWholeRows.current = false
    e.preventDefault() // чтобы не выделялся текст
  }

  /** Клик по номеру строки выделяет строку целиком. */
  const onRowNumMouseDown = (e: React.MouseEvent, row: number) => {
    if (e.button !== 0) return
    if (editing) commitOrCancel()
    scrollRef.current?.focus({ preventScroll: true })
    setSelection(prev =>
      e.shiftKey && prev ? { a: prev.a, b: { row, col: lastCol } } : { a: { row, col: 0 }, b: { row, col: lastCol } },
    )
    dragging.current = true
    dragWholeRows.current = true
    e.preventDefault()
  }

  /** Клик по заголовку номера — выделить всю таблицу. */
  const selectAll = () => {
    if (editing) commitOrCancel()
    scrollRef.current?.focus({ preventScroll: true })
    setSelection({ a: { row: 0, col: 0 }, b: { row: sortedRows.length - 1, col: lastCol } })
  }

  const onCellMouseEnter = (e: React.MouseEvent, row: number, col: number) => {
    // buttons === 0 — кнопку уже отпустили (например, вне окна): протягивание закончилось
    if (!dragging.current || e.buttons === 0) {
      dragging.current = false
      dragWholeRows.current = false
      return
    }
    // начали с номера строки — тянем строки целиком, а не одну колонку
    const nextCol = dragWholeRows.current ? lastCol : col
    setSelection(prev =>
      prev
        ? { a: dragWholeRows.current ? { row: prev.a.row, col: 0 } : prev.a, b: { row, col: nextCol } }
        : { a: { row, col: 0 }, b: { row, col: nextCol } },
    )
  }

  const move = (row: number, col: number, extend: boolean) => {
    const r = Math.max(0, Math.min(sortedRows.length - 1, row))
    const c = Math.max(0, Math.min(lastCol, col))
    setSelection(prev => (extend && prev ? { ...prev, b: { row: r, col: c } } : { a: { row: r, col: c }, b: { row: r, col: c } }))
    virtualizer.scrollToIndex(r, { align: 'auto' })
  }

  // -------------------------------------------------------------- копирование

  const copySelection = React.useCallback(async () => {
    if (!rect) return
    const rowCount = rect.r1 - rect.r0 + 1
    const colCount = rect.c1 - rect.c0 + 1
    // выделить всю таблицу можно, но копировать 100 000 ячеек в буфер — уже перебор
    if (rowCount * colCount > 50_000) {
      setNotice({
        kind: 'err',
        text: `Выбрано ${rowCount.toLocaleString('ru-RU')} × ${colCount} — слишком много для буфера, выделите меньше`,
      })
      return
    }
    const lines: string[] = []
    for (let r = rect.r0; r <= rect.r1; r++) {
      const row = sortedRows[r]
      if (!row) continue
      const cells: string[] = []
      for (let c = rect.c0; c <= rect.c1; c++) {
        const col = visualColumns[c]
        if (col) cells.push(rawCell(row.original, col))
      }
      lines.push(cells.join('\t'))
    }
    try {
      await copyText(lines.join('\n'))
      setNotice({ kind: 'ok', text: `Скопировано: ${rowCount} × ${colCount} → буфер обмена (TSV, как в Excel)` })
    } catch {
      setNotice({ kind: 'err', text: 'Браузер не дал доступ к буферу обмена' })
    }
  }, [rect, sortedRows, visualColumns])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      void copySelection()
      return
    }
    if (!selection) return
    const pos = selection.b
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        move(pos.row + 1, pos.col, e.shiftKey)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(pos.row - 1, pos.col, e.shiftKey)
        break
      case 'ArrowRight':
        e.preventDefault()
        move(pos.row, pos.col + 1, e.shiftKey)
        break
      case 'ArrowLeft':
        e.preventDefault()
        move(pos.row, pos.col - 1, e.shiftKey)
        break
      case 'Enter':
        e.preventDefault()
        beginEdit(pos.row, pos.col)
        break
      case 'Escape':
        e.preventDefault()
        setSelection(null)
        break
      default:
        // печать поверх ячейки сразу открывает редактор
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const col = visualColumns[pos.col]
          if (col && col.editor !== 'readonly') {
            e.preventDefault()
            beginEdit(pos.row, pos.col, e.key)
          }
        }
    }
  }

  // --------------------------------------------------------------- экспорт CSV

  const handleExport = React.useCallback(() => {
    const exportRows = sortedRows.map(r => {
      const out: Record<string, unknown> = {}
      visualColumns.forEach(col => {
        out[col.header] = rawCell(r.original, col)
      })
      return out
    })
    const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
    downloadCSV(`datagrid-export-${ts}`, exportRows)
  }, [sortedRows, visualColumns])

  const selectedCount = rect ? { rows: rect.r1 - rect.r0 + 1, cols: rect.c1 - rect.c0 + 1 } : null
  const columnsWidth = leafColumns.reduce((sum, leaf) => sum + leaf.getSize(), 0)
  const tableWidth = gutterWidth + columnsWidth
  const colSpan = visualColumns.length + (showRowNumbers ? 1 : 0)

  // тень — один общий элемент на границе неподвижной части.
  // Нужна только когда есть что прокручивать и содержимое уже уехало под неё.
  const pinnedWidth = leafColumns.slice(0, pinnedCount).reduce((sum, leaf) => sum + leaf.getSize(), 0)
  const edgeLeft = gutterWidth + pinnedWidth
  const canScrollX = viewportWidth > 0 && tableWidth > viewportWidth
  const showEdgeShadow = canScrollX && scrollLeft > 0 && edgeLeft > 0

  return (
    <div className="tableShell">
      <Toolbar
        search={search}
        onChange={setSearch}
        onReset={() => setSearch('')}
        onExport={handleExport}
        canExport={sortedRows.length > 0}
        onResetLayout={resetLayout}
        layoutChanged={layoutChanged}
      />

      <div className="scrollWrap">
      <div
        className={focused ? 'scroll' : 'scroll unfocused'}
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={e => {
          const left = e.currentTarget.scrollLeft
          if (left !== scrollLeft) setScrollLeft(left)
        }}
        onFocus={() => setFocused(true)}
        onBlur={e => {
          // фокус ушёл внутрь таблицы (в редактор) — это всё ещё фокус на таблице
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
        }}
      >
        <table className="grid" style={{ width: tableWidth }}>
          <colgroup>
            {showRowNumbers && <col style={{ width: ROWNUM_WIDTH }} />}
            {leafColumns.map(leaf => (
              <col key={leaf.id} style={{ width: leaf.getSize() }} />
            ))}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {showRowNumbers && (
                  <th
                    className={pinnedCount === 0 ? 'rowNum frozenEdge' : 'rowNum'}
                    title="Номер строки. Клик — выделить всю таблицу"
                    onClick={selectAll}
                  >
                    {/* без подписи: это не колонка данных, сортировать по ней нельзя */}
                    <span className="visuallyHidden">Номер строки</span>
                  </th>
                )}
                {hg.headers.map((header, index) => {
                  const col = configByKey.get(header.column.id)
                  const sortDir = header.column.getIsSorted()
                  const alignRight = col?.align === 'right'
                  const isPinned = pinnedSet.has(header.column.id)
                  const classes = [
                    alignRight ? 'num' : '',
                    'sortable',
                    isPinned ? 'frozen' : '',
                    isPinned && index === pinnedCount - 1 ? 'frozenEdge' : '',
                    dragCol === index ? 'dragging' : '',
                    dropCol === index && dragCol !== null && dragCol !== index ? 'dropTarget' : '',
                    header.column.getIsResizing() ? 'resizing' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')

                  return (
                    <th
                      key={header.id}
                      className={classes}
                      style={isPinned ? { left: stickyLeft.get(header.column.id) } : undefined}
                      onClick={header.column.getToggleSortingHandler()}
                      draggable={!resizingColumn}
                      onDragStart={e => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', header.column.id)
                        setDragCol(index)
                      }}
                      onDragOver={e => {
                        if (dragCol === null) return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        if (dropCol !== index) setDropCol(index)
                      }}
                      onDragEnd={() => {
                        setDragCol(null)
                        setDropCol(null)
                      }}
                      onDrop={e => {
                        e.preventDefault()
                        if (dragCol !== null) moveColumn(dragCol, index)
                        setDragCol(null)
                        setDropCol(null)
                      }}
                      title={
                        sortDir
                          ? 'Клик — другая сортировка, перетаскивание — порядок колонок'
                          : 'Клик — сортировка, перетаскивание — порядок колонок'
                      }
                    >
                      <span className="thLabel">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                      {/* значок только у колонки, по которой реально отсортировано */}
                      {sortDir && <span className="sortIcon">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      <button
                        type="button"
                        className={isPinned ? 'pinBtn pinned' : 'pinBtn'}
                        title={isPinned ? 'Открепить колонку' : 'Закрепить колонку слева'}
                        aria-pressed={isPinned}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          togglePin(header.column.id)
                        }}
                      >
                        <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                          <path
                            d="M9.8 1.2 14.8 6.2l-1.4 1.4-.9-.9-3.1 3.1.4 2.6-1.2 1.2-2.8-2.8-3 3-.8-.8 3-3-2.8-2.8L3.4 5.7l2.6.4 3.1-3.1-.9-.9z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                      <span
                        className="colResizer"
                        onMouseDown={e => {
                          e.stopPropagation()
                          header.getResizeHandler()(e)
                        }}
                        onTouchStart={header.getResizeHandler()}
                        onClick={e => e.stopPropagation()}
                        onDoubleClick={e => {
                          e.stopPropagation()
                          // двойной клик по краю — вернуть исходную ширину колонки
                          setColumnSizing(prev => {
                            const next = { ...prev }
                            delete next[header.column.id]
                            return next
                          })
                        }}
                        title="Потяните, чтобы изменить ширину. Двойной клик — исходная"
                      />
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td className="empty" colSpan={colSpan}>
                  Ничего не найдено. Попробуйте другой запрос.
                </td>
              </tr>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={colSpan} style={{ height: paddingTop, padding: 0, border: 0 }} />
                  </tr>
                )}
                {items.map(item => {
                  const row = sortedRows[item.index]
                  const rowSelected = rect ? item.index >= rect.r0 && item.index <= rect.r1 : false
                  return (
                    <tr key={row.id} style={{ height: ROW_HEIGHT }}>
                      {showRowNumbers && (
                        <td
                          className={[
                            'rowNum',
                            rowSelected ? 'sel' : '',
                            pinnedCount === 0 ? 'frozenEdge' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onMouseDown={e => onRowNumMouseDown(e, item.index)}
                          onMouseEnter={e => onCellMouseEnter(e, item.index, 0)}
                          title="Клик — выделить строку целиком"
                        >
                          {item.index + 1}
                        </td>
                      )}
                      {visualColumns.map((col, c) => {
                        const isSelected = rect
                          ? item.index >= rect.r0 && item.index <= rect.r1 && c >= rect.c0 && c <= rect.c1
                          : false
                        const isEditing = editing?.pos.row === item.index && editing.pos.col === c
                        const isFocus = selection?.b.row === item.index && selection.b.col === c && !isEditing
                        const isSaving = saving.has(`${row.original.id}:${col.key}`)
                        const isPinned = pinnedSet.has(col.key)
                        const className = [
                          col.align === 'right' ? 'num' : '',
                          isSelected ? 'sel' : '',
                          isFocus ? 'selFocus' : '',
                          isSaving ? 'saving' : '',
                          isEditing ? 'editing' : '',
                          isEditing && editing?.error ? 'invalid' : '',
                          isPinned ? 'frozen' : '',
                          isPinned && c === pinnedCount - 1 ? 'frozenEdge' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')

                        return (
                          <td
                            key={col.key}
                            className={className}
                            style={isPinned ? { left: stickyLeft.get(col.key) } : undefined}
                            onMouseDown={e => onCellMouseDown(e, item.index, c)}
                            onMouseEnter={e => onCellMouseEnter(e, item.index, c)}
                            onDoubleClick={() => beginEdit(item.index, c)}
                            title={isEditing && editing?.error ? editing.error : undefined}
                          >
                            {isEditing && editing ? (
                              <CellEditor
                                col={col}
                                draft={editing.draft}
                                invalid={Boolean(editing.error)}
                                onChange={draft => setEditing({ ...editing, draft, error: null })}
                                onCommit={value => tryCommit(value)}
                                onBlur={commitOrCancel}
                                onCancel={cancelEdit}
                              />
                            ) : col.badge ? (
                              <span className={statusClass[String(row.original[col.key])] ?? 'badge'}>
                                {formatCell(row.original, col)}
                              </span>
                            ) : (
                              formatCell(row.original, col)
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {tailPadding > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={colSpan} style={{ height: tailPadding, padding: 0, border: 0 }} />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
        {showEdgeShadow && <div className="frozenShadow" style={{ left: edgeLeft }} aria-hidden="true" />}
      </div>

      <div className="statusbar">
        <span>
          Найдено: <b>{sortedRows.length.toLocaleString('ru-RU')}</b> из {rows.length.toLocaleString('ru-RU')}
        </span>
        <span>
          {selectedCount ? (
            <>
              Выделено: <b>{selectedCount.rows}</b> × {selectedCount.cols}
              {selectedCount.rows > 1 || selectedCount.cols > 1 ? ' — Ctrl+C скопирует прямоугольник' : ' — двойной клик для правки'}
            </>
          ) : (
            'Выберите ячейку: клик, Shift+клик или протяните мышью'
          )}
        </span>
        <span>
          {pinnedCount > 0 && (
            <>
              Закреплено: <b>{pinnedCount}</b> ·{' '}
            </>
          )}
          В DOM: <b>{items.length}</b> строк
        </span>
        <button className="btn small" onClick={() => void copySelection()} disabled={!selectedCount}>
          Скопировать
        </button>
        {editing?.error ? (
          <span className="notice err">Не сохранится: {editing.error} — Esc отменит ввод</span>
        ) : (
          notice && <span className={notice.kind === 'err' ? 'notice err' : 'notice'}>{notice.text}</span>
        )}
      </div>
    </div>
  )
}
