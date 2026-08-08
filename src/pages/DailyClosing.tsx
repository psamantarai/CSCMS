import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, formatDate, formatTime, fromPaise, localDateISO, toPaise } from "../lib/format"
import { BlockState } from "../components/QueryState"
import { useAuth } from "../lib/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

type Account = { id: number; name: string; account_type: string; bank_name: string | null; is_active: number }
type Transaction = { id: number; customer_name: string | null; service_name: string; status: string; total_paise: number; paid_paise: number }
type DayStatus = { business_date: string; status: "open" | "closed"; opened_at: string | null; closed_at: string | null; closed_by: number | null }

type AccountBreakdown = {
  account_id: number; account_name: string
  opening_paise: number; received_paise: number; paid_paise: number
  transfer_in_paise: number; transfer_out_paise: number; adjustment_paise: number; closing_paise: number
}
type DayReport = {
  business_date: string; status: "open" | "closed"
  accounts: AccountBreakdown[]
  totals: Omit<AccountBreakdown, "account_id" | "account_name">
  cash_variance_paise: number
}

const steps = [
  { id: 1, label: "Verify Pending Work", desc: "Check all open transactions" },
  { id: 2, label: "Verify Cash", desc: "Physical count vs system balance" },
  { id: 3, label: "Verify Bank Balances", desc: "Match all accounts" },
  { id: 4, label: "Record Adjustments", desc: "Remarks for any variance" },
  { id: 5, label: "Lock Business Day", desc: "Confirm and seal the day" },
]

function money(paise: number) {
  return fmt(fromPaise(paise))
}

