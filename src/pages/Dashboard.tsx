import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import StatCard from "../components/StatCard"
import { BlockState, TableRowState } from "../components/QueryState"
import { SortableTableHead, useSort } from "../components/SortableTableHead"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import TransactionForm from "../components/forms/TransactionForm"
import BankingEntryForm from "../components/forms/BankingEntryForm"
import ExpenseForm from "../components/forms/ExpenseForm"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, fromPaise, localDateISO } from "../lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { cn } from "@/lib/utils"

// PLAN 9.5: the three quick actions that are single forms open inline here
// instead of navigating away; "Close Business Day" stays a navigation link
// since DailyClosing.tsx is a multi-step wizard, not a form (see PLAN.md
// Phase 9's rationale).
type QuickModal = "transaction" | "banking" | "expense" | null

type Dashboard = {
  business_date: string
  today_income_paise: number
  today_expenses_paise: number
  today_profit_paise: number
  cash_in_hand_paise: number
  total_bank_balance_paise: number
  pending_credits_paise: number
  today_customers: number
  closing_status: "open" | "closed"
}

type Transaction = {
  id: number
  customer_name: string | null
  service_name: string
  fee_paise: number
  charge_paise: number
  paid_paise: number
  status: "completed" | "partial" | "pending"
}

type Account = { account_type: string; is_active: number }

const statusClass: Record<Transaction["status"], string> = {
  completed: "bg-success/15 text-success",
  partial: "bg-destructive/15 text-destructive",
  pending: "bg-warning/15 text-warning",
}

const txnColumns = ["S.No", "Customer", "Service", "Fees", "Charge", "Payment", "Status"]

