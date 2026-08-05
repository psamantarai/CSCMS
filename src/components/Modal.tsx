import { useEffect, useRef } from "react"

// PLAN 9.1: built on the native <dialog> element instead of a hand-rolled
// overlay — showModal()/close() give Escape-to-close and focus trapping for
// free; only backdrop-click-to-close needs wiring up here.
export default function Modal({ open, onClose, title, children }: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={e => { if (e.target === ref.current) onClose() }}
      style={{ margin: "auto", border: "none", borderRadius: 10, padding: 0, maxWidth: 560, width: "90vw", boxShadow: "0 12px 32px rgba(0,0,0,0.18)" }}
    >
      <div style={{ padding: "16px 22px", borderBottom: "1px solid #eef1f7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
        <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#64748b", lineHeight: 1, padding: 4 }}>×</button>
      </div>
      <div style={{ padding: "20px 22px" }}>{children}</div>
    </dialog>
  )
}
