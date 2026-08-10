import { useEffect, useState } from "react"
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, useLocation } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  Activity, BarChart3, BookOpen, Clock, CreditCard, FileText, IndianRupee,
  LayoutDashboard, LogOut, MessageSquare, Moon, Sun, Tag, Users, type LucideIcon,
} from "lucide-react"
import { api } from "./lib/api"
import { queryKeys } from "./lib/queries"
import { formatDate, localDateISO } from "./lib/format"
import { useAuth } from "./lib/auth"
import { BlockState } from "@/components/QueryState"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar"
import Login from "./pages/Login"
import Setup from "./pages/Setup"
import Dashboard from "./pages/Dashboard"
import Customers from "./pages/Customers"
import Services from "./pages/Services"
import Transactions from "./pages/Transactions"
import Banking from "./pages/Banking"
import Accounts from "./pages/Accounts"
import Expenses from "./pages/Expenses"
import Ledger from "./pages/Ledger"
import Reports from "./pages/Reports"
import DailyClosing from "./pages/DailyClosing"
import AuditLog from "./pages/AuditLog"

type NavItem = { path: string; label: string; icon: LucideIcon }

const navGroups: { group: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [{ path: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    group: "Operations",
    items: [
      { path: "/customers", label: "Customers", icon: Users },
      { path: "/services", label: "Services", icon: Tag },
      { path: "/transactions", label: "Transactions", icon: Activity },
      { path: "/banking", label: "Banking", icon: IndianRupee },
    ],
  },
  {
    group: "Finance",
    items: [
      { path: "/expenses", label: "Expenses", icon: FileText },
      { path: "/accounts", label: "Accounts", icon: CreditCard },
      { path: "/ledger", label: "Ledger", icon: BookOpen },
    ],
  },
  {
    group: "Insights",
    items: [
      { path: "/reports", label: "Reports", icon: BarChart3 },
      { path: "/closing", label: "Daily Closing", icon: MessageSquare },
      { path: "/audit-log", label: "Audit Log", icon: Clock },
    ],
  },
]

const navItems = navGroups.flatMap(g => g.items)

export default function App() {
  // 9.5.15: next-themes-free — plain useState + localStorage + classList.toggle,
  // no SSR flash to manage since this is a Vite SPA.
  const [dark, setDark] = useState(() => localStorage.getItem("theme") === "dark")
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem("theme", dark ? "dark" : "light")
  }, [dark])

  return (
    <BrowserRouter>
      <AppShell dark={dark} onToggleDark={() => setDark(d => !d)} />
    </BrowserRouter>
  )
}

