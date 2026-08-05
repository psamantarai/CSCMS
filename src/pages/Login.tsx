// PLAN 8.2: the whole app is unusable until this succeeds — App.tsx renders
// this instead of the shell whenever useAuth().user is null.
import { useState } from "react"
import { useAuth } from "../lib/auth"

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : "login failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0f2035", fontFamily: "'Outfit', system-ui, sans-serif",
    }}>
      <form onSubmit={handleSubmit} style={{
        background: "#fff", borderRadius: 12, padding: "32px 28px", width: 320,
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 32, height: 32, background: "#f59e0b", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#1a1000", fontFamily: "'Roboto Slab', serif" }}>
            C
          </div>
          <div>
            <div style={{ color: "#1a2332", fontWeight: 700, fontSize: 14, lineHeight: 1.1 }}>CSCMS</div>
            <div style={{ color: "#64748b", fontSize: 10, letterSpacing: "0.04em" }}>Common Service Center</div>
          </div>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#475569" }}>
          Username
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            autoFocus
            style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d9e6", fontSize: 13 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#475569" }}>
          Password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d9e6", fontSize: 13 }}
          />
        </label>

        {error && <div style={{ color: "#dc2626", fontSize: 12 }}>{error}</div>}

        <button
          type="submit"
          disabled={submitting}
          style={{
            background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 6,
            padding: "9px 12px", fontSize: 13, fontWeight: 600, cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  )
}
