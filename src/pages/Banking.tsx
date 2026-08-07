import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, formatDate, formatTime, fromPaise, localDateISO } from "../lib/format"
import { TableRowState } from "../components/QueryState"
import BankingEntryForm from "../components/forms/BankingEntryForm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"

type Account = { id: number; name: string; is_active: number }
type TxnType = "withdrawal" | "deposit" | "aeps" | "money_transfer" | "balance_enquiry"

type BankingTxn = {
  id: number
  business_date: string
  customer_id: number | null
  txn_type: TxnType
  principal_paise: number
  commission_paise: number
  settlement_account_id: number
  cash_account_id: number
  remarks: string | null
  created_at: string
}

const typeLabels: Record<TxnType, string> = {
  withdrawal: "Cash Withdrawal",
  deposit: "Cash Deposit",
  aeps: "AEPS Withdrawal",
  money_transfer: "Money Transfer",
  balance_enquiry: "Balance Enquiry",
}

const typeClass: Record<TxnType, string> = {
  withdrawal: "bg-ring/15 text-ring",
  aeps: "bg-ring/15 text-ring",
  money_transfer: "bg-purple-500/15 text-purple-600",
  deposit: "bg-success/15 text-success",
  balance_enquiry: "bg-muted text-muted-foreground",
}

// ARCHITECTURE.md §3: quick-launch cards map 1:1 to the real txn_type enum
// (no "Mini Statement" card — that isn't a banking_transactions type).
const quickLaunch: { type: TxnType; icon: string; desc: string }[] = [
  { type: "aeps", icon: "💳", desc: "Biometric cash" },
  { type: "withdrawal", icon: "🏧", desc: "Cash withdrawal" },
  { type: "money_transfer", icon: "↗", desc: "IMPS / NEFT" },
  { type: "deposit", icon: "↙", desc: "Bank deposit" },
  { type: "balance_enquiry", icon: "🔍", desc: "Account check" },
]

const columns = ["ID", "Date", "Time", "Customer", "Type", "Amount", "Commission", "Settlement Acct", "Cash Acct", "Remarks", ""]

const PAGE_SIZE = 50