function AppShell({ dark, onToggleDark }: { dark: boolean; onToggleDark: () => void }) {
  const { user, restoring, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const activePath = navItems.find(n => location.pathname.startsWith(n.path))?.path
  const { data: health } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => api.get<{ status: string }>("/health"),
  })
  const today = localDateISO()
  // enabled: !!user — /api/day is auth-guarded (PLAN 8.2), no point firing
  // it before login, and hooks must stay unconditional either way.
  const { data: dayStatus } = useQuery({
    queryKey: queryKeys.dayStatus(today),
    queryFn: () => api.get<{ status: "open" | "closed" }>(`/day/${today}`),
    enabled: !!user,
  })
  // PLAN 9.8.2: first-run gate. Public, pre-login check for zero users.
  const { data: bootstrapStatus } = useQuery({
    queryKey: ["auth", "bootstrap-status"],
    queryFn: () => api.get<{ needed: boolean }>("/auth/bootstrap"),
    enabled: !user,
  })
  // Sticky for the rest of this session once bootstrap says setup is
  // needed: run_seed() always creates a Cash Drawer account (kept for the
  // ~24 backend tests that depend on it), so accounts.length is never
  // actually 0 the way PLAN 9.8.2's "or zero accounts" wording assumes —
  // re-deriving from account count would skip Setup's step 2 the instant
  // bootstrap() logs the operator in. Reset when the wizard finishes.
  const [inSetup, setInSetup] = useState(false)
  useEffect(() => {
    if (bootstrapStatus?.needed) setInSetup(true)
  }, [bootstrapStatus?.needed])
  const dayClosed = dayStatus?.status === "closed"
  const apiUp = health?.status === "ok"

  // PLAN 8.2/9.8/9.9: the app is unusable until authenticated, and unusable
  // until first-run setup is done. Below this point nothing renders without
  // a user (or mid-setup) — checked after the hooks above so their count
  // never changes across a login/logout/setup re-render. 9.9.2: while the
  // mount-restore call is in flight, show nothing rather than Login — a
  // reload of an authenticated session must never flash the login screen.
  if (restoring) return <div className="flex h-svh items-center justify-center"><BlockState isLoading error={null} /></div>
  if (!user) return inSetup ? <Setup onComplete={() => setInSetup(false)} /> : <Login />
  if (inSetup) return <Setup onComplete={() => setInSetup(false)} />

  return (
    <SidebarProvider
      className="h-svh overflow-hidden"
      style={{ "--sidebar-width": "14rem" } as React.CSSProperties}
    >
      <AppSidebar activePath={activePath} user={user} logout={logout} dark={dark} onToggleDark={onToggleDark} />

      {/* .app-topbar is load-bearing: the PLAN 6.7 print rules hide it by name. */}
      <SidebarInset className="overflow-hidden">
        <header className="app-topbar flex h-12 shrink-0 items-center justify-between gap-3 border-b bg-card px-4">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="topbar-hide-mobile">
                  <BreadcrumbLink render={<NavLink to="/dashboard" />}>CSCMS</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="topbar-hide-mobile" />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate font-medium">
                    {navItems.find(n => n.path === activePath)?.label}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant="outline"
              className={dayClosed ? "border-success/40 text-success" : "border-warning/40 text-warning"}
            >
              <span className="topbar-hide-mobile">{formatDate(today)}&nbsp;</span>
              {dayStatus ? (dayClosed ? "CLOSED" : "OPEN") : "…"}
            </Badge>
            <Badge variant="outline" className={apiUp ? "border-success/40 text-success" : "border-destructive/40 text-destructive"}>
              <span className={`size-1.5 rounded-full ${apiUp ? "bg-success" : "bg-destructive"}`} />
              <span className="topbar-hide-mobile">{apiUp ? "API Connected" : "API Offline"}</span>
            </Badge>
            <Button size="sm" onClick={() => navigate("/closing")}>Close Day</Button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/services" element={<Services />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/banking" element={<Banking />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/closing" element={<DailyClosing />} />
            <Route path="/audit-log" element={<AuditLog />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function AppSidebar({ activePath, user, logout, dark, onToggleDark }: {
  activePath?: string
  user: { username: string; role: string }
  logout: () => void
  dark: boolean
  onToggleDark: () => void
}) {
  const { setOpenMobile } = useSidebar()

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 px-1 py-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary font-serif text-base font-extrabold text-sidebar-primary-foreground">
            C
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-sidebar-foreground">CSCMS</div>
            <div className="truncate text-[10px] tracking-wide text-sidebar-foreground/50">Common Service Center</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map(({ group, items }) => (
          <SidebarGroup key={group}>
            <SidebarGroupLabel className="text-[10px] font-bold tracking-widest uppercase">{group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map(({ path, label, icon: Icon }) => (
                  <SidebarMenuItem key={path}>
                    <SidebarMenuButton
                      isActive={activePath === path}
                      className="rounded-none border-l-3 border-transparent data-active:border-sidebar-primary"
                      render={<NavLink to={path} onClick={() => setOpenMobile(false)} />}
                    >
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                    {path === "/closing" && (
                      <SidebarMenuBadge className="bg-sidebar-primary font-bold text-sidebar-primary-foreground">!</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-1">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-bold text-sidebar-accent-foreground">
            {user.username[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-sidebar-foreground capitalize">{user.username}</div>
            <div className="truncate text-[10px] text-sidebar-foreground/50 capitalize">{user.role}</div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={onToggleDark}
            className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {dark ? <Sun /> : <Moon />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Log out"
            onClick={logout}
            className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
