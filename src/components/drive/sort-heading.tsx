import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useState } from 'react'

export type SortKey = 'name' | 'size' | 'status' | 'copies' | 'uploaded'
export type FileSort = { key: SortKey; direction: 'asc' | 'desc' }
export const nameOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function useFileSort() {
  const [sort, setSort] = useState<FileSort>({ key: 'name', direction: 'asc' })
  const toggleSort = (key: SortKey) =>
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  return { sort, toggleSort }
}

export function SortHeading({
  label,
  column,
  sort,
  onSort,
  className = '',
}: {
  label: string
  column: SortKey
  sort: FileSort
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = sort.key === column
  const Icon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`px-4 py-2 font-medium ${className}`}
    >
      <button
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm hover:text-foreground ${active ? 'text-foreground' : ''}`}
        onClick={() => onSort(column)}
        type="button"
      >
        {label}
        <Icon aria-hidden="true" className={active ? '' : 'opacity-40'} size={12} />
      </button>
    </th>
  )
}

/** Legacy cache records contain formatted sizes rather than byte counts. */
export function sizeInBytes(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*(Bytes?|B|Ki?B|Mi?B|Gi?B|Ti?B)$/i.exec(value.trim())
  if (!match) return undefined
  const unit = match[2].toLowerCase()
  const exponent = unit.startsWith('k')
    ? 1
    : unit.startsWith('m')
      ? 2
      : unit.startsWith('g')
        ? 3
        : unit.startsWith('t')
          ? 4
          : 0
  return Number(match[1]) * 1024 ** exponent
}

export function compareValues(a: string | number | undefined, b: string | number | undefined, sort: FileSort) {
  // Missing metadata stays last in either direction.
  if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1
  const difference = typeof a === 'string' && typeof b === 'string' ? nameOrder.compare(a, b) : Number(a) - Number(b)
  return sort.direction === 'asc' ? difference : -difference
}
