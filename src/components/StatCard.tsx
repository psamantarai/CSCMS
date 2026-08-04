interface StatCardProps {
  label: string
  value: string
  sub?: string
  color?: "default" | "green" | "amber" | "red" | "blue"
  icon: React.ReactNode
}

const colorMap = {
  default: { bg: "#ffffff", accent: "#1e3a5f", badge: "#e8edf5" },
  green:   { bg: "#f0fdf4", accent: "#16a34a", badge: "#dcfce7" },
  amber:   { bg: "#fffbeb", accent: "#d97706", badge: "#fef3c7" },
  red:     { bg: "#fef2f2", accent: "#dc2626", badge: "#fee2e2" },
  blue:    { bg: "#eff6ff", accent: "#2563eb", badge: "#dbeafe" },
}

export default function StatCard({ label, value, sub, color = "default", icon }: StatCardProps) {
  const c = colorMap[color]
  return (
    <div style={{
      background: c.bg,
      border: "1px solid #d1d9e6",
      borderRadius: 10,
      padding: "18px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
        <span style={{ background: c.badge, color: c.accent, borderRadius: 7, padding: "5px 7px", display: "flex", alignItems: "center" }}>
          {icon}
        </span>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 600, color: c.accent, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "#64748b" }}>{sub}</div>}
    </div>
  )
}
