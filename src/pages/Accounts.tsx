import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, formatDate, formatTime, fromPaise, localDateISO, toPaise } from "../lib/format"

type AccountType = "cash" | "savings" | "current" | "wallet" | "settlement"

type Account = {
  id: number
  name: string
  account_type: AccountType
  bank_name: string | null
  account_number_masked: string | null
  ifsc: string | null
  opening_balance_paise: number
  is_active: number
}

const typeIcon: Record<AccountType, string> = {
  cash: "💵",
  savings: "🏦",
  current: "🏢",
  wallet: "📱",
  settlement: "🔄",
}

const typeColor: Record<AccountType, string> = {
  cash: "#f59e0b",
  savings: "#1e3a5f",
  current: "#7c3aed",
  wallet: "#0891b2",
  settlement: "#059669",
}

const typeLabel: Record<AccountType, string> = {
  cash: "Cash",
  savings: "Savings",
  current: "Current",
  wallet: "Wallet",
  settlement: "Settlement",
}

type Transfer = {
  id: number
  business_date: string
  from_account_name: string
  to_account_name: string
  amount_paise: number
  created_at: string
}

const emptyTransferForm = { from_account_id: "", to_account_id: "", amount: "" }

const emptyForm = {
  name: "",
  account_type: "cash" as AccountType,
  bank_name: "",
  account_number_masked: "",
  ifsc: "",
  opening_balance: "0",
}

function AccountBalance({ id }: { id: number }) {
  const { data } = useQuery({
    queryKey: queryKeys.accountBalance(id),
    queryFn: () => api.get<{ balance_paise: number }>(`/accounts/${id}/balance`),
  })
  return <>{fmt(data ? fromPaise(data.balance_paise) : 0)}</>
}

