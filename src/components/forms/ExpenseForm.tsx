import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../../lib/api"
import { queryKeys } from "../../lib/queries"
import { fromPaise, localDateISO, toPaise } from "../../lib/format"

type Account = { id: number; name: string; is_active: number }

// Subset of Expenses.tsx's Expense needed to prefill an edit — kept local
// rather than imported from the page, same pattern as TransactionForm.tsx.
type EditingExpense = {
  id: number
  business_date: string
  category: string
  amount_paise: number
  account_id: number
  note: string | null
}

// H.18-style: a function, not a frozen object — localDateISO() must be read
// at call time, not once at module load.
function emptyForm() {
  return { category: "", amount: "", businessDate: localDateISO(), accountId: "", note: "" }
}

function formFromExpense(e: EditingExpense) {
  return {
    category: e.category,
    amount: String(fromPaise(e.amount_paise)),
    businessDate: e.business_date,
    accountId: String(e.account_id),
    note: e.note ?? "",
  }
}

// PLAN 9.4: extracted from Expenses.tsx so the page's inline create/edit
// form and the Dashboard's create-only modal (PLAN 9.5) share one
// validation/mutation path. `editing` is omitted for create, passed for
// edit — pass a `key` (e.g. the expense id, or "create") from the caller so
// switching between entries remounts fresh state instead of leaking the
// previous edit's form.
export default function ExpenseForm({ editing, onSuccess, onCancel }: {
  editing?: EditingExpense
  onSuccess: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState(() => editing ? formFromExpense(editing) : emptyForm())
  const [formError, setFormError] = useState("")
  const queryClient = useQueryClient()

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.expenseCategories,
    queryFn: () => api.get<{ categories: string[] }>("/expenses/categories").then(r => r.categories),
  })

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.get<Account[]>("/accounts"),
  })
  const activeAccounts = accounts.filter(a => a.is_active)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["expenses"] })
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts }) // prefix match also covers accountBalance(id)
    queryClient.invalidateQueries({ queryKey: ["dashboard"] })
  }

  function payload() {
    return {
      business_date: form.businessDate,
      category: form.category,
      amount_paise: toPaise(Number(form.amount) || 0),
      account_id: Number(form.accountId),
      note: form.note || null,
    }
  }

  const createMutation = useMutation({
    mutationFn: () => api.post("/expenses", payload()),
    onSuccess: () => { invalidate(); onSuccess() },
    onError: (e: Error) => setFormError(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: () => api.patch(`/expenses/${editing!.id}`, payload()),
    onSuccess: () => { invalidate(); onSuccess() },
    onError: (e: Error) => setFormError(e.message),
  })

  function submitForm() {
    if (!form.category) { setFormError("Select a category"); return }
    if (!(Number(form.amount) > 0)) { setFormError("Amount must be positive"); return }
    if (!form.accountId) { setFormError("Select a paying account"); return }
    setFormError("")
    if (editing) updateMutation.mutate()
    else createMutation.mutate()
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Category</label>
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
            <option value="">Select category…</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Amount (₹)</label>
          <input type="number" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Date</label>
          <input type="date" value={form.businessDate} onChange={e => setForm({ ...form, businessDate: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Paying Account</label>
          <select value={form.accountId} onChange={e => setForm({ ...form, accountId: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
            <option value="">Select account…</option>
            {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Note</label>
          <input placeholder="Brief description…" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={submitForm} disabled={isPending} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {isPending ? "Saving…" : editing ? "Save Changes" : "Save"}
        </button>
        <button onClick={onCancel} style={{ background: "#f1f5f9", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 20px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
        {formError && <span style={{ color: "#dc2626", fontSize: 12 }}>{formError}</span>}
      </div>
    </>
  )
}
