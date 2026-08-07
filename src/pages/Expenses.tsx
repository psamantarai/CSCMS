import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, formatDate, fromPaise } from "../lib/format"
import { TableRowState } from "../components/QueryState"
import ExpenseForm from "../components/forms/ExpenseForm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"

type Account = { id: number; name: string; is_active: number }

type Expense = {
  id: number
  business_date: string
  category: string
  amount_paise: number
  account_id: number
  note: string | null
}

const columns = ["#", "Category", "Amount", "Date", "Account", "Note", ""]

const PAGE_SIZE = 50

export default function Expenses() {
  const [businessDate, setBusinessDate] = useState("")
  const [category, setCategory] = useState("")
  const [offset, setOffset] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const queryClient = useQueryClient()

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.expenseCategories,
    queryFn: () => api.get<{ categories: string[] }>("/expenses/categories").then(r => r.categories),
  })

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.get<Account[]>("/accounts"),
  })
  const accountName = (id: number) => accounts.find(a => a.id === id)?.name ?? `#${id}`

  const filters: Record<string, string | number> = { limit: PAGE_SIZE, offset }
  if (businessDate) filters.business_date = businessDate
  if (category) filters.category = category

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.expenses(filters),
    queryFn: () => {
      const params = new URLSearchParams(filters as Record<string, string>)
      return api.get<{ items: Expense[]; total: number }>(`/expenses?${params}`)
    },
  })
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const showFigures = !isLoading && !error
  const pageTotal = items.reduce((s, e) => s + e.amount_paise, 0)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["expenses"] })
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts }) // prefix match also covers accountBalance(id)
    queryClient.invalidateQueries({ queryKey: ["dashboard"] })
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/expenses/${id}`),
    onSuccess: invalidate,
  })

  function closeForm() {
    setFormOpen(false)
    setEditingExpense(null)
  }

  function openCreate() {
    setEditingExpense(null)
    setFormOpen(true)
  }

  function openEdit(e: Expense) {
    setEditingExpense(e)
    setFormOpen(true)
  }

  function submitDelete(id: number) {
    if (!window.confirm("Delete this expense? This reverses its ledger entry.")) return
    deleteMutation.mutate(id)
  }

  function resetPage() {
    setOffset(0)
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="m-0 text-[22px]">Expenses</h1>
          <p className="mt-1 mb-0 text-[13px] text-muted-foreground">{showFigures ? `${total} entries` : "—"}</p>
        </div>
        <Button onClick={() => (formOpen ? closeForm() : openCreate())}>{formOpen ? "Cancel" : "+ Record Expense"}</Button>
      </div>

      {formOpen && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>{editingExpense ? "Edit Expense" : "Record Expense"}</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseForm
              key={editingExpense?.id ?? "create"}
              editing={editingExpense ?? undefined}
              onSuccess={closeForm}
              onCancel={closeForm}
            />
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="mb-4">
        <CardContent>
          <div className="rs-grid grid grid-cols-[160px_1fr_auto] items-end gap-2.5">
            <Field>
              <FieldLabel htmlFor="expense-filter-date">Date</FieldLabel>
              <Input id="expense-filter-date" type="date" value={businessDate} onChange={e => { setBusinessDate(e.target.value); resetPage() }} />
            </Field>
            <Field>
              <FieldLabel htmlFor="expense-filter-category">Category</FieldLabel>
              <Select
                items={{ all: "All categories", ...Object.fromEntries(categories.map(c => [c, c])) }}
                value={category || "all"}
                onValueChange={v => { setCategory(v === "all" ? "" : (v as string)); resetPage() }}
              >
                <SelectTrigger id="expense-filter-category" className="w-full">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Button variant="outline" onClick={() => { setBusinessDate(""); setCategory(""); resetPage() }}>
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(h => <TableHead key={h}>{h}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRowState isLoading={isLoading} error={error} colSpan={columns.length} />
            {showFigures && items.map(e => (
              <TableRow key={e.id}>
                <TableCell className="font-mono text-muted-foreground">{e.id}</TableCell>
                <TableCell>
                  <Badge variant="outline">{e.category}</Badge>
                </TableCell>
                <TableCell className="font-mono font-bold tabular-nums text-destructive">{fmt(fromPaise(e.amount_paise))}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(e.business_date)}</TableCell>
                <TableCell className="text-muted-foreground">{accountName(e.account_id)}</TableCell>
                <TableCell className="text-muted-foreground">{e.note}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(e)}>Edit</Button>
                    <Button variant="outline" size="sm" className="text-destructive" onClick={() => submitDelete(e.id)}>Delete</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {showFigures && items.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length}>
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>No expenses</EmptyTitle>
                      <EmptyDescription>No expenses match these filters.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {showFigures && items.length > 0 && (
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={2} className="font-bold">Total (this page)</TableCell>
                <TableCell className="font-mono font-bold tabular-nums text-destructive">{fmt(fromPaise(pageTotal))}</TableCell>
                <TableCell colSpan={4} />
              </TableRow>
            </TableFooter>
          )}
        </Table>
        <div className="flex items-center justify-between border-t px-3.5 py-2.5">
          <span className="text-xs text-muted-foreground">
            {!showFigures ? "—" : total === 0 ? "0 entries" : `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Prev</Button>
            <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