export default function Dashboard() {
  const today = localDateISO()
  const navigate = useNavigate()
  const [openModal, setOpenModal] = useState<QuickModal>(null)

  const { data: dash, isLoading: dashLoading, error: dashError } = useQuery({
    queryKey: queryKeys.dashboard(today),
    queryFn: () => api.get<Dashboard>(`/dashboard?business_date=${today}`),
  })

  const txnFilters: Record<string, string | number> = { business_date: today, limit: 100 }
  const { data: txnData, isLoading: txnLoading, error: txnError } = useQuery({
    queryKey: queryKeys.transactions(txnFilters),
    queryFn: () => {
      const params = new URLSearchParams(txnFilters as Record<string, string>)
      return api.get<{ items: Transaction[]; total: number }>(`/transactions?${params}`)
    },
  })
  const todaysTxns = txnData?.items ?? []
  const recentTxns = todaysTxns.slice(0, 5)
  const { sorted: sortedRecentTxns, sort: recentTxnSort, toggleSort: toggleRecentTxnSort } = useSort(recentTxns, {
    customer: t => t.customer_name ?? "Walk-in",
    service: t => t.service_name,
    fee: t => t.fee_paise,
    charge: t => t.charge_paise,
    paid: t => t.paid_paise,
  })
  // H.41: !txnLoading && !txnError isn't proof of a confirmed empty result --
  // a query stuck between retries (or otherwise settled with no data) reads
  // that way too. Only treat it as genuinely empty once txnData has arrived;
  // otherwise surface it through the same "could not load" state as a real error.
  const txnUnavailable = txnError ?? (!txnLoading && !txnData ? new Error("failed to load") : undefined)

  const { data: expenseData } = useQuery({
    queryKey: queryKeys.expenses({ business_date: today, limit: 1 }),
    queryFn: () => api.get<{ total: number }>(`/expenses?business_date=${today}&limit=1`),
  })

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.get<Account[]>("/accounts"),
  })
  const bankAccountCount = accounts.filter(a => a.account_type !== "cash" && a.is_active).length

  // Service breakdown off today's own transaction list, not a new endpoint --
  // it's the same data the register table below already fetched.
  const serviceBreakdown = Object.values(
    todaysTxns.reduce<Record<string, { name: string; count: number; income: number }>>((acc, t) => {
      const row = (acc[t.service_name] ??= { name: t.service_name, count: 0, income: 0 })
      row.count += 1
      row.income += t.paid_paise
      return acc
    }, {})
  ).sort((a, b) => b.income - a.income)

  const statsReady = !dashLoading && !dashError && dash

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mb-5">
        <h1 className="m-0 text-[22px]">Dashboard</h1>
        <p className="mt-1 mb-0 text-[13px] text-muted-foreground">
          {new Date(`${today}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          {" · "}Business Day {statsReady ? (dash.closing_status === "closed" ? "Closed" : "Open") : "…"}
        </p>
      </div>

      {!statsReady ? (
        <div className="mb-5"><BlockState isLoading={dashLoading} error={dashError} /></div>
      ) : (
        <>
          {/* Stats grid */}
          <div className="rs-grid mb-5 grid grid-cols-4 gap-3.5">
            <StatCard label="Today's Income" value={fmt(fromPaise(dash.today_income_paise))} sub={`${txnData?.total ?? 0} transactions`} color="green"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>} />
            <StatCard label="Today's Expenses" value={fmt(fromPaise(dash.today_expenses_paise))} sub={`${expenseData?.total ?? 0} entries today`} color="red"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>} />
            <StatCard label="Today's Profit" value={fmt(fromPaise(dash.today_profit_paise))} sub="Net after expenses" color="blue"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>} />
            <StatCard label="Pending Credits" value={fmt(fromPaise(dash.pending_credits_paise))} sub="Outstanding across all customers" color="amber"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>} />
          </div>

          <div className="rs-grid mb-7 grid grid-cols-4 gap-3.5">
            <StatCard label="Cash in Hand" value={fmt(fromPaise(dash.cash_in_hand_paise))} sub="All cash accounts" color="default"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>} />
            <StatCard label="Total Bank Balance" value={fmt(fromPaise(dash.total_bank_balance_paise))} sub={`${bankAccountCount} accounts`} color="default"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>} />
            <StatCard label="Today's Customers" value={String(dash.today_customers)} sub="Distinct customers served today" color="default"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
            <StatCard label="Closing Status" value={dash.closing_status === "closed" ? "Closed" : "Open"} sub={dash.closing_status === "closed" ? "Day is locked" : "Day not yet closed"} color={dash.closing_status === "closed" ? "default" : "amber"}
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>} />
          </div>
        </>
      )}

      {/* Bottom two-col layout */}
      <div className="rs-grid grid grid-cols-[1fr_360px] gap-5">
        {/* Recent transactions */}
        <Card className="py-0">
          <CardHeader className="flex-row items-center justify-between border-b py-3.5">
            <CardTitle>Today's Transactions</CardTitle>
            <span className="text-xs font-medium text-ring">View All →</span>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>S.No</TableHead>
                <SortableTableHead sortKey="customer" sort={recentTxnSort} onSort={toggleRecentTxnSort}>Customer</SortableTableHead>
                <SortableTableHead sortKey="service" sort={recentTxnSort} onSort={toggleRecentTxnSort}>Service</SortableTableHead>
                <SortableTableHead sortKey="fee" sort={recentTxnSort} onSort={toggleRecentTxnSort}>Fees</SortableTableHead>
                <SortableTableHead sortKey="charge" sort={recentTxnSort} onSort={toggleRecentTxnSort}>Charge</SortableTableHead>
                <SortableTableHead sortKey="paid" sort={recentTxnSort} onSort={toggleRecentTxnSort}>Payment</SortableTableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRowState isLoading={txnLoading} error={txnUnavailable} colSpan={txnColumns.length} />
              {!txnLoading && !txnUnavailable && recentTxns.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={txnColumns.length}>
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>No transactions</EmptyTitle>
                        <EmptyDescription>No transactions yet today.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              )}
              {sortedRecentTxns.map((t, i) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono font-semibold text-ring">{i + 1}</TableCell>
                  <TableCell>{t.customer_name ?? "Walk-in"}</TableCell>
                  <TableCell className="text-muted-foreground">{t.service_name}</TableCell>
                  <TableCell className="font-mono tabular-nums">{fmt(fromPaise(t.fee_paise))}</TableCell>
                  <TableCell className="font-mono tabular-nums text-success">+{fmt(fromPaise(t.charge_paise))}</TableCell>
                  <TableCell className="font-mono font-bold tabular-nums">{fmt(fromPaise(t.paid_paise))}</TableCell>
                  <TableCell><Badge className={cn("capitalize", statusClass[t.status])}>{t.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Service breakdown + quick actions */}
        <div className="flex flex-col gap-3.5">
          <Card className="py-0">
            <CardHeader className="border-b py-3.5">
              <CardTitle className="text-sm">Service Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="px-0 py-1.5">
              {txnLoading || txnUnavailable ? (
                <BlockState isLoading={txnLoading} error={txnUnavailable} />
              ) : serviceBreakdown.length === 0 ? (
                <div className="px-4.5 py-5 text-center text-[13px] text-muted-foreground">No services rendered today.</div>
              ) : (
                serviceBreakdown.map(s => (
                  <div key={s.name} className="flex items-center justify-between border-b px-4.5 py-2.5 last:border-b-0">
                    <div>
                      <div className="text-[13px] font-medium">{s.name}</div>
                      <div className="text-[11px] text-muted-foreground">{s.count} jobs</div>
                    </div>
                    <span className="font-mono text-[13px] font-semibold text-success">{fmt(fromPaise(s.income))}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="bg-primary text-primary-foreground">
            <CardHeader>
              <CardTitle className="text-xs tracking-wide text-primary-foreground/70 uppercase">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {[
                { label: "New Transaction", modal: "transaction" as QuickModal, path: null as string | null },
                { label: "New Banking Entry", modal: "banking" as QuickModal, path: null as string | null },
                { label: "Record Expense", modal: "expense" as QuickModal, path: null as string | null },
                { label: "Close Business Day", modal: null as QuickModal, path: "/closing" as string | null },
              ].map((a, i) => (
                <Button
                  key={a.label}
                  variant={i === 3 ? "default" : "ghost"}
                  className={cn(
                    "justify-start",
                    i === 3 ? "bg-warning text-warning-foreground hover:bg-warning/90" : "bg-white/10 text-primary-foreground hover:bg-white/15"
                  )}
                  onClick={() => (a.modal ? setOpenModal(a.modal) : navigate(a.path!))}
                >
                  {a.label}
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {openModal === "transaction" && (
        <Dialog open onOpenChange={o => !o && setOpenModal(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Transaction</DialogTitle></DialogHeader>
            <TransactionForm onSuccess={() => setOpenModal(null)} onCancel={() => setOpenModal(null)} />
          </DialogContent>
        </Dialog>
      )}
      {openModal === "banking" && (
        <Dialog open onOpenChange={o => !o && setOpenModal(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Banking Entry</DialogTitle></DialogHeader>
            <BankingEntryForm onSuccess={() => setOpenModal(null)} onCancel={() => setOpenModal(null)} />
          </DialogContent>
        </Dialog>
      )}
      {openModal === "expense" && (
        <Dialog open onOpenChange={o => !o && setOpenModal(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
            <ExpenseForm onSuccess={() => setOpenModal(null)} onCancel={() => setOpenModal(null)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
