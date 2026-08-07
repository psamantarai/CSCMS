import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, formatDate, formatTime, fromPaise, localDateISO, toPaise } from "../lib/format"
import { BlockState, InlineState, TableRowState } from "../components/QueryState"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { cn } from "@/lib/utils"

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

const typeAccent: Record<AccountType, string> = {
  cash: "bg-warning",
  savings: "bg-primary",
  current: "bg-purple-600",
  wallet: "bg-cyan-600",
  settlement: "bg-success",
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

const transferColumns = ["ID", "From", "To", "Amount", "Date", "Time"]

function AccountBalance({ id }: { id: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.accountBalance(id),
    queryFn: () => api.get<{ balance_paise: number }>(`/accounts/${id}/balance`),
  })
  return isLoading || error
    ? <InlineState isLoading={isLoading} error={error} />
    : <>{fmt(fromPaise(data!.balance_paise))}</>
}

export default function Accounts() {
  const [showTransfer, setShowTransfer] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [transferForm, setTransferForm] = useState(emptyTransferForm)
  const [transferError, setTransferError] = useState("")
  const queryClient = useQueryClient()

  const { data: accounts = [], isLoading: accountsLoading, error: accountsError } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.get<Account[]>("/accounts"),
  })

  const { data: transfers = [], isLoading: transfersLoading, error: transfersError } = useQuery({
    queryKey: queryKeys.transfers,
    queryFn: () => api.get<Transfer[]>("/transfers"),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.accounts })
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }) // account create/edit/delete can move opening-balance ledger rows
  }

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
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
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
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="m-0 text-[22px]">Accounts & Balances</h1>
          <p className="mt-1 mb-0 text-[13px] text-muted-foreground">
            {accountsLoading ? "Loading…" : accountsError ? "Could not load accounts" : `${accounts.length} account${accounts.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex gap-2.5">
          <Button variant="outline" onClick={() => setShowTransfer(!showTransfer)}>⇄ Internal Transfer</Button>
          <Button onClick={() => (formOpen ? closeForm() : openCreate())}>{formOpen ? "Cancel" : "+ Add Account"}</Button>
        </div>
      </div>

      {/* Create / edit form */}
      {formOpen && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>{editingId ? "Edit Account" : "New Account"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rs-grid grid grid-cols-3 gap-2.5">
              <Field>
                <FieldLabel htmlFor="acc-name">Name</FieldLabel>
                <Input id="acc-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="acc-type">Type</FieldLabel>
                <Select
                  items={typeLabel}
                  value={form.account_type}
                  onValueChange={v => setForm({ ...form, account_type: v as AccountType })}
                >
                  <SelectTrigger id="acc-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(typeLabel) as AccountType[]).map(t => <SelectItem key={t} value={t}>{typeLabel[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              {!editingId && (
                <Field>
                  <FieldLabel htmlFor="acc-opening">Opening Balance (₹)</FieldLabel>
                  <Input id="acc-opening" type="number" value={form.opening_balance} onChange={e => setForm({ ...form, opening_balance: e.target.value })} />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="acc-bank">Bank Name</FieldLabel>
                <Input id="acc-bank" value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="acc-number">Account Number</FieldLabel>
                <Input id="acc-number" value={form.account_number_masked} onChange={e => setForm({ ...form, account_number_masked: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="acc-ifsc">IFSC</FieldLabel>
                <Input id="acc-ifsc" value={form.ifsc} onChange={e => setForm({ ...form, ifsc: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3.5 flex gap-2.5">
              <Button onClick={submitForm}>{editingId ? "Save Changes" : "Create Account"}</Button>
              <Button variant="outline" onClick={closeForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transfer form */}
      {showTransfer && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>Internal Fund Transfer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rs-grid grid grid-cols-[1fr_60px_1fr_160px] items-end gap-2.5">
              <Field>
                <FieldLabel htmlFor="trf-from">From Account</FieldLabel>
                <Select
                  items={{ "": "Select…", ...Object.fromEntries(accounts.filter(a => a.is_active).map(a => [String(a.id), a.name])) }}
                  value={transferForm.from_account_id}
                  onValueChange={v => setTransferForm({ ...transferForm, from_account_id: v as string })}
                >
                  <SelectTrigger id="trf-from" className="w-full">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter(a => a.is_active).map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <div className="pb-2 text-center text-lg text-muted-foreground">→</div>
              <Field>
                <FieldLabel htmlFor="trf-to">To Account</FieldLabel>
                <Select
                  items={{ "": "Select…", ...Object.fromEntries(accounts.filter(a => a.is_active).map(a => [String(a.id), a.name])) }}
                  value={transferForm.to_account_id}
                  onValueChange={v => setTransferForm({ ...transferForm, to_account_id: v as string })}
                >
                  <SelectTrigger id="trf-to" className="w-full">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter(a => a.is_active).map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="trf-amount">Amount (₹)</FieldLabel>
                <Input id="trf-amount" type="number" placeholder="0" value={transferForm.amount} onChange={e => setTransferForm({ ...transferForm, amount: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3.5 flex items-center gap-2.5">
              <Button onClick={submitTransfer} disabled={transferMutation.isPending}>
                {transferMutation.isPending ? "Transferring…" : "Execute Transfer"}
              </Button>
              <Button variant="outline" onClick={() => { setShowTransfer(false); setTransferError("") }}>Cancel</Button>
              {transferError && <span className="text-xs text-destructive">{transferError}</span>}
            </div>
            <p className="mt-2.5 mb-0 text-xs text-muted-foreground">Transfer creates two ledger entries — debit source, credit destination.</p>
          </CardContent>
        </Card>
      )}

      {/* Account cards */}
      <BlockState isLoading={accountsLoading} error={accountsError} />
      {!accountsLoading && !accountsError && (
        <div className="rs-grid mb-7 grid grid-cols-3 gap-3.5">
          {accounts.map(a => (
            <Card key={a.id} className={cn("relative overflow-hidden py-0", !a.is_active && "opacity-60")}>
              <div className={cn("absolute inset-y-0 left-0 w-1", typeAccent[a.account_type])} />
              <CardContent className="px-5.5 py-5">
                <div className="mb-3.5 flex items-start justify-between pl-1">
                  <div>
                    <div className="mb-1 text-lg">{typeIcon[a.account_type]}</div>
                    <div className="text-[15px] font-semibold">{a.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{a.bank_name || "Internal"} · {typeLabel[a.account_type]}</div>
                  </div>
                  <Badge className={a.is_active ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}>
                    {a.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                {a.account_number_masked && (
                  <div className="mb-2.5 pl-1 font-mono text-xs text-muted-foreground/70">{a.account_number_masked}</div>
                )}
                <div className="mb-3.5 pl-1">
                  <div className="mb-1 text-[11px] tracking-wide text-muted-foreground uppercase">Current Balance</div>
                  <div className="font-mono text-[22px] font-bold tabular-nums text-primary"><AccountBalance id={a.id} /></div>
                </div>
                <div className="flex gap-2 pl-1">
                  <Button variant="outline" size="sm" onClick={() => openEdit(a)}>Edit</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={a.is_active ? "text-destructive" : "text-success"}
                    onClick={() => deactivateMutation.mutate({ id: a.id, is_active: !a.is_active })}
                  >
                    {a.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Transfer history */}
      <Card className="py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Recent Internal Transfers</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              {transferColumns.map(h => <TableHead key={h}>{h}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRowState isLoading={transfersLoading} error={transfersError} colSpan={transferColumns.length} />
            {!transfersLoading && !transfersError && transfers.map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs font-semibold text-ring">TRF-{t.id}</TableCell>
                <TableCell>{t.from_account_name}</TableCell>
                <TableCell>{t.to_account_name}</TableCell>
                <TableCell className="font-mono font-bold tabular-nums">{fmt(fromPaise(t.amount_paise))}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(t.business_date)}</TableCell>
                <TableCell className="text-muted-foreground/70">{formatTime(t.created_at)}</TableCell>
              </TableRow>
            ))}
            {!transfersLoading && !transfersError && transfers.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={transferColumns.length}>
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>No transfers</EmptyTitle>
                      <EmptyDescription>No internal transfers yet.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