export default function Banking() {
  // Defaults to today, matching PLAN 5.4's "today's commission total on the
  // page matches the API" — the commission-summary query below reuses this
  // same filter.
  const [businessDate, setBusinessDate] = useState(localDateISO())
  const [txnTypeFilter, setTxnTypeFilter] = useState<TxnType | "">("")
  const [offset, setOffset] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editingTxn, setEditingTxn] = useState<BankingTxn | null>(null)
  const [initialType, setInitialType] = useState<TxnType | "">("")
  const queryClient = useQueryClient()

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.get<Account[]>("/accounts"),
  })
  const accountName = (id: number) => accounts.find(a => a.id === id)?.name ?? `#${id}`

  const filters: Record<string, string | number> = { limit: PAGE_SIZE, offset }
  if (businessDate) filters.business_date = businessDate
  if (txnTypeFilter) filters.txn_type = txnTypeFilter

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.banking(filters),
    queryFn: () => {
      const params = new URLSearchParams(filters as Record<string, string>)
      return api.get<{ items: BankingTxn[]; total: number }>(`/banking?${params}`)
    },
  })
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const showFigures = !isLoading && !error

  // PLAN 5.3's own endpoint, not a client-side sum — this is what keeps the
  // page's commission tile from ever drifting from the ledger.
  const commissionFilters: Record<string, string | number> = {}
  if (businessDate) commissionFilters.business_date = businessDate
  const { data: commissionSummary } = useQuery({
    queryKey: queryKeys.bankingCommissionSummary(commissionFilters),
    queryFn: () => {
      const params = new URLSearchParams(commissionFilters as Record<string, string>)
      return api.get<{ total_commission_paise: number }>(`/banking/commission-summary?${params}`)
    },
  })

  const pageVolume = items.reduce((s, t) => s + t.principal_paise, 0)
  const aepsCount = items.filter(t => t.txn_type === "aeps" || t.txn_type === "withdrawal").length
  const transferCount = items.filter(t => t.txn_type === "money_transfer").length

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["banking"] })
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts }) // prefix match also covers accountBalance
    queryClient.invalidateQueries({ queryKey: ["dashboard"] })
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/banking/${id}`),
    onSuccess: invalidate,
  })

  function closeForm() {
    setFormOpen(false)
    setEditingTxn(null)
    setInitialType("")
  }

  function openCreate(txnType: TxnType | "" = "") {
    setEditingTxn(null)
    setInitialType(txnType)
    setFormOpen(true)
  }

  function openEdit(t: BankingTxn) {
    setEditingTxn(t)
    setFormOpen(true)
  }

  function submitDelete(id: number) {
    if (!window.confirm("Delete this banking entry? This reverses its ledger entries.")) return
    deleteMutation.mutate(id)
  }

  function resetPage() {
    setOffset(0)
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="m-0 text-[22px]">Banking Services</h1>
          <p className="mt-1 mb-0 text-[13px] text-muted-foreground">AEPS · IMPS · Money Transfer · Deposits</p>
        </div>
        <Button onClick={() => (formOpen ? closeForm() : openCreate())}>{formOpen ? "Cancel" : "+ New Banking Entry"}</Button>
      </div>

      {formOpen && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>{editingTxn ? "Edit Banking Entry" : "New Banking Entry"}</CardTitle>
          </CardHeader>
          <CardContent>
            <BankingEntryForm
              key={editingTxn?.id ?? "create"}
              editing={editingTxn ?? undefined}
              initialTxnType={initialType}
              onSuccess={closeForm}
              onCancel={closeForm}
            />
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="rs-grid mb-6 grid grid-cols-4 gap-3.5">
        <Card size="sm" className="bg-ring/5">
          <CardContent>
            <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Total Volume (this page)</div>
            <div className="font-mono text-xl font-bold tabular-nums text-ring">{showFigures ? fmt(fromPaise(pageVolume)) : "—"}</div>
          </CardContent>
        </Card>
        <Card size="sm" className="bg-success/5">
          <CardContent>
            <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Total Commission</div>
            <div className="font-mono text-xl font-bold tabular-nums text-success">{commissionSummary ? fmt(fromPaise(commissionSummary.total_commission_paise)) : "—"}</div>
          </CardContent>
        </Card>
        <Card size="sm" className="bg-ring/5">
          <CardContent>
            <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">AEPS / Withdrawal Txns</div>
            <div className="font-mono text-xl font-bold tabular-nums text-ring">{showFigures ? String(aepsCount) : "—"}</div>
          </CardContent>
        </Card>
        <Card size="sm" className="bg-purple-500/5">
          <CardContent>
            <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Money Transfers</div>
            <div className="font-mono text-xl font-bold tabular-nums text-purple-600">{showFigures ? String(transferCount) : "—"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Service type cards */}
      <div className="rs-grid mb-6 grid grid-cols-5 gap-3">
        {quickLaunch.map(s => (
          <Card
            key={s.type}
            className="cursor-pointer transition-shadow hover:shadow-md hover:ring-ring/40"
            onClick={() => openCreate(s.type)}
          >
            <CardContent>
              <div className="mb-2 text-[22px]">{s.icon}</div>
              <div className="text-[13px] font-semibold">{typeLabels[s.type]}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{s.desc}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent>
          <div className="rs-grid grid grid-cols-[160px_1fr_auto] items-end gap-2.5">
            <Field>
              <FieldLabel htmlFor="bank-filter-date">Date</FieldLabel>
              <Input id="bank-filter-date" type="date" value={businessDate} onChange={e => { setBusinessDate(e.target.value); resetPage() }} />
            </Field>
            <Field>
              <FieldLabel htmlFor="bank-filter-type">Type</FieldLabel>
              <Select
                items={{ all: "All types", ...typeLabels }}
                value={txnTypeFilter || "all"}
                onValueChange={v => { setTxnTypeFilter(v === "all" ? "" : (v as TxnType)); resetPage() }}
              >
                <SelectTrigger id="bank-filter-type" className="w-full">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {(Object.keys(typeLabels) as TxnType[]).map(t => <SelectItem key={t} value={t}>{typeLabels[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Button variant="outline" onClick={() => { setBusinessDate(""); setTxnTypeFilter(""); resetPage() }}>
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
            {showFigures && items.map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-mono font-semibold text-ring">#{t.id}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(t.business_date)}</TableCell>
                <TableCell className="text-muted-foreground/70">{formatTime(t.created_at)}</TableCell>
                <TableCell>{t.customer_id ? `#${t.customer_id}` : "—"}</TableCell>
                <TableCell>
                  <Badge className={typeClass[t.txn_type]}>{typeLabels[t.txn_type]}</Badge>
                </TableCell>
                <TableCell className="font-mono font-semibold tabular-nums">{t.principal_paise > 0 ? fmt(fromPaise(t.principal_paise)) : "—"}</TableCell>
                <TableCell className="font-mono font-semibold tabular-nums text-success">{t.commission_paise > 0 ? `+${fmt(fromPaise(t.commission_paise))}` : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{accountName(t.settlement_account_id)}</TableCell>
                <TableCell className="text-muted-foreground">{accountName(t.cash_account_id)}</TableCell>
                <TableCell className="text-muted-foreground">{t.remarks}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(t)}>Edit</Button>
                    <Button variant="outline" size="sm" className="text-destructive" onClick={() => submitDelete(t.id)}>Delete</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {showFigures && items.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length}>
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>No banking transactions</EmptyTitle>
                      <EmptyDescription>No banking transactions match these filters.</EmptyDescription>
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
