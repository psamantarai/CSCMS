import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, fromPaise, toPaise } from "../lib/format"

type Service = {
  id: number
  name: string
  category: string
  default_fee_paise: number
  default_charge_paise: number
  is_active: number
}

const emptyForm = { name: "", category: "", default_fee: "0", default_charge: "0" }

export default function Services() {
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const queryClient = useQueryClient()

  const { data: services = [] } = useQuery({
    queryKey: queryKeys.services,
    queryFn: () => api.get<Service[]>("/services"),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.services })

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/services", {
        name: form.name,
        category: form.category,
        default_fee_paise: toPaise(Number(form.default_fee) || 0),
        default_charge_paise: toPaise(Number(form.default_charge) || 0),
      }),
    onSuccess: () => { invalidate(); closeForm() },
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      api.patch(`/services/${editingId}`, {
        name: form.name,
        category: form.category,
        default_fee_paise: toPaise(Number(form.default_fee) || 0),
        default_charge_paise: toPaise(Number(form.default_charge) || 0),
      }),
    onSuccess: () => { invalidate(); closeForm() },
  })

  const deactivateMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.patch(`/services/${id}`, { is_active }),
    onSuccess: invalidate,
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

  function openEdit(s: Service) {
    setEditingId(s.id)
    setForm({
      name: s.name,
      category: s.category,
      default_fee: String(fromPaise(s.default_fee_paise)),
      default_charge: String(fromPaise(s.default_charge_paise)),
    })
    setFormOpen(true)
  }

  function submitForm() {
    if (!form.name.trim() || !form.category.trim()) return
    if (editingId) updateMutation.mutate()
    else createMutation.mutate()
  }

  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Services</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            {services.length} service{services.length === 1 ? "" : "s"}
          </p>
        </div>
        <button onClick={() => (formOpen ? closeForm() : openCreate())} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {formOpen ? "Cancel" : "+ Add Service"}
        </button>
      </div>

      {formOpen && (
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 24px", marginBottom: 22 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>{editingId ? "Edit Service" : "New Service"}</h3>
          <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Category</label>
              <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Default Fee (₹)</label>
              <input type="number" value={form.default_fee} onChange={e => setForm({ ...form, default_fee: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>Default Charge (₹)</label>
              <input type="number" value={form.default_charge} onChange={e => setForm({ ...form, default_charge: e.target.value })} style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <button onClick={submitForm} style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {editingId ? "Save Changes" : "Create Service"}
            </button>
            <button onClick={closeForm} style={{ background: "#f1f5f9", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 20px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Name", "Category", "Default Fee", "Default Charge", "Status", ""].map(h => (
                  <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.map((s, i) => (
                <tr key={s.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9", opacity: s.is_active ? 1 : 0.6 }}>
                  <td style={{ padding: "9px 14px", fontSize: 13, fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: "9px 14px", fontSize: 13, color: "#475569" }}>{s.category}</td>
                  <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12 }}>{fmt(fromPaise(s.default_fee_paise))}</td>
                  <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12 }}>{fmt(fromPaise(s.default_charge_paise))}</td>
                  <td style={{ padding: "9px 14px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: s.is_active ? "#dcfce7" : "#fee2e2", color: s.is_active ? "#16a34a" : "#dc2626" }}>
                      {s.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ padding: "9px 14px", display: "flex", gap: 8 }}>
                    <button onClick={() => openEdit(s)} style={{ border: "1px solid #d1d9e6", background: "#fff", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", color: "#475569" }}>Edit</button>
                    <button
                      onClick={() => deactivateMutation.mutate({ id: s.id, is_active: !s.is_active })}
                      style={{ border: "1px solid #d1d9e6", background: "#fff", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", color: s.is_active ? "#dc2626" : "#16a34a" }}
                    >
                      {s.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
              {services.length === 0 && (
                <tr><td colSpan={6} style={{ padding: "18px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No services yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
