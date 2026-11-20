import type { SaleRow, Status } from '../types'
import { CATEGORIES, STATUSES, fetchCities } from './dictionaries'

// ---------------------------------------------------------------------------
// Описание колонок: что это за поле, как его показывать и как править.
// Компонент таблицы ничего не знает про конкретные поля — он берёт это отсюда.
// ---------------------------------------------------------------------------

export type EditorKind = 'text' | 'number' | 'date' | 'datetime' | 'status' | 'lookup' | 'readonly'

export type ColumnConfig = {
  key: keyof SaleRow & string
  header: string
  width: number
  align?: 'right'
  editor: EditorKind
  options?: string[] // status: выбор из фиксированного списка
  lookup?: () => Promise<string[]> // справочник: значения приходят с сервера
  min?: number
  max?: number
  step?: number
  integer?: boolean
  badge?: boolean
  format?: (value: any) => string
}

export const money = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const COLUMNS: ColumnConfig[] = [
  { key: 'id', header: '№', width: 70, align: 'right', editor: 'readonly' },
  { key: 'customer', header: 'Клиент', width: 180, editor: 'text' },
  { key: 'city', header: 'Город', width: 150, editor: 'lookup', lookup: fetchCities },
  { key: 'category', header: 'Категория', width: 130, editor: 'status', options: CATEGORIES },
  {
    key: 'quantity',
    header: 'Кол-во',
    width: 80,
    align: 'right',
    editor: 'number',
    min: 1,
    max: 999,
    step: 1,
    integer: true,
  },
  { key: 'price', header: 'Цена, ₽', width: 120, align: 'right', editor: 'number', min: 0, step: 0.01, format: v => money.format(v) },
  { key: 'discount', header: 'Скидка, %', width: 100, align: 'right', editor: 'number', min: 0, max: 90, step: 1, format: v => `${v} %` },
  // считается из количества, цены и скидки — редактировать нельзя
  { key: 'total', header: 'Сумма, ₽', width: 130, align: 'right', editor: 'readonly', format: v => money.format(v) },
  { key: 'status', header: 'Статус', width: 120, editor: 'status', options: STATUSES, badge: true },
  { key: 'dateISO', header: 'Дата', width: 110, editor: 'date' },
  { key: 'createdAt', header: 'Создано', width: 150, editor: 'datetime', format: v => String(v).replace('T', ' ') },
]

export function formatCell(row: SaleRow, col: ColumnConfig): string {
  const value = row[col.key]
  if (col.format) return col.format(value)
  return value === null || value === undefined ? '' : String(value)
}

/** Сырое значение для буфера обмена: числа и даты — как есть, без форматирования. */
export function rawCell(row: SaleRow, col: ColumnConfig): string {
  const value = row[col.key]
  return value === null || value === undefined ? '' : String(value)
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function computeTotal(row: Pick<SaleRow, 'quantity' | 'price' | 'discount'>): number {
  const gross = row.quantity * row.price
  return round2(gross - (gross * row.discount) / 100)
}

/**
 * Единственное место, где меняется запись: значение поля + пересчёт суммы
 * и нормализованных полей поиска. Используется и оптимистичным обновлением, и «сервером».
 */
export function applyCellChange(row: SaleRow, key: string, value: unknown): SaleRow {
  const next: SaleRow = { ...row, [key]: value } as SaleRow
  if (key === 'customer') next.customerLC = String(value).toLowerCase()
  if (key === 'city') next.cityLC = String(value).toLowerCase()
  if (key === 'category') next.categoryLC = String(value).toLowerCase()
  if (key === 'status') next.statusLC = String(value).toLowerCase()
  if (key === 'quantity' || key === 'price' || key === 'discount') next.total = computeTotal(next)
  return next
}

export type ParseResult = { value: unknown; error?: undefined } | { value?: undefined; error: string }

/** Проверка и приведение введённого значения к типу колонки. */
export function parseValue(col: ColumnConfig, draft: string): ParseResult {
  const text = draft.trim()

  switch (col.editor) {
    case 'readonly':
      return { error: 'Эта колонка не редактируется' }

    case 'number': {
      const n = Number(text.replace(',', '.'))
      if (!text || !Number.isFinite(n)) return { error: 'Нужно число' }
      if (col.integer && !Number.isInteger(n)) return { error: 'Нужно целое число' }
      if (col.min !== undefined && n < col.min) return { error: `Не меньше ${col.min}` }
      if (col.max !== undefined && n > col.max) return { error: `Не больше ${col.max}` }
      return { value: n }
    }

    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { error: 'Дата в формате ГГГГ-ММ-ДД' }
      if (Number.isNaN(new Date(text).getTime())) return { error: 'Такой даты нет' }
      return { value: text }

    case 'datetime':
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return { error: 'Дата и время: ГГГГ-ММ-ДД ЧЧ:ММ' }
      return { value: text }

    case 'status':
      if (!col.options?.includes(text)) return { error: 'Выберите значение из списка' }
      return { value: text }

    case 'lookup':
      if (!text) return { error: 'Выберите значение из справочника' }
      return { value: text }

    default:
      if (!text) return { error: 'Пустое значение' }
      return { value: text }
  }
}

/** Значение поля в виде строки для поля ввода. */
export function draftOf(col: ColumnConfig, value: unknown): string {
  if (value === null || value === undefined) return ''
  if (col.editor === 'datetime') return String(value).slice(0, 16)
  return String(value)
}

export type { Status }
