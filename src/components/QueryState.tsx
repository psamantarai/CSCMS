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
  if (isLoading) return <tr><td colSpan={colSpan} style={{ padding: "24px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading…</td></tr>
  if (error) return <tr><td colSpan={colSpan} style={{ padding: "24px 14px", textAlign: "center", color: "#dc2626", fontSize: 13 }}>Could not load: {message(error)}</td></tr>
  return null
}

export function BlockState({ isLoading, error }: Status) {
  if (isLoading) return <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading…</div>
  if (error) return <div style={{ padding: 24, textAlign: "center", color: "#dc2626", fontSize: 13 }}>Could not load: {message(error)}</div>
  return null
}

export function InlineState({ isLoading, error }: Status) {
  if (isLoading) return <span style={{ color: "#94a3b8" }}>…</span>
  if (error) return <span style={{ color: "#dc2626" }} title={message(error)}>Error</span>
  return null
}
