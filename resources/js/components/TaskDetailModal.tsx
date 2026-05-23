import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TaskDetailView } from '../Pages/TaskDetailView'

/**
 * TaskDetailModal — mount TaskDetailView sebagai modal dengan animasi "expand
 * dari card". Pakem 2026-05-21: card click di Workboard buka modal alih-alih
 * navigate full-page.
 *
 * Animation strategy (FLIP-like):
 * - Capture rect card (originRect) saat klik.
 * - Phase 'enter': modal initial = transform translate(dx, dy) scale(card/modal),
 *   yaitu posisi card di viewport, dengan ukuran card. Element rendered tapi
 *   appear di card location.
 * - RAF → Phase 'open': transform = translate(0,0) scale(1) — element kembali
 *   ke posisi flex-centered + full size. CSS transition handle interpolation.
 * - Phase 'exit': transform balik ke initial, fade out.
 *
 * Hasil: kesan "card mengembang jadi modal", bukan modal pop-in dari center.
 */
export interface TaskDetailModalProps {
  taskId: number
  originRect?: DOMRect | null
  onClose: () => void
}

type AnimPhase = 'enter' | 'open' | 'exit'

export function TaskDetailModal({ taskId, originRect, onClose }: TaskDetailModalProps) {
  const [phase, setPhase] = useState<AnimPhase>('enter')
  const dialogRef = useRef<HTMLDivElement | null>(null)

  // Compute "start" transform: posisi card relatif ke pusat viewport (translate),
  // dengan scale = card width / modal width. Modal akan render di card location
  // dengan card-size, lalu animate ke center + full size.
  const startTransform = useMemo(() => {
    if (!originRect) return null
    const modalMaxWidth = Math.min(1080, window.innerWidth - 64)
    const viewportCenterX = window.innerWidth / 2
    const viewportCenterY = window.innerHeight / 2
    const cardCenterX = originRect.left + originRect.width / 2
    const cardCenterY = originRect.top + originRect.height / 2
    const dx = cardCenterX - viewportCenterX
    const dy = cardCenterY - viewportCenterY
    const scale = Math.max(0.1, Math.min(1, originRect.width / modalMaxWidth))
    return `translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(${scale.toFixed(3)})`
  }, [originRect])

  // Mount: render dengan startTransform (phase 'enter'), lalu RAF→RAF kick ke
  // 'open' supaya CSS transition fire. Double RAF dipakai supaya browser commit
  // initial styles dulu sebelum target styles diaplikasikan.
  useEffect(() => {
    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase('open'))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [])

  const handleClose = useCallback(() => {
    if (phase === 'exit') return
    setPhase('exit')
    window.setTimeout(onClose, 280)
  }, [phase, onClose])

  // Esc to close — skip kalau focus di input/textarea/contenteditable atau
  // event sudah di-handle (defaultPrevented), supaya user bisa Esc untuk
  // close inline picker (PIC search, week picker, dll) tanpa close modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (e.defaultPrevented) return
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (target.isContentEditable) return
      }
      handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  // Auto focus modal saat mount
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  const modalStyle = (() => {
    const transition = 'transform 320ms cubic-bezier(0.32, 0.72, 0.0, 1), opacity 240ms cubic-bezier(0.4, 0, 0.2, 1)'
    if (phase === 'open') {
      return { transform: 'translate(0, 0) scale(1)', opacity: 1, transition }
    }
    // 'enter' atau 'exit' — pakai startTransform (card position + card size)
    return {
      transform: startTransform ?? 'scale(0.85)',
      opacity: startTransform ? 0.9 : 0,
      transition,
    }
  })()

  return createPortal(
    <div
      className={`task-detail-modal-backdrop${phase === 'exit' ? ' task-detail-modal-backdrop--closing' : ''}`}
      onClick={handleClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="task-detail-modal"
        style={modalStyle}
        onClick={e => e.stopPropagation()}
      >
        {/* Header bar modal — close button + copy link untuk share */}
        <div className="task-detail-modal__header">
          <button
            type="button"
            className="task-detail-modal__open-full"
            onClick={() => {
              const url = `${window.location.origin}/execution/tasks/${taskId}`
              navigator.clipboard?.writeText(url)
            }}
            title="Salin link task untuk di-share"
          >
            🔗 Salin link
          </button>
          <button
            type="button"
            className="task-detail-modal__close"
            onClick={handleClose}
            aria-label="Tutup"
          >
            <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 14 14" width="14">
              <path d="m1 1 12 12M13 1 1 13" />
            </svg>
          </button>
        </div>

        {/* TaskDetailView content — mode modal hide topbar */}
        <div className="task-detail-modal__body">
          <TaskDetailView taskId={taskId} mode="modal" onClose={handleClose} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
