import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { AuthProvider } from './lib/auth'
import { reportClientError } from './lib/clientLog'
import './index.css'

// PLAN 12.4: catches what an ErrorBoundary structurally can't — event
// handlers and async rejections, neither of which happen during render.
window.onerror = (message, source, lineno, colno) => {
  reportClientError(String(message), { source, lineno, colno })
}
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  reportClientError(reason instanceof Error ? reason.message : String(reason), {
    stack: reason instanceof Error ? reason.stack : undefined,
  })
})

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
