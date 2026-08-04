import { useState } from "react"
import { transactions, expenses, accounts } from "../data/mockData"

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN")
}

const reportTypes = [
  { id: "daily", label: "Daily Report" },
  { id: "monthly", label: "Monthly Report" },
  { id: "service", label: "Service-wise" },
  { id: "pl", label: "Profit & Loss" },
  { id: "commission", label: "Banking Commission" },
]

const monthlyData = [
  { month: "Mar 2026", income: 48200, expenses: 3100, profit: 45100 },
  { month: "Apr 2026", income: 52400, expenses: 3400, profit: 49000 },
  { month: "May 2026", income: 44100, expenses: 2900, profit: 41200 },
  { month: "Jun 2026", income: 61300, expenses: 3800, profit: 57500 },
  { month: "Jul 2026", income: 57800, expenses: 3200, profit: 54600 },
  { month: "Aug 2026", income: 9282, expenses: 3309, profit: 5973 },
]

const maxProfit = Math.max(...monthlyData.map(m => m.income))

export default function Reports() {
  const [activeReport, setActiveReport] = useState("daily")
  const todayIncome = transactions.reduce((s, t) => s + t.payment, 0)
  const todayExpenses = expenses.filter(e => e.date === "2026-08-04").reduce((s, e) => s + e.amount, 0)

  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Reports</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Daily, monthly, and service-wise financial summaries</p>
        </div>
        <button style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          ⬇ Export PDF
        </button>
      </div>

      {/* Report type tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#f0f4f8", borderRadius: 9, padding: 4, width: "fit-content" }}>
        {reportTypes.map(r => (
          <button key={r.id} onClick={() => setActiveReport(r.id)} style={{
            padding: "7px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "none",
            background: activeReport === r.id ? "#1e3a5f" : "transparent",
            color: activeReport === r.id ? "#fff" : "#64748b",
            transition: "all 0.15s",
          }}>{r.label}</button>
        ))}
      </div>

      {activeReport === "daily" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
            {/* Daily summary */}
            <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 24px" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Daily Summary — 4 August 2026</h3>
              {[
                { label: "Opening Cash Balance", value: fmt(9200), color: "#64748b" },
                { label: "Income Collected", value: "+ " + fmt(todayIncome), color: "#16a34a" },
                { label: "Expenses Paid", value: "− " + fmt(todayExpenses), color: "#dc2626" },
                { label: "Closing Cash Balance", value: fmt(9200 + todayIncome - todayExpenses), color: "#1e3a5f" },
              ].map((r, i) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: i < 3 ? "1px dashed #e8edf5" : "2px solid #d1d9e6" }}>
                  <span style={{ fontSize: 13, color: "#475569" }}>{r.label}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: r.color }}>{r.value}</span>
                </div>
              ))}
            </div>

            {/* Account balances */}
            <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 24px" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Account Balances</h3>
              {accounts.map((a, i) => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: i < accounts.length - 1 ? "1px dashed #e8edf5" : "none" }}>
                  <span style={{ fontSize: 13, color: "#475569" }}>{a.name}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#1e3a5f" }}>{fmt(a.balance)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Service breakdown table */}
          <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef1f7" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Transaction Register</h3>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["TXN", "Customer", "Service", "Fees", "Charge", "Payment", "Status"].map(h => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => (
                  <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12, color: "#3b6cb7" }}>{t.id}</td>
                    <td style={{ padding: "8px 14px", fontSize: 13 }}>{t.customer}</td>
                    <td style={{ padding: "8px 14px", fontSize: 13, color: "#475569" }}>{t.service}</td>
                    <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12 }}>{fmt(t.fees)}</td>
                    <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12, color: "#16a34a" }}>+{fmt(t.charge)}</td>
                    <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{fmt(t.payment)}</td>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: t.status === "Completed" ? "#dcfce7" : t.status === "Pending" ? "#fef3c7" : "#fee2e2", color: t.status === "Completed" ? "#16a34a" : t.status === "Pending" ? "#d97706" : "#dc2626" }}>{t.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeReport === "monthly" && (
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "24px" }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 15, fontFamily: "'Roboto Slab', serif" }}>Monthly Income vs Expenses (Mar–Aug 2026)</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {monthlyData.map(m => (
              <div key={m.month} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 70, fontSize: 12, color: "#64748b", flexShrink: 0 }}>{m.month}</div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ height: 14, borderRadius: 3, background: "#1e3a5f", width: `${(m.income / maxProfit) * 100}%`, minWidth: 4 }} />
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "#1e3a5f", fontWeight: 600 }}>{fmt(m.income)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ height: 14, borderRadius: 3, background: "#fca5a5", width: `${(m.expenses / maxProfit) * 100}%`, minWidth: 4 }} />
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "#dc2626", fontWeight: 600 }}>{fmt(m.expenses)}</span>
                  </div>
                </div>
                <div style={{ width: 80, textAlign: "right", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#16a34a" }}>{fmt(m.profit)}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 16, paddingTop: 14, borderTop: "1px solid #eef1f7" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 12, borderRadius: 2, background: "#1e3a5f" }} /><span style={{ fontSize: 12, color: "#64748b" }}>Income</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 12, borderRadius: 2, background: "#fca5a5" }} /><span style={{ fontSize: 12, color: "#64748b" }}>Expenses</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 12, height: 12, borderRadius: 2, background: "#16a34a" }} /><span style={{ fontSize: 12, color: "#64748b" }}>Profit</span></div>
          </div>
        </div>
      )}

      {(activeReport === "service" || activeReport === "pl" || activeReport === "commission") && (
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "40px", textAlign: "center", color: "#94a3b8" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          <div style={{ fontSize: 14, marginBottom: 6 }}>{reportTypes.find(r => r.id === activeReport)?.label}</div>
          <div style={{ fontSize: 13 }}>Available in full application with backend data.</div>
        </div>
      )}
    </div>
  )
}
