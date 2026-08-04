import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, formatDate, fromPaise, localDateISO, toPaise } from "../lib/format"
import { BlockState, InlineState, TableRowState } from "../components/QueryState"

type Customer = {
  id: number
  name: string
  phone: string | null
  village: string | null
  aadhaar_masked: string | null
  notes: string | null
}

type Transaction = {
  id: number
  business_date: string
  service_name: string
  total_paise: number
  status: "completed" | "partial" | "pending"
}

type BankingTransaction = {
  id: number
  business_date: string
  txn_type: string
  principal_paise: number
  commission_paise: number
}

type Account = { id: number; name: string; is_active: number }

const emptyForm = { name: "", phone: "", village: "", aadhaar_masked: "", notes: "" }
const emptySettleForm = { accountId: "", amount: "0", remarks: "" }

const statusColor: Record<Transaction["status"], { bg: string; fg: string }> = {
  completed: { bg: "#dcfce7", fg: "#16a34a" },
  partial: { bg: "#fee2e2", fg: "#dc2626" },
  pending: { bg: "#fef3c7", fg: "#d97706" },
}

function CustomerHistory({ id }: { id: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.customerHistory(id),
    queryFn: () => api.get<{ transactions: Transaction[]; banking_transactions: BankingTransaction[] }>(`/customers/${id}/history`),
  })
  const txns = data?.transactions ?? []
  const banking = data?.banking_transactions ?? []
  const loaded = !isLoading && !error

  return (
    <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef1f7" }}>
        <h3 style={{ margin: 0, fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Service History</h3>
      </div>
      {!loaded && <BlockState isLoading={isLoading} error={error} />}
      {loaded && (txns.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["ID", "Date", "Service", "Total", "Status"].map(h => (
                  <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txns.map((t, i) => (
                <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12, color: "#3b6cb7" }}>{t.id}</td>
                  <td style={{ padding: "9px 14px", fontSize: 12, color: "#64748b" }}>{formatDate(t.business_date)}</td>
                  <td style={{ padding: "9px 14px", fontSize: 13 }}>{t.service_name}</td>
                  <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{fmt(fromPaise(t.total_paise))}</td>
                  <td style={{ padding: "9px 14px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: statusColor[t.status].bg, color: statusColor[t.status].fg }}>{t.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: 24, color: "#94a3b8", fontSize: 13 }}>No transactions yet.</div>
      ))}

      {loaded && (
      <div style={{ padding: "14px 18px", borderTop: "1px solid #eef1f7", borderBottom: "1px solid #eef1f7" }}>
        <h3 style={{ margin: 0, fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Banking History</h3>
      </div>
      )}
      {loaded && (banking.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["ID", "Date", "Type", "Principal", "Commission"].map(h => (
                  <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {banking.map((b, i) => (
                <tr key={b.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12, color: "#3b6cb7" }}>{b.id}</td>
                  <td style={{ padding: "9px 14px", fontSize: 12, color: "#64748b" }}>{formatDate(b.business_date)}</td>
                  <td style={{ padding: "9px 14px", fontSize: 13, textTransform: "capitalize" }}>{b.txn_type.replace("_", " ")}</td>
                  <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12 }}>{fmt(fromPaise(b.principal_paise))}</td>
                  <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12, color: "#16a34a" }}>{fmt(fromPaise(b.commission_paise))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: 24, color: "#94a3b8", fontSize: 13 }}>No banking transactions yet.</div>
      ))}
    </div>
  )
}

function CustomerOutstanding({ id }: { id: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.customerOutstanding(id),
    queryFn: () => api.get<{ outstanding_paise: number }>(`/customers/${id}/outstanding`),
  })
  return isLoading || error
    ? <InlineState isLoading={isLoading} error={error} />
    : <>{fmt(fromPaise(data!.outstanding_paise))}</>
}

export default function Customers() {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<number | null>(null)
  const [formMode, setFormMode] = useState<"view" | "create" | "edit">("view")
  const [form, setForm] = useState(emptyForm)
  const [showSettle, setShowSettle] = useState(false)
  const [settleForm, setSettleForm] = useState(emptySettleForm)
  const [settleError, setSettleError] = useState("")
  const queryClient = useQueryClient()

  const { data: customers = [], isLoading: customersLoading, error: customersError } = useQuery({
    queryKey: queryKeys.customers(search),
    queryFn: () => api.get<Customer[]>(`/customers${search ? `?q=${encodeURIComponent(search)}` : ""}`),
  })

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.get<Account[]>("/accounts"),
  })
  const activeAccounts = accounts.filter(a => a.is_active)

  const customer = selected !== null ? customers.find(c => c.id === selected) ?? null : null

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["customers"] })

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Customer>("/customers", {
        name: form.name,
        phone: form.phone || null,
        village: form.village || null,
        aadhaar_masked: form.aadhaar_masked || null,
        notes: form.notes || null,
      }),
    onSuccess: created => {
      invalidate()
      setSelected(created.id)
      setFormMode("view")
    },
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      api.patch(`/customers/${selected}`, {
        name: form.name,
        phone: form.phone || null,
        village: form.village || null,
        aadhaar_masked: form.aadhaar_masked || null,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      invalidate()
      setFormMode("view")
    },
  })

  // H.19: settles the customer's outstanding via POST /api/payments — oldest
  // bills first, server-side (app/payments.py) — rather than a per-transaction
  // edit. The only path to this API from the UI.
  const settleMutation = useMutation({
    mutationFn: () =>
      api.post("/payments", {
        business_date: localDateISO(),
        customer_id: selected,
        amount_paise: toPaise(Number(settleForm.amount) || 0),
        account_id: Number(settleForm.accountId),
        remarks: settleForm.remarks || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customerOutstanding(selected!) })
      queryClient.invalidateQueries({ queryKey: queryKeys.customerHistory(selected!) })
      queryClient.invalidateQueries({ queryKey: ["transactions"] })
      setSettleForm(emptySettleForm)
      setSettleError("")
      setShowSettle(false)
    },
    onError: (e: Error) => setSettleError(e.message),
  })

  function openCreate() {
    setSelected(null)
    setForm(emptyForm)
    setFormMode("create")
    setShowSettle(false)
  }

  function openEdit() {
    if (!customer) return
    setForm({
      name: customer.name,
      phone: customer.phone ?? "",
      village: customer.village ?? "",
      aadhaar_masked: customer.aadhaar_masked ?? "",
      notes: customer.notes ?? "",
    })
    setFormMode("edit")
    setShowSettle(false)
  }

  function submitForm() {
    if (!form.name.trim()) return
    if (formMode === "edit") updateMutation.mutate()
    else createMutation.mutate()
  }

  function openSettle() {
    setSettleForm(emptySettleForm)
    setSettleError("")
    setShowSettle(true)
  }

  function submitSettle() {
    if (!settleForm.accountId) { setSettleError("Select an account"); return }
    if (!(Number(settleForm.amount) > 0)) { setSettleError("Amount must be positive"); return }
    setSettleError("")
    settleMutation.mutate()
  }

  return (
    <div className="rs-flex-split" style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* List panel */}
      <div className="rs-flex-side" style={{ width: 320, borderRight: "1px solid #d1d9e6", display: "flex", flexDirection: "column", flexShrink: 0 }}>
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
          <BlockState isLoading={customersLoading} error={customersError} />
          {!customersLoading && !customersError && customers.map(c => (
            <div
              key={c.id}
              onClick={() => { setSelected(c.id); setFormMode("view"); setShowSettle(false) }}
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #f1f5f9",
                cursor: "pointer",
                background: selected === c.id ? "#eff6ff" : "transparent",
                borderLeft: selected === c.id ? "3px solid #1e3a5f" : "3px solid transparent",
                transition: "background 0.1s",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{c.phone || "—"} · {c.village || "—"}</div>
            </div>
          ))}
          {!customersLoading && !customersError && customers.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No customers found</div>
          )}
        </div>
        <div style={{ padding: "10px 16px", borderTop: "1px solid #eef1f7" }}>
          <button onClick={openCreate} style={{ width: "100%", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Add New Customer
          </button>
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        {formMode === "create" || formMode === "edit" ? (
          <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 24px", maxWidth: 520 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>{formMode === "edit" ? "Edit Customer" : "New Customer"}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Name</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Phone</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Village</label>
                <input value={form.village} onChange={e => setForm({ ...form, village: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Aadhaar (masked)</label>
                <input value={form.aadhaar_masked} onChange={e => setForm({ ...form, aadhaar_masked: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
              <button onClick={submitForm} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {formMode === "edit" ? "Save Changes" : "Create Customer"}
              </button>
              <button onClick={() => setFormMode("view")} style={{ background: "#f1f5f9", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 20px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        ) : customer ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>{customer.name}</h2>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>{customer.phone || "—"} · {customer.village || "—"}</div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={showSettle ? () => setShowSettle(false) : openSettle} style={{ padding: "7px 14px", border: "1px solid #d1d9e6", borderRadius: 7, background: "#fff", fontSize: 13, cursor: "pointer" }}>
                  {showSettle ? "Cancel" : "Settle Payment"}
                </button>
                <button onClick={openEdit} style={{ padding: "7px 14px", border: "1px solid #d1d9e6", borderRadius: 7, background: "#fff", fontSize: 13, cursor: "pointer" }}>Edit</button>
              </div>
            </div>

            {/* Settle payment form (H.19) */}
            {showSettle && (
              <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 24px", marginBottom: 24 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>Settle Payment</h3>
                <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Amount (₹)</label>
                    <input type="number" value={settleForm.amount} onChange={e => setSettleForm({ ...settleForm, amount: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Account (received into)</label>
                    <select value={settleForm.accountId} onChange={e => setSettleForm({ ...settleForm, accountId: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
                      <option value="">Select account…</option>
                      {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Remarks</label>
                    <input value={settleForm.remarks} onChange={e => setSettleForm({ ...settleForm, remarks: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button onClick={submitSettle} disabled={settleMutation.isPending} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    {settleMutation.isPending ? "Saving…" : "Settle"}
                  </button>
                  {settleError && <span style={{ color: "#dc2626", fontSize: 12 }}>{settleError}</span>}
                </div>
              </div>
            )}

            {/* Profile cards */}
            <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
              {[
                { label: "Aadhaar", value: customer.aadhaar_masked || "—" },
                { label: "Outstanding Balance", value: <CustomerOutstanding id={customer.id} /> },
                { label: "Notes", value: customer.notes || "—" },
              ].map(f => (
                <div key={f.label} style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{f.label}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 600, color: "#1a2332" }}>{f.value}</div>
                </div>
              ))}
            </div>

            <CustomerHistory id={customer.id} />
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
