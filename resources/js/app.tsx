// @refresh reset
import { createInertiaApp } from '@inertiajs/react'
import { Component } from 'react'
import type { ComponentType, ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers'
import { RealtimeProvider } from './contexts/RealtimeProvider'
import { WorkspaceProvider } from './context/workspace'
import { AppShell } from './layouts/AppShell'

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; stack: string }> {
    state = { error: null as Error | null, stack: '' }
    static getDerivedStateFromError(error: Error) { return { error, stack: '' } }
    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[AppErrorBoundary]', error, info.componentStack)
        this.setState({ stack: info.componentStack ?? '' })
    }
    render() {
        if (this.state.error) {
            return (
                <div style={{ padding: 32, fontFamily: 'monospace', fontSize: 12 }}>
                    <h2>Terjadi kesalahan render</h2>
                    <pre style={{ color: 'red', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {String(this.state.error)}
                    </pre>
                    <details open>
                        <summary>Component stack</summary>
                        <pre style={{ fontSize: 11, color: '#555', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {this.state.stack}
                        </pre>
                    </details>
                    <button onClick={() => { this.setState({ error: null, stack: '' }); window.location.reload() }}>
                        Muat ulang
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}

import './styles/tokens.css'
import './design-system/tokens.css'
import './styles/reset.css'
import './styles/shell.css'
import './styles/components.css'
import './styles/dashboard.css'
import './styles/home.css'
import './styles/programs.css'
import './styles/execution-grid.css'
import './styles/workboard.css'
import './styles/wi-detail.css'
import './styles/channels.css'
import './styles/presence.css'
import './styles/misc-views.css'
import './styles/performance.css'
import './styles/pica.css'
import './styles/pilot-metrics.css'
import './styles/thresholds.css'
import './styles/responsive.css'
import './styles/topbar-extras.css'
import './styles/command-palette.css'

import { hydrateThemePreference } from './lib/theme'

// Restore persisted appearance settings before first paint
;(function () {
    hydrateThemePreference()
    const size = localStorage.getItem('atlas.fontSize')
    if (size) document.documentElement.style.fontSize = size === 'small' ? '13px' : size === 'large' ? '15px' : '14px'
    const compact = localStorage.getItem('atlas.sidebarCompact')
    if (compact === 'true') document.documentElement.setAttribute('data-sidebar', 'compact')
})()

type InertiaPage = ComponentType & {
    layout?: (page: ReactNode) => ReactNode
}

const roots = new WeakMap<Element, ReturnType<typeof createRoot>>()

createInertiaApp({
    title: (title) => `${title} — ATLAS`,
    resolve: async (name) => {
        const pageModule = await resolvePageComponent(
            `./Pages/${name}.tsx`,
            import.meta.glob('./Pages/**/*.tsx'),
        ) as InertiaPage | { default: InertiaPage }
        const page = 'default' in pageModule ? pageModule.default : pageModule

        if (!name.startsWith('Auth/')) {
            page.layout ??= (page) => (
                <AppErrorBoundary>
                    <RealtimeProvider>
                        <WorkspaceProvider>
                            <AppShell>{page}</AppShell>
                        </WorkspaceProvider>
                    </RealtimeProvider>
                </AppErrorBoundary>
            )
        }

        return page
    },
    setup({ el, App, props }) {
        let root = roots.get(el)
        if (!root) {
            root = createRoot(el)
            roots.set(el, root)
        }
        root.render(<App {...props} />)
    },
})
