import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, formatDate, formatTime, fromPaise, localDateISO, toPaise } from "../lib/format"
import { BlockState } from "../components/QueryState"
import { useAuth } from "../lib/auth"

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
    <div className="print-report" style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
        <div style={{ background: "#f0fdf4", border: "2px solid #16a34a", borderRadius: 16, padding: "28px 36px", textAlign: "center", maxWidth: 480 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>✓</div>
          <h2 style={{ margin: "0 0 6px", color: "#16a34a", fontSize: 20 }}>Business Day Closed</h2>
          <p style={{ color: "#64748b", margin: 0, fontSize: 13 }}>
            {formatDate(today)}{dayStatus.closed_at && <> · Closed at {formatTime(dayStatus.closed_at)}</>} · Closed by Admin
          </p>
        </div>
      </div>

      {!report ? <BlockState isLoading error={undefined} /> : (
        <>
          <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
            {[
              ["Total Received", money(report.totals.received_paise), "#16a34a", "#f0fdf4"],
              ["Total Expenses", money(report.totals.paid_paise), "#dc2626", "#fef2f2"],
              ["Cash Variance", money(report.cash_variance_paise), report.cash_variance_paise === 0 ? "#64748b" : "#d97706", "#f8fafc"],
              ["Cash Closing Balance", cash ? money(cash.closing_paise) : "—", "#1e3a5f", "#eff6ff"],
            ].map(([l, v, color, bg]) => (
              <div key={l} style={{ background: bg, border: "1px solid #d1d9e6", borderRadius: 9, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{l}</div>
                <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #eef1f7", fontWeight: 600, fontSize: 13 }}>Per-Account Closing Report</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Account", "Opening", "Received", "Paid", "Transfer In", "Transfer Out", "Adjustment", "Closing"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.accounts.map((a, i) => (
                    <tr key={a.account_id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>{a.account_name}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }}>{money(a.opening_paise)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: "#16a34a" }}>{a.received_paise ? `+${money(a.received_paise)}` : "—"}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: "#dc2626" }}>{a.paid_paise ? `−${money(a.paid_paise)}` : "—"}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }}>{a.transfer_in_paise ? `+${money(a.transfer_in_paise)}` : "—"}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }}>{a.transfer_out_paise ? `−${money(a.transfer_out_paise)}` : "—"}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: a.adjustment_paise === 0 ? "#94a3b8" : a.adjustment_paise > 0 ? "#16a34a" : "#dc2626" }}>{a.adjustment_paise ? money(a.adjustment_paise) : "—"}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>{money(a.closing_paise)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#f8fafc", borderTop: "2px solid #d1d9e6" }}>
                    <td style={{ padding: "9px 12px", fontSize: 13, fontWeight: 700 }}>Total</td>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{money(report.totals.opening_paise)}</td>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#16a34a" }}>+{money(report.totals.received_paise)}</td>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#dc2626" }}>−{money(report.totals.paid_paise)}</td>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>+{money(report.totals.transfer_in_paise)}</td>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>−{money(report.totals.transfer_out_paise)}</td>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{money(report.totals.adjustment_paise)}</td>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>{money(report.totals.closing_paise)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <button onClick={() => window.print()} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Print Closing Report
        </button>
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
      <button onClick={() => setConfirming(true)} style={{ background: "#fff", color: "#dc2626", border: "1px solid #dc2626", borderRadius: 7, padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        Reopen Day (Admin)
      </button>
    )
  }

  return (
    <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "14px 16px", maxWidth: 360 }}>
      <div style={{ fontSize: 12, color: "#991b1b", marginBottom: 8 }}>
        This reopens {formatDate(businessDate)} for new writes and is recorded in the audit trail. Are you sure?
      </div>
      <input
        value={remarks}
        onChange={e => setRemarks(e.target.value)}
        placeholder="Reason (optional)…"
        style={{ width: "100%", padding: "7px 9px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box", marginBottom: 10 }}
      />
      {reopenMutation.isError && <div style={{ color: "#dc2626", fontSize: 11, marginBottom: 8 }}>{(reopenMutation.error as Error).message}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setConfirming(false)} style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 6, padding: "7px 14px", fontSize: 12, cursor: "pointer" }}>Cancel</button>
        <button
          onClick={() => reopenMutation.mutate()}
          disabled={reopenMutation.isPending}
          style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
        >
          {reopenMutation.isPending ? "Reopening…" : "Confirm Reopen"}
        </button>
      </div>
    </div>
  )
}

