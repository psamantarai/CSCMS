import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, formatDate, formatTime, fromPaise, localDateISO, toPaise } from "../lib/format"
import { TableRowState } from "../components/QueryState"

type Service = { id: number; name: string; default_fee_paise: number; default_charge_paise: number; is_active: number }
type Account = { id: number; name: string; is_active: number }
type Customer = { id: number; name: string; phone: string | null }

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

// H.18: a function, not a frozen object — localDateISO() must be read at
// call time (mount, openForm, create onSuccess), not once at module load,
// or a session left open across midnight keeps stamping the previous day.
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

export default function Transactions() {
  const [businessDate, setBusinessDate] = useState("")
  const [serviceId, setServiceId] = useState("")
  const [statusFilter, setStatusFilter] = useState<typeof statuses[number]>("All")
  const [offset, setOffset] = useState(0)
  const [showForm, setShowForm] = useState(false)
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
      setShowForm(false)
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
    setFormError("")
    createMutation.mutate()
  }

  function openForm() {
    setForm(emptyForm())
    setFormError("")
    setShowForm(true)
  }

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
          onClick={() => (showForm ? setShowForm(false) : openForm())}
          style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {showForm ? "Cancel" : "+ New Transaction"}
        </button>
      </div>

      {/* New Transaction Form */}
      {showForm && (
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 24px", marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>New Transaction</h3>
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
            <button onClick={() => { setShowForm(false); setFormError("") }} style={{ background: "#f1f5f9", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 20px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            {formError && <span style={{ color: "#dc2626", fontSize: 12 }}>{formError}</span>}
          </div>
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
