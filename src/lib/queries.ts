// react-query key factory. Grows one entry per resource as each API lands
// (accounts in 1.2, customers in 2.2, ...) — nothing speculative here yet.

export const queryKeys = {
  health: ["health"] as const,
  accounts: ["accounts"] as const,
  accountBalance: (id: number) => ["accounts", id, "balance"] as const,
  ledger: (filters: Record<string, string | number>) => ["ledger", filters] as const,
  transfers: ["transfers"] as const,
  customers: (q: string) => ["customers", q] as const,
  customerHistory: (id: number) => ["customers", id, "history"] as const,
  customerOutstanding: (id: number) => ["customers", id, "outstanding"] as const,
  services: ["services"] as const,
  transactions: (filters: Record<string, string | number>) => ["transactions", filters] as const,
  expenses: (filters: Record<string, string | number>) => ["expenses", filters] as const,
  expenseCategories: ["expenses", "categories"] as const,
  banking: (filters: Record<string, string | number>) => ["banking", filters] as const,
  bankingCommissionSummary: (filters: Record<string, string | number>) => ["banking", "commission-summary", filters] as const,
  dayStatus: (date: string) => ["day", date, "status"] as const,
  dayReport: (date: string) => ["day", date, "report"] as const,
  dashboard: (date: string) => ["dashboard", date] as const,
  reportMonthly: (year: number, month: number) => ["reports", "monthly", year, month] as const,
  reportServiceWise: (filters: Record<string, string>) => ["reports", "service-wise", filters] as const,
  reportProfitLoss: (filters: Record<string, string>) => ["reports", "profit-loss", filters] as const,
  reportBankingCommission: (filters: Record<string, string>) => ["reports", "banking-commission", filters] as const,
}
