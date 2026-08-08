// PLAN 9.8.2: first-run only. App.tsx renders this instead of Login (zero
// users) or the dashboard shell (zero accounts) — see its gate. Two steps:
// Create Admin Account (+ shop name, via bootstrap) then add starting
// accounts (existing POST /accounts, no backend change needed there).
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "../lib/auth"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { toPaise } from "../lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Trash2 } from "lucide-react"

type AccountType = "cash" | "savings" | "current" | "wallet" | "settlement"
type AccountRow = { name: string; account_type: AccountType; opening_balance: string }

const accountTypeLabel: Record<AccountType, string> = {
  cash: "Cash", savings: "Savings", current: "Current", wallet: "Wallet", settlement: "Settlement",
}

const emptyRow = (): AccountRow => ({ name: "", account_type: "cash", opening_balance: "0" })

function SetupCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center bg-sidebar">
      <Card className="w-[26rem]">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-accent font-serif text-base font-extrabold text-accent-foreground">
              C
            </div>
            <div>
              <div className="text-sm leading-tight font-bold">CSCMS Setup</div>
              <div className="text-[10px] tracking-wide text-muted-foreground">{title}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}

export default function Setup({ onComplete }: { onComplete: () => void }) {
  const { user } = useAuth()
  const [step, setStep] = useState<1 | 2>(user ? 2 : 1)

  return step === 1
    ? <CreateAdminStep onDone={() => setStep(2)} />
    : <ShopSetupStep onDone={onComplete} />
}

function CreateAdminStep({ onDone }: { onDone: () => void }) {
  const { bootstrap } = useAuth()
  const [shopName, setShopName] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    setSubmitting(true)
    try {
      await bootstrap(username, password, shopName)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : "setup failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SetupCard title="Step 1 of 2 — Create Admin Account">
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="setup-shop-name">Shop name</FieldLabel>
            <Input id="setup-shop-name" value={shopName} onChange={e => setShopName(e.target.value)} autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="setup-username">Username</FieldLabel>
            <Input id="setup-username" value={username} onChange={e => setUsername(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="setup-password">Password</FieldLabel>
            <Input
              id="setup-password" type="password" value={password}
              onChange={e => setPassword(e.target.value)} required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="setup-confirm-password">Confirm password</FieldLabel>
            <Input
              id="setup-confirm-password" type="password" value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)} required
            />
          </Field>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create account"}
          </Button>
        </FieldGroup>
      </form>
    </SetupCard>
  )
}

function ShopSetupStep({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<AccountRow[]>([emptyRow()])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function updateRow(i: number, patch: Partial<AccountRow>) {
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const valid = rows.filter(r => r.name.trim())
    if (valid.length === 0) {
      setError("Add at least one account")
      return
    }
    setSubmitting(true)
    try {
      for (const r of valid) {
        await api.post("/accounts", {
          name: r.name.trim(),
          account_type: r.account_type,
          opening_balance_paise: toPaise(Number(r.opening_balance) || 0),
        })
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not create accounts")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SetupCard title="Step 2 of 2 — Add Your Accounts">
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          {rows.map((row, i) => (
            <div key={i} className="flex items-end gap-2 border-b pb-3 last:border-0 last:pb-0">
              <Field className="flex-1">
                <FieldLabel htmlFor={`setup-account-name-${i}`}>Account name</FieldLabel>
                <Input
                  id={`setup-account-name-${i}`} value={row.name} autoFocus={i === 0}
                  onChange={e => updateRow(i, { name: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`setup-account-type-${i}`}>Type</FieldLabel>
                <Select value={row.account_type} onValueChange={v => updateRow(i, { account_type: v as AccountType })}>
                  <SelectTrigger id={`setup-account-type-${i}`} className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(accountTypeLabel) as AccountType[]).map(t => (
                      <SelectItem key={t} value={t}>{accountTypeLabel[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={`setup-account-balance-${i}`}>Opening ₹</FieldLabel>
                <Input
                  id={`setup-account-balance-${i}`} type="number" step="0.01" className="w-24"
                  value={row.opening_balance} onChange={e => updateRow(i, { opening_balance: e.target.value })}
                />
              </Field>
              <Button
                type="button" variant="ghost" size="icon-sm" disabled={rows.length === 1}
                onClick={() => setRows(rs => rs.filter((_, idx) => idx !== i))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}

          <Button type="button" variant="outline" onClick={() => setRows(rs => [...rs, emptyRow()])}>
            + Add another account
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={submitting}>
            {submitting ? "Finishing…" : "Finish setup"}
          </Button>
        </FieldGroup>
      </form>
    </SetupCard>
  )
}
