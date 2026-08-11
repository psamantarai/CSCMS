// PLAN 12.4: reports a renderer error to POST /api/client-log so it lands in
// backend.log instead of vanishing (no console in a packaged build). Shared
// by ErrorBoundary and main.tsx's window.onerror/unhandledrejection listeners.
//
// Module-level counter, not per-caller: a render loop retrying the same
// throw would otherwise hammer the endpoint and bury the first, useful error
// under thousands of copies of itself.
let postCount = 0
const MAX_POSTS_PER_LOAD = 10

export function reportClientError(message: string, extra?: Record<string, unknown>) {
  if (postCount >= MAX_POSTS_PER_LOAD) return
  postCount++
  fetch("/api/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ message, ...extra }),
  }).catch(() => {})
}
