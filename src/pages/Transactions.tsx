import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, formatDate, formatTime, fromPaise } from "../lib/format"
import { TableRowState } from "../components/QueryState"
import TransactionForm from "../components/forms/TransactionForm"

type Service = { id: number; name: string; is_active: number }

type Transaction = {
  id: number
  business_date: string
  customer_id: number | null
  customer_name: string | null
  service_id: number
  service_name: string
  fee_paise: number
  charge_paise: number
  discount_paise: number
  total_paise: number
  paid_paise: number
  status: "completed" | "partial" | "pending"
  created_at: string
}

const statuses = ["All", "completed", "partial", "pending"] as const

const statusColor: Record<Transaction["status"], { bg: string; fg: string }> = {
  completed: { bg: "#dcfce7", fg: "#16a34a" },
  partial: { bg: "#fee2e2", fg: "#dc2626" },
  pending: { bg: "#fef3c7", fg: "#d97706" },
}

const PAGE_SIZE = 50

export default function Transactions() {
  const [businessDate, setBusinessDate] = useState("")
  const [serviceId, setServiceId] = useState("")
  const [statusFilter, setStatusFilter] = useState<typeof statuses[number]>("All")
  const [offset, setOffset] = useState(0)
  const [showForm, setShowForm] = useState(false)

  const { data: services = [] } = useQuery({
    queryKey: queryKeys.services,
    queryFn: () => api.get<Service[]>("/services"),
  })

  const filters: Record<string, string | number> = { limit: PAGE_SIZE, offset }
  if (businessDate) filters.business_date = businessDate
  if (serviceId) filters.service_id = serviceId
  if (statusFilter !== "All") filters.status = statusFilter

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.transactions(filters),
    queryFn: () => {
      const params = new URLSearchParams(filters as Record<string, string>)
      return api.get<{ items: Transaction[]; total: number }>(`/transactions?${params}`)
    },
  })
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const showFigures = !isLoading && !error

  const totalCollected = items.reduce((s, t) => s + t.paid_paise, 0)
  const totalPending = items.reduce((s, t) => s + Math.max(0, t.total_paise - t.paid_paise), 0)

  function resetPage() {
    setOffset(0)
  }

  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Transactions</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>{showFigures ? `${total} entries` : "—"}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {showForm ? "Cancel" : "+ New Transaction"}
        </button>
      </div>

      {/* New Transaction Form */}
      {showForm && (
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 24px", marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>New Transaction</h3>
          <TransactionForm onSuccess={() => setShowForm(false)} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* Summary bar */}
      <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 16px" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>TOTAL COLLECTED (this page)</div>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 16, color: "#16a34a" }}>{showFigures ? fmt(fromPaise(totalCollected)) : "—"}</div>
        </div>
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 16px" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>TOTAL PENDING (this page)</div>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 16, color: "#d97706" }}>{showFigures ? fmt(fromPaise(totalPending)) : "—"}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 10, marginBottom: 14, alignItems: "end" }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Date</label>
          <input type="date" value={businessDate} onChange={e => { setBusinessDate(e.target.value); resetPage() }} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Service</label>
          <select value={serviceId} onChange={e => { setServiceId(e.target.value); resetPage() }} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
            <option value="">All services</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <button
          onClick={() => { setBusinessDate(""); setServiceId(""); setStatusFilter("All"); resetPage() }}
          style={{ border: "1px solid #d1d9e6", background: "#fff", borderRadius: 7, padding: "8px 16px", fontSize: 13, cursor: "pointer", color: "#475569" }}
        >
          Clear filters
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {statuses.map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); resetPage() }} style={{
            padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer", textTransform: "capitalize",
            border: statusFilter === s ? "1px solid #1e3a5f" : "1px solid #d1d9e6",
            background: statusFilter === s ? "#1e3a5f" : "#fff",
            color: statusFilter === s ? "#fff" : "#475569",
          }}>{s}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["TXN ID", "Date", "Time", "Customer", "Service", "Fee", "Charge", "Discount", "Total", "Paid", "Pending", "Status"].map(h => (
                <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TableRowState isLoading={isLoading} error={error} colSpan={12} />
            {showFigures && items.map((t, i) => {
              const pending = Math.max(0, t.total_paise - t.paid_paise)
              return (
                <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: "#3b6cb7", fontWeight: 600 }}>#{t.id}</td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: "#64748b" }}>{formatDate(t.business_date)}</td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: "#94a3b8" }}>{formatTime(t.created_at)}</td>
                  <td style={{ padding: "9px 12px", fontSize: 13 }}>{t.customer_name ?? "Walk-in"}</td>
                  <td style={{ padding: "9px 12px", fontSize: 13, color: "#475569" }}>{t.service_name}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12 }}>{fmt(fromPaise(t.fee_paise))}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: "#16a34a" }}>{t.charge_paise > 0 ? `+${fmt(fromPaise(t.charge_paise))}` : "—"}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: t.discount_paise > 0 ? "#dc2626" : "#94a3b8" }}>{t.discount_paise > 0 ? `-${fmt(fromPaise(t.discount_paise))}` : "—"}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{fmt(fromPaise(t.total_paise))}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12 }}>{fmt(fromPaise(t.paid_paise))}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: pending > 0 ? "#d97706" : "#94a3b8" }}>{pending > 0 ? fmt(fromPaise(pending)) : "—"}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, textTransform: "capitalize", background: statusColor[t.status].bg, color: statusColor[t.status].fg }}>{t.status}</span>
                  </td>
                </tr>
              )
            })}
            {showFigures && items.length === 0 && (
              <tr><td colSpan={12} style={{ padding: "24px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No transactions match these filters.</td></tr>
            )}
          </tbody>
        </table>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderTop: "1px solid #eef1f7" }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>
            {!showFigures ? "—" : total === 0 ? "0 entries" : `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} style={{ border: "1px solid #d1d9e6", background: "#fff", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: offset === 0 ? "default" : "pointer", opacity: offset === 0 ? 0.5 : 1 }}>Prev</button>
            <button disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)} style={{ border: "1px solid #d1d9e6", background: "#fff", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: offset + PAGE_SIZE >= total ? "default" : "pointer", opacity: offset + PAGE_SIZE >= total ? 0.5 : 1 }}>Next</button>
          </div>
        </div>
      </div>
    </div>
  )
}
