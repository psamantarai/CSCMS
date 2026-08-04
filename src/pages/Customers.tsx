import { useState } from "react"
import { customers, transactions } from "../data/mockData"
import { fmt } from "../lib/format"

export default function Customers() {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<number | null>(null)

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.village.toLowerCase().includes(search.toLowerCase())
  )

  const customer = selected !== null ? customers.find(c => c.id === selected) : null
  const custTxns = customer ? transactions.filter(t => t.customer === customer.name) : []

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* List panel */}
      <div style={{ width: 320, borderRight: "1px solid #d1d9e6", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid #eef1f7" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16, fontFamily: "'Roboto Slab', serif" }}>Customers</h2>
          <div style={{ position: "relative" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, phone, village…"
              style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid #d1d9e6", borderRadius: 7, fontSize: 13, background: "#f8fafc", outline: "none", boxSizing: "border-box" }}
            />
            <svg style={{ position: "absolute", left: 9, top: 9, color: "#94a3b8" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {filtered.map(c => (
            <div
              key={c.id}
              onClick={() => setSelected(c.id)}
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #f1f5f9",
                cursor: "pointer",
                background: selected === c.id ? "#eff6ff" : "transparent",
                borderLeft: selected === c.id ? "3px solid #1e3a5f" : "3px solid transparent",
                transition: "background 0.1s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{c.phone} · {c.village}</div>
                </div>
                {c.outstanding > 0 && (
                  <span style={{ background: "#fef3c7", color: "#d97706", fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 20 }}>
                    {fmt(c.outstanding)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Last visit: {c.lastVisit}</div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No customers found</div>
          )}
        </div>
        <div style={{ padding: "10px 16px", borderTop: "1px solid #eef1f7" }}>
          <button style={{ width: "100%", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Add New Customer
          </button>
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        {customer ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>{customer.name}</h2>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>{customer.phone} · {customer.village}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ padding: "7px 14px", border: "1px solid #d1d9e6", borderRadius: 7, background: "#fff", fontSize: 13, cursor: "pointer" }}>Edit</button>
                <button style={{ padding: "7px 14px", border: "none", borderRadius: 7, background: "#1e3a5f", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>New Transaction</button>
              </div>
            </div>

            {/* Profile cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
              {[
                { label: "Aadhaar", value: customer.aadhaar },
                { label: "Outstanding Balance", value: fmt(customer.outstanding), highlight: customer.outstanding > 0 },
                { label: "Last Visit", value: customer.lastVisit },
              ].map(f => (
                <div key={f.label} style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{f.label}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 600, color: f.highlight ? "#d97706" : "#1a2332" }}>{f.value}</div>
                </div>
              ))}
            </div>

            {/* Transaction history */}
            <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef1f7" }}>
                <h3 style={{ margin: 0, fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Service History</h3>
              </div>
              {custTxns.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["ID", "Service", "Payment", "Pending", "Status", "Time"].map(h => (
                        <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {custTxns.map((t, i) => (
                      <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12, color: "#3b6cb7" }}>{t.id}</td>
                        <td style={{ padding: "9px 14px", fontSize: 13 }}>{t.service}</td>
                        <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{fmt(t.payment)}</td>
                        <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12, color: t.pending > 0 ? "#d97706" : "#94a3b8" }}>{t.pending > 0 ? fmt(t.pending) : "—"}</td>
                        <td style={{ padding: "9px 14px" }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                            background: t.status === "Completed" ? "#dcfce7" : t.status === "Pending" ? "#fef3c7" : "#fee2e2",
                            color: t.status === "Completed" ? "#16a34a" : t.status === "Pending" ? "#d97706" : "#dc2626",
                          }}>{t.status}</span>
                        </td>
                        <td style={{ padding: "9px 14px", fontSize: 12, color: "#64748b" }}>{t.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: 24, color: "#94a3b8", fontSize: 13 }}>No transactions found for today.</div>
              )}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <p style={{ marginTop: 12, fontSize: 14 }}>Select a customer to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}
