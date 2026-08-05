// Client-side CSV export (PLAN 7.7): reports are small, so a browser-generated
// file needs no server endpoint.
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map(row => row.map(cell => {
      const s = String(cell)
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }).join(","))
    .join("\r\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
