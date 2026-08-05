import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string
  sub?: string
  color?: "default" | "green" | "amber" | "red" | "blue"
  icon: React.ReactNode
}

const colorMap = {
  default: { card: "bg-primary/5", badge: "bg-primary/15 text-primary", text: "text-primary" },
  green:   { card: "bg-success/5", badge: "bg-success/15 text-success", text: "text-success" },
  amber:   { card: "bg-warning/5", badge: "bg-warning/15 text-warning", text: "text-warning" },
  red:     { card: "bg-destructive/5", badge: "bg-destructive/15 text-destructive", text: "text-destructive" },
  blue:    { card: "bg-ring/5", badge: "bg-ring/15 text-ring", text: "text-ring" },
}

export default function StatCard({ label, value, sub, color = "default", icon }: StatCardProps) {
  const c = colorMap[color]
  return (
    <Card className={c.card}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
        <span className={cn("flex items-center rounded-md p-1.5", c.badge)}>{icon}</span>
      </CardHeader>
      <CardContent>
        <div className={cn("font-mono text-2xl font-semibold leading-none", c.text)}>{value}</div>
        {sub && <div className="mt-2.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  )
}
