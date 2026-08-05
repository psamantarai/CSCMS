// PLAN 8.1/8.2: session state for the whole app. Token lives in React state
// only (never localStorage, ARCHITECTURE.md §9) — a page reload always
// returns to the login screen.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { api, setAuthToken, setOnUnauthorized } from "./api"

type User = { id: number; username: string; role: string }

type AuthContextValue = {
  user: User | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    setOnUnauthorized(() => setUser(null))
    return () => setOnUnauthorized(null)
  }, [])

  async function login(username: string, password: string) {
    const result = await api.post<{ token: string; user: User }>("/auth/login", { username, password })
    setAuthToken(result.token)
    setUser(result.user)
  }

  function logout() {
    api.post("/auth/logout").catch(() => {}) // best-effort; clear local state regardless
    setAuthToken(null)
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
