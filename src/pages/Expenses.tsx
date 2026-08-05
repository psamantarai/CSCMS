import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, formatDate, fromPaise } from "../lib/format"
import { TableRowState } from "../components/QueryState"
import ExpenseForm from "../components/forms/ExpenseForm"

type Account = { id: number; name: string; is_active: number }

type Expense = {
  id: number
  business_date: string
  category: string
  amount_paise: number
  account_id: number
  note: string | null
}

const catColors: Record<string, string> = {
  Internet: "#2563eb", Electricity: "#d97706", Paper: "#0891b2",
  Ink: "#7c3aed", Rent: "#dc2626", Repairs: "#64748b", Miscellaneous: "#475569"
}
const fallbackColor = "#475569"

const PAGE_SIZE = 50

export default function Expenses() {
  const [businessDate, setBusinessDate] = useState("")
  const [category, setCategory] = useState("")
  const [offset, setOffset] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const queryClient = useQueryClient()

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.expenseCategories,
    queryFn: () => api.get<{ categories: string[] }>("/expenses/categories").then(r => r.categories),
  })

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.get<Account[]>("/accounts"),
  })
  const accountName = (id: number) => accounts.find(a => a.id === id)?.name ?? `#${id}`

  const filters: Record<string, string | number> = { limit: PAGE_SIZE, offset }
  if (businessDate) filters.business_date = businessDate
  if (category) filters.category = category

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.expenses(filters),
    queryFn: () => {
      const params = new URLSearchParams(filters as Record<string, string>)
      return api.get<{ items: Expense[]; total: number }>(`/expenses?${params}`)
    },
  })
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const showFigures = !isLoading && !error
  const pageTotal = items.reduce((s, e) => s + e.amount_paise, 0)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["expenses"] })
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts }) // prefix match also covers accountBalance(id)
    queryClient.invalidateQueries({ queryKey: ["dashboard"] })
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/expenses/${id}`),
    onSuccess: invalidate,
  })

  function closeForm() {
    setFormOpen(false)
    setEditingExpense(null)
  }

  function openCreate() {
    setEditingExpense(null)
    setFormOpen(true)
  }

  function openEdit(e: Expense) {
    setEditingExpense(e)
    setFormOpen(true)
  }

  function submitDelete(id: number) {
    if (!window.confirm("Delete this expense? This reverses its ledger entry.")) return
    deleteMutation.mutate(id)
  }

  function resetPage() {
    setOffset(0)
  }

  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Expenses</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>{showFigures ? `${total} entries` : "—"}</p>
        </div>
        <button onClick={() => (formOpen ? closeForm() : openCreate())} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {formOpen ? "Cancel" : "+ Record Expense"}
        </button>
      </div>

      {/* Create / edit form */}
      {formOpen && (
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 24px", marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>{editingExpense ? "Edit Expense" : "Record Expense"}</h3>
          <ExpenseForm
            key={editingExpense?.id ?? "create"}
            editing={editingExpense ?? undefined}
            onSuccess={closeForm}
            onCancel={closeForm}
          />
        </div>
      )}

      {/* Filters */}
      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 10, marginBottom: 18, alignItems: "end" }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Date</label>
          <input type="date" value={businessDate} onChange={e => { setBusinessDate(e.target.value); resetPage() }} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Category</label>
          <select value={category} onChange={e => { setCategory(e.target.value); resetPage() }} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button
          onClick={() => { setBusinessDate(""); setCategory(""); resetPage() }}
          style={{ border: "1px solid #d1d9e6", background: "#fff", borderRadius: 7, padding: "8px 16px", fontSize: 13, cursor: "pointer", color: "#475569" }}
        >
          Clear filters
        </button>
      </div>

      {/* Expense list */}
      <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["#", "Category", "Amount", "Date", "Account", "Note", ""].map(h => (
                <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TableRowState isLoading={isLoading} error={error} colSpan={7} />
            {showFigures && items.map((e, i) => (
              <tr key={e.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>{e.id}</td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 9px", borderRadius: 20, background: "#f8fafc", color: catColors[e.category] || fallbackColor, border: `1px solid ${catColors[e.category] || "#d1d9e6"}20` }}>
                    {e.category}
                  </span>
                </td>
                <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#dc2626" }}>{fmt(fromPaise(e.amount_paise))}</td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{formatDate(e.business_date)}</td>
                <td style={{ padding: "10px 14px", fontSize: 13, color: "#475569" }}>{accountName(e.account_id)}</td>
                <td style={{ padding: "10px 14px", fontSize: 13, color: "#475569" }}>{e.note}</td>
                <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                  <button onClick={() => openEdit(e)} style={{ background: "none", border: "1px solid #d1d9e6", borderRadius: 5, padding: "3px 9px", fontSize: 11, cursor: "pointer", color: "#64748b", marginRight: 6 }}>Edit</button>
                  <button onClick={() => submitDelete(e.id)} style={{ background: "none", border: "1px solid #d1d9e6", borderRadius: 5, padding: "3px 9px", fontSize: 11, cursor: "pointer", color: "#dc2626" }}>Delete</button>
                </td>
              </tr>
            ))}
            {showFigures && items.length === 0 && (
              <tr><td colSpan={7} style={{ padding: "24px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No expenses match these filters.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ background: "#f8fafc", borderTop: "2px solid #d1d9e6" }}>
              <td colSpan={2} style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700 }}>Total (this page)</td>
              <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#dc2626" }}>{showFigures ? fmt(fromPaise(pageTotal)) : "—"}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
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
