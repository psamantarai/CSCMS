import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../../lib/api"
import { queryKeys } from "../../lib/queries"
import { fromPaise, localDateISO, toPaise } from "../../lib/format"

type Account = { id: number; name: string; is_active: number }
type Customer = { id: number; name: string; phone: string | null }
type TxnType = "withdrawal" | "deposit" | "aeps" | "money_transfer" | "balance_enquiry"

// Subset of Banking.tsx's BankingTxn needed to prefill an edit — kept local
// rather than imported from the page, same pattern as TransactionForm.tsx.
type EditingTxn = {
  id: number
  business_date: string
  customer_id: number | null
  txn_type: TxnType
  principal_paise: number
  commission_paise: number
  settlement_account_id: number
  cash_account_id: number
  remarks: string | null
}

const typeLabels: Record<TxnType, string> = {
  withdrawal: "Cash Withdrawal",
  deposit: "Cash Deposit",
  aeps: "AEPS Withdrawal",
  money_transfer: "Money Transfer",
  balance_enquiry: "Balance Enquiry",
}

// H.18-style: a function, not a frozen object — localDateISO() must be read
// at call time, not once at module load.
function emptyForm(txnType: TxnType | "" = "") {
  return {
    businessDate: localDateISO(),
    customerSearch: "", customerId: null as number | null, customerName: "",
    txnType,
    principal: "",
    commission: "",
    settlementAccountId: "",
    cashAccountId: "",
    remarks: "",
  }
}

function formFromTxn(t: EditingTxn) {
  return {
    businessDate: t.business_date,
    customerSearch: "", customerId: t.customer_id, customerName: t.customer_id ? `#${t.customer_id}` : "",
    txnType: t.txn_type,
    principal: t.principal_paise ? String(fromPaise(t.principal_paise)) : "",
    commission: t.commission_paise ? String(fromPaise(t.commission_paise)) : "",
    settlementAccountId: String(t.settlement_account_id),
    cashAccountId: String(t.cash_account_id),
    remarks: t.remarks ?? "",
  }
}

