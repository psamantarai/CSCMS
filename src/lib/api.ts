// Thin fetch wrapper for the CSCMS backend. Requests go through the Vite
// dev proxy at /api (see vite.config.ts), so no base URL or CORS config
// is needed in development.

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    // ARCHITECTURE.md §6: errors return { detail, code }. Read it when
    // present so the caller sees why the request failed, not just the
    // status code — falls back to the old message for a non-JSON body.
    const body = await res.json().catch(() => null)
    const detail = typeof body?.detail === "string" ? body.detail : undefined
    throw new Error(detail ?? `${init?.method ?? "GET"} ${path} failed: ${res.status} ${res.statusText}`)
  }
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
