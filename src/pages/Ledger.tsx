import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, formatDate, formatTime, fromPaise } from "../lib/format"
import { TableRowState } from "../components/QueryState"

type Account = { id: number; name: string }

type LedgerEntry = {
  id: number
  business_date: string
  account_id: number
  amount_paise: number
  entry_type: string
  description: string | null
  created_at: string
  running_balance: number
}

const typeLabel: Record<string, string> = {
  service_income: "Service Income",
  commission: "Commission",
  expense: "Expense",
  transfer: "Transfer",
  customer_payment: "Customer Payment",
  adjustment: "Adjustment",
  opening_balance: "Opening Balance",
  reversal: "Reversal",
}

const typeColors: Record<string, { bg: string; color: string }> = {
  service_income: { bg: "#f0fdf4", color: "#16a34a" },
  commission:     { bg: "#eff6ff", color: "#2563eb" },
  expense:        { bg: "#fef2f2", color: "#dc2626" },
  transfer:       { bg: "#fdf4ff", color: "#9333ea" },
}

const PAGE_SIZE = 50

export default function Ledger() {
  const [businessDate, setBusinessDate] = useState("")
  const [accountId, setAccountId] = useState("")
  const [entryType, setEntryType] = useState("")
  const [offset, setOffset] = useState(0)

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.get<Account[]>("/accounts"),
  })
  const accountName = (id: number) => accounts.find(a => a.id === id)?.name ?? `Account #${id}`

  const filters: Record<string, string | number> = { limit: PAGE_SIZE, offset }
  if (businessDate) filters.business_date = businessDate
  if (accountId) filters.account_id = accountId
  if (entryType) filters.entry_type = entryType

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.ledger(filters),
    queryFn: () => {
      const params = new URLSearchParams(filters as Record<string, string>)
      return api.get<{ items: LedgerEntry[]; total: number }>(`/ledger?${params}`)
    },
  })
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const showFigures = !isLoading && !error

  const totalCredit = items.reduce((s, e) => s + (e.amount_paise > 0 ? e.amount_paise : 0), 0)
  const totalDebit = items.reduce((s, e) => s + (e.amount_paise < 0 ? -e.amount_paise : 0), 0)
  const net = totalCredit - totalDebit

  function resetPage() {
    setOffset(0)
  }

  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Financial Ledger</h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Single source of truth for all financial events</p>
      </div>

      {/* Filters */}
      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr auto", gap: 10, marginBottom: 22, alignItems: "end" }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Date</label>
          <input type="date" value={businessDate} onChange={e => { setBusinessDate(e.target.value); resetPage() }} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Account</label>
          <select value={accountId} onChange={e => { setAccountId(e.target.value); resetPage() }} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
            <option value="">All accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Type</label>
          <select value={entryType} onChange={e => { setEntryType(e.target.value); resetPage() }} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
            <option value="">All types</option>
            {Object.entries(typeLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <button
          onClick={() => { setBusinessDate(""); setAccountId(""); setEntryType(""); resetPage() }}
          style={{ border: "1px solid #d1d9e6", background: "#fff", borderRadius: 7, padding: "8px 16px", fontSize: 13, cursor: "pointer", color: "#475569" }}
        >
          Clear filters
        </button>
      </div>

      {/* Net summary */}
      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 9, padding: "16px 18px" }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Total Credits (this page)</div>
          <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: "#16a34a" }}>{showFigures ? fmt(fromPaise(totalCredit)) : "—"}</div>
        </div>
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, padding: "16px 18px" }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Total Debits (this page)</div>
          <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: "#dc2626" }}>{showFigures ? fmt(fromPaise(totalDebit)) : "—"}</div>
        </div>
        <div style={{ background: net >= 0 ? "#eff6ff" : "#fef2f2", border: `1px solid ${net >= 0 ? "#bfdbfe" : "#fecaca"}`, borderRadius: 9, padding: "16px 18px" }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Net (this page)</div>
          <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: net >= 0 ? "#2563eb" : "#dc2626" }}>
            {showFigures ? `${net >= 0 ? "+" : "-"}${fmt(fromPaise(Math.abs(net)))}` : "—"}
          </div>
        </div>
      </div>

      {/* Ledger table */}
      <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Entry", "Date", "Time", "Description", "Type", "Account", "Debit", "Credit", "Running Balance"].map(h => (
                <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TableRowState isLoading={isLoading} error={error} colSpan={9} />
            {showFigures && items.map((e, i) => {
              const tc = typeColors[e.entry_type] || { bg: "#f8fafc", color: "#475569" }
              const debit = e.amount_paise < 0 ? -e.amount_paise : 0
              const credit = e.amount_paise > 0 ? e.amount_paise : 0
              return (
                <tr key={e.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#3b6cb7", fontWeight: 600 }}>#{e.id}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{formatDate(e.business_date)}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#94a3b8" }}>{formatTime(e.created_at)}</td>
                  <td style={{ padding: "10px 14px", fontSize: 13 }}>{e.description || "—"}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: tc.bg, color: tc.color }}>{typeLabel[e.entry_type] ?? e.entry_type}</span>
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>{accountName(e.account_id)}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: debit > 0 ? "#dc2626" : "#94a3b8" }}>
                    {debit > 0 ? fmt(fromPaise(debit)) : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: credit > 0 ? "#16a34a" : "#94a3b8" }}>
                    {credit > 0 ? fmt(fromPaise(credit)) : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#1e3a5f" }}>
                    {fmt(fromPaise(e.running_balance))}
                  </td>
                </tr>
              )
            })}
            {showFigures && items.length === 0 && (
              <tr><td colSpan={9} style={{ padding: "24px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No ledger entries match these filters.</td></tr>
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
