import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, formatDate, formatTime, fromPaise, localDateISO } from "../lib/format"
import { TableRowState } from "../components/QueryState"
import BankingEntryForm from "../components/forms/BankingEntryForm"

type Account = { id: number; name: string; is_active: number }
type TxnType = "withdrawal" | "deposit" | "aeps" | "money_transfer" | "balance_enquiry"

type BankingTxn = {
  id: number
  business_date: string
  customer_id: number | null
  txn_type: TxnType
  principal_paise: number
  commission_paise: number
  settlement_account_id: number
  cash_account_id: number
  remarks: string | null
  created_at: string
}

const typeLabels: Record<TxnType, string> = {
  withdrawal: "Cash Withdrawal",
  deposit: "Cash Deposit",
  aeps: "AEPS Withdrawal",
  money_transfer: "Money Transfer",
  balance_enquiry: "Balance Enquiry",
}

const typeColors: Record<TxnType, { bg: string; color: string }> = {
  withdrawal: { bg: "#eff6ff", color: "#2563eb" },
  aeps: { bg: "#eff6ff", color: "#2563eb" },
  money_transfer: { bg: "#fdf4ff", color: "#9333ea" },
  deposit: { bg: "#f0fdf4", color: "#16a34a" },
  balance_enquiry: { bg: "#f8fafc", color: "#475569" },
}

// ARCHITECTURE.md §3: quick-launch cards map 1:1 to the real txn_type enum
// (no "Mini Statement" card — that isn't a banking_transactions type).
const quickLaunch: { type: TxnType; icon: string; desc: string }[] = [
  { type: "aeps", icon: "💳", desc: "Biometric cash" },
  { type: "withdrawal", icon: "🏧", desc: "Cash withdrawal" },
  { type: "money_transfer", icon: "↗", desc: "IMPS / NEFT" },
  { type: "deposit", icon: "↙", desc: "Bank deposit" },
  { type: "balance_enquiry", icon: "🔍", desc: "Account check" },
]

const PAGE_SIZE = 50

