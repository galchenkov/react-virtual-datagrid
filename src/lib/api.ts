import type { SaleRow } from '../types'
import { applyCellChange } from './model'
import { generateSales } from './seed'

// ---------------------------------------------------------------------------
// Имитация сервера. Таблица про это ничего не знает: она получает данные
// пропсом и зовёт onSaveCell. Здесь — «HTTP»: задержка, ошибки, хранилище.
// ---------------------------------------------------------------------------

const READ_DELAY = 400
const WRITE_DELAY = 500 // эмуляция задержки записи по HTTP

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

// «база» — живёт, пока открыта страница
let db: SaleRow[] | null = null
let failSaves = false

/** Включить/выключить имитацию ошибки сохранения (для проверки отката). */
export function setFailSaves(value: boolean) {
  failSaves = value
}

export async function fetchSales(opts?: { count?: number }): Promise<SaleRow[]> {
  const count = opts?.count ?? 10_000
  await sleep(READ_DELAY)
  db = generateSales(count)
  return db
}

/**
 * Запись одной ячейки. Сервер сам пересчитывает сумму, поэтому возвращает
 * всю обновлённую запись, а не только принятое значение.
 */
export async function saveCell(rowId: number, column: string, value: unknown): Promise<SaleRow> {
  await sleep(WRITE_DELAY)
  if (failSaves) throw new Error('сервер ответил 500')
  const rows = db ?? (db = generateSales())
  const index = rows.findIndex(row => row.id === rowId)
  if (index < 0) throw new Error('запись не найдена')
  rows[index] = applyCellChange(rows[index], column, value)
  return rows[index]
}
