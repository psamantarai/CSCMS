import { useState } from "react"
import { expenses } from "../data/mockData"

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN")
}

const categories = ["Rent", "Internet", "Electricity", "Paper", "Ink", "Repairs", "Miscellaneous"]
const catColors: Record<string, string> = {
  Internet: "#2563eb", Electricity: "#d97706", Paper: "#0891b2",
  Ink: "#7c3aed", Rent: "#dc2626", Repairs: "#64748b", Miscellaneous: "#475569"
}

export default function Expenses() {
  const [showForm, setShowForm] = useState(false)
  const total = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Expenses</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>August 2026 · {expenses.length} entries · Total: <strong style={{ fontFamily: "monospace" }}>{fmt(total)}</strong></p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          + Record Expense
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 24px", marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>Record Expense</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Category</label>
              <select style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff" }}>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Amount (₹)</label>
              <input type="number" placeholder="0.00" style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Date</label>
              <input type="date" defaultValue="2026-08-04" style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Note</label>
              <input placeholder="Brief description…" style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <button style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save</button>
            <button onClick={() => setShowForm(false)} style={{ background: "#f1f5f9", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 20px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Category summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {categories.slice(0, 4).map(cat => {
          const catExpenses = expenses.filter(e => e.category === cat)
          const catTotal = catExpenses.reduce((s, e) => s + e.amount, 0)
          return (
            <div key={cat} style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 9, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: catColors[cat] || "#475569" }}>{cat}</span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{catExpenses.length} entries</span>
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: catTotal > 0 ? "#dc2626" : "#94a3b8" }}>
                {catTotal > 0 ? fmt(catTotal) : "—"}
              </div>
            </div>
          )
        })}
      </div>

      {/* Expense list */}
      <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["#", "Category", "Amount", "Date", "Note", ""].map(h => (
                <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {expenses.map((e, i) => (
              <tr key={e.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>{e.id}</td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 9px", borderRadius: 20, background: "#f8fafc", color: catColors[e.category] || "#475569", border: `1px solid ${catColors[e.category] || "#d1d9e6"}20` }}>
                    {e.category}
                  </span>
                </td>
                <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#dc2626" }}>{fmt(e.amount)}</td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{e.date}</td>
                <td style={{ padding: "10px 14px", fontSize: 13, color: "#475569" }}>{e.note}</td>
                <td style={{ padding: "10px 14px" }}>
                  <button style={{ background: "none", border: "1px solid #d1d9e6", borderRadius: 5, padding: "3px 9px", fontSize: 11, cursor: "pointer", color: "#64748b" }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "#f8fafc", borderTop: "2px solid #d1d9e6" }}>
              <td colSpan={2} style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700 }}>Total</td>
              <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#dc2626" }}>{fmt(total)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
