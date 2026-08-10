// Thin fetch wrapper for the CSCMS backend. Requests go through the Vite
// dev proxy at /api (see vite.config.ts), so no base URL or CORS config
// is needed in development.

// PLAN 9.9: the session lives in an httpOnly cookie the browser manages —
// never readable via JS. credentials: "include" makes fetch send it.
let onUnauthorized: (() => void) | null = null

// AuthProvider registers this once, to clear its own state on a 401 (expired
// session, logged out elsewhere) without api.ts importing React.
export function setOnUnauthorized(handler: (() => void) | null) {
  onUnauthorized = handler
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    credentials: "include",
    ...init,
  })
  if (res.status === 401) {
    onUnauthorized?.()
  }
  if (!res.ok) {
    // ARCHITECTURE.md §6: errors return { detail, code }. Read it when
    // present so the caller sees why the request failed, not just the
    // status code — falls back to the old message for a non-JSON body.
    const body = await res.json().catch(() => null)
    const detail = typeof body?.detail === "string" ? body.detail : undefined
    throw new Error(detail ?? `${init?.method ?? "GET"} ${path} failed: ${res.status} ${res.statusText}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
}
