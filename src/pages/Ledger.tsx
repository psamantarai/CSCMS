import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, formatDate, formatTime, fromPaise } from "../lib/format"
import { TableRowState } from "../components/QueryState"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { cn } from "@/lib/utils"

type Account = { id: number; name: string }

type LedgerEntry = {
  id: number
  business_date: string
  account_id: number
  amount_paise: number
  entry_type: string
  description: string | null
  created_at: string
  running_balance: number
}

const typeLabel: Record<string, string> = {
  service_income: "Service Income",
  commission: "Commission",
  expense: "Expense",
  transfer: "Transfer",
  customer_payment: "Customer Payment",
  adjustment: "Adjustment",
  opening_balance: "Opening Balance",
  reversal: "Reversal",
}

const typeClass: Record<string, string> = {
  service_income: "bg-success/15 text-success",
  commission: "bg-ring/15 text-ring",
  expense: "bg-destructive/15 text-destructive",
  transfer: "bg-purple-500/15 text-purple-600",
}

const columns = ["Entry", "Date", "Time", "Description", "Type", "Account", "Debit", "Credit", "Running Balance"]

const PAGE_SIZE = 50

export default function Ledger() {
  const [businessDate, setBusinessDate] = useState("")
  const [accountId, setAccountId] = useState("")
  const [entryType, setEntryType] = useState("")
  const [offset, setOffset] = useState(0)

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.get<Account[]>("/accounts"),
  })
  const accountName = (id: number) => accounts.find(a => a.id === id)?.name ?? `Account #${id}`

  const filters: Record<string, string | number> = { limit: PAGE_SIZE, offset }
  if (businessDate) filters.business_date = businessDate
  if (accountId) filters.account_id = accountId
  if (entryType) filters.entry_type = entryType

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.ledger(filters),
    queryFn: () => {
      const params = new URLSearchParams(filters as Record<string, string>)
      return api.get<{ items: LedgerEntry[]; total: number }>(`/ledger?${params}`)
    },
  })
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const showFigures = !isLoading && !error

  const totalCredit = items.reduce((s, e) => s + (e.amount_paise > 0 ? e.amount_paise : 0), 0)
  const totalDebit = items.reduce((s, e) => s + (e.amount_paise < 0 ? -e.amount_paise : 0), 0)
  const net = totalCredit - totalDebit

  function resetPage() {
    setOffset(0)
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mb-5">
        <h1 className="m-0 text-[22px]">Financial Ledger</h1>
        <p className="mt-1 mb-0 text-[13px] text-muted-foreground">Single source of truth for all financial events</p>
      </div>

      {/* Filters */}
      <Card className="mb-5">
        <CardContent>
          <div className="rs-grid grid grid-cols-[160px_1fr_1fr_auto] items-end gap-2.5">
            <Field>
              <FieldLabel htmlFor="ledger-filter-date">Date</FieldLabel>
              <Input id="ledger-filter-date" type="date" value={businessDate} onChange={e => { setBusinessDate(e.target.value); resetPage() }} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ledger-filter-account">Account</FieldLabel>
              <Select
                items={{ all: "All accounts", ...Object.fromEntries(accounts.map(a => [String(a.id), a.name])) }}
                value={accountId || "all"}
                onValueChange={v => { setAccountId(v === "all" ? "" : (v as string)); resetPage() }}
              >
                <SelectTrigger id="ledger-filter-account" className="w-full">
                  <SelectValue placeholder="All accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accounts</SelectItem>
                  {accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="ledger-filter-type">Type</FieldLabel>
              <Select
                items={{ all: "All types", ...typeLabel }}
                value={entryType || "all"}
                onValueChange={v => { setEntryType(v === "all" ? "" : (v as string)); resetPage() }}
              >
                <SelectTrigger id="ledger-filter-type" className="w-full">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {Object.entries(typeLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Button variant="outline" onClick={() => { setBusinessDate(""); setAccountId(""); setEntryType(""); resetPage() }}>
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Net summary */}
      <div className="rs-grid mb-6 grid grid-cols-3 gap-3.5">
        <Card size="sm" className="bg-success/5">
          <CardContent>
            <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Total Credits (this page)</div>
            <div className="font-mono text-xl font-bold tabular-nums text-success">{showFigures ? fmt(fromPaise(totalCredit)) : "—"}</div>
          </CardContent>
        </Card>
        <Card size="sm" className="bg-destructive/5">
          <CardContent>
            <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Total Debits (this page)</div>
            <div className="font-mono text-xl font-bold tabular-nums text-destructive">{showFigures ? fmt(fromPaise(totalDebit)) : "—"}</div>
          </CardContent>
        </Card>
        <Card size="sm" className={net >= 0 ? "bg-ring/5" : "bg-destructive/5"}>
          <CardContent>
            <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Net (this page)</div>
            <div className={cn("font-mono text-xl font-bold tabular-nums", net >= 0 ? "text-ring" : "text-destructive")}>
              {showFigures ? `${net >= 0 ? "+" : "-"}${fmt(fromPaise(Math.abs(net)))}` : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ledger table */}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(h => <TableHead key={h}>{h}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRowState isLoading={isLoading} error={error} colSpan={columns.length} />
            {showFigures && items.map(e => {
              const debit = e.amount_paise < 0 ? -e.amount_paise : 0
              const credit = e.amount_paise > 0 ? e.amount_paise : 0
              return (
                <TableRow key={e.id}>
                  <TableCell className="font-mono font-semibold text-ring">#{e.id}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(e.business_date)}</TableCell>
                  <TableCell className="text-muted-foreground/70">{formatTime(e.created_at)}</TableCell>
                  <TableCell>{e.description || "—"}</TableCell>
                  <TableCell>
                    <Badge className={typeClass[e.entry_type] ?? "bg-muted text-muted-foreground"}>{typeLabel[e.entry_type] ?? e.entry_type}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{accountName(e.account_id)}</TableCell>
                  <TableCell className={cn("font-mono tabular-nums", debit > 0 ? "text-destructive" : "text-muted-foreground")}>
                    {debit > 0 ? fmt(fromPaise(debit)) : "—"}
                  </TableCell>
                  <TableCell className={cn("font-mono tabular-nums", credit > 0 ? "text-success" : "text-muted-foreground")}>
                    {credit > 0 ? fmt(fromPaise(credit)) : "—"}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">{fmt(fromPaise(e.running_balance))}</TableCell>
                </TableRow>
              )
            })}
            {showFigures && items.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length}>
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>No ledger entries</EmptyTitle>
                      <EmptyDescription>No ledger entries match these filters.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
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
