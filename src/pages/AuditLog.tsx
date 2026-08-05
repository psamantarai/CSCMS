import { Fragment, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { formatDate, formatTime } from "../lib/format"
import { TableRowState } from "../components/QueryState"

type AuditEntry = {
  id: number
  table_name: string
  row_id: number
  action: string
  before_json: string | null
  after_json: string | null
  user_id: number | null
  username: string | null
  created_at: string
}

const tableLabel: Record<string, string> = {
  accounts: "Accounts",
  expenses: "Expenses",
  transactions: "Transactions",
  payments: "Payments",
  banking_transactions: "Banking",
  account_transfers: "Transfers",
  business_days: "Business Days",
}

const actionColors: Record<string, { bg: string; color: string }> = {
  create: { bg: "#f0fdf4", color: "#16a34a" },
  update: { bg: "#eff6ff", color: "#2563eb" },
  delete: { bg: "#fef2f2", color: "#dc2626" },
  close:  { bg: "#fdf4ff", color: "#9333ea" },
}

const PAGE_SIZE = 50

function prettyJson(s: string | null): string {
  if (s === null) return "—"
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}

export default function AuditLog() {
  const [tableName, setTableName] = useState("")
  const [action, setAction] = useState("")
  const [businessDate, setBusinessDate] = useState("")
  const [offset, setOffset] = useState(0)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const filters: Record<string, string | number> = { limit: PAGE_SIZE, offset }
  if (tableName) filters.table_name = tableName
  if (action) filters.action = action
  if (businessDate) filters.business_date = businessDate

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.auditLogs(filters),
    queryFn: () => {
      const params = new URLSearchParams(filters as Record<string, string>)
      return api.get<{ items: AuditEntry[]; total: number }>(`/audit?${params}`)
    },
  })
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const showRows = !isLoading && !error

  function resetPage() {
    setOffset(0)
  }

  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Audit Log</h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Before/after record of every financial mutation</p>
      </div>

      {/* Filters */}
      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px auto", gap: 10, marginBottom: 22, alignItems: "end" }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Table</label>
          <select value={tableName} onChange={e => { setTableName(e.target.value); resetPage() }} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
            <option value="">All tables</option>
            {Object.entries(tableLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Action</label>
          <select value={action} onChange={e => { setAction(e.target.value); resetPage() }} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
            <option value="">All actions</option>
            {Object.keys(actionColors).map(a => <option key={a} value={a}>{a[0].toUpperCase() + a.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Date</label>
          <input type="date" value={businessDate} onChange={e => { setBusinessDate(e.target.value); resetPage() }} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <button
          onClick={() => { setTableName(""); setAction(""); setBusinessDate(""); resetPage() }}
          style={{ border: "1px solid #d1d9e6", background: "#fff", borderRadius: 7, padding: "8px 16px", fontSize: 13, cursor: "pointer", color: "#475569" }}
        >
          Clear filters
        </button>
      </div>

      {/* Audit table */}
      <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Entry", "Date", "Time", "Table", "Row", "Action", "User"].map(h => (
                <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TableRowState isLoading={isLoading} error={error} colSpan={7} />
            {showRows && items.map((e, i) => {
              const ac = actionColors[e.action] || { bg: "#f8fafc", color: "#475569" }
              const expanded = expandedId === e.id
              return (
                <Fragment key={e.id}>
                  <tr
                    onClick={() => setExpandedId(expanded ? null : e.id)}
                    style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: expanded ? "none" : "1px solid #f1f5f9", cursor: "pointer" }}
                  >
                    <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#3b6cb7", fontWeight: 600 }}>#{e.id}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{formatDate(e.created_at.split(" ")[0])}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#94a3b8" }}>{formatTime(e.created_at)}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>{tableLabel[e.table_name] ?? e.table_name}</td>
                    <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#475569" }}>#{e.row_id}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: ac.bg, color: ac.color }}>{e.action}</span>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>{e.username ?? "—"}</td>
                  </tr>
                  {expanded && (
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                      <td colSpan={7} style={{ padding: "12px 14px 16px" }}>
                        <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                          <div>
                            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Before</div>
                            <pre style={{ margin: 0, background: "#fff", border: "1px solid #eef1f7", borderRadius: 6, padding: 10, fontSize: 11, color: "#334155", overflowX: "auto" }}>{prettyJson(e.before_json)}</pre>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>After</div>
                            <pre style={{ margin: 0, background: "#fff", border: "1px solid #eef1f7", borderRadius: 6, padding: 10, fontSize: 11, color: "#334155", overflowX: "auto" }}>{prettyJson(e.after_json)}</pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {showRows && items.length === 0 && (
              <tr><td colSpan={7} style={{ padding: "24px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No audit entries match these filters.</td></tr>
            )}
          </tbody>
        </table>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderTop: "1px solid #eef1f7" }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>
            {!showRows ? "—" : total === 0 ? "0 entries" : `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
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
