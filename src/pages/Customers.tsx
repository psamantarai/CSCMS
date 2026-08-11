import { useState } from "react"
import { useLocation } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Search, Users } from "lucide-react"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, formatDate, fromPaise, localDateISO, toPaise } from "../lib/format"
import { BlockState, InlineState } from "../components/QueryState"
import { SortableTableHead, useSort } from "../components/SortableTableHead"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { cn } from "@/lib/utils"

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

const statusClass: Record<Transaction["status"], string> = {
  completed: "bg-success/15 text-success",
  partial: "bg-destructive/15 text-destructive",
  pending: "bg-warning/15 text-warning",
}

const serviceColumns = ["ID", "Date", "Service", "Total", "Status"]
const bankingColumns = ["ID", "Date", "Type", "Principal", "Commission"]

function CustomerHistory({ id }: { id: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.customerHistory(id),
    queryFn: () => api.get<{ transactions: Transaction[]; banking_transactions: BankingTransaction[] }>(`/customers/${id}/history`),
  })
  const txns = data?.transactions ?? []
  const banking = data?.banking_transactions ?? []
  const loaded = !isLoading && !error

  const { sorted: sortedTxns, sort: txnSort, toggleSort: toggleTxnSort } = useSort(txns, {
    id: t => t.id,
    date: t => t.business_date,
    service: t => t.service_name,
    total: t => t.total_paise,
  })
  const { sorted: sortedBanking, sort: bankingSort, toggleSort: toggleBankingSort } = useSort(banking, {
    id: b => b.id,
    date: b => b.business_date,
    type: b => b.txn_type,
    principal: b => b.principal_paise,
    commission: b => b.commission_paise,
  })

  return (
    <Card className="py-0">
      {!loaded && <div className="p-2"><BlockState isLoading={isLoading} error={error} /></div>}
      {loaded && (
        <Tabs defaultValue="service" className="p-4">
          <TabsList>
            <TabsTrigger value="service">Service History</TabsTrigger>
            <TabsTrigger value="banking">Banking History</TabsTrigger>
          </TabsList>
          <TabsContent value="service">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="id" sort={txnSort} onSort={toggleTxnSort}>ID</SortableTableHead>
                  <SortableTableHead sortKey="date" sort={txnSort} onSort={toggleTxnSort}>Date</SortableTableHead>
                  <SortableTableHead sortKey="service" sort={txnSort} onSort={toggleTxnSort}>Service</SortableTableHead>
                  <SortableTableHead sortKey="total" sort={txnSort} onSort={toggleTxnSort}>Total</SortableTableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTxns.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-ring">{t.id}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(t.business_date)}</TableCell>
                    <TableCell>{t.service_name}</TableCell>
                    <TableCell className="font-mono font-semibold tabular-nums">{fmt(fromPaise(t.total_paise))}</TableCell>
                    <TableCell><Badge className={cn("capitalize", statusClass[t.status])}>{t.status}</Badge></TableCell>
                  </TableRow>
                ))}
                {txns.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={serviceColumns.length} className="py-6 text-center text-muted-foreground">No transactions yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>
          <TabsContent value="banking">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="id" sort={bankingSort} onSort={toggleBankingSort}>ID</SortableTableHead>
                  <SortableTableHead sortKey="date" sort={bankingSort} onSort={toggleBankingSort}>Date</SortableTableHead>
                  <SortableTableHead sortKey="type" sort={bankingSort} onSort={toggleBankingSort}>Type</SortableTableHead>
                  <SortableTableHead sortKey="principal" sort={bankingSort} onSort={toggleBankingSort}>Principal</SortableTableHead>
                  <SortableTableHead sortKey="commission" sort={bankingSort} onSort={toggleBankingSort}>Commission</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedBanking.map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-ring">{b.id}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(b.business_date)}</TableCell>
                    <TableCell className="capitalize">{b.txn_type.replace("_", " ")}</TableCell>
                    <TableCell className="font-mono tabular-nums">{fmt(fromPaise(b.principal_paise))}</TableCell>
                    <TableCell className="font-mono tabular-nums text-success">{fmt(fromPaise(b.commission_paise))}</TableCell>
                  </TableRow>
                ))}
                {banking.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={bankingColumns.length} className="py-6 text-center text-muted-foreground">No banking transactions yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      )}
    </Card>
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
  // PLAN 15.4/15.5: TransactionForm and the Dashboard's Quick Actions send
  // the operator here to create a customer, optionally with the name they had
  // already typed. Read once as the initial state rather than in an effect, so
  // the create panel is open on the first paint and a later re-render can't
  // yank it back open after they cancel.
  const { state } = useLocation() as { state?: { create?: boolean; name?: string } }
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<number | null>(null)
  const [formMode, setFormMode] = useState<"view" | "create" | "edit">(state?.create ? "create" : "view")
  const [form, setForm] = useState(() => (state?.create ? { ...emptyForm, name: state.name ?? "" } : emptyForm))
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
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
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
    <div className="rs-flex-split flex h-full overflow-hidden">
      {/* List panel */}
      <div className="rs-flex-side flex w-80 shrink-0 flex-col border-r">
        <div className="border-b px-4 pt-5 pb-3">
          <h2 className="m-0 mb-3 text-base">Customers</h2>
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, phone, village…"
              className="pl-8"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <BlockState isLoading={customersLoading} error={customersError} />
          {!customersLoading && !customersError && customers.map(c => (
            <div
              key={c.id}
              onClick={() => { setSelected(c.id); setFormMode("view"); setShowSettle(false) }}
              className={cn(
                "cursor-pointer border-b border-l-[3px] px-4 py-3 transition-colors",
                selected === c.id ? "border-l-primary bg-primary/5" : "border-l-transparent hover:bg-muted/50"
              )}
            >
              <div className="text-[13px] font-semibold">{c.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{c.phone || "—"} · {c.village || "—"}</div>
            </div>
          ))}
          {!customersLoading && !customersError && customers.length === 0 && (
            <div className="py-6 text-center text-[13px] text-muted-foreground">No customers found</div>
          )}
        </div>
        <div className="border-t p-3">
          <Button className="w-full" onClick={openCreate}>+ Add New Customer</Button>
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto px-8 py-7">
        {formMode === "create" || formMode === "edit" ? (
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>{formMode === "edit" ? "Edit Customer" : "New Customer"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rs-grid grid grid-cols-2 gap-2.5">
                <Field>
                  <FieldLabel htmlFor="customer-name">Name</FieldLabel>
                  <Input id="customer-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-phone">Phone</FieldLabel>
                  <Input id="customer-phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-village">Village</FieldLabel>
                  <Input id="customer-village" value={form.village} onChange={e => setForm({ ...form, village: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-aadhaar">Aadhaar (masked)</FieldLabel>
                  <Input id="customer-aadhaar" value={form.aadhaar_masked} onChange={e => setForm({ ...form, aadhaar_masked: e.target.value })} />
                </Field>
                <Field className="col-span-2">
                  <FieldLabel htmlFor="customer-notes">Notes</FieldLabel>
                  <Input id="customer-notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </Field>
              </div>
              <div className="mt-3.5 flex gap-2.5">
                <Button onClick={submitForm}>{formMode === "edit" ? "Save Changes" : "Create Customer"}</Button>
                <Button variant="outline" onClick={() => setFormMode("view")}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        ) : customer ? (
          <>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="m-0 text-xl">{customer.name}</h2>
                <div className="mt-1 text-[13px] text-muted-foreground">{customer.phone || "—"} · {customer.village || "—"}</div>
              </div>
              <div className="flex gap-2.5">
                <Button variant="outline" onClick={showSettle ? () => setShowSettle(false) : openSettle}>
                  {showSettle ? "Cancel" : "Settle Payment"}
                </Button>
                <Button variant="outline" onClick={openEdit}>Edit</Button>
              </div>
            </div>

            {/* Settle payment form (H.19) */}
            {showSettle && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Settle Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rs-grid grid grid-cols-3 gap-3.5">
                    <Field>
                      <FieldLabel htmlFor="settle-amount">Amount (₹)</FieldLabel>
                      <Input id="settle-amount" type="number" value={settleForm.amount} onChange={e => setSettleForm({ ...settleForm, amount: e.target.value })} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="settle-account">Account (received into)</FieldLabel>
                      <Select
                        items={Object.fromEntries(activeAccounts.map(a => [String(a.id), a.name]))}
                        value={settleForm.accountId || undefined}
                        onValueChange={v => setSettleForm({ ...settleForm, accountId: v as string })}
                      >
                        <SelectTrigger id="settle-account" className="w-full">
                          <SelectValue placeholder="Select account…" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeAccounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="settle-remarks">Remarks</FieldLabel>
                      <Input id="settle-remarks" value={settleForm.remarks} onChange={e => setSettleForm({ ...settleForm, remarks: e.target.value })} />
                    </Field>
                  </div>
                  <div className="mt-3.5 flex flex-col gap-2.5">
                    {settleError && (
                      <Alert variant="destructive">
                        <AlertDescription>{settleError}</AlertDescription>
                      </Alert>
                    )}
                    <div>
                      <Button onClick={submitSettle} disabled={settleMutation.isPending}>
                        {settleMutation.isPending ? "Saving…" : "Settle"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Profile cards */}
            <div className="rs-grid mb-6 grid grid-cols-3 gap-3.5">
              {[
                { label: "Aadhaar", value: customer.aadhaar_masked || "—" },
                { label: "Outstanding Balance", value: <CustomerOutstanding id={customer.id} /> },
                { label: "Notes", value: customer.notes || "—" },
              ].map(f => (
                <Card key={f.label}>
                  <CardContent>
                    <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">{f.label}</div>
                    <div className="font-mono text-[15px] font-semibold">{f.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <CustomerHistory id={customer.id} />
          </>
        ) : (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyTitle>No customer selected</EmptyTitle>
              <EmptyDescription>Select a customer to view details</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  )
}