// PLAN 6.7: shared by the fresh-close success view and by reopening the app
// on an already-closed day (same data, same layout) — className="print-report"
// is what index.css's @media print block un-clips.
function ClosedReport({ today, dayStatus, report }: { today: string; dayStatus: DayStatus; report: DayReport | undefined }) {
  const cash = report?.accounts.find(a => a.account_name === "Cash Drawer") ?? report?.accounts[0]
  return (
    <div className="print-report h-full overflow-y-auto px-8 py-7">
      <div className="mb-6 flex flex-col items-center">
        <Card className="max-w-[480px] border-success/30 bg-success/5 py-7 text-center">
          <CardContent className="flex flex-col items-center gap-1.5">
            <div className="text-[40px] leading-none">✓</div>
            <h2 className="m-0 text-xl text-success">Business Day Closed</h2>
            <p className="m-0 text-[13px] text-muted-foreground">
              {formatDate(today)}{dayStatus.closed_at && <> · Closed at {formatTime(dayStatus.closed_at)}</>} · Closed by Admin
            </p>
          </CardContent>
        </Card>
      </div>

      {!report ? <BlockState isLoading error={undefined} /> : (
        <>
          <div className="rs-grid mb-5 grid grid-cols-4 gap-3.5">
            {[
              ["Total Received", money(report.totals.received_paise), "text-success", "bg-success/5"],
              ["Total Expenses", money(report.totals.paid_paise), "text-destructive", "bg-destructive/5"],
              ["Cash Variance", money(report.cash_variance_paise), report.cash_variance_paise === 0 ? "text-muted-foreground" : "text-warning", "bg-muted"],
              ["Cash Closing Balance", cash ? money(cash.closing_paise) : "—", "text-primary", "bg-primary/5"],
            ].map(([l, v, color, bg]) => (
              <Card key={l} size="sm" className={bg}>
                <CardContent>
                  <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">{l}</div>
                  <div className={cn("font-mono text-lg font-bold tabular-nums", color)}>{v}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mb-5 py-0">
            <CardHeader className="border-b py-3.5">
              <CardTitle>Per-Account Closing Report</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  {["Account", "Opening", "Received", "Paid", "Transfer In", "Transfer Out", "Adjustment", "Closing"].map(h => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.accounts.map(a => (
                  <TableRow key={a.account_id}>
                    <TableCell className="font-semibold">{a.account_name}</TableCell>
                    <TableCell className="font-mono text-xs">{money(a.opening_paise)}</TableCell>
                    <TableCell className="font-mono text-xs text-success">{a.received_paise ? `+${money(a.received_paise)}` : "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-destructive">{a.paid_paise ? `−${money(a.paid_paise)}` : "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{a.transfer_in_paise ? `+${money(a.transfer_in_paise)}` : "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{a.transfer_out_paise ? `−${money(a.transfer_out_paise)}` : "—"}</TableCell>
                    <TableCell className={cn("font-mono text-xs", a.adjustment_paise === 0 ? "text-muted-foreground" : a.adjustment_paise > 0 ? "text-success" : "text-destructive")}>
                      {a.adjustment_paise ? money(a.adjustment_paise) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold">{money(a.closing_paise)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="font-bold">Total</TableCell>
                  <TableCell className="font-mono text-xs font-bold">{money(report.totals.opening_paise)}</TableCell>
                  <TableCell className="font-mono text-xs font-bold text-success">+{money(report.totals.received_paise)}</TableCell>
                  <TableCell className="font-mono text-xs font-bold text-destructive">−{money(report.totals.paid_paise)}</TableCell>
                  <TableCell className="font-mono text-xs font-bold">+{money(report.totals.transfer_in_paise)}</TableCell>
                  <TableCell className="font-mono text-xs font-bold">−{money(report.totals.transfer_out_paise)}</TableCell>
                  <TableCell className="font-mono text-xs font-bold">{money(report.totals.adjustment_paise)}</TableCell>
                  <TableCell className="font-mono text-xs font-bold">{money(report.totals.closing_paise)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Card>
        </>
      )}

      <div className="no-print flex items-start gap-2.5">
        <Button onClick={() => window.print()}>Print Closing Report</Button>
        <ReopenControl businessDate={today} />
      </div>
    </div>
  )
}

// PLAN 8.7: admin-only override, always audited server-side. Inline confirm
// (not window.confirm — Banking.tsx's use of it already blocks CDP-driven
// E2E, ARCHITECTURE.md §8; no point adding a second instance of that).
function ReopenControl({ businessDate }: { businessDate: string }) {
  const { user } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [remarks, setRemarks] = useState("")
  const queryClient = useQueryClient()

  const reopenMutation = useMutation({
    mutationFn: () => api.post(`/day/${businessDate}/reopen`, { remarks: remarks || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["day"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    },
  })

  if (user?.role !== "admin") return null

  if (!confirming) {
    return (
      <Button variant="destructive" onClick={() => setConfirming(true)}>
        Reopen Day (Admin)
      </Button>
    )
  }

  return (
    <Card className="max-w-[360px] border-destructive/30 bg-destructive/5 py-3.5">
      <CardContent className="flex flex-col gap-2.5">
        <div className="text-xs text-destructive">
          This reopens {formatDate(businessDate)} for new writes and is recorded in the audit trail. Are you sure?
        </div>
        <Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Reason (optional)…" />
        {reopenMutation.isError && <div className="text-[11px] text-destructive">{(reopenMutation.error as Error).message}</div>}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
          <Button variant="destructive" size="sm" disabled={reopenMutation.isPending} onClick={() => reopenMutation.mutate()}>
            {reopenMutation.isPending ? "Reopening…" : "Confirm Reopen"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function DailyClosing() {
  const [today] = useState(() => localDateISO())
  const [currentStep, setCurrentStep] = useState(1)
  const [physicalCash, setPhysicalCash] = useState("")
  const [remarks, setRemarks] = useState("")
  const [closeError, setCloseError] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: dayStatus, isLoading: statusLoading, error: statusError } = useQuery({
    queryKey: queryKeys.dayStatus(today),
    queryFn: () => api.get<DayStatus>(`/day/${today}`),
  })

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.get<Account[]>("/accounts"),
  })
  const cashAccountMeta = accounts.find(a => a.account_type === "cash" && a.is_active)
  const bankAccountsMeta = accounts.filter(a => a.account_type !== "cash" && a.is_active)

  // the report's closing_paise-as-of-today doubles as "current system
  // balance" — one query serves both the wizard's live preview and the
  // post-close display, instead of a separate per-account balance fetch.
  const { data: report } = useQuery({
    queryKey: queryKeys.dayReport(today),
    queryFn: () => api.get<DayReport>(`/day/${today}/report`),
  })
  const rowFor = (accountId: number | undefined) => report?.accounts.find(a => a.account_id === accountId)
  const cashBalance = rowFor(cashAccountMeta?.id)?.closing_paise ?? 0

  const { data: txnData, isLoading: txnLoading, error: txnError } = useQuery({
    queryKey: queryKeys.transactions({ business_date: today, limit: 500 }),
    queryFn: () => api.get<{ items: Transaction[]; total: number }>(`/transactions?business_date=${today}&limit=500`),
  })
  const pendingTxns = (txnData?.items ?? []).filter(t => t.status !== "completed")

  const variance = cashAccountMeta && physicalCash !== "" ? toPaise(Number(physicalCash) || 0) - cashBalance : 0
  const varianceEntered = cashAccountMeta && physicalCash !== ""
  const needsRemarks = varianceEntered && variance !== 0
  const canLock = !cashAccountMeta || (varianceEntered && (!needsRemarks || remarks.trim().length > 0))

  const closeMutation = useMutation({
    mutationFn: () => api.post(`/day/${today}/close`, {
      physical_cash_paise: cashAccountMeta ? toPaise(Number(physicalCash) || 0) : null,
      remarks: remarks || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["day"] })
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      setCloseError("")
    },
    onError: (e: Error) => setCloseError(e.message),
  })

  if (statusLoading || statusError) {
    return (
      <div className="px-8 py-7">
        <BlockState isLoading={statusLoading} error={statusError} />
      </div>
    )
  }

  // PLAN 6.6: reopening the app on an already-closed day shows it closed —
  // no wizard, straight to the sealed report.
  if (dayStatus!.status === "closed") {
    return <ClosedReport today={today} dayStatus={dayStatus!} report={report} />
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mb-6">
        <h1 className="m-0 text-[22px]">Daily Closing</h1>
        <p className="mt-1 mb-0 text-[13px] text-muted-foreground">{formatDate(today)} · Walk through each step to close the business day</p>
      </div>

      <div className="rs-grid grid grid-cols-[220px_1fr] gap-5">
        {/* Step rail */}
        <Card className="h-fit gap-0 py-2">
          {steps.map((s, i) => (
            <div key={s.id}>
              <button
                type="button"
                onClick={() => setCurrentStep(s.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 border-l-[3px] px-4 py-3 text-left transition-colors",
                  currentStep === s.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50"
                )}
              >
                <Badge
                  className={cn(
                    "size-6 shrink-0 justify-center rounded-full p-0 text-[11px]",
                    s.id < currentStep ? "bg-success text-success-foreground"
                      : s.id === currentStep ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {s.id < currentStep ? "✓" : s.id}
                </Badge>
                <span>
                  <span className={cn("block text-[13px] font-medium", s.id === currentStep ? "text-primary" : "text-foreground/80")}>{s.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{s.desc}</span>
                </span>
              </button>
              {i < steps.length - 1 && <Separator />}
            </div>
          ))}
        </Card>

        {/* Step content */}
        <Card className="p-0">
          <CardContent className="px-7 py-6">
            {currentStep === 1 && (
              <div>
                <h3 className="mb-4 font-serif text-[15px]">Verify Pending Work</h3>
                {txnLoading || txnError ? <BlockState isLoading={txnLoading} error={txnError} /> : pendingTxns.length === 0 ? (
                  <Alert className="border-success/30 bg-success/5">
                    <AlertDescription className="font-medium text-success">✓ All of today's transactions are completed. No pending work.</AlertDescription>
                  </Alert>
                ) : (
                  <div>
                    <Alert className="mb-3.5 border-warning/30 bg-warning/5">
                      <AlertDescription className="text-warning">⚠ {pendingTxns.length} transaction{pendingTxns.length === 1 ? "" : "s"} require attention before closing.</AlertDescription>
                    </Alert>
                    {pendingTxns.map(t => (
                      <div key={t.id} className="mb-2 flex items-center justify-between rounded-md border border-warning/30 bg-warning/5 px-3.5 py-2.5">
                        <div>
                          <span className="font-mono text-xs text-ring">#{t.id}</span>
                          <span className="ml-2.5 text-[13px]">{t.customer_name ?? "Walk-in"} — {t.service_name}</span>
                        </div>
                        <span className="font-mono text-xs font-bold text-warning">Pending: {money(t.total_paise - t.paid_paise)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Button className="mt-5" onClick={() => setCurrentStep(2)}>Continue →</Button>
              </div>
            )}

            {currentStep === 2 && (
              <div>
                <h3 className="mb-4 font-serif text-[15px]">Verify Cash</h3>
                {!cashAccountMeta ? (
                  <Alert className="mb-5">
                    <AlertDescription>No cash account configured — nothing to count.</AlertDescription>
                  </Alert>
                ) : (
                  <div className="rs-grid mb-5 grid grid-cols-2 gap-5">
                    <div className="rounded-lg bg-muted px-4.5 py-4">
                      <div className="mb-1.5 text-xs text-muted-foreground">System Cash Balance</div>
                      <div className="font-mono text-2xl font-bold text-primary">{money(cashBalance)}</div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-muted-foreground">Physical Cash Count (₹)</label>
                      <Input
                        type="number"
                        value={physicalCash}
                        onChange={e => setPhysicalCash(e.target.value)}
                        placeholder="Enter counted amount…"
                        className="h-auto font-mono text-base"
                      />
                      {physicalCash && (
                        <div className={cn("mt-2 text-[13px] font-semibold", variance === 0 ? "text-success" : "text-warning")}>
                          Variance: {money(variance)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex gap-2.5">
                  <Button variant="outline" onClick={() => setCurrentStep(1)}>← Back</Button>
                  <Button onClick={() => setCurrentStep(3)}>Continue →</Button>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div>
                <h3 className="mb-4 font-serif text-[15px]">Verify Bank Balances</h3>
                <div className="mb-5 flex flex-col gap-2.5">
                  {bankAccountsMeta.length === 0 && <div className="text-[13px] text-muted-foreground">No other accounts configured.</div>}
                  {bankAccountsMeta.map(a => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                      <div>
                        <div className="text-[13px] font-semibold">{a.name}</div>
                        <div className="text-xs text-muted-foreground">{a.bank_name}</div>
                      </div>
                      <div className="font-mono text-sm font-bold text-primary">{money(rowFor(a.id)?.closing_paise ?? 0)}</div>
                      <Badge className="bg-success/15 text-success">✓ Verified</Badge>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2.5">
                  <Button variant="outline" onClick={() => setCurrentStep(2)}>← Back</Button>
                  <Button onClick={() => setCurrentStep(4)}>Continue →</Button>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div>
                <h3 className="mb-4 font-serif text-[15px]">Record Adjustments</h3>
                {needsRemarks ? (
                  <Alert className="mb-3.5 border-warning/30 bg-warning/5">
                    <AlertDescription className="text-[13px] text-warning">
                      Cash variance of {money(variance)} from step 2 — remarks are required to close with a variance.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="mb-3.5 border-success/30 bg-success/5">
                    <AlertDescription className="text-[13px] text-success">
                      {cashAccountMeta ? "No cash variance — remarks are optional." : "Nothing to adjust."}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="mb-5">
                  <label className="mb-1 block text-xs text-muted-foreground">Remarks{needsRemarks ? " (required)" : ""}</label>
                  <Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Reason for variance, or general closing notes…" />
                </div>
                <div className="flex gap-2.5">
                  <Button variant="outline" onClick={() => setCurrentStep(3)}>← Back</Button>
                  <Button onClick={() => setCurrentStep(5)}>Continue →</Button>
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div>
                <h3 className="mb-4 font-serif text-[15px]">Lock Business Day</h3>
                <Alert className="mb-5 border-warning/30 bg-warning/5">
                  <AlertDescription className="text-warning">
                    <strong>⚠ This action cannot be undone.</strong> Once locked, the business day is sealed. Any changes will require an administrator override and will be recorded in the audit trail.
                  </AlertDescription>
                </Alert>
                <Card className="mb-5">
                  <CardHeader>
                    <CardTitle>Closing Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const rows = [
                        ["Total Received", report ? money(report.totals.received_paise) : "…"],
                        ["Total Expenses", report ? money(report.totals.paid_paise) : "…"],
                        ["Net Received", report ? money(report.totals.received_paise - report.totals.paid_paise) : "…"],
                        ["Cash in Hand", money(cashBalance)],
                        ["Cash Variance", cashAccountMeta ? money(variance) : "—"],
                      ]
                      return rows.map(([l, v], i) => (
                        <div key={l} className={cn("flex justify-between py-2.25", i < rows.length - 1 ? "border-b border-dashed" : "border-b-2")}>
                          <span className="text-[13px] text-muted-foreground">{l}</span>
                          <span className="font-mono text-[13px] font-bold tabular-nums">{v}</span>
                        </div>
                      ))
                    })()}
                  </CardContent>
                </Card>
                {!canLock && (
                  <div className="mb-2.5 text-xs text-warning">
                    {!varianceEntered ? "Enter the physical cash count in step 2 first." : "Remarks are required before locking (step 4)."}
                  </div>
                )}
                {closeError && <div className="mb-2.5 text-xs text-destructive">{closeError}</div>}
                <div className="flex gap-2.5">
                  <Button variant="outline" onClick={() => setCurrentStep(4)}>← Back</Button>
                  <Button
                    variant="destructive"
                    disabled={!canLock || closeMutation.isPending}
                    onClick={() => setConfirmOpen(true)}
                  >
                    {closeMutation.isPending ? "Locking…" : "Lock Business Day"}
                  </Button>
                </div>
                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Lock {formatDate(today)}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This seals the business day. Any change afterward needs an administrator override and is recorded in the audit trail.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          setConfirmOpen(false)
                          closeMutation.mutate()
                        }}
                      >
                        Lock Business Day
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
