import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../../lib/api"
import { queryKeys } from "../../lib/queries"
import { fmt, fromPaise, localDateISO, toPaise } from "../../lib/format"

type Service = { id: number; name: string; default_fee_paise: number; default_charge_paise: number; is_active: number }
type Account = { id: number; name: string; is_active: number }
type Customer = { id: number; name: string; phone: string | null }

// H.18: a function, not a frozen object — localDateISO() must be read at
// call time (mount, create onSuccess), not once at module load, or a
// session left open across midnight keeps stamping the previous day.
function emptyForm() {
  return {
    businessDate: localDateISO(),
    customerSearch: "",
    customerId: null as number | null,
    customerName: "",
    serviceId: "",
    accountId: "",
    fee: "0",
    charge: "0",
    discount: "0",
    paid: "0",
    remarks: "",
  }
}

// PLAN 9.2: extracted from Transactions.tsx so the page's inline form and
// the Dashboard's modal (PLAN 9.5) share one validation/mutation path.
export default function TransactionForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState("")
  const queryClient = useQueryClient()

  const { data: services = [] } = useQuery({
    queryKey: queryKeys.services,
    queryFn: () => api.get<Service[]>("/services"),
  })
  const activeServices = services.filter(s => s.is_active)

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

  const fee = Number(form.fee) || 0
  const charge = Number(form.charge) || 0
  const discount = Number(form.discount) || 0
  const formTotal = fee + charge - discount
  const paid = Number(form.paid) || 0

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/transactions", {
        business_date: form.businessDate,
        customer_id: form.customerId,
        service_id: Number(form.serviceId),
        fee_paise: toPaise(fee),
        charge_paise: toPaise(charge),
        discount_paise: toPaise(discount),
        account_id: Number(form.accountId),
        amount_paid_paise: toPaise(paid),
        remarks: form.remarks || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      if (form.customerId) queryClient.invalidateQueries({ queryKey: queryKeys.customerOutstanding(form.customerId) })
      setForm(emptyForm())
      setFormError("")
      onSuccess()
    },
    onError: (e: Error) => setFormError(e.message),
  })

  function selectService(id: string) {
    const svc = services.find(s => String(s.id) === id)
    setForm({
      ...form, serviceId: id,
      fee: svc ? String(fromPaise(svc.default_fee_paise)) : form.fee,
      charge: svc ? String(fromPaise(svc.default_charge_paise)) : form.charge,
    })
  }

  function selectCustomer(c: Customer) {
    setForm({ ...form, customerId: c.id, customerName: c.name, customerSearch: "" })
  }

  function submitTransaction() {
    if (!form.serviceId) { setFormError("Select a service"); return }
    if (!form.accountId) { setFormError("Select an account"); return }
    if (!(fee >= 0)) { setFormError("Fee cannot be negative"); return }
    if (paid > formTotal) { setFormError("Payment cannot exceed the total"); return }
    // H.50: a walk-in (no customer_id) has no customer row to carry an
    // unpaid remainder as outstanding, so it can't be left partially paid —
    // prompt to register/select a customer via the search field above
    // instead. Fully unpaid (paid = 0, pending) is still fine.
    if (form.customerId === null && paid > 0 && paid < formTotal) {
      setFormError("Walk-in transactions can't be partially paid — select or register a customer to allow partial payment")
      return
    }
    setFormError("")
    createMutation.mutate()
  }

  return (
    <>
      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Date</label>
          <input type="date" value={form.businessDate} onChange={e => setForm({ ...form, businessDate: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>

        <div style={{ position: "relative" }}>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Customer</label>
          {form.customerId ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, background: "#f8fafc" }}>
              <span style={{ fontSize: 13, flex: 1 }}>{form.customerName}</span>
              <button onClick={() => setForm({ ...form, customerId: null, customerName: "" })} style={{ border: "none", background: "none", color: "#64748b", cursor: "pointer", fontSize: 13 }}>×</button>
            </div>
          ) : (
            <input
              value={form.customerSearch}
              onChange={e => setForm({ ...form, customerSearch: e.target.value })}
              placeholder="Search customer… (blank = walk-in)"
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
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Service</label>
          <select value={form.serviceId} onChange={e => selectService(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
            <option value="">Select service…</option>
            {activeServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Account (payment received into)</label>
          <select value={form.accountId} onChange={e => setForm({ ...form, accountId: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
            <option value="">Select account…</option>
            {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Fee (₹)</label>
          <input type="number" value={form.fee} onChange={e => setForm({ ...form, fee: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Service Charge (₹)</label>
          <input type="number" value={form.charge} onChange={e => setForm({ ...form, charge: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Discount (₹)</label>
          <input type="number" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Payment Received (₹)</label>
          <input type="number" value={form.paid} onChange={e => setForm({ ...form, paid: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Total</label>
          <div style={{ padding: "8px 10px", fontFamily: "monospace", fontWeight: 700, fontSize: 14 }}>{fmt(formTotal)}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={submitTransaction} disabled={createMutation.isPending} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {createMutation.isPending ? "Saving…" : "Save Transaction"}
        </button>
        <button onClick={onCancel} style={{ background: "#f1f5f9", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 20px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
        {formError && <span style={{ color: "#dc2626", fontSize: 12 }}>{formError}</span>}
      </div>
    </>
  )
}
