/**
 * Post-MVP — Hook untuk trigger Shepherd.js tour idempotently.
 *
 * Pakai contoh:
 *   useOnboardingTour('escalation-inbox', { trigger: showSection })
 *
 * Logic:
 *   1. Cek currentUser.toursCompleted[tourId] — kalau sudah pernah, skip
 *   2. Lazy import shepherd.js + CSS
 *   3. Build tour dari TOURS[tourId]
 *   4. saat selesai, POST /users/me/tours-completed
 */
import { useEffect, useRef } from 'react'
import { usePage, router } from '@inertiajs/react'
import { api } from '../lib/api'
import { TOURS, tourExists, type TourId } from '../lib/onboardingTours'

type AuthUser = {
  id: number
  toursCompleted?: Record<string, string>
}

export function useOnboardingTour(tourId: TourId, options: { trigger: boolean } = { trigger: true }) {
  const { auth } = usePage<{ auth?: { user?: AuthUser } }>().props
  const startedRef = useRef(false)

  useEffect(() => {
    if (!options.trigger) return
    if (!auth?.user) return
    if (startedRef.current) return
    if (!tourExists(tourId)) return

    const completed = auth.user.toursCompleted ?? {}
    if (completed[tourId]) return

    startedRef.current = true

    // Lazy import — tidak bebani initial bundle
    void Promise.all([
      import('shepherd.js'),
      // Shepherd CSS dari paket
      import('shepherd.js/dist/css/shepherd.css'),
    ]).then(([shepherdMod]) => {
      const Shepherd = shepherdMod.default
      const tour = new Shepherd.Tour({
        useModalOverlay: true,
        defaultStepOptions: {
          cancelIcon: { enabled: true },
          classes: 'atlas-tour-step',
          scrollTo: { behavior: 'smooth', block: 'center' },
        },
      })

      const steps = TOURS[tourId]
      steps.forEach((step, idx) => {
        const isLast = idx === steps.length - 1
        tour.addStep({
          id: step.id,
          title: step.title,
          text: step.text,
          attachTo: step.attachTo,
          buttons: [
            ...(idx > 0 ? [{ text: 'Back', action: () => tour.back(), classes: 'btn btn--ghost btn--sm' }] : []),
            {
              text: isLast ? 'Done' : 'Next',
              action: () => isLast ? tour.complete() : tour.next(),
              classes: 'btn btn--primary btn--sm',
            },
          ],
        })
      })

      tour.on('complete', () => {
        void markTourCompleted(tourId)
      })
      tour.on('cancel', () => {
        // Treat cancel as completed — user sudah lihat, tidak ulang
        void markTourCompleted(tourId)
      })

      tour.start()
    }).catch((err) => {
      console.warn('[Atlas] Onboarding tour gagal load:', err)
    })
  }, [tourId, options.trigger, auth?.user])
}

async function markTourCompleted(tourId: string): Promise<void> {
  try {
    await api.post('/users/me/tours-completed', { tourId })
    // Refresh Inertia shared props supaya auth.user.toursCompleted update
    router.reload({ only: ['auth'] })
  } catch (err) {
    console.warn('[Atlas] Gagal mark tour completed:', err)
  }
}
