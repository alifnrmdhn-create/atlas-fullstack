import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../design-system'
import './AvatarCropper.css'

// Crop foto profil — interaktif: zoom (slider + wheel + pinch) & geser (drag).
// Viewport persegi VIEWPORT×VIEWPORT, ditampilkan dengan mask lingkaran (spotlight)
// supaya WYSIWYG dengan bentuk avatar. Hasil di-export persegi OUT×OUT JPEG;
// komponen Avatar yang membulatkannya saat render (border-radius:50%).

const OUT = 512            // px output (cukup tajam utk retina, ringan)
const MAX_ZOOM = 4         // 4× dari cover-fit
const JPEG_QUALITY = 0.9

type Pt = { x: number; y: number }

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export function AvatarCropper({ file, busy = false, onCancel, onCrop }: {
  file: File
  busy?: boolean
  onCancel: () => void
  onCrop: (cropped: File) => void
}) {
  const { t } = useTranslation()
  const viewportRef = useRef<HTMLDivElement>(null)
  const imgElRef = useRef<HTMLImageElement | null>(null)

  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Pt>({ x: 0, y: 0 })
  const [exporting, setExporting] = useState(false)
  // Ukuran viewport diukur runtime (CSS responsif: min(288px,78vw)) supaya math
  // crop/clamp/export selalu cocok dengan piksel yang benar-benar dirender.
  const [vp, setVp] = useState(288)

  // Pointer aktif (utk pan 1-jari & pinch 2-jari).
  const pointers = useRef<Map<number, Pt>>(new Map())
  const pinchBaseRef = useRef<{ dist: number; zoom: number } | null>(null)

  // Muat gambar dari File → ukuran natural untuk math cover.
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setObjectUrl(url)
    const img = new Image()
    img.onload = () => {
      imgElRef.current = img
      setDims({ w: img.naturalWidth, h: img.naturalHeight })
      setZoom(1)
      setOffset({ x: 0, y: 0 })
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  // ESC = batal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy && !exporting) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy, exporting])

  // Ukur viewport (CSS bisa berubah responsif / saat resize).
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setVp(w)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const coverScale = dims ? Math.max(vp / dims.w, vp / dims.h) : 1

  // Batasi offset supaya gambar selalu menutupi viewport (tak ada celah kosong).
  const clampOffset = useCallback((off: Pt, z: number): Pt => {
    if (!dims) return { x: 0, y: 0 }
    const dw = dims.w * coverScale * z
    const dh = dims.h * coverScale * z
    const maxX = Math.max(0, (dw - vp) / 2)
    const maxY = Math.max(0, (dh - vp) / 2)
    return { x: clamp(off.x, -maxX, maxX), y: clamp(off.y, -maxY, maxY) }
  }, [dims, coverScale, vp])

  const applyZoom = useCallback((nextZoom: number) => {
    const z = clamp(nextZoom, 1, MAX_ZOOM)
    setZoom(z)
    setOffset((off) => clampOffset(off, z))
  }, [clampOffset])

  // Viewport berubah ukuran → batas offset ikut berubah, re-clamp.
  useEffect(() => {
    setOffset((off) => clampOffset(off, zoom))
  }, [vp, clampOffset, zoom])

  // Wheel zoom — pasang non-passive supaya preventDefault tak men-scroll halaman.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 0.93))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyZoom, zoom])

  // ── Pointer (pan + pinch) ──────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if (busy || exporting) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinchBaseRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const cur = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, cur)

    if (pointers.current.size >= 2 && pinchBaseRef.current) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      applyZoom(pinchBaseRef.current.zoom * (dist / pinchBaseRef.current.dist))
      return
    }
    // Pan 1-jari.
    const dx = cur.x - prev.x
    const dy = cur.y - prev.y
    setOffset((off) => clampOffset({ x: off.x + dx, y: off.y + dy }, zoom))
  }

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchBaseRef.current = null
  }

  // ── Export ─────────────────────────────────────────────────────────────
  async function handleApply() {
    const img = imgElRef.current
    if (!img || !dims) return
    setExporting(true)
    try {
      const s = coverScale * zoom // px tampil per px natural
      const dw = dims.w * s
      const dh = dims.h * s
      const imageLeft = vp / 2 + offset.x - dw / 2
      const imageTop = vp / 2 + offset.y - dh / 2
      const sx = -imageLeft / s
      const sy = -imageTop / s
      const sSize = vp / s

      const canvas = document.createElement('canvas')
      canvas.width = OUT
      canvas.height = OUT
      const ctx = canvas.getContext('2d')
      if (!ctx) { setExporting(false); return }
      ctx.fillStyle = '#ffffff' // latar utk PNG transparan
      ctx.fillRect(0, 0, OUT, OUT)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUT, OUT)

      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY))
      if (!blob) { setExporting(false); return }
      const cropped = new File([blob], 'avatar.jpg', { type: 'image/jpeg', lastModified: file.lastModified })
      onCrop(cropped)
    } catch {
      setExporting(false)
    }
  }

  const dw = dims ? dims.w * coverScale * zoom : 0
  const dh = dims ? dims.h * coverScale * zoom : 0
  const busyAny = busy || exporting

  return (
    <div className="avatar-cropper" role="dialog" aria-modal="true" aria-label={t('Crop photo')}>
      <div className="avatar-cropper__backdrop" onClick={() => !busyAny && onCancel()} />
      <div className="avatar-cropper__panel">
        <h3 className="avatar-cropper__title">{t('Adjust your photo')}</h3>
        <p className="avatar-cropper__hint">{t('Drag to reposition · scroll or pinch to zoom')}</p>

        <div
          ref={viewportRef}
          className="avatar-cropper__viewport"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          style={{ touchAction: 'none' }}
        >
          {objectUrl && dims && (
            <img
              className="avatar-cropper__img"
              src={objectUrl}
              alt=""
              draggable={false}
              style={{
                width: dw,
                height: dh,
                left: '50%',
                top: '50%',
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          )}
          <div className="avatar-cropper__mask" aria-hidden="true" />
        </div>

        <div className="avatar-cropper__zoom">
          <button
            className="avatar-cropper__zoom-btn"
            type="button"
            aria-label={t('Zoom out')}
            disabled={busyAny}
            onClick={() => applyZoom(zoom - 0.2)}
          >−</button>
          <input
            className="avatar-cropper__slider"
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={busyAny || !dims}
            onChange={(e) => applyZoom(parseFloat(e.target.value))}
            aria-label={t('Zoom')}
          />
          <button
            className="avatar-cropper__zoom-btn"
            type="button"
            aria-label={t('Zoom in')}
            disabled={busyAny}
            onClick={() => applyZoom(zoom + 0.2)}
          >+</button>
        </div>

        <div className="avatar-cropper__actions">
          <Button variant="ghost" onClick={onCancel} disabled={busyAny}>{t('Cancel')}</Button>
          <Button variant="primary" onClick={handleApply} disabled={busyAny || !dims}>
            {busyAny ? t('Saving…') : t('Save photo')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default AvatarCropper
