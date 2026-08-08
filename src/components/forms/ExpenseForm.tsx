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
  // PLAN 9.5.7: which field the last client-side validation failure was
  // about — see TransactionForm.tsx for why server errors don't set this.
  const [invalidField, setInvalidField] = useState<string | null>(null)
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
    onError: (e: Error) => { setInvalidField(null); setFormError(e.message) },
  })

  const updateMutation = useMutation({
    mutationFn: () => api.patch(`/expenses/${editing!.id}`, payload()),
    onSuccess: () => { invalidate(); onSuccess() },
    onError: (e: Error) => { setInvalidField(null); setFormError(e.message) },
  })

  function fail(field: string, message: string) {
    setInvalidField(field)
    setFormError(message)
  }

  function submitForm() {
    if (!form.category) { fail("category", "Select a category"); return }
    if (!(Number(form.amount) > 0)) { fail("amount", "Amount must be positive"); return }
    if (!form.accountId) { fail("accountId", "Select a paying account"); return }
    setInvalidField(null)
    setFormError("")
    if (editing) updateMutation.mutate()
    else createMutation.mutate()
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <>
      <div className="grid grid-cols-1 gap-3">
        <Field data-invalid={invalidField === "category"}>
          <FieldLabel htmlFor="expense-category">Category</FieldLabel>
          <Select value={form.category || undefined} onValueChange={v => setForm({ ...form, category: v as string })}>
            <SelectTrigger id="expense-category" className="w-full" aria-invalid={invalidField === "category"}>
              <SelectValue placeholder="Select category…" />
            </SelectTrigger>
            <SelectContent>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field data-invalid={invalidField === "amount"}>
          <FieldLabel htmlFor="expense-amount">Amount (₹)</FieldLabel>
          <Input id="expense-amount" type="number" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} aria-invalid={invalidField === "amount"} />
        </Field>
        <Field>
          <FieldLabel htmlFor="expense-date">Date</FieldLabel>
          <Input id="expense-date" type="date" value={form.businessDate} onChange={e => setForm({ ...form, businessDate: e.target.value })} />
        </Field>
        <Field data-invalid={invalidField === "accountId"}>
          <FieldLabel htmlFor="expense-account">Paying Account</FieldLabel>
          <Select
            items={Object.fromEntries(activeAccounts.map(a => [String(a.id), a.name]))}
            value={form.accountId || undefined}
            onValueChange={v => setForm({ ...form, accountId: v as string })}
          >
            <SelectTrigger id="expense-account" className="w-full" aria-invalid={invalidField === "accountId"}>
              <SelectValue placeholder="Select account…" />
            </SelectTrigger>
            <SelectContent>
              {activeAccounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="expense-note">Note</FieldLabel>
          <Input id="expense-note" placeholder="Brief description…" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
        </Field>
      </div>
      <div className="mt-3.5 flex flex-col gap-2.5">
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
