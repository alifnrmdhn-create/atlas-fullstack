import { createPortal } from 'react-dom'
import { useEscKey } from '../hooks/useEscKey'
import i18n from '../lib/i18n'

/**
 * ImageLightbox — overlay foto layar-penuh dengan tombol tutup + unduh.
 *
 * Awalnya lokal di ChannelsView (lampiran gambar); diangkat jadi reusable agar
 * dipakai juga oleh UserProfileModal (klik foto profil → preview besar). CSS
 * `.lightbox-*` global di styles/responsive.css. Klik backdrop / ESC menutup.
 */
export function ImageLightbox({ url, name, onClose, className }: { url: string; name: string; onClose: () => void; className?: string }) {
  useEscKey(onClose)
  return createPortal(
    <div className={`lightbox-overlay${className ? ' ' + className : ''}`} onClick={onClose}>
      <button aria-label={i18n.t('Close')} className="lightbox-close" onClick={onClose} type="button">
        <svg fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
      <img
        alt={name}
        className="lightbox-img"
        onClick={(e) => e.stopPropagation()}
        src={url}
      />
      <a
        className="lightbox-download"
        download={name}
        href={url}
        onClick={(e) => e.stopPropagation()}
      >
        <svg fill="none" height="15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="15">
          <path d="M12 3v13M5 16l7 7 7-7" /><path d="M3 21h18" />
        </svg>
        {i18n.t('Download')}
      </a>
    </div>,
    document.body,
  )
}
