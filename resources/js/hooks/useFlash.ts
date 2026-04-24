import { usePage } from '@inertiajs/react'
import { useEffect, useRef } from 'react'

type PageProps = {
    flash?: { success?: string | null; error?: string | null }
    errors?: Record<string, string>
}

/**
 * Auto-consume flash message dari Laravel session.
 *
 * Penggunaan:
 *   useFlash({
 *     onSuccess: (msg) => toast.success(msg),
 *     onError: (msg) => toast.error(msg),
 *   })
 */
export function useFlash(handlers: {
    onSuccess?: (message: string) => void
    onError?: (message: string) => void
}): void {
    const { props } = usePage<PageProps>()
    const lastHandledRef = useRef<{ success?: string | null; error?: string | null }>({})

    useEffect(() => {
        const success = props.flash?.success
        const error = props.flash?.error

        if (success && success !== lastHandledRef.current.success) {
            handlers.onSuccess?.(success)
            lastHandledRef.current.success = success
        }
        if (error && error !== lastHandledRef.current.error) {
            handlers.onError?.(error)
            lastHandledRef.current.error = error
        }
    }, [props.flash?.success, props.flash?.error, handlers])
}

/**
 * Return current flash messages sebagai nilai (untuk display langsung di JSX
 * tanpa trigger toast).
 */
export function useFlashValues(): { success: string | null; error: string | null } {
    const { props } = usePage<PageProps>()
    return {
        success: props.flash?.success ?? null,
        error: props.flash?.error ?? null,
    }
}
