import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../../lib/api"
import { queryKeys } from "../../lib/queries"
import { fmt, fromPaise, localDateISO, toPaise } from "../../lib/format"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"

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
  // PLAN 9.5.7: which field the last client-side validation failure was
  // about, so it — and only it — renders data-invalid/aria-invalid. Server
  // rejections (onError below) can't be attributed to one field, so they
  // clear this and fall back to the form-level Alert only.
  const [invalidField, setInvalidField] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // PLAN 15.4: the 15.3 guard sends the operator to find a customer, so every
  // place it fires needs a route to creating one. Customers.tsx owns that form
  // — router state (not a query string) so a refresh doesn't reopen it. The
  // in-progress transaction is lost; onCancel also closes the Dashboard modal.
  function goCreateCustomer(name: string) {
    onCancel()
    navigate("/customers", { state: { create: true, name } })
  }

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
      setInvalidField(null)
      onSuccess()
    },
    onError: (e: Error) => { setInvalidField(null); setFormError(e.message) },
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

  function fail(field: string, message: string) {
    setInvalidField(field)
    setFormError(message)
  }

  function submitTransaction() {
    if (!form.serviceId) { fail("serviceId", "Select a service"); return }
    if (!form.accountId) { fail("accountId", "Select an account"); return }
    if (!(fee >= 0)) { fail("fee", "Fee cannot be negative"); return }
    if (paid > formTotal) { fail("paid", "Payment cannot exceed the total"); return }
    // H.50 / PLAN 15.3: a walk-in (no customer_id) has no customer row to
    // carry an unpaid amount as outstanding, so nothing can ever collect it —
    // that's true of a partly paid walk-in and just as true of a wholly
    // unpaid one, which is the form's default state. Mirrors the server guard
    // in create_transaction.
    if (form.customerId === null && paid < formTotal) {
      fail("customer", "A transaction left unpaid needs a customer — select or add one, or record the full payment")
      return
    }
    setInvalidField(null)
    setFormError("")
    createMutation.mutate()
  }

  return (
    <>
      <div className="mb-3.5 grid grid-cols-1 gap-3.5">
        <Field>
          <FieldLabel htmlFor="txn-date">Date</FieldLabel>
          <Input id="txn-date" type="date" value={form.businessDate} onChange={e => setForm({ ...form, businessDate: e.target.value })} />
        </Field>

        <Field className="relative" data-invalid={invalidField === "customer"}>
          <FieldLabel htmlFor="txn-customer">Customer</FieldLabel>
          {form.customerId ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-input bg-muted px-2.5 py-1.5">
              <span className="flex-1 text-sm">{form.customerName}</span>
              <button type="button" onClick={() => setForm({ ...form, customerId: null, customerName: "" })} className="text-muted-foreground hover:text-foreground">×</button>
            </div>
          ) : (
            <Input
              id="txn-customer"
              value={form.customerSearch}
              onChange={e => setForm({ ...form, customerSearch: e.target.value })}
              placeholder="Search customer… (blank = walk-in)"
              aria-invalid={invalidField === "customer"}
            />
          )}
          {form.customerSearch && !form.customerId && (
            <div className="absolute top-full right-0 left-0 z-10 mt-0.5 max-h-40 overflow-y-auto rounded-lg border border-input bg-popover shadow-md">
              {customerMatches.map(c => (
                <div key={c.id} onClick={() => selectCustomer(c)} className="cursor-pointer border-b border-border px-2.5 py-2 text-sm last:border-b-0 hover:bg-muted">
                  {c.name} {c.phone && <span className="text-muted-foreground">· {c.phone}</span>}
                </div>
              ))}
              {/* PLAN 15.4: a search that finds nobody is exactly the moment
                  the operator needs to create somebody. */}
              {customerMatches.length === 0 && (
                <div
                  onClick={() => goCreateCustomer(form.customerSearch)}
                  className="cursor-pointer px-2.5 py-2 text-sm font-medium text-ring hover:bg-muted"
                >
                  + Add "{form.customerSearch}" as a new customer
                </div>
              )}
            </div>
          )}
        </Field>

        <Field data-invalid={invalidField === "serviceId"}>
          <FieldLabel htmlFor="txn-service">Service</FieldLabel>
          <Select
            items={Object.fromEntries(activeServices.map(s => [String(s.id), s.name]))}
            value={form.serviceId || undefined}
            onValueChange={v => selectService(v as string)}
          >
            <SelectTrigger id="txn-service" className="w-full" aria-invalid={invalidField === "serviceId"}>
              <SelectValue placeholder="Select service…" />
            </SelectTrigger>
            <SelectContent>
              {activeServices.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>

        <Field data-invalid={invalidField === "accountId"}>
          <FieldLabel htmlFor="txn-account">Account (payment received into)</FieldLabel>
          <Select
            items={Object.fromEntries(activeAccounts.map(a => [String(a.id), a.name]))}
            value={form.accountId || undefined}
            onValueChange={v => setForm({ ...form, accountId: v as string })}
          >
            <SelectTrigger id="txn-account" className="w-full" aria-invalid={invalidField === "accountId"}>
              <SelectValue placeholder="Select account…" />
            </SelectTrigger>
            <SelectContent>
              {activeAccounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>

        <Field data-invalid={invalidField === "fee"}>
          <FieldLabel htmlFor="txn-fee">Fee (₹)</FieldLabel>
          <Input id="txn-fee" type="number" value={form.fee} onChange={e => setForm({ ...form, fee: e.target.value })} aria-invalid={invalidField === "fee"} />
        </Field>
        <Field>
          <FieldLabel htmlFor="txn-charge">Service Charge (₹)</FieldLabel>
          <Input id="txn-charge" type="number" value={form.charge} onChange={e => setForm({ ...form, charge: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="txn-discount">Discount (₹)</FieldLabel>
          <Input id="txn-discount" type="number" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} />
        </Field>
        <Field data-invalid={invalidField === "paid"}>
          <FieldLabel htmlFor="txn-paid">Payment Received (₹)</FieldLabel>
          <Input id="txn-paid" type="number" value={form.paid} onChange={e => setForm({ ...form, paid: e.target.value })} aria-invalid={invalidField === "paid"} />
        </Field>
        <Field>
          <FieldLabel>Total</FieldLabel>
          <div className="px-2.5 py-1 font-mono text-sm font-bold tabular-nums">{fmt(formTotal)}</div>
        </Field>
      </div>
      <div className="flex flex-col gap-2.5">
        {formError && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <span>{formError}</span>
              {invalidField === "customer" && (
                <Button size="sm" variant="outline" onClick={() => goCreateCustomer(form.customerSearch)}>
                  Add a customer
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex items-center gap-2.5">
          <Button onClick={submitTransaction} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Saving…" : "Save Transaction"}
          </Button>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </>
  )
}
