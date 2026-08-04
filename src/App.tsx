import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, useLocation } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "./lib/api"
import { queryKeys } from "./lib/queries"
import Dashboard from "./pages/Dashboard"
import Customers from "./pages/Customers"
import Transactions from "./pages/Transactions"
import Banking from "./pages/Banking"
import Accounts from "./pages/Accounts"
import Expenses from "./pages/Expenses"
import Ledger from "./pages/Ledger"
import Reports from "./pages/Reports"
import DailyClosing from "./pages/DailyClosing"

const nav: { path: string; label: string; icon: React.ReactNode; group?: string }[] = [
  {
    path: "/dashboard", label: "Dashboard", group: "Overview",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
  },
  {
    path: "/customers", label: "Customers", group: "Operations",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  },
  {
    path: "/transactions", label: "Transactions",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
  },
  {
    path: "/banking", label: "Banking",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
  },
  {
    path: "/expenses", label: "Expenses", group: "Finance",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  },
  {
    path: "/accounts", label: "Accounts",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
  },
  {
    path: "/ledger", label: "Ledger",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
  },
  {
    path: "/reports", label: "Reports", group: "Insights",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
  },
  {
    path: "/closing", label: "Daily Closing",
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  },
]

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const activePath = nav.find(n => location.pathname.startsWith(n.path))?.path
  const { data: health } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => api.get<{ status: string }>("/health"),
  })

  let lastGroup = ""

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "'Outfit', system-ui, sans-serif" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: "#0f2035",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
      }}>
        {/* Logo / Branding */}
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, background: "#f59e0b", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#1a1000", flexShrink: 0, fontFamily: "'Roboto Slab', serif" }}>
              R
            </div>
            <div>
              <div style={{ color: "#e2ebf5", fontWeight: 700, fontSize: 14, lineHeight: 1.1 }}>RSCMS</div>
              <div style={{ color: "#5a7a9a", fontSize: 10, letterSpacing: "0.04em" }}>Rural Service Center</div>
            </div>
          </div>
        </div>

        {/* Business day badge */}
        <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.25)", borderRadius: 6, padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 500 }}>4 Aug 2026</span>
            <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>OPEN</span>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {nav.map(item => {
            const showGroup = item.group && item.group !== lastGroup
            if (item.group) lastGroup = item.group
            const active = activePath === item.path
            return (
              <div key={item.path}>
                {showGroup && (
                  <div style={{ padding: "12px 16px 4px", fontSize: 10, color: "#3d5a78", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                    {item.group}
                  </div>
                )}
                <NavLink
                  to={item.path}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 16px",
                    background: active ? "rgba(59, 108, 183, 0.25)" : "transparent",
                    border: "none",
                    borderLeft: active ? "3px solid #f59e0b" : "3px solid transparent",
                    color: active ? "#e2ebf5" : "#7a9abd",
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                    textAlign: "left",
                    textDecoration: "none",
                    transition: "all 0.12s",
                    fontFamily: "'Outfit', sans-serif",
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)" }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent" }}
                >
                  <span style={{ opacity: active ? 1 : 0.7 }}>{item.icon}</span>
                  {item.label}
                  {item.path === "/closing" && (
                    <span style={{ marginLeft: "auto", background: "#f59e0b", color: "#1a1000", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>!</span>
                  )}
                </NavLink>
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
            <div style={{ width: 28, height: 28, background: "#1e3a5f", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#93b4d4", fontWeight: 700, border: "1px solid #2d5080" }}>A</div>
            <div>
              <div style={{ color: "#c8d8ec", fontSize: 12, fontWeight: 500 }}>Admin</div>
              <div style={{ color: "#3d5a78", fontSize: 10 }}>Operator</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", background: "#f0f4f8" }}>
        {/* Top bar */}
        <div style={{ height: 48, background: "#fff", borderBottom: "1px solid #d1d9e6", display: "flex", alignItems: "center", padding: "0 24px", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#64748b" }}>
            <span>RSCMS</span>
            <span style={{ color: "#d1d9e6" }}>›</span>
            <span style={{ color: "#1a2332", fontWeight: 500, textTransform: "capitalize" }}>
              {nav.find(n => n.path === activePath)?.label}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11, color: health?.status === "ok" ? "#16a34a" : "#dc2626", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: health?.status === "ok" ? "#16a34a" : "#dc2626", display: "inline-block" }} />
              {health?.status === "ok" ? "API Connected" : "API Offline"}
            </span>
            <button style={{ background: "none", border: "1px solid #d1d9e6", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer", color: "#475569", display: "flex", alignItems: "center", gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Search
            </button>
            <button style={{ background: "none", border: "1px solid #d1d9e6", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer", color: "#475569" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </button>
            <button
              onClick={() => navigate("/closing")}
              style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Close Day
            </button>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/banking" element={<Banking />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/closing" element={<DailyClosing />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