export default function DailyClosing() {
  const [today] = useState(() => localDateISO())
  const [currentStep, setCurrentStep] = useState(1)
  const [physicalCash, setPhysicalCash] = useState("")
  const [remarks, setRemarks] = useState("")
  const [closeError, setCloseError] = useState("")
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
      <div style={{ padding: "28px 32px" }}>
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
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Daily Closing</h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>{formatDate(today)} · Walk through each step to close the business day</p>
      </div>

      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20 }}>
        {/* Step sidebar */}
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "12px 0", height: "fit-content" }}>
          {steps.map(s => (
            <div
              key={s.id}
              onClick={() => setCurrentStep(s.id)}
              style={{
                padding: "12px 16px", cursor: "pointer",
                borderLeft: currentStep === s.id ? "3px solid #1e3a5f" : "3px solid transparent",
                background: currentStep === s.id ? "#f0f4f8" : "transparent",
                display: "flex", alignItems: "center", gap: 10,
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, flexShrink: 0,
                background: s.id < currentStep ? "#16a34a" : s.id === currentStep ? "#1e3a5f" : "#e8edf5",
                color: s.id <= currentStep ? "#fff" : "#64748b",
              }}>
                {s.id < currentStep ? "✓" : s.id}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: s.id === currentStep ? "#1e3a5f" : "#475569" }}>{s.label}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Step content */}
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "24px 28px" }}>
          {currentStep === 1 && (
            <div>
              <h3 style={{ margin: "0 0 16px", fontSize: 15, fontFamily: "'Roboto Slab', serif" }}>Verify Pending Work</h3>
              {txnLoading || txnError ? <BlockState isLoading={txnLoading} error={txnError} /> : pendingTxns.length === 0 ? (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "16px 20px", color: "#16a34a", fontWeight: 500 }}>
                  ✓ All of today's transactions are completed. No pending work.
                </div>
              ) : (
                <div>
                  <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "12px 16px", color: "#d97706", marginBottom: 14 }}>
                    ⚠ {pendingTxns.length} transaction{pendingTxns.length === 1 ? "" : "s"} require attention before closing.
                  </div>
                  {pendingTxns.map(t => (
                    <div key={t.id} style={{ padding: "10px 14px", border: "1px solid #fde68a", borderRadius: 7, marginBottom: 8, background: "#fffbeb", display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#3b6cb7" }}>#{t.id}</span>
                        <span style={{ fontSize: 13, marginLeft: 10 }}>{t.customer_name ?? "Walk-in"} — {t.service_name}</span>
                      </div>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "#d97706", fontWeight: 700 }}>Pending: {money(t.total_paise - t.paid_paise)}</span>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => setCurrentStep(2)} style={{ marginTop: 20, background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Continue →</button>
            </div>
          )}

          {currentStep === 2 && (
            <div>
              <h3 style={{ margin: "0 0 16px", fontSize: 15, fontFamily: "'Roboto Slab', serif" }}>Verify Cash</h3>
              {!cashAccountMeta ? (
                <div style={{ background: "#f8fafc", border: "1px solid #d1d9e6", borderRadius: 8, padding: "16px 20px", color: "#64748b" }}>No cash account configured — nothing to count.</div>
              ) : (
                <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                  <div style={{ background: "#f0f4f8", borderRadius: 8, padding: "16px 18px" }}>
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>System Cash Balance</div>
                    <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 700, color: "#1e3a5f" }}>{money(cashBalance)}</div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 6 }}>Physical Cash Count (₹)</label>
                    <input
                      type="number"
                      value={physicalCash}
                      onChange={e => setPhysicalCash(e.target.value)}
                      placeholder="Enter counted amount…"
                      style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d9e6", borderRadius: 7, fontSize: 16, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}
                    />
                    {physicalCash && (
                      <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: variance === 0 ? "#16a34a" : "#d97706" }}>
                        Variance: {money(variance)}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setCurrentStep(1)} style={{ background: "#f1f5f9", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 20px", fontSize: 13, cursor: "pointer" }}>← Back</button>
                <button onClick={() => setCurrentStep(3)} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Continue →</button>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div>
              <h3 style={{ margin: "0 0 16px", fontSize: 15, fontFamily: "'Roboto Slab', serif" }}>Verify Bank Balances</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                {bankAccountsMeta.length === 0 && <div style={{ color: "#94a3b8", fontSize: 13 }}>No other accounts configured.</div>}
                {bankAccountsMeta.map(a => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", border: "1px solid #d1d9e6", borderRadius: 8, background: "#fafbfd" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{a.bank_name}</div>
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#1e3a5f" }}>{money(rowFor(a.id)?.closing_paise ?? 0)}</div>
                    <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>✓ Verified</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setCurrentStep(2)} style={{ background: "#f1f5f9", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 20px", fontSize: 13, cursor: "pointer" }}>← Back</button>
                <button onClick={() => setCurrentStep(4)} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Continue →</button>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div>
              <h3 style={{ margin: "0 0 16px", fontSize: 15, fontFamily: "'Roboto Slab', serif" }}>Record Adjustments</h3>
              {needsRemarks ? (
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "12px 16px", color: "#d97706", marginBottom: 14, fontSize: 13 }}>
                  Cash variance of {money(variance)} from step 2 — remarks are required to close with a variance.
                </div>
              ) : (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px", color: "#16a34a", marginBottom: 14, fontSize: 13 }}>
                  {cashAccountMeta ? "No cash variance — remarks are optional." : "Nothing to adjust."}
                </div>
              )}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Remarks{needsRemarks ? " (required)" : ""}</label>
                <input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Reason for variance, or general closing notes…" style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setCurrentStep(3)} style={{ background: "#f1f5f9", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 20px", fontSize: 13, cursor: "pointer" }}>← Back</button>
                <button onClick={() => setCurrentStep(5)} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Continue →</button>
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div>
              <h3 style={{ margin: "0 0 16px", fontSize: 15, fontFamily: "'Roboto Slab', serif" }}>Lock Business Day</h3>
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "16px 20px", marginBottom: 20 }}>
                <strong>⚠ This action cannot be undone.</strong> Once locked, the business day is sealed. Any changes will require an administrator override and will be recorded in the audit trail.
              </div>
              <div style={{ background: "#f8fafc", border: "1px solid #d1d9e6", borderRadius: 9, padding: "18px 20px", marginBottom: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Closing Summary</div>
                {[
                  ["Total Received", report ? money(report.totals.received_paise) : "…"],
                  ["Total Expenses", report ? money(report.totals.paid_paise) : "…"],
                  ["Net Received", report ? money(report.totals.received_paise - report.totals.paid_paise) : "…"],
                  ["Cash in Hand", money(cashBalance)],
                  ["Cash Variance", cashAccountMeta ? money(variance) : "—"],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed #e8edf5" }}>
                    <span style={{ fontSize: 13, color: "#475569" }}>{l}</span>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>{v}</span>
                  </div>
                ))}
              </div>
              {!canLock && (
                <div style={{ color: "#d97706", fontSize: 12, marginBottom: 10 }}>
                  {!varianceEntered ? "Enter the physical cash count in step 2 first." : "Remarks are required before locking (step 4)."}
                </div>
              )}
              {closeError && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 10 }}>{closeError}</div>}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setCurrentStep(4)} style={{ background: "#f1f5f9", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 20px", fontSize: 13, cursor: "pointer" }}>← Back</button>
                <button
                  onClick={() => closeMutation.mutate()}
                  disabled={!canLock || closeMutation.isPending}
                  style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 7, padding: "9px 24px", fontSize: 13, fontWeight: 700, cursor: canLock ? "pointer" : "default", opacity: canLock ? 1 : 0.5 }}
                >
                  {closeMutation.isPending ? "Locking…" : "Lock Business Day"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
