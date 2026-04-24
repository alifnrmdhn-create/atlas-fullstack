import { usePage } from '@inertiajs/react'

export type AuthUser = {
    id: number
    email: string
    name: string
    roleType: string
    positionTitle?: string | null
    avatarUrl?: string | null
    unitId?: number | null
    directorateId?: number | null
    managerUserId?: number | null
}

type PageProps = {
    auth: { user: AuthUser | null }
    flash: { success: string | null; error: string | null }
    errors: Record<string, string>
}

/**
 * Baca current user dari Inertia shared props (HandleInertiaRequests).
 *
 * Sebelumnya: WorkspaceContext.currentUser (workspace.tsx).
 * Sekarang: usePage().props.auth.user — di-share di setiap Inertia response.
 */
export function useAuth(): AuthUser | null {
    const { props } = usePage<PageProps>()
    return props.auth?.user ?? null
}

export function useAuthOrThrow(): AuthUser {
    const user = useAuth()
    if (!user) throw new Error('useAuthOrThrow: user tidak login — pakai useAuth() untuk case yang memperbolehkan null.')
    return user
}
