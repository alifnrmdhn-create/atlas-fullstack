import { router } from '@inertiajs/react'

export function useInertiaNavigate() {
  return (target: string | number) => {
    if (typeof target === 'number') {
      window.history.go(target)
      return
    }

    router.visit(target)
  }
}
