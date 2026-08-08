import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, fromPaise, localDateISO } from "../lib/format"
import { downloadCsv } from "../lib/csv"
import { BlockState, TableRowState } from "../components/QueryState"
import { SortableTableHead, useSort } from "../components/SortableTableHead"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

const reportTypes = [
  { id: "daily", label: "Daily Report" },
  { id: "monthly", label: "Monthly Report" },
  { id: "service", label: "Service-wise" },
  { id: "pl", label: "Profit & Loss" },
  { id: "commission", label: "Banking Commission" },
] as const
type ReportType = (typeof reportTypes)[number]["id"]

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const monthItems = Object.fromEntries(monthNames.map((m, i) => [String(i + 1), m]))

type Account = { id: number; account_type: string }
type DayReportAccount = { account_id: number; account_name: string; opening_paise: number; received_paise: number; paid_paise: number; transfer_in_paise: number; transfer_out_paise: number; adjustment_paise: number; closing_paise: number }
type DayReport = { business_date: string; status: "open" | "closed"; accounts: DayReportAccount[] }
type Transaction = { id: number; customer_name: string | null; service_name: string; fee_paise: number; charge_paise: number; paid_paise: number; status: "completed" | "partial" | "pending" }
type MonthlyReport = { income_paise: number; expenses_paise: number; profit_paise: number }
type ServiceRow = { service_id: number; service_name: string; transaction_count: number; billed_paise: number; income_paise: number }
type ProfitLoss = {
  service_income_paise: number; commission_paise: number; total_income_paise: number
  expenses_by_category: { category: string; amount_paise: number }[]; total_expenses_paise: number; profit_paise: number
}
type CommissionReport = { items: { account_id: number; account_name: string; total_commission_paise: number }[]; total_commission_paise: number }

const statusClass: Record<Transaction["status"], string> = {
  completed: "bg-success/15 text-success",
  partial: "bg-destructive/15 text-destructive",
  pending: "bg-warning/15 text-warning",
}

function firstOfMonthISO(): string {
  return localDateISO().slice(0, 8) + "01"
}