export default function Banking() {
  // Defaults to today, matching PLAN 5.4's "today's commission total on the
  // page matches the API" — the commission-summary query below reuses this
  // same filter.
  const [businessDate, setBusinessDate] = useState(localDateISO())
  const [txnTypeFilter, setTxnTypeFilter] = useState<TxnType | "">("")
  const [offset, setOffset] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editingTxn, setEditingTxn] = useState<BankingTxn | null>(null)
  const [initialType, setInitialType] = useState<TxnType | "">("")
  const queryClient = useQueryClient()

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.get<Account[]>("/accounts"),
  })
  const accountName = (id: number) => accounts.find(a => a.id === id)?.name ?? `#${id}`

  const filters: Record<string, string | number> = { limit: PAGE_SIZE, offset }
  if (businessDate) filters.business_date = businessDate
  if (txnTypeFilter) filters.txn_type = txnTypeFilter

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.banking(filters),
    queryFn: () => {
      const params = new URLSearchParams(filters as Record<string, string>)
      return api.get<{ items: BankingTxn[]; total: number }>(`/banking?${params}`)
    },
  })
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const showFigures = !isLoading && !error

  // PLAN 5.3's own endpoint, not a client-side sum — this is what keeps the
  // page's commission tile from ever drifting from the ledger.
  const commissionFilters: Record<string, string | number> = {}
  if (businessDate) commissionFilters.business_date = businessDate
  const { data: commissionSummary } = useQuery({
    queryKey: queryKeys.bankingCommissionSummary(commissionFilters),
    queryFn: () => {
      const params = new URLSearchParams(commissionFilters as Record<string, string>)
      return api.get<{ total_commission_paise: number }>(`/banking/commission-summary?${params}`)
    },
  })

  const pageVolume = items.reduce((s, t) => s + t.principal_paise, 0)
  const aepsCount = items.filter(t => t.txn_type === "aeps" || t.txn_type === "withdrawal").length
  const transferCount = items.filter(t => t.txn_type === "money_transfer").length

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["banking"] })
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts }) // prefix match also covers accountBalance
    queryClient.invalidateQueries({ queryKey: ["dashboard"] })
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/banking/${id}`),
    onSuccess: invalidate,
  })

  function closeForm() {
    setFormOpen(false)
    setEditingTxn(null)
    setInitialType("")
  }

  function openCreate(txnType: TxnType | "" = "") {
    setEditingTxn(null)
    setInitialType(txnType)
    setFormOpen(true)
  }

  function openEdit(t: BankingTxn) {
    setEditingTxn(t)
    setFormOpen(true)
  }

  function submitDelete(id: number) {
    if (!window.confirm("Delete this banking entry? This reverses its ledger entries.")) return
    deleteMutation.mutate(id)
  }

  function resetPage() {
    setOffset(0)
  }

  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Banking Services</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>AEPS · IMPS · Money Transfer · Deposits</p>
        </div>
        <button onClick={() => (formOpen ? closeForm() : openCreate())} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {formOpen ? "Cancel" : "+ New Banking Entry"}
        </button>
      </div>

      {/* Create / edit form */}
      {formOpen && (
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 24px", marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>{editingTxn ? "Edit Banking Entry" : "New Banking Entry"}</h3>
          <BankingEntryForm
            key={editingTxn?.id ?? "create"}
            editing={editingTxn ?? undefined}
            initialTxnType={initialType}
            onSuccess={closeForm}
            onCancel={closeForm}
          />
        </div>
      )}

      {/* Summary */}
      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Volume (this page)", value: showFigures ? fmt(fromPaise(pageVolume)) : "—", color: "#1e3a5f", bg: "#eff6ff" },
          { label: "Total Commission", value: commissionSummary ? fmt(fromPaise(commissionSummary.total_commission_paise)) : "—", color: "#16a34a", bg: "#f0fdf4" },
          { label: "AEPS / Withdrawal Txns", value: showFigures ? String(aepsCount) : "—", color: "#2563eb", bg: "#eff6ff" },
          { label: "Money Transfers", value: showFigures ? String(transferCount) : "—", color: "#9333ea", bg: "#fdf4ff" },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: "1px solid #d1d9e6", borderRadius: 9, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Service type cards */}
      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        {quickLaunch.map(s => (
          <div key={s.type} onClick={() => openCreate(s.type)} style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 9, padding: "16px 14px", cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#3b6cb7"; (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(59,108,183,0.12)" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#d1d9e6"; (e.currentTarget as HTMLElement).style.boxShadow = "none" }}
          >
            <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{typeLabels[s.type]}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 10, marginBottom: 18, alignItems: "end" }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Date</label>
          <input type="date" value={businessDate} onChange={e => { setBusinessDate(e.target.value); resetPage() }} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Type</label>
          <select value={txnTypeFilter} onChange={e => { setTxnTypeFilter(e.target.value as TxnType | ""); resetPage() }} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
            <option value="">All types</option>
            {(Object.keys(typeLabels) as TxnType[]).map(t => <option key={t} value={t}>{typeLabels[t]}</option>)}
          </select>
        </div>
        <button
          onClick={() => { setBusinessDate(""); setTxnTypeFilter(""); resetPage() }}
          style={{ border: "1px solid #d1d9e6", background: "#fff", borderRadius: 7, padding: "8px 16px", fontSize: 13, cursor: "pointer", color: "#475569" }}
        >
          Clear filters
        </button>
      </div>

      {/* Transactions table */}
      <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef1f7" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Banking Transactions</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["ID", "Date", "Time", "Customer", "Type", "Amount", "Commission", "Settlement Acct", "Cash Acct", "Remarks", ""].map(h => (
                <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TableRowState isLoading={isLoading} error={error} colSpan={11} />
            {showFigures && items.map((t, i) => {
              const tc = typeColors[t.txn_type]
              return (
                <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#3b6cb7", fontWeight: 600 }}>#{t.id}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{formatDate(t.business_date)}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#94a3b8" }}>{formatTime(t.created_at)}</td>
                  <td style={{ padding: "10px 14px", fontSize: 13 }}>{t.customer_id ? `#${t.customer_id}` : "—"}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: tc.bg, color: tc.color }}>{typeLabels[t.txn_type]}</span>
                  </td>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{t.principal_paise > 0 ? fmt(fromPaise(t.principal_paise)) : "—"}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#16a34a", fontWeight: 600 }}>{t.commission_paise > 0 ? `+${fmt(fromPaise(t.commission_paise))}` : "—"}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>{accountName(t.settlement_account_id)}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>{accountName(t.cash_account_id)}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>{t.remarks}</td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                    <button onClick={() => openEdit(t)} style={{ background: "none", border: "1px solid #d1d9e6", borderRadius: 5, padding: "3px 9px", fontSize: 11, cursor: "pointer", color: "#64748b", marginRight: 6 }}>Edit</button>
                    <button onClick={() => submitDelete(t.id)} style={{ background: "none", border: "1px solid #d1d9e6", borderRadius: 5, padding: "3px 9px", fontSize: 11, cursor: "pointer", color: "#dc2626" }}>Delete</button>
                  </td>
                </tr>
              )
            })}
            {showFigures && items.length === 0 && (
              <tr><td colSpan={11} style={{ padding: "24px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No banking transactions match these filters.</td></tr>
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
