import { Fragment, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { formatDate, formatTime } from "../lib/format"
import { TableRowState } from "../components/QueryState"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"

type AuditEntry = {
  id: number
  table_name: string
  row_id: number
  action: string
  before_json: string | null
  after_json: string | null
  user_id: number | null
  username: string | null
  created_at: string
}

const tableLabel: Record<string, string> = {
  accounts: "Accounts",
  expenses: "Expenses",
  transactions: "Transactions",
  payments: "Payments",
  banking_transactions: "Banking",
  account_transfers: "Transfers",
  business_days: "Business Days",
}

const actionClass: Record<string, string> = {
  create: "bg-success/15 text-success",
  update: "bg-ring/15 text-ring",
  delete: "bg-destructive/15 text-destructive",
  close: "bg-purple-500/15 text-purple-600",
}

const columns = ["Entry", "Date", "Time", "Table", "Row", "Action", "User"]

const PAGE_SIZE = 50

function prettyJson(s: string | null): string {
  if (s === null) return "—"
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}

export default function AuditLog() {
  const [tableName, setTableName] = useState("")
  const [action, setAction] = useState("")
  const [businessDate, setBusinessDate] = useState("")
  const [offset, setOffset] = useState(0)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const filters: Record<string, string | number> = { limit: PAGE_SIZE, offset }
  if (tableName) filters.table_name = tableName
  if (action) filters.action = action
  if (businessDate) filters.business_date = businessDate

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.auditLogs(filters),
    queryFn: () => {
      const params = new URLSearchParams(filters as Record<string, string>)
      return api.get<{ items: AuditEntry[]; total: number }>(`/audit?${params}`)
    },
  })
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const showRows = !isLoading && !error

  function resetPage() {
    setOffset(0)
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mb-5.5">
        <h1 className="m-0 text-[22px]">Audit Log</h1>
        <p className="mt-1 mb-0 text-[13px] text-muted-foreground">Before/after record of every financial mutation</p>
      </div>

      {/* Filters */}
      <Card className="mb-5.5">
        <CardContent>
          <div className="rs-grid grid grid-cols-[1fr_1fr_160px_auto] items-end gap-2.5">
            <Field>
              <FieldLabel htmlFor="audit-filter-table">Table</FieldLabel>
              <Select
                items={{ all: "All tables", ...tableLabel }}
                value={tableName || "all"}
                onValueChange={v => { setTableName(v === "all" ? "" : (v as string)); resetPage() }}
              >
                <SelectTrigger id="audit-filter-table" className="w-full">
                  <SelectValue placeholder="All tables" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tables</SelectItem>
                  {Object.entries(tableLabel).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="audit-filter-action">Action</FieldLabel>
              <Select
                items={{ all: "All actions", ...Object.fromEntries(Object.keys(actionClass).map(a => [a, a[0].toUpperCase() + a.slice(1)])) }}
                value={action || "all"}
                onValueChange={v => { setAction(v === "all" ? "" : (v as string)); resetPage() }}
              >
                <SelectTrigger id="audit-filter-action" className="w-full">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {Object.keys(actionClass).map(a => <SelectItem key={a} value={a}>{a[0].toUpperCase() + a.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="audit-filter-date">Date</FieldLabel>
              <Input id="audit-filter-date" type="date" value={businessDate} onChange={e => { setBusinessDate(e.target.value); resetPage() }} />
            </Field>
            <Button variant="outline" onClick={() => { setTableName(""); setAction(""); setBusinessDate(""); resetPage() }}>
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Audit table */}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(h => <TableHead key={h}>{h}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRowState isLoading={isLoading} error={error} colSpan={columns.length} />
            {showRows && items.map(e => {
              const ac = actionClass[e.action] ?? "bg-muted text-muted-foreground"
              const expanded = expandedId === e.id
              return (
                <Fragment key={e.id}>
                  <TableRow className="cursor-pointer" onClick={() => setExpandedId(expanded ? null : e.id)}>
                    <TableCell className="font-mono font-semibold text-ring">#{e.id}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(e.created_at.split(" ")[0])}</TableCell>
                    <TableCell className="text-muted-foreground/70">{formatTime(e.created_at)}</TableCell>
                    <TableCell>{tableLabel[e.table_name] ?? e.table_name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">#{e.row_id}</TableCell>
                    <TableCell>
                      <Badge className={ac}>{e.action}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{e.username ?? "—"}</TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell colSpan={columns.length} className="whitespace-normal px-3.5 pt-3 pb-4">
                        <div className="rs-grid grid grid-cols-2 gap-3.5">
                          <div>
                            <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Before</div>
                            <pre className="m-0 overflow-x-auto rounded-md border bg-card p-2.5 text-[11px] text-foreground">{prettyJson(e.before_json)}</pre>
                          </div>
                          <div>
                            <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">After</div>
                            <pre className="m-0 overflow-x-auto rounded-md border bg-card p-2.5 text-[11px] text-foreground">{prettyJson(e.after_json)}</pre>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
            {showRows && items.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length}>
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>No audit entries</EmptyTitle>
                      <EmptyDescription>No audit entries match these filters.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-3.5 py-2.5">
          <span className="text-xs text-muted-foreground">
            {!showRows ? "—" : total === 0 ? "0 entries" : `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
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