export default function Accounts() {
  const [showTransfer, setShowTransfer] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [transferForm, setTransferForm] = useState(emptyTransferForm)
  const [transferError, setTransferError] = useState("")
  const queryClient = useQueryClient()

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.get<Account[]>("/accounts"),
  })

  const { data: transfers = [] } = useQuery({
    queryKey: queryKeys.transfers,
    queryFn: () => api.get<Transfer[]>("/transfers"),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.accounts })

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/accounts", {
        name: form.name,
        account_type: form.account_type,
        bank_name: form.bank_name || null,
        account_number_masked: form.account_number_masked || null,
        ifsc: form.ifsc || null,
        opening_balance_paise: toPaise(Number(form.opening_balance) || 0),
      }),
    onSuccess: () => {
      invalidate()
      closeForm()
    },
  })

  const updateMutation = useMutation({
    mutationFn: (body: Partial<Account>) => api.patch(`/accounts/${editingId}`, body),
    onSuccess: () => {
      invalidate()
      closeForm()
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.patch(`/accounts/${id}`, { is_active }),
    onSuccess: invalidate,
  })

  const transferMutation = useMutation({
    mutationFn: () =>
      api.post("/transfers", {
        business_date: localDateISO(),
        from_account_id: Number(transferForm.from_account_id),
        to_account_id: Number(transferForm.to_account_id),
        amount_paise: toPaise(Number(transferForm.amount) || 0),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transfers })
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts }) // prefix match also covers accountBalance(id)
      setTransferForm(emptyTransferForm)
      setTransferError("")
      setShowTransfer(false)
    },
    onError: (e: Error) => setTransferError(e.message),
  })

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setFormOpen(true)
  }

  function openEdit(a: Account) {
    setEditingId(a.id)
    setForm({
      name: a.name,
      account_type: a.account_type,
      bank_name: a.bank_name ?? "",
      account_number_masked: a.account_number_masked ?? "",
      ifsc: a.ifsc ?? "",
      opening_balance: String(fromPaise(a.opening_balance_paise)),
    })
    setFormOpen(true)
  }

  function submitTransfer() {
    if (!transferForm.from_account_id || !transferForm.to_account_id) {
      setTransferError("Select both accounts")
      return
    }
    if (transferForm.from_account_id === transferForm.to_account_id) {
      setTransferError("Cannot transfer to the same account")
      return
    }
    if (!(Number(transferForm.amount) > 0)) {
      setTransferError("Amount must be positive")
      return
    }
    setTransferError("")
    transferMutation.mutate()
  }

  function submitForm() {
    if (!form.name.trim()) return
    if (editingId) {
      updateMutation.mutate({
        name: form.name,
        account_type: form.account_type,
        bank_name: form.bank_name || null,
        account_number_masked: form.account_number_masked || null,
        ifsc: form.ifsc || null,
      })
    } else {
      createMutation.mutate()
    }
  }

  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Accounts & Balances</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            {accounts.length} account{accounts.length === 1 ? "" : "s"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setShowTransfer(!showTransfer)} style={{ border: "1px solid #1e3a5f", color: "#1e3a5f", background: "#fff", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            ⇄ Internal Transfer
          </button>
          <button onClick={() => (formOpen ? closeForm() : openCreate())} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {formOpen ? "Cancel" : "+ Add Account"}
          </button>
        </div>
      </div>

      {/* Create / edit form */}
      {formOpen && (
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 24px", marginBottom: 22 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>{editingId ? "Edit Account" : "New Account"}</h3>
          <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Type</label>
              <select value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value as AccountType })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
                {(Object.keys(typeLabel) as AccountType[]).map(t => <option key={t} value={t}>{typeLabel[t]}</option>)}
              </select>
            </div>
            {!editingId && (
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Opening Balance (₹)</label>
                <input type="number" value={form.opening_balance} onChange={e => setForm({ ...form, opening_balance: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            )}
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Bank Name</label>
              <input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Account Number</label>
              <input value={form.account_number_masked} onChange={e => setForm({ ...form, account_number_masked: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>IFSC</label>
              <input value={form.ifsc} onChange={e => setForm({ ...form, ifsc: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <button onClick={submitForm} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {editingId ? "Save Changes" : "Create Account"}
            </button>
            <button onClick={closeForm} style={{ background: "#f1f5f9", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 20px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Transfer form */}
      {showTransfer && (
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 24px", marginBottom: 22 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>Internal Fund Transfer</h3>
          <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "1fr 60px 1fr 160px", gap: 10, alignItems: "end" }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>From Account</label>
              <select value={transferForm.from_account_id} onChange={e => setTransferForm({ ...transferForm, from_account_id: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
                <option value="">Select…</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div style={{ textAlign: "center", paddingBottom: 8, fontSize: 18, color: "#64748b" }}>→</div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>To Account</label>
              <select value={transferForm.to_account_id} onChange={e => setTransferForm({ ...transferForm, to_account_id: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}>
                <option value="">Select…</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Amount (₹)</label>
              <input type="number" placeholder="0" value={transferForm.amount} onChange={e => setTransferForm({ ...transferForm, amount: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={submitTransfer} disabled={transferMutation.isPending} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {transferMutation.isPending ? "Transferring…" : "Execute Transfer"}
            </button>
            <button onClick={() => { setShowTransfer(false); setTransferError("") }} style={{ background: "#f1f5f9", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 20px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            {transferError && <span style={{ color: "#dc2626", fontSize: 12 }}>{transferError}</span>}
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "#64748b" }}>Transfer creates two ledger entries — debit source, credit destination.</p>
        </div>
      )}

      {/* Account cards */}
      <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
        {accounts.map(a => (
          <div key={a.id} style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 22px", position: "relative", overflow: "hidden", opacity: a.is_active ? 1 : 0.6 }}>
            <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: typeColor[a.account_type] }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, paddingLeft: 4 }}>
              <div>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{typeIcon[a.account_type]}</div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{a.name}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{a.bank_name || "Internal"} · {typeLabel[a.account_type]}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: a.is_active ? "#dcfce7" : "#fee2e2", color: a.is_active ? "#16a34a" : "#dc2626" }}>
                {a.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            {a.account_number_masked && (
              <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace", marginBottom: 10, paddingLeft: 4 }}>{a.account_number_masked}</div>
            )}
            <div style={{ paddingLeft: 4, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Current Balance</div>
              <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: "#1e3a5f" }}><AccountBalance id={a.id} /></div>
            </div>
            <div style={{ display: "flex", gap: 8, paddingLeft: 4 }}>
              <button onClick={() => openEdit(a)} style={{ border: "1px solid #d1d9e6", background: "#fff", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", color: "#475569" }}>Edit</button>
              <button
                onClick={() => deactivateMutation.mutate({ id: a.id, is_active: !a.is_active })}
                style={{ border: "1px solid #d1d9e6", background: "#fff", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", color: a.is_active ? "#dc2626" : "#16a34a" }}
              >
                {a.is_active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Transfer history */}
      <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef1f7" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Recent Internal Transfers</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["ID", "From", "To", "Amount", "Date", "Time"].map(h => (
                <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transfers.map((t, i) => (
              <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12, color: "#3b6cb7" }}>TRF-{t.id}</td>
                <td style={{ padding: "9px 14px", fontSize: 13 }}>{t.from_account_name}</td>
                <td style={{ padding: "9px 14px", fontSize: 13 }}>{t.to_account_name}</td>
                <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#1e3a5f" }}>{fmt(fromPaise(t.amount_paise))}</td>
                <td style={{ padding: "9px 14px", fontSize: 12, color: "#64748b" }}>{formatDate(t.business_date)}</td>
                <td style={{ padding: "9px 14px", fontSize: 12, color: "#94a3b8" }}>{formatTime(t.created_at)}</td>
              </tr>
            ))}
            {transfers.length === 0 && (
              <tr><td colSpan={6} style={{ padding: "18px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No transfers yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
