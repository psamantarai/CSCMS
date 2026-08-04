import { bankingTransactions } from "../data/mockData"
import { fmt } from "../lib/format"

const typeColors: Record<string, { bg: string; color: string }> = {
  "AEPS Withdrawal": { bg: "#eff6ff", color: "#2563eb" },
  "Money Transfer":  { bg: "#fdf4ff", color: "#9333ea" },
  "Deposit":         { bg: "#f0fdf4", color: "#16a34a" },
  "Balance Enquiry": { bg: "#f8fafc", color: "#475569" },
}

const totalCommission = bankingTransactions.reduce((s, t) => s + t.commission, 0)
const totalVolume = bankingTransactions.reduce((s, t) => s + t.amount, 0)

export default function Banking() {
  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Banking Services</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>4 August 2026 · AEPS · IMPS · Money Transfer · Deposits</p>
        </div>
        <button style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          + New Banking Entry
        </button>
      </div>

      {/* Summary */}
      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Volume", value: fmt(totalVolume), color: "#1e3a5f", bg: "#eff6ff" },
          { label: "Total Commission", value: fmt(totalCommission), color: "#16a34a", bg: "#f0fdf4" },
          { label: "AEPS Transactions", value: bankingTransactions.filter(t => t.type === "AEPS Withdrawal").length.toString(), color: "#2563eb", bg: "#eff6ff" },
          { label: "Money Transfers", value: bankingTransactions.filter(t => t.type === "Money Transfer").length.toString(), color: "#9333ea", bg: "#fdf4ff" },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: "1px solid #d1d9e6", borderRadius: 9, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Service type cards */}
      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "AEPS Withdrawal", icon: "💳", desc: "Biometric cash" },
          { label: "Money Transfer", icon: "↗", desc: "IMPS / NEFT" },
          { label: "Cash Deposit", icon: "↙", desc: "Bank deposit" },
          { label: "Balance Enquiry", icon: "🔍", desc: "Account check" },
          { label: "Mini Statement", icon: "📄", desc: "Last 5 txns" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 9, padding: "16px 14px", cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#3b6cb7"; (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(59,108,183,0.12)" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#d1d9e6"; (e.currentTarget as HTMLElement).style.boxShadow = "none" }}
          >
            <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Transactions table */}
      <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef1f7" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Today's Banking Transactions</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["ID", "Customer", "Type", "Amount", "Commission", "Settlement Account", "Time"].map(h => (
                <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bankingTransactions.map((t, i) => {
              const tc = typeColors[t.type] || { bg: "#f8fafc", color: "#475569" }
              return (
                <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#3b6cb7", fontWeight: 600 }}>{t.id}</td>
                  <td style={{ padding: "10px 14px", fontSize: 13 }}>{t.customer}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: tc.bg, color: tc.color }}>{t.type}</span>
                  </td>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{t.amount > 0 ? fmt(t.amount) : "—"}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#16a34a", fontWeight: 600 }}>+{fmt(t.commission)}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>{t.account}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#94a3b8" }}>{t.time}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
