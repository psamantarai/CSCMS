import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import StatCard from "../components/StatCard"
import { BlockState, TableRowState } from "../components/QueryState"
import Modal from "../components/Modal"
import TransactionForm from "../components/forms/TransactionForm"
import BankingEntryForm from "../components/forms/BankingEntryForm"
import ExpenseForm from "../components/forms/ExpenseForm"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, fromPaise, localDateISO } from "../lib/format"

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

  // Service breakdown off today's own transaction list, not a new endpoint —
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
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, margin: 0, color: "#1a2332" }}>Dashboard</h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
          {new Date(`${today}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          {" · "}Business Day {statsReady ? (dash.closing_status === "closed" ? "Closed" : "Open") : "…"}
        </p>
      </div>

      {!statsReady ? (
        <div style={{ marginBottom: 24 }}><BlockState isLoading={dashLoading} error={dashError} /></div>
      ) : (
        <>
          {/* Stats grid */}
          <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
            <StatCard label="Today's Income" value={fmt(fromPaise(dash.today_income_paise))} sub={`${txnData?.total ?? 0} transactions`} color="green"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>} />
            <StatCard label="Today's Expenses" value={fmt(fromPaise(dash.today_expenses_paise))} sub={`${expenseData?.total ?? 0} entries today`} color="red"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>} />
            <StatCard label="Today's Profit" value={fmt(fromPaise(dash.today_profit_paise))} sub="Net after expenses" color="blue"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>} />
            <StatCard label="Pending Credits" value={fmt(fromPaise(dash.pending_credits_paise))} sub="Outstanding across all customers" color="amber"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>} />
          </div>

          <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
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
      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>
        {/* Recent transactions */}
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #eef1f7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontFamily: "'Roboto Slab', serif" }}>Today's Transactions</h3>
            <span style={{ fontSize: 12, color: "#3b6cb7", cursor: "pointer", fontWeight: 500 }}>View All →</span>
          </div>
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["S.No", "Customer", "Service", "Fees", "Charge", "Payment", "Status"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <TableRowState isLoading={txnLoading} error={txnUnavailable} colSpan={7} />
              {!txnLoading && !txnUnavailable && recentTxns.length === 0 && (
                <tr><td colSpan={7} style={{ padding: "24px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No transactions yet today.</td></tr>
              )}
              {recentTxns.map((t, i) => (
                <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: "#3b6cb7", fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ padding: "9px 12px", fontSize: 13 }}>{t.customer_name ?? "Walk-in"}</td>
                  <td style={{ padding: "9px 12px", fontSize: 13, color: "#475569" }}>{t.service_name}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12 }}>{fmt(fromPaise(t.fee_paise))}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: "#16a34a" }}>+{fmt(fromPaise(t.charge_paise))}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{fmt(fromPaise(t.paid_paise))}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                      background: t.status === "completed" ? "#dcfce7" : t.status === "pending" ? "#fef3c7" : "#fee2e2",
                      color: t.status === "completed" ? "#16a34a" : t.status === "pending" ? "#d97706" : "#dc2626",
                    }}>{t.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {/* Service breakdown */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef1f7" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Service Breakdown</h3>
            </div>
            <div style={{ padding: "6px 0" }}>
              {txnLoading || txnUnavailable ? (
                <BlockState isLoading={txnLoading} error={txnUnavailable} />
              ) : serviceBreakdown.length === 0 ? (
                <div style={{ padding: "20px 18px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No services rendered today.</div>
              ) : (
                serviceBreakdown.map(s => (
                  <div key={s.name} style={{ padding: "10px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f8fafc" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{s.count} jobs</div>
                    </div>
                    <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 13, color: "#16a34a" }}>{fmt(fromPaise(s.income))}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ background: "#1e3a5f", borderRadius: 10, padding: "18px 20px", color: "#fff" }}>
            <div style={{ fontSize: 12, color: "#93b4d4", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Quick Actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "New Transaction", modal: "transaction" as QuickModal, path: null as string | null },
                { label: "New Banking Entry", modal: "banking" as QuickModal, path: null as string | null },
                { label: "Record Expense", modal: "expense" as QuickModal, path: null as string | null },
                { label: "Close Business Day", modal: null as QuickModal, path: "/closing" as string | null },
              ].map((a, i) => (
                <button key={a.label} onClick={() => (a.modal ? setOpenModal(a.modal) : navigate(a.path!))} style={{
                  background: i === 3 ? "#f59e0b" : "rgba(255,255,255,0.08)",
                  border: "1px solid " + (i === 3 ? "#f59e0b" : "rgba(255,255,255,0.12)"),
                  borderRadius: 7, padding: "9px 14px", color: i === 3 ? "#1a1000" : "#e2ebf5",
                  fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left",
                  transition: "background 0.15s",
                }}>{a.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {openModal === "transaction" && (
        <Modal open onClose={() => setOpenModal(null)} title="New Transaction">
          <TransactionForm onSuccess={() => setOpenModal(null)} onCancel={() => setOpenModal(null)} />
        </Modal>
      )}
      {openModal === "banking" && (
        <Modal open onClose={() => setOpenModal(null)} title="New Banking Entry">
          <BankingEntryForm onSuccess={() => setOpenModal(null)} onCancel={() => setOpenModal(null)} />
        </Modal>
      )}
      {openModal === "expense" && (
        <Modal open onClose={() => setOpenModal(null)} title="Record Expense">
          <ExpenseForm onSuccess={() => setOpenModal(null)} onCancel={() => setOpenModal(null)} />
        </Modal>
      )}
    </div>
  )
}
