import React from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SaleRow } from '../types'
import { fetchSales, saveCell } from './api'
import { applyCellChange } from './model'

export type GridData = {
  rows: SaleRow[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
  saving: Set<string> // "rowId:column" — что сейчас летит на сервер
  saveCell: (rowId: number, column: string, value: unknown) => Promise<void>
}

/**
 * Источник данных и сохранение — здесь, вне компонента таблицы.
 * Оптимистичное обновление: значение меняется сразу, при ошибке откатывается.
 */
export function useGridData(count: number): GridData {
  const queryClient = useQueryClient()
  const queryKey = ['sales', count] as const
  const [saving, setSaving] = React.useState<Set<string>>(() => new Set())

  const query = useQuery({
    queryKey,
    queryFn: () => fetchSales({ count }),
    placeholderData: keepPreviousData,
  })

  const save = React.useCallback(
    async (rowId: number, column: string, value: unknown) => {
      const cellKey = `${rowId}:${column}`
      setSaving(prev => new Set(prev).add(cellKey))

      const snapshot = queryClient.getQueryData<SaleRow[]>(queryKey)
      queryClient.setQueryData<SaleRow[]>(queryKey, old =>
        old?.map(row => (row.id === rowId ? applyCellChange(row, column, value) : row)),
      )

      try {
        const updated = await saveCell(rowId, column, value)
        // сервер — источник истины (он же пересчитал сумму)
        queryClient.setQueryData<SaleRow[]>(queryKey, old => old?.map(row => (row.id === rowId ? updated : row)))
      } catch (e) {
        queryClient.setQueryData<SaleRow[]>(queryKey, snapshot)
        throw e
      } finally {
        setSaving(prev => {
          const next = new Set(prev)
          next.delete(cellKey)
          return next
        })
      }
    },
    [queryClient, count],
  )

  return {
    rows: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    refetch: () => void query.refetch(),
    saving,
    saveCell: save,
  }
}
