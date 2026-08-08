import { useState } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { TableHead } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type SortDir = "asc" | "desc"
export type SortState = { key: string; dir: SortDir } | null

function compare(a: string | number, b: string | number): number {
  return typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : (a as number) - (b as number)
}

// Client-side sort over an already-fetched page of rows. Cycles asc → desc → unsorted.
export function useSort<T>(items: T[], accessors: Record<string, (row: T) => string | number>) {
  const [sort, setSort] = useState<SortState>(null)

  function toggleSort(key: string) {
    setSort(prev => (!prev || prev.key !== key ? { key, dir: "asc" } : prev.dir === "asc" ? { key, dir: "desc" } : null))
  }

  const sorted = !sort
    ? items
    : [...items].sort((a, b) => {
        const cmp = compare(accessors[sort.key](a), accessors[sort.key](b))
        return sort.dir === "asc" ? cmp : -cmp
      })

  return { sorted, sort, toggleSort }
}

export function SortableTableHead({
  sortKey, sort, onSort, children, className,
}: {
  sortKey: string
  sort: SortState
  onSort: (key: string) => void
  children: React.ReactNode
  className?: string
}) {
  const active = sort?.key === sortKey
  return (
    <TableHead className={cn("cursor-pointer select-none", className)} onClick={() => onSort(sortKey)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {active && (sort!.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </span>
    </TableHead>
  )
}
