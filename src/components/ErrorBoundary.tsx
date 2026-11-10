import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'

interface Props {
  children: ReactNode
}
interface State {
  error?: Error
}

/** A lazily loaded page whose file is gone from the server (after a new release) fails with one of these messages. */
export const isStaleBundleError = (e: Error | undefined): boolean =>
  Boolean(e && /dynamically imported module|importing a module script failed|loading chunk|failed to fetch dynamically/i.test(e.message))

/**
 * Keeps one broken page from blanking the whole app. Rendered with a `key` of the current route, so moving to another
 * page clears the error. Funds are never at risk from a screen crash: every transaction is confirmed onchain.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const stale = isStaleBundleError(error)
    return (
      <div className="card mx-auto max-w-xl space-y-3 p-6" role="alert">
        <div className="flex items-center gap-2 text-base font-semibold"><TriangleAlert className="size-5" style={{ color: 'var(--warn)' }} /> {stale ? 'A new version is available' : 'Something went wrong on this page'}</div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {stale
            ? 'The app was updated while this page was open. Reload to get the latest version.'
            : 'The rest of the app is fine and nothing was sent from your wallet by this error. Reload the page, or go back to the dashboard.'}
        </p>
        {!stale ? <p className="mono break-words text-xs" style={{ color: 'var(--subtle)' }}>{error.message}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}><RefreshCw className="size-4" /> Reload</button>
          <a href="/dashboard" className="btn btn-secondary">Dashboard</a>
        </div>
      </div>
    )
  }
}
