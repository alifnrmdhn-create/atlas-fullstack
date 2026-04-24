import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Frontend runtime error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100svh',
            display: 'grid',
            placeItems: 'center',
            padding: '32px',
            background:
              'radial-gradient(circle at top right, var(--accent-dim), transparent 20%), linear-gradient(180deg, var(--app-bg), var(--surface-0))',
          }}
        >
          <div
            style={{
              width: 'min(720px, 100%)',
              padding: '28px',
              borderRadius: '28px',
              background: 'var(--panel)',
              border: '1px solid var(--panel-border)',
              boxShadow: 'var(--panel-shadow-xl)',
            }}
          >
            <p style={{ margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 800 }}>
              ATLAS
            </p>
            <h1 style={{ margin: '0 0 12px', fontSize: '2rem' }}>Frontend runtime error</h1>
            <p style={{ margin: '0 0 12px', color: 'var(--text)' }}>
              One of the ATLAS workspace panels crashed while rendering. The app shell is still safe, and a refresh usually clears stale dev state.
            </p>
            <pre
              style={{
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                padding: '14px',
                borderRadius: '18px',
                background: 'var(--surface-1)',
                color: 'var(--red)',
                fontSize: '0.92rem',
              }}
            >
              {this.state.message || 'Unknown frontend error'}
            </pre>
            <button
              onClick={this.handleReload}
              style={{
                marginTop: '16px',
                border: 0,
                borderRadius: '999px',
                padding: '12px 18px',
                background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                color: 'var(--text-inverse)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              type="button"
            >
              Reload ATLAS
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
