import type { SaleRow, Status } from '../types'
import { CATEGORIES, CITIES, STATUSES } from './dictionaries'

// Детерминированный генератор: одни и те же строки при каждой загрузке.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const firstNames = ['Анна', 'Иван', 'Мария', 'Пётр', 'Ольга', 'Сергей', 'Елена', 'Дмитрий', 'Наталья', 'Алексей', 'Ирина', 'Павел', 'Татьяна', 'Максим', 'Юлия', 'Артём']
const lastNames = ['Петрова', 'Смирнов', 'Кузнецова', 'Соколов', 'Попова', 'Лебедев', 'Козлова', 'Новиков', 'Морозова', 'Волков', 'Соловьёва', 'Орлов', 'Зайцева', 'Фёдоров', 'Павлова', 'Никитин']

const pick = <T,>(rnd: () => number, list: T[]): T => list[Math.floor(rnd() * list.length)]

export function generateSales(count = 10_000, seed = 42): SaleRow[] {
  const rnd = mulberry32(seed)
  const rows: SaleRow[] = []
  const start = new Date('2023-01-01').getTime()
  const end = new Date('2025-10-01').getTime()

  for (let i = 1; i <= count; i++) {
    const customer = `${pick(rnd, firstNames)} ${pick(rnd, lastNames)}`
    const city = pick(rnd, CITIES)
    const category = pick(rnd, CATEGORIES)
    const status: Status = pick(rnd, STATUSES)
    const quantity = Math.max(1, Math.floor(rnd() * 10))
    const price = Math.round((150 + rnd() * 19_850) * 100) / 100
    const discount = Math.floor(rnd() * 31) // 0…30 %

    const d = new Date(start + rnd() * (end - start))
    const dateISO = d.toISOString().slice(0, 10)
    const createdAt = `${dateISO}T${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`

    const total = Math.round(quantity * price * (1 - discount / 100) * 100) / 100

    rows.push({
      id: i,
      customer,
      city,
      category,
      quantity,
      price,
      discount,
      total,
      status,
      dateISO,
      createdAt,
      customerLC: customer.toLowerCase(),
      cityLC: city.toLowerCase(),
      categoryLC: category.toLowerCase(),
      statusLC: status.toLowerCase(),
    })
  }

  return rows
}
