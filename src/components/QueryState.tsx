import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"

// H.8: a query that's still in flight or that failed must never render as a
// confirmed empty/zero result — in a cash ledger "loading" and "₹0" are not
// the same claim. These three helpers cover the three shapes call sites need
// (table row, block, inline figure); each returns null once data is ready so
// the caller renders its normal content.

type Status = { isLoading: boolean; error: unknown }

function message(error: unknown): string {
  return error instanceof Error ? error.message : "failed to load"
}

export function TableRowState({ isLoading, error, colSpan }: Status & { colSpan: number }) {
  if (isLoading) return <tr><td colSpan={colSpan} className="p-3"><Skeleton className="h-4 w-full" /></td></tr>
  if (error) return <tr><td colSpan={colSpan} className="p-2"><Alert variant="destructive"><AlertDescription>Could not load: {message(error)}</AlertDescription></Alert></td></tr>
  return null
}

export function BlockState({ isLoading, error }: Status) {
  if (isLoading) return <div className="space-y-2 p-4"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
  if (error) return <div className="p-2"><Alert variant="destructive"><AlertDescription>Could not load: {message(error)}</AlertDescription></Alert></div>
  return null
}

export function InlineState({ isLoading, error }: Status) {
  if (isLoading) return <Skeleton className="inline-block h-4 w-10 align-middle" />
  if (error) return <span className="text-destructive" title={message(error)}>Error</span>
  return null
}
