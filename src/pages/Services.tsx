import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, fromPaise, toPaise } from "../lib/format"
import { TableRowState } from "../components/QueryState"
import { SortableTableHead, useSort } from "../components/SortableTableHead"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { cn } from "@/lib/utils"

type Service = {
  id: number
  name: string
  category: string
  default_fee_paise: number
  default_charge_paise: number
  is_active: number
}

const emptyForm = { name: "", category: "", default_fee: "0", default_charge: "0" }

const columns = ["Name", "Category", "Default Fee", "Default Charge", "Status", ""]

export default function Services() {
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const queryClient = useQueryClient()

  const { data: services = [], isLoading: servicesLoading, error: servicesError } = useQuery({
    queryKey: queryKeys.services,
    queryFn: () => api.get<Service[]>("/services"),
  })

  const { sorted: sortedServices, sort, toggleSort } = useSort(services, {
    name: s => s.name,
    category: s => s.category,
    fee: s => s.default_fee_paise,
    charge: s => s.default_charge_paise,
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
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="m-0 text-[22px]">Services</h1>
          <p className="mt-1 mb-0 text-[13px] text-muted-foreground">
            {servicesLoading ? "Loading…" : servicesError ? "Could not load services" : `${services.length} service${services.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Button onClick={() => (formOpen ? closeForm() : openCreate())}>{formOpen ? "Cancel" : "+ Add Service"}</Button>
      </div>

      {formOpen && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>{editingId ? "Edit Service" : "New Service"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rs-grid grid grid-cols-4 gap-3">
              <Field>
                <FieldLabel htmlFor="service-name">Name</FieldLabel>
                <Input id="service-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="service-category">Category</FieldLabel>
                <Input id="service-category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="service-fee">Default Fee (₹)</FieldLabel>
                <Input id="service-fee" type="number" value={form.default_fee} onChange={e => setForm({ ...form, default_fee: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="service-charge">Default Charge (₹)</FieldLabel>
                <Input id="service-charge" type="number" value={form.default_charge} onChange={e => setForm({ ...form, default_charge: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3.5 flex gap-2.5">
              <Button onClick={submitForm}>{editingId ? "Save Changes" : "Create Service"}</Button>
              <Button variant="outline" onClick={closeForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="name" sort={sort} onSort={toggleSort}>Name</SortableTableHead>
              <SortableTableHead sortKey="category" sort={sort} onSort={toggleSort}>Category</SortableTableHead>
              <SortableTableHead sortKey="fee" sort={sort} onSort={toggleSort}>Default Fee</SortableTableHead>
              <SortableTableHead sortKey="charge" sort={sort} onSort={toggleSort}>Default Charge</SortableTableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRowState isLoading={servicesLoading} error={servicesError} colSpan={columns.length} />
            {!servicesLoading && !servicesError && sortedServices.map(s => (
              <TableRow key={s.id} className={cn(!s.is_active && "opacity-60")}>
                <TableCell className="font-semibold">{s.name}</TableCell>
                <TableCell className="text-muted-foreground">{s.category}</TableCell>
                <TableCell className="font-mono tabular-nums">{fmt(fromPaise(s.default_fee_paise))}</TableCell>
                <TableCell className="font-mono tabular-nums">{fmt(fromPaise(s.default_charge_paise))}</TableCell>
                <TableCell>
                  <Badge className={s.is_active ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}>
                    {s.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(s)}>Edit</Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className={s.is_active ? "text-destructive" : "text-success"}
                      onClick={() => deactivateMutation.mutate({ id: s.id, is_active: !s.is_active })}
                    >
                      {s.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!servicesLoading && !servicesError && services.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length}>
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>No services</EmptyTitle>
                      <EmptyDescription>No services have been added yet.</EmptyDescription>
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