export default function Reports() {
  const [activeReport, setActiveReport] = useState<ReportType>("daily")

  const [dailyDate, setDailyDate] = useState(localDateISO())
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [startDate, setStartDate] = useState(firstOfMonthISO())
  const [endDate, setEndDate] = useState(localDateISO())

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.get<Account[]>("/accounts"),
  })

  const { data: dayReport, isLoading: dayLoading, error: dayError } = useQuery({
    queryKey: queryKeys.dayReport(dailyDate),
    queryFn: () => api.get<DayReport>(`/day/${dailyDate}/report`),
    enabled: activeReport === "daily",
  })
  const dailyTxnFilters: Record<string, string | number> = { business_date: dailyDate, limit: 100 }
  const { data: dailyTxnData, isLoading: txnLoading, error: txnError } = useQuery({
    queryKey: queryKeys.transactions(dailyTxnFilters),
    queryFn: () => {
      const params = new URLSearchParams(dailyTxnFilters as Record<string, string>)
      return api.get<{ items: Transaction[]; total: number }>(`/transactions?${params}`)
    },
    enabled: activeReport === "daily",
  })
  const cashAccountId = accounts.find(a => a.account_type === "cash")?.id
  const cashRow = dayReport?.accounts.find(a => a.account_id === cashAccountId)
  const dailyTxns = dailyTxnData?.items ?? []
  const { sorted: sortedDailyTxns, sort: dailyTxnSort, toggleSort: toggleDailyTxnSort } = useSort(dailyTxns, {
    id: t => t.id,
    customer: t => t.customer_name ?? "Walk-in",
    service: t => t.service_name,
    fees: t => t.fee_paise,
    charge: t => t.charge_paise,
    payment: t => t.paid_paise,
  })

  const { data: monthly, isLoading: monthlyLoading, error: monthlyError } = useQuery({
    queryKey: queryKeys.reportMonthly(year, month),
    queryFn: () => api.get<MonthlyReport>(`/reports/monthly?year=${year}&month=${month}`),
    enabled: activeReport === "monthly",
  })

  const rangeFilters = { start_date: startDate, end_date: endDate }

  const { data: serviceRows, isLoading: serviceLoading, error: serviceError } = useQuery({
    queryKey: queryKeys.reportServiceWise(rangeFilters),
    queryFn: () => {
      const params = new URLSearchParams(rangeFilters)
      return api.get<ServiceRow[]>(`/reports/service-wise?${params}`)
    },
    enabled: activeReport === "service",
  })
  const { sorted: sortedServiceRows, sort: serviceRowSort, toggleSort: toggleServiceRowSort } = useSort(serviceRows ?? [], {
    service: s => s.service_name,
    transactions: s => s.transaction_count,
    billed: s => s.billed_paise,
    income: s => s.income_paise,
  })

  const { data: pl, isLoading: plLoading, error: plError } = useQuery({
    queryKey: queryKeys.reportProfitLoss(rangeFilters),
    queryFn: () => {
      const params = new URLSearchParams(rangeFilters)
      return api.get<ProfitLoss>(`/reports/profit-loss?${params}`)
    },
    enabled: activeReport === "pl",
  })

  const { data: commission, isLoading: commissionLoading, error: commissionError } = useQuery({
    queryKey: queryKeys.reportBankingCommission(rangeFilters),
    queryFn: () => {
      const params = new URLSearchParams(rangeFilters)
      return api.get<CommissionReport>(`/reports/banking-commission?${params}`)
    },
    enabled: activeReport === "commission",
  })
  const { sorted: sortedCommissionItems, sort: commissionSort, toggleSort: toggleCommissionSort } = useSort(commission?.items ?? [], {
    account: r => r.account_name,
    commission: r => r.total_commission_paise,
  })

  // PLAN 7.7: CSV export builds rows straight from the same fetched data the
  // active tab renders, so exported totals can't drift from on-screen ones.
  // Amounts go out as raw rupee numbers (fromPaise), not fmt()'s "₹"/comma
  // strings, so a spreadsheet can sum them.
  const csvBuilders: Record<ReportType, { ready: boolean; rows: () => (string | number)[][]; filename: string }> = {
    daily: {
      ready: !dayLoading && !dayError && !txnLoading && !txnError && !!dayReport && !!cashRow,
      filename: `daily-report-${dailyDate}.csv`,
      rows: () => [
        ["Cash Summary", dailyDate],
        ["Opening Cash Balance", fromPaise(cashRow!.opening_paise)],
        ["Received", fromPaise(cashRow!.received_paise)],
        ["Paid Out", fromPaise(cashRow!.paid_paise)],
        ["Transfer In", fromPaise(cashRow!.transfer_in_paise)],
        ["Transfer Out", fromPaise(cashRow!.transfer_out_paise)],
        ["Adjustment", fromPaise(cashRow!.adjustment_paise)],
        ["Closing Cash Balance", fromPaise(cashRow!.closing_paise)],
        [],
        ["Account Balances"],
        ["Account", "Closing Balance"],
        ...dayReport!.accounts.map(a => [a.account_name, fromPaise(a.closing_paise)]),
        [],
        ["Transaction Register"],
        ["TXN", "Customer", "Service", "Fees", "Charge", "Payment", "Status"],
        ...dailyTxns.map(t => [t.id, t.customer_name ?? "Walk-in", t.service_name, fromPaise(t.fee_paise), fromPaise(t.charge_paise), fromPaise(t.paid_paise), t.status]),
      ],
    },
    monthly: {
      ready: !monthlyLoading && !monthlyError && !!monthly,
      filename: `monthly-report-${year}-${String(month).padStart(2, "0")}.csv`,
      rows: () => [
        [`${monthNames[month - 1]} ${year}`],
        ["Income", fromPaise(monthly!.income_paise)],
        ["Expenses", fromPaise(monthly!.expenses_paise)],
        ["Profit", fromPaise(monthly!.profit_paise)],
      ],
    },
    service: {
      ready: !serviceLoading && !serviceError && !!serviceRows,
      filename: `service-wise-report-${startDate}-to-${endDate}.csv`,
      rows: () => [
        ["Service", "Transactions", "Billed", "Income Collected"],
        ...(serviceRows ?? []).map(s => [s.service_name, s.transaction_count, fromPaise(s.billed_paise), fromPaise(s.income_paise)]),
      ],
    },
    pl: {
      ready: !plLoading && !plError && !!pl,
      filename: `profit-loss-report-${startDate}-to-${endDate}.csv`,
      rows: () => [
        ["Total Income", fromPaise(pl!.total_income_paise)],
        ["Total Expenses", fromPaise(pl!.total_expenses_paise)],
        ["Net Profit", fromPaise(pl!.profit_paise)],
        [],
        ["Income Sources"],
        ["Service Income", fromPaise(pl!.service_income_paise)],
        ["Banking Commission", fromPaise(pl!.commission_paise)],
        [],
        ["Expenses by Category"],
        ...pl!.expenses_by_category.map(r => [r.category, fromPaise(r.amount_paise)]),
      ],
    },
    commission: {
      ready: !commissionLoading && !commissionError && !!commission,
      filename: `banking-commission-report-${startDate}-to-${endDate}.csv`,
      rows: () => [
        ["Total Commission", fromPaise(commission!.total_commission_paise)],
        [],
        ["Account", "Commission"],
        ...commission!.items.map(r => [r.account_name, fromPaise(r.total_commission_paise)]),
      ],
    },
  }
  const activeCsv = csvBuilders[activeReport]

  return (
    <div className="print-report h-full overflow-y-auto px-8 py-7">
      <div className="no-print mb-5 flex items-start justify-between">
        <div>
          <h1 className="m-0 text-[22px]">Reports</h1>
          <p className="mt-1 mb-0 text-[13px] text-muted-foreground">Daily, monthly, and service-wise financial summaries</p>
        </div>
        <div className="flex gap-2.5">
          <Button variant="outline" onClick={() => window.print()}>🖨 Print</Button>
          <Button disabled={!activeCsv.ready} onClick={() => downloadCsv(activeCsv.filename, activeCsv.rows())}>⬇ Export CSV</Button>
        </div>
      </div>

      {/* Report type tabs */}
      <ToggleGroup
        variant="outline"
        value={[activeReport]}
        onValueChange={v => { if (v.length > 0) setActiveReport(v[0] as ReportType) }}
        className="no-print mb-5"
      >
        {reportTypes.map(r => <ToggleGroupItem key={r.id} value={r.id}>{r.label}</ToggleGroupItem>)}
      </ToggleGroup>

      {/* Period controls */}
      {activeReport === "daily" && (
        <div className="no-print mb-5">
          <Field className="w-[180px]">
            <FieldLabel htmlFor="report-daily-date">Date</FieldLabel>
            <Input id="report-daily-date" type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)} />
          </Field>
        </div>
      )}
      {activeReport === "monthly" && (
        <div className="no-print mb-5 flex gap-2.5">
          <Field>
            <FieldLabel htmlFor="report-month">Month</FieldLabel>
            <Select items={monthItems} value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger id="report-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthNames.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field className="w-[100px]">
            <FieldLabel htmlFor="report-year">Year</FieldLabel>
            <Input id="report-year" type="number" value={year} onChange={e => setYear(Number(e.target.value) || now.getFullYear())} />
          </Field>
        </div>
      )}
      {(activeReport === "service" || activeReport === "pl" || activeReport === "commission") && (
        <div className="no-print mb-5 flex gap-2.5">
          <Field className="w-[160px]">
            <FieldLabel htmlFor="report-from">From</FieldLabel>
            <Input id="report-from" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </Field>
          <Field className="w-[160px]">
            <FieldLabel htmlFor="report-to">To</FieldLabel>
            <Input id="report-to" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </Field>
        </div>
      )}

      {activeReport === "daily" && (
        <>
          <div className="rs-grid mb-6 grid grid-cols-2 gap-5">
            {/* Daily summary */}
            <Card>
              <CardHeader>
                <CardTitle>Cash Summary — {dailyDate}</CardTitle>
              </CardHeader>
              <CardContent>
                {/* H.33: react-query has a third state — data undefined,
                    isLoading false, error null — while backing off a failed
                    fetch. Neither dayLoading nor dayError covers it, so it's
                    checked explicitly here too, not just !cashRow. */}
                {dayLoading || dayError || !dayReport ? <BlockState isLoading={dayLoading || !dayError} error={dayError} /> : !cashRow ? (
                  <div className="text-[13px] text-muted-foreground">No cash account found.</div>
                ) : (
                  (() => {
                    const rows = [
                      { label: "Opening Cash Balance", value: fmt(fromPaise(cashRow.opening_paise)), className: "text-muted-foreground" },
                      { label: "Received", value: "+ " + fmt(fromPaise(cashRow.received_paise)), className: "text-success" },
                      { label: "Paid Out", value: "− " + fmt(fromPaise(cashRow.paid_paise)), className: "text-destructive" },
                      { label: "Transfer In", value: "+ " + fmt(fromPaise(cashRow.transfer_in_paise)), className: "text-success" },
                      { label: "Transfer Out", value: "− " + fmt(fromPaise(cashRow.transfer_out_paise)), className: "text-destructive" },
                      { label: "Adjustment", value: fmt(fromPaise(cashRow.adjustment_paise)), className: "text-muted-foreground" },
                      { label: "Closing Cash Balance", value: fmt(fromPaise(cashRow.closing_paise)), className: "text-primary" },
                    ]
                    return rows.map((r, i) => (
                      <div key={r.label} className={cn("flex justify-between py-2.25", i < rows.length - 1 ? "border-b border-dashed" : "border-b-2")}>
                        <span className="text-[13px] text-muted-foreground">{r.label}</span>
                        <span className={cn("font-mono text-[13px] font-bold tabular-nums", r.className)}>{r.value}</span>
                      </div>
                    ))
                  })()
                )}
              </CardContent>
            </Card>

            {/* Account balances */}
            <Card>
              <CardHeader>
                <CardTitle>Account Balances</CardTitle>
              </CardHeader>
              <CardContent>
                {/* H.33: dayReport!.accounts crashed the whole app (white
                    screen, no error boundary) during that same third state —
                    !dayReport closes the gap, same fix as Cash Summary above. */}
                {dayLoading || dayError || !dayReport ? <BlockState isLoading={dayLoading || !dayError} error={dayError} /> : (
                  dayReport.accounts.map((a, i) => (
                    <div key={a.account_id} className={cn("flex items-center justify-between py-2.25", i < dayReport.accounts.length - 1 && "border-b border-dashed")}>
                      <span className="text-[13px] text-muted-foreground">{a.account_name}</span>
                      <span className="font-mono text-[13px] font-bold tabular-nums text-primary">{fmt(fromPaise(a.closing_paise))}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Transaction register */}
          <Card className="py-0">
            <CardHeader className="border-b py-3.5">
              <CardTitle>Transaction Register</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="id" sort={dailyTxnSort} onSort={toggleDailyTxnSort}>TXN</SortableTableHead>
                  <SortableTableHead sortKey="customer" sort={dailyTxnSort} onSort={toggleDailyTxnSort}>Customer</SortableTableHead>
                  <SortableTableHead sortKey="service" sort={dailyTxnSort} onSort={toggleDailyTxnSort}>Service</SortableTableHead>
                  <SortableTableHead sortKey="fees" sort={dailyTxnSort} onSort={toggleDailyTxnSort}>Fees</SortableTableHead>
                  <SortableTableHead sortKey="charge" sort={dailyTxnSort} onSort={toggleDailyTxnSort}>Charge</SortableTableHead>
                  <SortableTableHead sortKey="payment" sort={dailyTxnSort} onSort={toggleDailyTxnSort}>Payment</SortableTableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRowState isLoading={txnLoading} error={txnError} colSpan={7} />
                {!txnLoading && !txnError && dailyTxns.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7}>
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle>No transactions</EmptyTitle>
                          <EmptyDescription>No transactions on this date.</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                )}
                {sortedDailyTxns.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs text-ring">#{t.id}</TableCell>
                    <TableCell>{t.customer_name ?? "Walk-in"}</TableCell>
                    <TableCell className="text-muted-foreground">{t.service_name}</TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">{fmt(fromPaise(t.fee_paise))}</TableCell>
                    <TableCell className="font-mono text-xs tabular-nums text-success">+{fmt(fromPaise(t.charge_paise))}</TableCell>
                    <TableCell className="font-mono text-xs font-bold tabular-nums">{fmt(fromPaise(t.paid_paise))}</TableCell>
                    <TableCell>
                      <Badge className={cn("capitalize", statusClass[t.status])}>{t.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {activeReport === "monthly" && (
        <Card>
          <CardHeader>
            <CardTitle>{monthNames[month - 1]} {year}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* H.33: same react-query third-state gap as the Daily tab. */}
            {monthlyLoading || monthlyError || !monthly ? <BlockState isLoading={monthlyLoading || !monthlyError} error={monthlyError} /> : (
              <div className="rs-grid grid grid-cols-3 gap-3.5">
                {[
                  { label: "Income", value: fmt(fromPaise(monthly.income_paise)), className: "text-primary", bg: "bg-primary/5" },
                  { label: "Expenses", value: fmt(fromPaise(monthly.expenses_paise)), className: "text-destructive", bg: "bg-destructive/5" },
                  { label: "Profit", value: fmt(fromPaise(monthly.profit_paise)), className: "text-success", bg: "bg-success/5" },
                ].map(s => (
                  <Card key={s.label} size="sm" className={s.bg}>
                    <CardContent>
                      <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">{s.label}</div>
                      <div className={cn("font-mono text-xl font-bold tabular-nums", s.className)}>{s.value}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeReport === "service" && (
        <Card className="py-0">
          <CardHeader className="border-b py-3.5">
            <CardTitle>Service-wise Breakdown</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="service" sort={serviceRowSort} onSort={toggleServiceRowSort}>Service</SortableTableHead>
                <SortableTableHead sortKey="transactions" sort={serviceRowSort} onSort={toggleServiceRowSort}>Transactions</SortableTableHead>
                <SortableTableHead sortKey="billed" sort={serviceRowSort} onSort={toggleServiceRowSort}>Billed</SortableTableHead>
                <SortableTableHead sortKey="income" sort={serviceRowSort} onSort={toggleServiceRowSort}>Income Collected</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRowState isLoading={serviceLoading} error={serviceError} colSpan={4} />
              {!serviceLoading && !serviceError && (serviceRows ?? []).length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4}>
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>No services</EmptyTitle>
                        <EmptyDescription>No services found.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              )}
              {sortedServiceRows.map(s => (
                <TableRow key={s.service_id}>
                  <TableCell>{s.service_name}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{s.transaction_count}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{fmt(fromPaise(s.billed_paise))}</TableCell>
                  <TableCell className="font-mono text-xs font-bold tabular-nums text-success">{fmt(fromPaise(s.income_paise))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {activeReport === "pl" && (
        <>
          {/* H.33: same react-query third-state gap as the Daily tab. */}
          {plLoading || plError || !pl ? <Card><CardContent><BlockState isLoading={plLoading || !plError} error={plError} /></CardContent></Card> : (
            <>
              <div className="rs-grid mb-5 grid grid-cols-3 gap-3.5">
                {[
                  { label: "Total Income", value: fmt(fromPaise(pl.total_income_paise)), className: "text-primary", bg: "bg-primary/5" },
                  { label: "Total Expenses", value: fmt(fromPaise(pl.total_expenses_paise)), className: "text-destructive", bg: "bg-destructive/5" },
                  { label: "Net Profit", value: fmt(fromPaise(pl.profit_paise)), className: "text-success", bg: "bg-success/5" },
                ].map(s => (
                  <Card key={s.label} size="sm" className={s.bg}>
                    <CardContent>
                      <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">{s.label}</div>
                      <div className={cn("font-mono text-xl font-bold tabular-nums", s.className)}>{s.value}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="rs-grid grid grid-cols-2 gap-5">
                <Card>
                  <CardHeader>
                    <CardTitle>Income Sources</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {[
                      { label: "Service Income", value: pl.service_income_paise },
                      { label: "Banking Commission", value: pl.commission_paise },
                    ].map((r, i) => (
                      <div key={r.label} className={cn("flex justify-between py-2.25", i < 1 && "border-b border-dashed")}>
                        <span className="text-[13px] text-muted-foreground">{r.label}</span>
                        <span className="font-mono text-[13px] font-bold tabular-nums text-success">{fmt(fromPaise(r.value))}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Expenses by Category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {pl.expenses_by_category.length === 0 ? (
                      <div className="text-[13px] text-muted-foreground">No expenses in this period.</div>
                    ) : pl.expenses_by_category.map((r, i) => (
                      <div key={r.category} className={cn("flex justify-between py-2.25", i < pl.expenses_by_category.length - 1 && "border-b border-dashed")}>
                        <span className="text-[13px] text-muted-foreground">{r.category}</span>
                        <span className="font-mono text-[13px] font-bold tabular-nums text-destructive">{fmt(fromPaise(r.amount_paise))}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </>
      )}

      {activeReport === "commission" && (
        <>
          <div className="mb-5">
            <Card size="sm" className="w-fit bg-success/5">
              <CardContent>
                <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Total Commission</div>
                <div className="font-mono text-xl font-bold tabular-nums text-success">
                  {/* H.33: same react-query third-state gap as the Daily tab. */}
                  {commissionLoading || commissionError || !commission ? "—" : fmt(fromPaise(commission.total_commission_paise))}
                </div>
              </CardContent>
            </Card>
          </div>
          <Card className="py-0">
            <CardHeader className="border-b py-3.5">
              <CardTitle>Commission by Account</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="account" sort={commissionSort} onSort={toggleCommissionSort}>Account</SortableTableHead>
                  <SortableTableHead sortKey="commission" sort={commissionSort} onSort={toggleCommissionSort}>Commission</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRowState isLoading={commissionLoading} error={commissionError} colSpan={2} />
                {!commissionLoading && !commissionError && (commission?.items ?? []).length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={2}>
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle>No commission</EmptyTitle>
                          <EmptyDescription>No commission in this period.</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                )}
                {sortedCommissionItems.map(r => (
                  <TableRow key={r.account_id}>
                    <TableCell>{r.account_name}</TableCell>
                    <TableCell className="font-mono text-xs font-bold tabular-nums text-success">{fmt(fromPaise(r.total_commission_paise))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  )
}