// PLAN 9.3: extracted from Banking.tsx so the page's inline create/edit form
// and the Dashboard's create-only modal (PLAN 9.5) share one validation/
// mutation path. `editing` is omitted for create, passed for edit — pass a
// `key` (e.g. the txn id, or "create") from the caller so switching between
// entries remounts fresh state instead of leaking the previous edit's form.
export default function BankingEntryForm({ editing, initialTxnType, onSuccess, onCancel }: {
  editing?: EditingTxn
  initialTxnType?: TxnType | ""
  onSuccess: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState(() => editing ? formFromTxn(editing) : emptyForm(initialTxnType ?? ""))
  const [formError, setFormError] = useState("")
  const queryClient = useQueryClient()

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.get<Account[]>("/accounts"),
  })
  const activeAccounts = accounts.filter(a => a.is_active)

  const { data: customerMatches = [] } = useQuery({
    queryKey: queryKeys.customers(form.customerSearch),
    queryFn: () => api.get<Customer[]>(`/customers?q=${encodeURIComponent(form.customerSearch)}`),
    enabled: form.customerSearch.length > 0 && form.customerId === null,
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["banking"] })
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts }) // prefix match also covers accountBalance
    queryClient.invalidateQueries({ queryKey: ["dashboard"] })
  }

  function payload() {
    return {
      business_date: form.businessDate,
      customer_id: form.customerId,
      txn_type: form.txnType,
      principal_paise: form.txnType === "balance_enquiry" ? 0 : toPaise(Number(form.principal) || 0),
      commission_paise: toPaise(Number(form.commission) || 0),
      settlement_account_id: Number(form.settlementAccountId),
      cash_account_id: Number(form.cashAccountId),
      remarks: form.remarks || null,
    }
  }

  const createMutation = useMutation({
    mutationFn: () => api.post("/banking", payload()),
    onSuccess: () => { invalidate(); onSuccess() },
    onError: (e: Error) => setFormError(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: () => api.patch(`/banking/${editing!.id}`, payload()),
    onSuccess: () => { invalidate(); onSuccess() },
    onError: (e: Error) => setFormError(e.message),
  })

  function selectCustomer(c: Customer) {
    setForm({ ...form, customerId: c.id, customerName: c.name, customerSearch: "" })
  }

  function submitForm() {
    if (!form.txnType) { setFormError("Select a transaction type"); return }
    if (form.txnType === "balance_enquiry") {
      if (form.principal) { setFormError("Balance enquiry has no principal amount"); return }
    } else if (!(Number(form.principal) > 0)) {
      setFormError("Enter the transaction amount"); return
    }
    if (!form.settlementAccountId) { setFormError("Select a settlement account"); return }
    if (!form.cashAccountId) { setFormError("Select a cash account"); return }
    if (form.txnType !== "balance_enquiry" && form.settlementAccountId === form.cashAccountId) {
      setFormError("Settlement and cash accounts must differ"); return
    }
    setFormError("")
    if (editing) updateMutation.mutate()
    else createMutation.mutate()
  }

  const isMoneyTransfer = form.txnType === "money_transfer"
  const isBalanceEnquiry = form.txnType === "balance_enquiry"
  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Date</label>
          <input type="date" value={form.businessDate} onChange={e => setForm({ ...form, businessDate: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>

        <div style={{ position: "relative" }}>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Customer</label>
          {form.customerId ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, background: "#f8fafc" }}>
              <span style={{ fontSize: 13, flex: 1 }}>{form.customerName}</span>
              <button onClick={() => setForm({ ...form, customerId: null, customerName: "" })} style={{ border: "none", background: "none", color: "#64748b", cursor: "pointer", fontSize: 13 }}>×</button>
            </div>
          ) : (
            <input
              value={form.customerSearch}
              onChange={e => setForm({ ...form, customerSearch: e.target.value })}
              placeholder="Search customer… (optional)"
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
          )}
          {form.customerSearch && !form.customerId && customerMatches.length > 0 && (
            <div style={{ position: "absolute", zIndex: 1, top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #d1d9e6", borderRadius: 6, marginTop: 2, maxHeight: 160, overflowY: "auto", boxShadow: "0 4px 10px rgba(0,0,0,0.08)" }}>
              {customerMatches.map(c => (
                <div key={c.id} onClick={() => selectCustomer(c)} style={{ padding: "8px 10px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}>
                  {c.name} {c.phone && <span style={{ color: "#94a3b8" }}>· {c.phone}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Transaction Type</label>
          <select value={form.txnType} onChange={e => setForm({ ...form, txnType: e.target.value as TxnType })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
            <option value="">Select type…</option>
            {(Object.keys(typeLabels) as TxnType[]).map(t => <option key={t} value={t}>{typeLabels[t]}</option>)}
          </select>
        </div>

        {/* Balance enquiry has no principal (ARCHITECTURE.md §3) */}
        {!isBalanceEnquiry && (
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Amount (₹)</label>
            <input type="number" placeholder="0.00" value={form.principal} onChange={e => setForm({ ...form, principal: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
        )}
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Commission (₹)</label>
          <input type="number" placeholder="0.00" value={form.commission} onChange={e => setForm({ ...form, commission: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Settlement Account</label>
          <select value={form.settlementAccountId} onChange={e => setForm({ ...form, settlementAccountId: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
            <option value="">Select account…</option>
            {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Cash Account</label>
          <select value={form.cashAccountId} onChange={e => setForm({ ...form, cashAccountId: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
            <option value="">Select account…</option>
            {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        {/* money_transfer needs a destination — no separate column for it, so it's captured in remarks */}
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>{isMoneyTransfer ? "Destination / Remarks" : "Remarks"}</label>
          <input placeholder={isMoneyTransfer ? "Recipient name / account…" : "Optional note…"} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={submitForm} disabled={isPending} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {isPending ? "Saving…" : editing ? "Save Changes" : "Save"}
        </button>
        <button onClick={onCancel} style={{ background: "#f1f5f9", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 20px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
        {formError && <span style={{ color: "#dc2626", fontSize: 12 }}>{formError}</span>}
      </div>
    </>
  )
}
