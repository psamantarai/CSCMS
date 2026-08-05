import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { queryKeys } from "../lib/queries"
import { fmt, fromPaise, localDateISO } from "../lib/format"
import { downloadCsv } from "../lib/csv"
import { BlockState, TableRowState } from "../components/QueryState"

const reportTypes = [
  { id: "daily", label: "Daily Report" },
  { id: "monthly", label: "Monthly Report" },
  { id: "service", label: "Service-wise" },
  { id: "pl", label: "Profit & Loss" },
  { id: "commission", label: "Banking Commission" },
] as const
type ReportType = (typeof reportTypes)[number]["id"]

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

type Account = { id: number; account_type: string }
type DayReportAccount = { account_id: number; account_name: string; opening_paise: number; received_paise: number; paid_paise: number; closing_paise: number }
type DayReport = { business_date: string; status: "open" | "closed"; accounts: DayReportAccount[] }
type Transaction = { id: number; customer_name: string | null; service_name: string; fee_paise: number; charge_paise: number; paid_paise: number; status: "completed" | "partial" | "pending" }
type MonthlyReport = { income_paise: number; expenses_paise: number; profit_paise: number }
type ServiceRow = { service_id: number; service_name: string; transaction_count: number; billed_paise: number; income_paise: number }
type ProfitLoss = {
  service_income_paise: number; commission_paise: number; total_income_paise: number
  expenses_by_category: { category: string; amount_paise: number }[]; total_expenses_paise: number; profit_paise: number
}
type CommissionReport = { items: { account_id: number; account_name: string; total_commission_paise: number }[]; total_commission_paise: number }

