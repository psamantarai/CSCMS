// Shared formatting, collapsing the fmt() that used to be copy-pasted into
// all 9 pages. toPaise/fromPaise exist for the API boundary (money crosses
// the API as integer paise — see ARCHITECTURE.md §6); pages themselves
// still work in rupees.

export function fmt(rupees: number): string {
  return "₹" + rupees.toLocaleString("en-IN")
}

export function formatDate(iso: string): string {
  // Append a local-midnight time so "2026-08-04" doesn't parse as UTC
  // midnight and roll back a day in negative-UTC-offset timezones.
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100)
}

export function fromPaise(paise: number): number {
  return paise / 100
}
