import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { reportClientError } from "@/lib/clientLog"

// PLAN 12.4: replaces the white screen a render crash currently leaves
// behind with a "Something went wrong" card, and reports the error so it
// lands in backend.log instead of vanishing.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(error.message, { stack: error.stack, componentStack: info.componentStack })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-svh items-center justify-center p-4">
          <Alert variant="destructive" className="max-w-md">
            <AlertDescription className="space-y-3">
              <p className="font-medium">Something went wrong.</p>
              <Button size="sm" onClick={() => location.reload()}>Reload</Button>
            </AlertDescription>
          </Alert>
        </div>
      )
    }
    return this.props.children
  }
}
