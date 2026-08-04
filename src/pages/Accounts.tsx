import { useState } from "react"
import { accounts } from "../data/mockData"

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN")
}

const typeIcon: Record<string, string> = {
  Cash: "💵",
  Savings: "🏦",
  Current: "🏢",
  Wallet: "📱",
  Settlement: "🔄",
}

const transfers = [
  { id: "TRF-01", from: "Cash Drawer", to: "SBI Savings", amount: 5000, time: "02:30 PM", date: "2026-08-04" },
  { id: "TRF-02", from: "AEPS Settlement", to: "SBI Savings", amount: 15000, time: "06:00 PM", date: "2026-08-03" },
]

export default function Accounts() {
  const [showTransfer, setShowTransfer] = useState(false)
  const total = accounts.reduce((s, a) => s + a.balance, 0)

  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Accounts & Balances</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            Total funds across all accounts: <strong style={{ fontFamily: "monospace", color: "#1e3a5f" }}>{fmt(total)}</strong>
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setShowTransfer(!showTransfer)} style={{ border: "1px solid #1e3a5f", color: "#1e3a5f", background: "#fff", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            ⇄ Internal Transfer
          </button>
          <button style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Add Account
          </button>
        </div>
      </div>

      {/* Transfer form */}
      {showTransfer && (
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 24px", marginBottom: 22 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>Internal Fund Transfer</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 1fr 160px", gap: 10, alignItems: "end" }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>From Account</label>
              <select style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
                {accounts.map(a => <option key={a.id}>{a.name} ({fmt(a.balance)})</option>)}
              </select>
            </div>
            <div style={{ textAlign: "center", paddingBottom: 8, fontSize: 18, color: "#64748b" }}>→</div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>To Account</label>
              <select style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
                {accounts.map(a => <option key={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Amount (₹)</label>
              <input type="number" placeholder="0" style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <button style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Execute Transfer</button>
            <button onClick={() => setShowTransfer(false)} style={{ background: "#f1f5f9", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 20px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "#64748b" }}>Transfer creates two ledger entries — debit source, credit destination.</p>
        </div>
      )}

      {/* Account cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
        {accounts.map(a => (
          <div key={a.id} style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 22px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: a.type === "Cash" ? "#f59e0b" : a.type === "Savings" ? "#1e3a5f" : a.type === "Current" ? "#7c3aed" : a.type === "Wallet" ? "#0891b2" : "#059669" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, paddingLeft: 4 }}>
              <div>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{typeIcon[a.type] || "🏦"}</div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{a.name}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{a.bank !== "—" ? a.bank : "Internal"} · {a.type}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#dcfce7", color: "#16a34a" }}>{a.status}</span>
            </div>
            {a.number !== "—" && (
              <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace", marginBottom: 10, paddingLeft: 4 }}>{a.number}</div>
            )}
            <div style={{ paddingLeft: 4 }}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Current Balance</div>
              <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: "#1e3a5f" }}>{fmt(a.balance)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Transfer history */}
      <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef1f7" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Recent Internal Transfers</h3>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["ID", "From", "To", "Amount", "Date", "Time"].map(h => (
                <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transfers.map((t, i) => (
              <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12, color: "#3b6cb7" }}>{t.id}</td>
                <td style={{ padding: "9px 14px", fontSize: 13 }}>{t.from}</td>
                <td style={{ padding: "9px 14px", fontSize: 13 }}>{t.to}</td>
                <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#1e3a5f" }}>{fmt(t.amount)}</td>
                <td style={{ padding: "9px 14px", fontSize: 12, color: "#64748b" }}>{t.date}</td>
                <td style={{ padding: "9px 14px", fontSize: 12, color: "#94a3b8" }}>{t.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
