// PLAN 8.1/8.2, 9.9: session state for the whole app. The session lives in
// an httpOnly cookie the browser manages (ARCHITECTURE.md §9) — unreadable
// via JS. On mount, restore `user` via GET /auth/me instead of starting
// logged out on every reload.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { api, setOnUnauthorized } from "./api"

type User = { id: number; username: string; role: string }

type AuthContextValue = {
  user: User | null
  restoring: boolean
  login: (username: string, password: string) => Promise<void>
  bootstrap: (username: string, password: string, shopName?: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  // 9.9.2: true until the mount-restore call below settles. Without this,
  // `user` reads null for that one round trip and the app briefly renders
  // Login before snapping back — exactly the flash this phase exists to fix.
  const [restoring, setRestoring] = useState(true)

  useEffect(() => {
    setOnUnauthorized(() => setUser(null))
    return () => setOnUnauthorized(null)
  }, [])

  // 9.9.2: mount-restore. A 401 (no/expired cookie) is expected and handled
  // by setOnUnauthorized above, so it's swallowed here, not re-surfaced.
  useEffect(() => {
    api.get<{ user: User }>("/auth/me").then(result => setUser(result.user)).catch(() => {}).finally(() => setRestoring(false))
  }, [])

  async function login(username: string, password: string) {
    const result = await api.post<{ user: User }>("/auth/login", { username, password })
    setUser(result.user)
  }

  // 9.8.1: same shape as login, just via /auth/bootstrap so it works with
  // zero users in the DB.
  async function bootstrap(username: string, password: string, shopName?: string) {
    const result = await api.post<{ user: User }>("/auth/bootstrap", {
      username, password, shop_name: shopName,
    })
    setUser(result.user)
  }

  function logout() {
    api.post("/auth/logout").catch(() => {}) // best-effort; clear local state regardless
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, restoring, login, bootstrap, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
