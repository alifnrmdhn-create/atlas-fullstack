import { createInertiaApp } from '@inertiajs/react'
import type { ComponentType, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers'
import { RealtimeProvider } from './contexts/RealtimeProvider'
import { WorkspaceProvider } from './context/workspace'
import { AppShell } from './layouts/AppShell'

import './styles/tokens.css'
import './styles/reset.css'
import './styles/shell.css'
import './styles/components.css'
import './styles/dashboard.css'
import './styles/programs.css'
import './styles/execution-grid.css'
import './styles/workboard.css'
import './styles/wi-detail.css'
import './styles/channels.css'
import './styles/presence.css'
import './styles/misc-views.css'
import './styles/responsive.css'

// Restore persisted appearance settings before first paint
;(function () {
    const size = localStorage.getItem('atlas.fontSize')
    if (size) document.documentElement.style.fontSize = size === 'small' ? '13px' : size === 'large' ? '15px' : '14px'
    const compact = localStorage.getItem('atlas.sidebarCompact')
    if (compact === 'true') document.documentElement.setAttribute('data-sidebar', 'compact')
})()

type InertiaPage = ComponentType & {
    layout?: (page: ReactNode) => ReactNode
}

createInertiaApp({
    title: (title) => `${title} — ATLAS`,
    resolve: async (name) => {
        const page = await resolvePageComponent(
            `./Pages/${name}.tsx`,
            import.meta.glob('./Pages/**/*.tsx'),
        ) as InertiaPage

        if (!name.startsWith('Auth/')) {
            page.layout ??= (page) => (
                <RealtimeProvider>
                    <WorkspaceProvider>
                        <AppShell>{page}</AppShell>
                    </WorkspaceProvider>
                </RealtimeProvider>
            )
        }

        return page
    },
    setup({ el, App, props }) {
        createRoot(el).render(<App {...props} />)
    },
})
