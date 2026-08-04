import { useState } from "react"
import { accounts, transactions, expenses } from "../data/mockData"

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN")
}

const steps = [
  { id: 1, label: "Verify Pending Work", desc: "Check all open transactions" },
  { id: 2, label: "Verify Cash", desc: "Physical count vs system balance" },
  { id: 3, label: "Verify Bank Balances", desc: "Match all accounts" },
  { id: 4, label: "Record Adjustments", desc: "Enter variance if any" },
  { id: 5, label: "Lock Business Day", desc: "Confirm and seal the day" },
  { id: 6, label: "Generate Report", desc: "Daily closing statement" },
]

export default function DailyClosing() {
  const [currentStep, setCurrentStep] = useState(1)
  const [physicaCash, setPhysicalCash] = useState("")
  const [remarks, setRemarks] = useState("")
  const [closed, setClosed] = useState(false)

  const todayIncome = transactions.reduce((s, t) => s + t.payment, 0)
  const todayExpenses = expenses.filter(e => e.date === "2026-08-04").reduce((s, e) => s + e.amount, 0)
  const cashAccount = accounts.find(a => a.name === "Cash Drawer")!
  const pendingTxns = transactions.filter(t => t.status !== "Completed")

  if (closed) {
    return (
      <div style={{ padding: "40px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div style={{ background: "#f0fdf4", border: "2px solid #16a34a", borderRadius: 16, padding: "40px 48px", textAlign: "center", maxWidth: 480 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
          <h2 style={{ margin: "0 0 8px", color: "#16a34a", fontSize: 22 }}>Business Day Closed</h2>
          <p style={{ color: "#64748b", margin: "0 0 20px" }}>4 August 2026 · Closed at 7:42 PM · Closed by Admin</p>
          <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 9, padding: "16px 20px", textAlign: "left", marginBottom: 20 }}>
            {[
              ["Opening Balance (Cash)", fmt(9200)],
              ["Income", "+ " + fmt(todayIncome)],
              ["Expenses", "− " + fmt(todayExpenses)],
              ["Closing Balance", fmt(9200 + todayIncome - todayExpenses)],
            ].map(([l, v], i) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < 3 ? "1px dashed #e8edf5" : "none" }}>
                <span style={{ fontSize: 13, color: "#475569" }}>{l}</span>
                <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </div>
          <button style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Print Closing Report
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Daily Closing</h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>4 August 2026 · Walk through each step to close the business day</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20 }}>
        {/* Step sidebar */}
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "12px 0", height: "fit-content" }}>
          {steps.map(s => (
            <div
              key={s.id}
              onClick={() => setCurrentStep(s.id)}
              style={{
                padding: "12px 16px",
                cursor: "pointer",
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
              {pendingTxns.length === 0 ? (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "16px 20px", color: "#16a34a", fontWeight: 500 }}>
                  ✓ All transactions are completed. No pending work.
                </div>
              ) : (
                <div>
                  <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "12px 16px", color: "#d97706", marginBottom: 14 }}>
                    ⚠ {pendingTxns.length} transactions require attention before closing.
                  </div>
                  {pendingTxns.map(t => (
                    <div key={t.id} style={{ padding: "10px 14px", border: "1px solid #fde68a", borderRadius: 7, marginBottom: 8, background: "#fffbeb", display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#3b6cb7" }}>{t.id}</span>
                        <span style={{ fontSize: 13, marginLeft: 10 }}>{t.customer} — {t.service}</span>
                      </div>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "#d97706", fontWeight: 700 }}>Pending: {fmt(t.pending)}</span>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                <div style={{ background: "#f0f4f8", borderRadius: 8, padding: "16px 18px" }}>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>System Cash Balance</div>
                  <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 700, color: "#1e3a5f" }}>{fmt(cashAccount.balance)}</div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 6 }}>Physical Cash Count (₹)</label>
                  <input
                    type="number"
                    value={physicaCash}
                    onChange={e => setPhysicalCash(e.target.value)}
                    placeholder="Enter counted amount…"
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d9e6", borderRadius: 7, fontSize: 16, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}
                  />
                  {physicaCash && (
                    <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: Number(physicaCash) === cashAccount.balance ? "#16a34a" : "#d97706" }}>
                      Variance: {fmt(Number(physicaCash) - cashAccount.balance)}
                    </div>
                  )}
                </div>
              </div>
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
                {accounts.filter(a => a.type !== "Cash").map(a => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", border: "1px solid #d1d9e6", borderRadius: 8, background: "#fafbfd" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{a.bank}</div>
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#1e3a5f" }}>{fmt(a.balance)}</div>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Adjustment Amount (₹)</label>
                  <input type="number" placeholder="0 (positive = surplus, negative = shortage)" style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Remarks</label>
                  <input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Reason for adjustment…" style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
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
                  ["Total Income", fmt(todayIncome)],
                  ["Total Expenses", fmt(todayExpenses)],
                  ["Net Profit", fmt(todayIncome - todayExpenses)],
                  ["Cash in Hand", fmt(cashAccount.balance)],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed #e8edf5" }}>
                    <span style={{ fontSize: 13, color: "#475569" }}>{l}</span>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setCurrentStep(4)} style={{ background: "#f1f5f9", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 20px", fontSize: 13, cursor: "pointer" }}>← Back</button>
                <button onClick={() => { setCurrentStep(6); setClosed(true) }} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 7, padding: "9px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Lock Business Day
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
