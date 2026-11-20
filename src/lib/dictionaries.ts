import type { Status } from '../types'

// Справочники. Настоящий справочник приходит с сервера — здесь имитация запроса.
export const CITIES = [
  'Москва',
  'Санкт-Петербург',
  'Казань',
  'Новосибирск',
  'Екатеринбург',
  'Нижний Новгород',
  'Самара',
  'Омск',
  'Ростов-на-Дону',
  'Уфа',
  'Краснодар',
  'Воронеж',
  'Пермь',
  'Волгоград',
  'Красноярск',
]

export const CATEGORIES = ['Электроника', 'Одежда', 'Продукты', 'Книги', 'Спорт', 'Игрушки', 'Косметика', 'Мебель']

export const STATUSES: Status[] = ['новый', 'в работе', 'отправлен', 'отменён']

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

/** Имитация запроса за справочником городов. */
export async function fetchCities(): Promise<string[]> {
  await sleep(300)
  return CITIES
}
