import { useState } from "react"
import { transactions } from "../data/mockData"
import { fmt } from "../lib/format"

const services = ["All", "Aadhaar", "PAN", "Utility Payments", "AEPS", "Printing", "Certificates", "Ticket Booking"]
const statuses = ["All", "Completed", "Pending", "Partial"]

export default function Transactions() {
  const [serviceFilter, setServiceFilter] = useState("All")
  const [statusFilter, setStatusFilter] = useState("All")
  const [showForm, setShowForm] = useState(false)

  const filtered = transactions.filter(t => {
    const svcMatch = serviceFilter === "All" || t.service.includes(serviceFilter)
    const stMatch = statusFilter === "All" || t.status === statusFilter
    return svcMatch && stMatch
  })

  const totalIncome = filtered.reduce((s, t) => s + t.payment, 0)
  const totalPending = filtered.reduce((s, t) => s + t.pending, 0)

  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Transactions</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>4 August 2026 · {transactions.length} entries</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          + New Transaction
        </button>
      </div>

      {/* New Transaction Form */}
      {showForm && (
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 24px", marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>New Transaction</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 14 }}>
            {[
              { label: "Customer", placeholder: "Search customer…", type: "text" },
              { label: "Service", placeholder: "Select service…", type: "text" },
              { label: "Fees (₹)", placeholder: "0.00", type: "number" },
              { label: "Service Charge (₹)", placeholder: "0.00", type: "number" },
              { label: "Discount (₹)", placeholder: "0.00", type: "number" },
              { label: "Payment Received (₹)", placeholder: "0.00", type: "number" },
            ].map(f => (
              <div key={f.label}>
                <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>{f.label}</label>
                <input type={f.type} placeholder={f.placeholder} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save Transaction</button>
            <button onClick={() => setShowForm(false)} style={{ background: "#f1f5f9", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 20px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Summary bar */}
      <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 16px" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>TOTAL COLLECTED</div>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 16, color: "#16a34a" }}>{fmt(totalIncome)}</div>
        </div>
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 16px" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>TOTAL PENDING</div>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 16, color: "#d97706" }}>{fmt(totalPending)}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {statuses.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer",
            border: statusFilter === s ? "1px solid #1e3a5f" : "1px solid #d1d9e6",
            background: statusFilter === s ? "#1e3a5f" : "#fff",
            color: statusFilter === s ? "#fff" : "#475569",
          }}>{s}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["TXN ID", "Customer", "Service", "Fees", "Charge", "Discount", "Payment", "Pending", "Operator", "Time", "Status"].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => (
              <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: "#3b6cb7", fontWeight: 600 }}>{t.id}</td>
                <td style={{ padding: "9px 12px", fontSize: 13 }}>{t.customer}</td>
                <td style={{ padding: "9px 12px", fontSize: 13, color: "#475569" }}>{t.service}</td>
                <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12 }}>{fmt(t.fees)}</td>
                <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: "#16a34a" }}>+{fmt(t.charge)}</td>
                <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: t.discount > 0 ? "#dc2626" : "#94a3b8" }}>{t.discount > 0 ? `-${fmt(t.discount)}` : "—"}</td>
                <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{fmt(t.payment)}</td>
                <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: t.pending > 0 ? "#d97706" : "#94a3b8" }}>{t.pending > 0 ? fmt(t.pending) : "—"}</td>
                <td style={{ padding: "9px 12px", fontSize: 12, color: "#64748b" }}>{t.operator}</td>
                <td style={{ padding: "9px 12px", fontSize: 12, color: "#94a3b8" }}>{t.time}</td>
                <td style={{ padding: "9px 12px" }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                    background: t.status === "Completed" ? "#dcfce7" : t.status === "Pending" ? "#fef3c7" : "#fee2e2",
                    color: t.status === "Completed" ? "#16a34a" : t.status === "Pending" ? "#d97706" : "#dc2626",
                  }}>{t.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
