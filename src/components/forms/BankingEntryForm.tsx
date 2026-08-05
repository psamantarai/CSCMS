import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../../lib/api"
import { queryKeys } from "../../lib/queries"
import { fromPaise, localDateISO, toPaise } from "../../lib/format"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"

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
  // PLAN 9.5.7: which field the last client-side validation failure was
  // about — see TransactionForm.tsx for why server errors don't set this.
  const [invalidField, setInvalidField] = useState<string | null>(null)
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
    onError: (e: Error) => { setInvalidField(null); setFormError(e.message) },
  })

  const updateMutation = useMutation({
    mutationFn: () => api.patch(`/banking/${editing!.id}`, payload()),
    onSuccess: () => { invalidate(); onSuccess() },
    onError: (e: Error) => { setInvalidField(null); setFormError(e.message) },
  })

  function selectCustomer(c: Customer) {
    setForm({ ...form, customerId: c.id, customerName: c.name, customerSearch: "" })
  }

  function fail(field: string, message: string) {
    setInvalidField(field)
    setFormError(message)
  }

  function submitForm() {
    if (!form.txnType) { fail("txnType", "Select a transaction type"); return }
    if (form.txnType === "balance_enquiry") {
      if (form.principal) { fail("principal", "Balance enquiry has no principal amount"); return }
    } else if (!(Number(form.principal) > 0)) {
      fail("principal", "Enter the transaction amount"); return
    }
    if (!form.settlementAccountId) { fail("settlementAccountId", "Select a settlement account"); return }
    if (!form.cashAccountId) { fail("cashAccountId", "Select a cash account"); return }
    if (form.txnType !== "balance_enquiry" && form.settlementAccountId === form.cashAccountId) {
      fail("cashAccountId", "Settlement and cash accounts must differ"); return
    }
    setInvalidField(null)
    setFormError("")
    if (editing) updateMutation.mutate()
    else createMutation.mutate()
  }

  const isMoneyTransfer = form.txnType === "money_transfer"
  const isBalanceEnquiry = form.txnType === "balance_enquiry"
  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <div className="rs-grid mb-3.5 grid grid-cols-3 gap-3.5">
        <Field>
          <FieldLabel htmlFor="bank-date">Date</FieldLabel>
          <Input id="bank-date" type="date" value={form.businessDate} onChange={e => setForm({ ...form, businessDate: e.target.value })} />
        </Field>

        <Field className="relative">
          <FieldLabel htmlFor="bank-customer">Customer</FieldLabel>
          {form.customerId ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-input bg-muted px-2.5 py-1.5">
              <span className="flex-1 text-sm">{form.customerName}</span>
              <button type="button" onClick={() => setForm({ ...form, customerId: null, customerName: "" })} className="text-muted-foreground hover:text-foreground">×</button>
            </div>
          ) : (
            <Input
              id="bank-customer"
              value={form.customerSearch}
              onChange={e => setForm({ ...form, customerSearch: e.target.value })}
              placeholder="Search customer… (optional)"
            />
          )}
          {form.customerSearch && !form.customerId && customerMatches.length > 0 && (
            <div className="absolute top-full right-0 left-0 z-10 mt-0.5 max-h-40 overflow-y-auto rounded-lg border border-input bg-popover shadow-md">
              {customerMatches.map(c => (
                <div key={c.id} onClick={() => selectCustomer(c)} className="cursor-pointer border-b border-border px-2.5 py-2 text-sm last:border-b-0 hover:bg-muted">
                  {c.name} {c.phone && <span className="text-muted-foreground">· {c.phone}</span>}
                </div>
              ))}
            </div>
          )}
        </Field>

        <Field data-invalid={invalidField === "txnType"}>
          <FieldLabel htmlFor="bank-type">Transaction Type</FieldLabel>
          <Select items={typeLabels} value={form.txnType || undefined} onValueChange={v => setForm({ ...form, txnType: v as TxnType })}>
            <SelectTrigger id="bank-type" className="w-full" aria-invalid={invalidField === "txnType"}>
              <SelectValue placeholder="Select type…" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(typeLabels) as TxnType[]).map(t => <SelectItem key={t} value={t}>{typeLabels[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>

        {/* Balance enquiry has no principal (ARCHITECTURE.md §3) */}
        {!isBalanceEnquiry && (
          <Field data-invalid={invalidField === "principal"}>
            <FieldLabel htmlFor="bank-amount">Amount (₹)</FieldLabel>
            <Input id="bank-amount" type="number" placeholder="0.00" value={form.principal} onChange={e => setForm({ ...form, principal: e.target.value })} aria-invalid={invalidField === "principal"} />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="bank-commission">Commission (₹)</FieldLabel>
          <Input id="bank-commission" type="number" placeholder="0.00" value={form.commission} onChange={e => setForm({ ...form, commission: e.target.value })} />
        </Field>
        <Field data-invalid={invalidField === "settlementAccountId"}>
          <FieldLabel htmlFor="bank-settlement-account">Settlement Account</FieldLabel>
          <Select
            items={Object.fromEntries(activeAccounts.map(a => [String(a.id), a.name]))}
            value={form.settlementAccountId || undefined}
            onValueChange={v => setForm({ ...form, settlementAccountId: v as string })}
          >
            <SelectTrigger id="bank-settlement-account" className="w-full" aria-invalid={invalidField === "settlementAccountId"}>
              <SelectValue placeholder="Select account…" />
            </SelectTrigger>
            <SelectContent>
              {activeAccounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field data-invalid={invalidField === "cashAccountId"}>
          <FieldLabel htmlFor="bank-cash-account">Cash Account</FieldLabel>
          <Select
            items={Object.fromEntries(activeAccounts.map(a => [String(a.id), a.name]))}
            value={form.cashAccountId || undefined}
            onValueChange={v => setForm({ ...form, cashAccountId: v as string })}
          >
            <SelectTrigger id="bank-cash-account" className="w-full" aria-invalid={invalidField === "cashAccountId"}>
              <SelectValue placeholder="Select account…" />
            </SelectTrigger>
            <SelectContent>
              {activeAccounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {/* money_transfer needs a destination — no separate column for it, so it's captured in remarks */}
        <Field>
          <FieldLabel htmlFor="bank-remarks">{isMoneyTransfer ? "Destination / Remarks" : "Remarks"}</FieldLabel>
          <Input id="bank-remarks" placeholder={isMoneyTransfer ? "Recipient name / account…" : "Optional note…"} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />
        </Field>
      </div>
      <div className="flex flex-col gap-2.5">
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <div className="flex items-center gap-2.5">
          <Button onClick={submitForm} disabled={isPending}>
            {isPending ? "Saving…" : editing ? "Save Changes" : "Save"}
          </Button>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </>
  )
}
