// react-query key factory. Grows one entry per resource as each API lands
// (accounts in 1.2, customers in 2.2, ...) — nothing speculative here yet.

export const queryKeys = {
  health: ["health"] as const,
  accounts: ["accounts"] as const,
  accountBalance: (id: number) => ["accounts", id, "balance"] as const,
  ledger: (filters: Record<string, string | number>) => ["ledger", filters] as const,
  transfers: ["transfers"] as const,
}
