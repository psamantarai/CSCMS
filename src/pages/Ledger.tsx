import { ledgerEntries } from "../data/mockData"

const typeColors: Record<string, { bg: string; color: string }> = {
  "Service Income": { bg: "#f0fdf4", color: "#16a34a" },
  "Commission":     { bg: "#eff6ff", color: "#2563eb" },
  "Expense":        { bg: "#fef2f2", color: "#dc2626" },
  "Transfer":       { bg: "#fdf4ff", color: "#9333ea" },
}

export default function Ledger() {
  const totalCredit = ledgerEntries.reduce((s, e) => s + e.credit, 0)
  const totalDebit  = ledgerEntries.reduce((s, e) => s + e.debit, 0)
  const net = totalCredit - totalDebit

  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Financial Ledger</h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Single source of truth for all financial events · 4 August 2026</p>
      </div>

      {/* Net summary */}
      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 9, padding: "16px 18px" }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Total Credits</div>
          <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: "#16a34a" }}>₹{totalCredit.toLocaleString("en-IN")}</div>
        </div>
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, padding: "16px 18px" }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Total Debits</div>
          <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: "#dc2626" }}>₹{totalDebit.toLocaleString("en-IN")}</div>
        </div>
        <div style={{ background: net >= 0 ? "#eff6ff" : "#fef2f2", border: `1px solid ${net >= 0 ? "#bfdbfe" : "#fecaca"}`, borderRadius: 9, padding: "16px 18px" }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Net Position</div>
          <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: net >= 0 ? "#2563eb" : "#dc2626" }}>
            {net >= 0 ? "+" : ""}₹{Math.abs(net).toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* Ledger table */}
      <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Entry", "Date", "Description", "Type", "Account", "Debit", "Credit"].map(h => (
                <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ledgerEntries.map((e, i) => {
              const tc = typeColors[e.type] || { bg: "#f8fafc", color: "#475569" }
              return (
                <tr key={e.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#3b6cb7", fontWeight: 600 }}>{e.id}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{e.date}</td>
                  <td style={{ padding: "10px 14px", fontSize: 13 }}>{e.description}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: tc.bg, color: tc.color }}>{e.type}</span>
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>{e.account}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: e.debit > 0 ? "#dc2626" : "#94a3b8" }}>
                    {e.debit > 0 ? `₹${e.debit.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: e.credit > 0 ? "#16a34a" : "#94a3b8" }}>
                    {e.credit > 0 ? `₹${e.credit.toLocaleString("en-IN")}` : "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: "#f8fafc", borderTop: "2px solid #d1d9e6" }}>
              <td colSpan={5} style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700 }}>Totals</td>
              <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#dc2626" }}>₹{totalDebit.toLocaleString("en-IN")}</td>
              <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#16a34a" }}>₹{totalCredit.toLocaleString("en-IN")}</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </div>
  )
}
