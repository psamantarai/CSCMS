import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, formatDate, formatTime, fromPaise } from "../lib/format"
import { TableRowState } from "../components/QueryState"
import TransactionForm from "../components/forms/TransactionForm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { cn } from "@/lib/utils"

type Service = { id: number; name: string; is_active: number }

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

const statusClass: Record<Transaction["status"], string> = {
  completed: "bg-success/15 text-success",
  partial: "bg-destructive/15 text-destructive",
  pending: "bg-warning/15 text-warning",
}

const columns = ["TXN ID", "Date", "Time", "Customer", "Service", "Fee", "Charge", "Discount", "Total", "Paid", "Pending", "Status"]

const PAGE_SIZE = 50

export default function Transactions() {
  const [businessDate, setBusinessDate] = useState("")
  const [serviceId, setServiceId] = useState("")
  const [statusFilter, setStatusFilter] = useState<typeof statuses[number]>("All")
  const [offset, setOffset] = useState(0)
  const [showForm, setShowForm] = useState(false)

  const { data: services = [] } = useQuery({
    queryKey: queryKeys.services,
    queryFn: () => api.get<Service[]>("/services"),
  })

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
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="m-0 text-[22px]">Transactions</h1>
          <p className="mt-1 mb-0 text-[13px] text-muted-foreground">{showFigures ? `${total} entries` : "—"}</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "+ New Transaction"}</Button>
      </div>

      {showForm && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>New Transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionForm onSuccess={() => setShowForm(false)} onCancel={() => setShowForm(false)} />
          </CardContent>
        </Card>
      )}

      {/* Summary bar */}
      <div className="mb-4.5 flex gap-4">
        <Card size="sm" className="bg-success/5">
          <CardContent>
            <div className="mb-0.5 text-[11px] text-muted-foreground">TOTAL COLLECTED (this page)</div>
            <div className="font-mono text-base font-bold tabular-nums text-success">{showFigures ? fmt(fromPaise(totalCollected)) : "—"}</div>
          </CardContent>
        </Card>
        <Card size="sm" className="bg-warning/5">
          <CardContent>
            <div className="mb-0.5 text-[11px] text-muted-foreground">TOTAL PENDING (this page)</div>
            <div className="font-mono text-base font-bold tabular-nums text-warning">{showFigures ? fmt(fromPaise(totalPending)) : "—"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-3.5">
        <CardContent>
          <div className="rs-grid grid grid-cols-[160px_1fr_auto] items-end gap-2.5">
            <Field>
              <FieldLabel htmlFor="txn-filter-date">Date</FieldLabel>
              <Input id="txn-filter-date" type="date" value={businessDate} onChange={e => { setBusinessDate(e.target.value); resetPage() }} />
            </Field>
            <Field>
              <FieldLabel htmlFor="txn-filter-service">Service</FieldLabel>
              <Select
                items={{ all: "All services", ...Object.fromEntries(services.map(s => [String(s.id), s.name])) }}
                value={serviceId || "all"}
                onValueChange={v => { setServiceId(v === "all" ? "" : (v as string)); resetPage() }}
              >
                <SelectTrigger id="txn-filter-service" className="w-full">
                  <SelectValue placeholder="All services" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All services</SelectItem>
                  {services.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Button variant="outline" onClick={() => { setBusinessDate(""); setServiceId(""); setStatusFilter("All"); resetPage() }}>
              Clear filters
            </Button>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {statuses.map(s => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                className="rounded-full capitalize"
                onClick={() => { setStatusFilter(s); resetPage() }}
              >
                {s}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(h => <TableHead key={h}>{h}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRowState isLoading={isLoading} error={error} colSpan={columns.length} />
            {showFigures && items.map(t => {
              const pending = Math.max(0, t.total_paise - t.paid_paise)
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-mono font-semibold text-ring">#{t.id}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(t.business_date)}</TableCell>
                  <TableCell className="text-muted-foreground/70">{formatTime(t.created_at)}</TableCell>
                  <TableCell>{t.customer_name ?? "Walk-in"}</TableCell>
                  <TableCell className="text-muted-foreground">{t.service_name}</TableCell>
                  <TableCell className="font-mono tabular-nums">{fmt(fromPaise(t.fee_paise))}</TableCell>
                  <TableCell className={cn("font-mono tabular-nums", t.charge_paise > 0 ? "text-success" : "text-muted-foreground")}>
                    {t.charge_paise > 0 ? `+${fmt(fromPaise(t.charge_paise))}` : "—"}
                  </TableCell>
                  <TableCell className={cn("font-mono tabular-nums", t.discount_paise > 0 ? "text-destructive" : "text-muted-foreground")}>
                    {t.discount_paise > 0 ? `-${fmt(fromPaise(t.discount_paise))}` : "—"}
                  </TableCell>
                  <TableCell className="font-mono font-bold tabular-nums">{fmt(fromPaise(t.total_paise))}</TableCell>
                  <TableCell className="font-mono tabular-nums">{fmt(fromPaise(t.paid_paise))}</TableCell>
                  <TableCell className={cn("font-mono tabular-nums", pending > 0 ? "text-warning" : "text-muted-foreground")}>
                    {pending > 0 ? fmt(fromPaise(pending)) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("capitalize", statusClass[t.status])}>{t.status}</Badge>
                  </TableCell>
                </TableRow>
              )
            })}
            {showFigures && items.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length}>
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>No transactions</EmptyTitle>
                      <EmptyDescription>No transactions match these filters.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-3.5 py-2.5">
          <span className="text-xs text-muted-foreground">
            {!showFigures ? "—" : total === 0 ? "0 entries" : `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Prev</Button>
            <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
