export type Status = 'новый' | 'в работе' | 'отправлен' | 'отменён'

export interface SaleRow {
  id: number
  customer: string
  city: string
  category: string
  quantity: number
  price: number
  discount: number // %
  total: number // считается из quantity, price и discount, руками не правится
  status: Status
  dateISO: string // дата, YYYY-MM-DD
  createdAt: string // дата и время, YYYY-MM-DDTHH:mm
  // нормализованные заранее поля для поиска
  customerLC: string
  cityLC: string
  categoryLC: string
  statusLC: string
}