const labelStyle = { display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 } as const
const inputStyle = { padding: "8px 10px", border: "1px solid #d1d9e6", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" as const }
const cardStyle = { background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, padding: "20px 24px" }

function firstOfMonthISO(): string {
  return localDateISO().slice(0, 8) + "01"
}

export default function Reports() {
  const [activeReport, setActiveReport] = useState<ReportType>("daily")

  const [dailyDate, setDailyDate] = useState(localDateISO())
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [startDate, setStartDate] = useState(firstOfMonthISO())
  const [endDate, setEndDate] = useState(localDateISO())

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => api.get<Account[]>("/accounts"),
  })

  const { data: dayReport, isLoading: dayLoading, error: dayError } = useQuery({
    queryKey: queryKeys.dayReport(dailyDate),
    queryFn: () => api.get<DayReport>(`/day/${dailyDate}/report`),
    enabled: activeReport === "daily",
  })
  const dailyTxnFilters: Record<string, string | number> = { business_date: dailyDate, limit: 100 }
  const { data: dailyTxnData, isLoading: txnLoading, error: txnError } = useQuery({
    queryKey: queryKeys.transactions(dailyTxnFilters),
    queryFn: () => {
      const params = new URLSearchParams(dailyTxnFilters as Record<string, string>)
      return api.get<{ items: Transaction[]; total: number }>(`/transactions?${params}`)
    },
    enabled: activeReport === "daily",
  })
  const cashAccountId = accounts.find(a => a.account_type === "cash")?.id
  const cashRow = dayReport?.accounts.find(a => a.account_id === cashAccountId)
  const dailyTxns = dailyTxnData?.items ?? []

  const { data: monthly, isLoading: monthlyLoading, error: monthlyError } = useQuery({
    queryKey: queryKeys.reportMonthly(year, month),
    queryFn: () => api.get<MonthlyReport>(`/reports/monthly?year=${year}&month=${month}`),
    enabled: activeReport === "monthly",
  })

  const rangeFilters = { start_date: startDate, end_date: endDate }

  const { data: serviceRows, isLoading: serviceLoading, error: serviceError } = useQuery({
    queryKey: queryKeys.reportServiceWise(rangeFilters),
    queryFn: () => {
      const params = new URLSearchParams(rangeFilters)
      return api.get<ServiceRow[]>(`/reports/service-wise?${params}`)
    },
    enabled: activeReport === "service",
  })

  const { data: pl, isLoading: plLoading, error: plError } = useQuery({
    queryKey: queryKeys.reportProfitLoss(rangeFilters),
    queryFn: () => {
      const params = new URLSearchParams(rangeFilters)
      return api.get<ProfitLoss>(`/reports/profit-loss?${params}`)
    },
    enabled: activeReport === "pl",
  })

  const { data: commission, isLoading: commissionLoading, error: commissionError } = useQuery({
    queryKey: queryKeys.reportBankingCommission(rangeFilters),
    queryFn: () => {
      const params = new URLSearchParams(rangeFilters)
      return api.get<CommissionReport>(`/reports/banking-commission?${params}`)
    },
    enabled: activeReport === "commission",
  })

  // PLAN 7.7: CSV export builds rows straight from the same fetched data the
  // active tab renders, so exported totals can't drift from on-screen ones.
  // Amounts go out as raw rupee numbers (fromPaise), not fmt()'s "₹"/comma
  // strings, so a spreadsheet can sum them.
  const csvBuilders: Record<ReportType, { ready: boolean; rows: () => (string | number)[][]; filename: string }> = {
    daily: {
      ready: !dayLoading && !dayError && !txnLoading && !txnError && !!dayReport && !!cashRow,
      filename: `daily-report-${dailyDate}.csv`,
      rows: () => [
        ["Cash Summary", dailyDate],
        ["Opening Cash Balance", fromPaise(cashRow!.opening_paise)],
        ["Received", fromPaise(cashRow!.received_paise)],
        ["Paid Out", fromPaise(cashRow!.paid_paise)],
        ["Closing Cash Balance", fromPaise(cashRow!.closing_paise)],
        [],
        ["Account Balances"],
        ["Account", "Closing Balance"],
        ...dayReport!.accounts.map(a => [a.account_name, fromPaise(a.closing_paise)]),
        [],
        ["Transaction Register"],
        ["TXN", "Customer", "Service", "Fees", "Charge", "Payment", "Status"],
        ...dailyTxns.map(t => [t.id, t.customer_name ?? "Walk-in", t.service_name, fromPaise(t.fee_paise), fromPaise(t.charge_paise), fromPaise(t.paid_paise), t.status]),
      ],
    },
    monthly: {
      ready: !monthlyLoading && !monthlyError && !!monthly,
      filename: `monthly-report-${year}-${String(month).padStart(2, "0")}.csv`,
      rows: () => [
        [`${monthNames[month - 1]} ${year}`],
        ["Income", fromPaise(monthly!.income_paise)],
        ["Expenses", fromPaise(monthly!.expenses_paise)],
        ["Profit", fromPaise(monthly!.profit_paise)],
      ],
    },
    service: {
      ready: !serviceLoading && !serviceError && !!serviceRows,
      filename: `service-wise-report-${startDate}-to-${endDate}.csv`,
      rows: () => [
        ["Service", "Transactions", "Billed", "Income Collected"],
        ...(serviceRows ?? []).map(s => [s.service_name, s.transaction_count, fromPaise(s.billed_paise), fromPaise(s.income_paise)]),
      ],
    },
    pl: {
      ready: !plLoading && !plError && !!pl,
      filename: `profit-loss-report-${startDate}-to-${endDate}.csv`,
      rows: () => [
        ["Total Income", fromPaise(pl!.total_income_paise)],
        ["Total Expenses", fromPaise(pl!.total_expenses_paise)],
        ["Net Profit", fromPaise(pl!.profit_paise)],
        [],
        ["Income Sources"],
        ["Service Income", fromPaise(pl!.service_income_paise)],
        ["Banking Commission", fromPaise(pl!.commission_paise)],
        [],
        ["Expenses by Category"],
        ...pl!.expenses_by_category.map(r => [r.category, fromPaise(r.amount_paise)]),
      ],
    },
    commission: {
      ready: !commissionLoading && !commissionError && !!commission,
      filename: `banking-commission-report-${startDate}-to-${endDate}.csv`,
      rows: () => [
        ["Total Commission", fromPaise(commission!.total_commission_paise)],
        [],
        ["Account", "Commission"],
        ...commission!.items.map(r => [r.account_name, fromPaise(r.total_commission_paise)]),
      ],
    },
  }
  const activeCsv = csvBuilders[activeReport]

  return (
    <div className="print-report" style={{ padding: "28px 32px", overflowY: "auto", height: "100%" }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Reports</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Daily, monthly, and service-wise financial summaries</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => window.print()} style={{ background: "#fff", color: "#1e3a5f", border: "1px solid #d1d9e6", borderRadius: 7, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            🖨 Print
          </button>
          <button
            disabled={!activeCsv.ready}
            onClick={() => downloadCsv(activeCsv.filename, activeCsv.rows())}
            style={{
              background: activeCsv.ready ? "#1e3a5f" : "#94a3b8", color: "#fff", border: "none", borderRadius: 7,
              padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: activeCsv.ready ? "pointer" : "not-allowed",
            }}
          >
            ⬇ Export CSV
          </button>
        </div>
      </div>

      {/* Report type tabs */}
      <div className="no-print" style={{ display: "flex", gap: 4, marginBottom: 20, background: "#f0f4f8", borderRadius: 9, padding: 4, width: "fit-content" }}>
        {reportTypes.map(r => (
          <button key={r.id} onClick={() => setActiveReport(r.id)} style={{
            padding: "7px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "none",
            background: activeReport === r.id ? "#1e3a5f" : "transparent",
            color: activeReport === r.id ? "#fff" : "#64748b",
            transition: "all 0.15s",
          }}>{r.label}</button>
        ))}
      </div>

      {/* Period controls */}
      {activeReport === "daily" && (
        <div className="no-print" style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Date</label>
          <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)} style={{ ...inputStyle, width: 180 }} />
        </div>
      )}
      {activeReport === "monthly" && (
        <div className="no-print" style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>Month</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ ...inputStyle, background: "#fff" }}>
              {monthNames.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Year</label>
            <input type="number" value={year} onChange={e => setYear(Number(e.target.value) || now.getFullYear())} style={{ ...inputStyle, width: 100 }} />
          </div>
        </div>
      )}
      {(activeReport === "service" || activeReport === "pl" || activeReport === "commission") && (
        <div className="no-print" style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inputStyle, width: 160 }} />
          </div>
          <div>
            <label style={labelStyle}>To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inputStyle, width: 160 }} />
          </div>
        </div>
      )}

      {activeReport === "daily" && (
        <>
          <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
            {/* Daily summary */}
            <div style={cardStyle}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Cash Summary — {dailyDate}</h3>
              {dayLoading || dayError ? <BlockState isLoading={dayLoading} error={dayError} /> : !cashRow ? (
                <div style={{ color: "#94a3b8", fontSize: 13 }}>No cash account found.</div>
              ) : (
                [
                  { label: "Opening Cash Balance", value: fmt(fromPaise(cashRow.opening_paise)), color: "#64748b" },
                  { label: "Received", value: "+ " + fmt(fromPaise(cashRow.received_paise)), color: "#16a34a" },
                  { label: "Paid Out", value: "− " + fmt(fromPaise(cashRow.paid_paise)), color: "#dc2626" },
                  { label: "Closing Cash Balance", value: fmt(fromPaise(cashRow.closing_paise)), color: "#1e3a5f" },
                ].map((r, i) => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: i < 3 ? "1px dashed #e8edf5" : "2px solid #d1d9e6" }}>
                    <span style={{ fontSize: 13, color: "#475569" }}>{r.label}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: r.color }}>{r.value}</span>
                  </div>
                ))
              )}
            </div>

            {/* Account balances */}
            <div style={cardStyle}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Account Balances</h3>
              {dayLoading || dayError ? <BlockState isLoading={dayLoading} error={dayError} /> : (
                dayReport!.accounts.map((a, i) => (
                  <div key={a.account_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: i < dayReport!.accounts.length - 1 ? "1px dashed #e8edf5" : "none" }}>
                    <span style={{ fontSize: 13, color: "#475569" }}>{a.account_name}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#1e3a5f" }}>{fmt(fromPaise(a.closing_paise))}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Transaction register */}
          <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef1f7" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Transaction Register</h3>
            </div>
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["TXN", "Customer", "Service", "Fees", "Charge", "Payment", "Status"].map(h => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TableRowState isLoading={txnLoading} error={txnError} colSpan={7} />
                {!txnLoading && !txnError && dailyTxns.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: "24px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No transactions on this date.</td></tr>
                )}
                {dailyTxns.map((t, i) => (
                  <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12, color: "#3b6cb7" }}>#{t.id}</td>
                    <td style={{ padding: "8px 14px", fontSize: 13 }}>{t.customer_name ?? "Walk-in"}</td>
                    <td style={{ padding: "8px 14px", fontSize: 13, color: "#475569" }}>{t.service_name}</td>
                    <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12 }}>{fmt(fromPaise(t.fee_paise))}</td>
                    <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12, color: "#16a34a" }}>+{fmt(fromPaise(t.charge_paise))}</td>
                    <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{fmt(fromPaise(t.paid_paise))}</td>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: t.status === "completed" ? "#dcfce7" : t.status === "pending" ? "#fef3c7" : "#fee2e2", color: t.status === "completed" ? "#16a34a" : t.status === "pending" ? "#d97706" : "#dc2626" }}>{t.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}

      {activeReport === "monthly" && (
        <div style={cardStyle}>
          <h3 style={{ margin: "0 0 20px", fontSize: 15, fontFamily: "'Roboto Slab', serif" }}>{monthNames[month - 1]} {year}</h3>
          {monthlyLoading || monthlyError ? <BlockState isLoading={monthlyLoading} error={monthlyError} /> : (
            <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {[
                { label: "Income", value: fmt(fromPaise(monthly!.income_paise)), color: "#1e3a5f", bg: "#eff6ff" },
                { label: "Expenses", value: fmt(fromPaise(monthly!.expenses_paise)), color: "#dc2626", bg: "#fef2f2" },
                { label: "Profit", value: fmt(fromPaise(monthly!.profit_paise)), color: "#16a34a", bg: "#f0fdf4" },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, border: "1px solid #d1d9e6", borderRadius: 9, padding: "16px 18px" }}>
                  <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeReport === "service" && (
        <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef1f7" }}>
            <h3 style={{ margin: 0, fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Service-wise Breakdown</h3>
          </div>
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Service", "Transactions", "Billed", "Income Collected"].map(h => (
                  <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <TableRowState isLoading={serviceLoading} error={serviceError} colSpan={4} />
              {!serviceLoading && !serviceError && (serviceRows ?? []).length === 0 && (
                <tr><td colSpan={4} style={{ padding: "24px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No services found.</td></tr>
              )}
              {(serviceRows ?? []).map((s, i) => (
                <tr key={s.service_id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "9px 14px", fontSize: 13 }}>{s.service_name}</td>
                  <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12 }}>{s.transaction_count}</td>
                  <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12 }}>{fmt(fromPaise(s.billed_paise))}</td>
                  <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#16a34a" }}>{fmt(fromPaise(s.income_paise))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {activeReport === "pl" && (
        <>
          {plLoading || plError ? <div style={cardStyle}><BlockState isLoading={plLoading} error={plError} /></div> : (
            <>
              <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
                {[
                  { label: "Total Income", value: fmt(fromPaise(pl!.total_income_paise)), color: "#1e3a5f", bg: "#eff6ff" },
                  { label: "Total Expenses", value: fmt(fromPaise(pl!.total_expenses_paise)), color: "#dc2626", bg: "#fef2f2" },
                  { label: "Net Profit", value: fmt(fromPaise(pl!.profit_paise)), color: "#16a34a", bg: "#f0fdf4" },
                ].map(s => (
                  <div key={s.label} style={{ background: s.bg, border: "1px solid #d1d9e6", borderRadius: 9, padding: "16px 18px" }}>
                    <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div className="rs-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div style={cardStyle}>
                  <h3 style={{ margin: "0 0 14px", fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Income Sources</h3>
                  {[
                    { label: "Service Income", value: pl!.service_income_paise },
                    { label: "Banking Commission", value: pl!.commission_paise },
                  ].map((r, i) => (
                    <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: i < 1 ? "1px dashed #e8edf5" : "none" }}>
                      <span style={{ fontSize: 13, color: "#475569" }}>{r.label}</span>
                      <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#16a34a" }}>{fmt(fromPaise(r.value))}</span>
                    </div>
                  ))}
                </div>
                <div style={cardStyle}>
                  <h3 style={{ margin: "0 0 14px", fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Expenses by Category</h3>
                  {pl!.expenses_by_category.length === 0 ? (
                    <div style={{ color: "#94a3b8", fontSize: 13 }}>No expenses in this period.</div>
                  ) : pl!.expenses_by_category.map((r, i) => (
                    <div key={r.category} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: i < pl!.expenses_by_category.length - 1 ? "1px dashed #e8edf5" : "none" }}>
                      <span style={{ fontSize: 13, color: "#475569" }}>{r.category}</span>
                      <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#dc2626" }}>{fmt(fromPaise(r.amount_paise))}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {activeReport === "commission" && (
        <>
          <div style={{ marginBottom: 20 }}>
            <div style={{ background: "#f0fdf4", border: "1px solid #d1d9e6", borderRadius: 9, padding: "16px 18px", width: "fit-content" }}>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Total Commission</div>
              <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: "#16a34a" }}>
                {commissionLoading || commissionError ? "—" : fmt(fromPaise(commission!.total_commission_paise))}
              </div>
            </div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #d1d9e6", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef1f7" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontFamily: "'Roboto Slab', serif" }}>Commission by Account</h3>
            </div>
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Account", "Commission"].map(h => (
                    <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eef1f7" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TableRowState isLoading={commissionLoading} error={commissionError} colSpan={2} />
                {!commissionLoading && !commissionError && (commission?.items ?? []).length === 0 && (
                  <tr><td colSpan={2} style={{ padding: "24px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No commission in this period.</td></tr>
                )}
                {(commission?.items ?? []).map((r, i) => (
                  <tr key={r.account_id} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfd", borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "9px 14px", fontSize: 13 }}>{r.account_name}</td>
                    <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#16a34a" }}>{fmt(fromPaise(r.total_commission_paise))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
