// react-query key factory. Grows one entry per resource as each API lands
// (accounts in 1.2, customers in 2.2, ...) — nothing speculative here yet.

export const queryKeys = {
  health: ["health"] as const,
}
