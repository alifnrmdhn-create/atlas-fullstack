import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FormEvent } from 'react'
import type { ChannelMember, ChannelMessage, ChannelSummary, Program, UnfurlData, Task } from '../types'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { useEscKey } from '../hooks/useEscKey'
import { extractErrorMessage } from '../lib/api'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import { formatRoleLabel } from '../lib/roleLabel'
import { compressImageFile, MAX_UPLOAD_BYTES } from '../lib/imageCompress'
import { getProgramHealthDisplay, getProgramDisplayStatus } from '../lib/programStatus'
import { useInlineToast } from '../components/InlineToast'
import { PageHeader } from '../design-system'
import './ChannelsView.css'
import {
  Avatar,
  EMOJI_SHORTCODES,
  InlineNotice,
  PanelHeader,
  RichTextPreview,
  SectionState,
  SkeletonBlock,
  SkeletonStack,
  formatDate,
  formatRelativeTime,
  resolveEmoji,
} from '../components/ui'

// ── Emoji picker categories ───────────────────────────────────────────────────
const PICKER_CATS: { id: string; icon: string; label: string; emojis: string[] }[] = [
  { id: 'smileys', icon: '😊', label: 'Smileys',
    emojis: ['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
  },
  { id: 'gestures', icon: '👋', label: 'Gestures',
    emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','👀','👁️','👅','👄','💋','🦷','🦴'],
  },
  { id: 'people', icon: '👤', label: 'People',
    emojis: ['👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','💆','💇','🚶','🧍','🧎','👮','🕵️','💂','👷','🎅','🤶','🧙','🧚','🧛','🧜','🧝','🧞','🧟','💃','🕺','🫂','🧑‍💻','🧑‍🎤','🧑‍🏫','🧑‍⚕️','🧑‍🍳','🧑‍🔧','🧑‍🏭','🧑‍💼','🧑‍🌾','🧑‍🚒','🧑‍🚀'],
  },
  { id: 'nature', icon: '🌿', label: 'Nature',
    emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐴','🦄','🐝','🦋','🐌','🐞','🐜','🐢','🐍','🦎','🐙','🦑','🐠','🐟','🐬','🐳','🦈','🌿','🍀','🌱','🌲','🌳','🌴','🌵','🍃','🍂','🍁','🌾','🌺','🌸','🌼','🌻','🌹','🌷','☀️','🌤️','⛅','🌧️','⛈️','❄️','🌈','🌊','🌙','⭐','🌟','✨'],
  },
  { id: 'food', icon: '🍕', label: 'Food',
    emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🥦','🌶️','🧄','🧅','🥔','🌽','🥐','🍞','🥖','🧀','🥚','🍳','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🌮','🌯','🥗','🍜','🍝','🍛','🍣','🥟','🍤','🍱','🍚','🍙','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🍯','🧃','🥤','🧋','☕','🍵','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧊'],
  },
  { id: 'travel', icon: '✈️', label: 'Travel',
    emojis: ['🚗','🚕','🚙','🚌','🏎️','🚑','🚒','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🚀','✈️','🛸','🚁','🛶','⛵','🚤','🚢','⚓','🏠','🏢','🏣','🏥','🏦','🏨','🏩','🏪','🏫','🏭','🏰','🗼','🗽','🏟️','🏛️','⛩️','🕌','🕍','⛪','🗺️','🌍','🌎','🌏','🧭','🏔️','⛰️','🌋','🏕️','🏖️','🏜️','🏝️','🏞️','🏙️','🌅','🌄','🌠','🎆','🎇','🌌','🌃','🌉','🌁'],
  },
  { id: 'objects', icon: '💡', label: 'Objects',
    emojis: ['⌚','📱','💻','⌨️','🖥️','🖱️','💾','💿','📀','📷','📸','📹','🎥','📞','☎️','📺','📻','⏰','⏱️','⏲️','⏳','📡','🔋','🔌','💡','🔦','🕯️','🔮','📿','🧲','🪜','🧰','🔧','🔨','⚙️','🔩','🪛','🔑','🗝️','🔐','🔒','🔓','🚪','🛋️','🛁','🚿','🧹','🧺','🧻','🧼','🧴','🧽','📝','✏️','🖊️','📖','📚','📋','📌','📍','📎','📐','📏','✂️','💼','📁','📂','📊','📈','📉','📅','📆','📦','📫','📬','📮','📄','📃','📑','🗒️','🗓️','🗃️','🗄️','🗑️'],
  },
  { id: 'symbols', icon: '♾️', label: 'Symbols',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','💕','💞','💓','💗','💖','💘','💝','💟','✅','❌','⭕','🛑','⛔','📛','🚫','💯','⚠️','♻️','✔️','🔰','♾️','🔃','🔄','🔙','🔚','🔛','🔜','🔝','❇️','✳️','❓','❗','ℹ️','⬆️','⬇️','⬅️','➡️','↗️','↘️','↙️','↖️','↕️','↔️','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔷','🔶','🔹','🔸','🔳','🔲','🏆','🏅','🥇','🥈','🥉','👑','🎯','🎮','🎨','🎭','🎤','🎧','🎼','🎹','🎸','🎺','🎻','🎁','🎊','🎉','🎈','✨','⭐','🌟','💫','🔥','💧','🌊','💥','🌈'],
  },
]

// Flat search index built from EMOJI_SHORTCODES — dedupe by emoji value
const PICKER_SEARCH_INDEX: { name: string; emoji: string }[] = (() => {
  const seen = new Set<string>()
  return Object.entries(EMOJI_SHORTCODES).reduce<{ name: string; emoji: string }[]>((acc, [name, emoji]) => {
    if (!seen.has(emoji)) { seen.add(emoji); acc.push({ name, emoji }) }
    return acc
  }, [])
})()

function EmojiPickerPanel({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [query, setQuery] = useState('')
  const [activeCat, setActiveCat] = useState('smileys')
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('atlas_emoji_recent') ?? '[]') as string[] } catch { return [] }
  })

  const handleSelect = (emoji: string) => {
    const next = [emoji, ...recentEmojis.filter(e => e !== emoji)].slice(0, 24)
    setRecentEmojis(next)
    try { localStorage.setItem('atlas_emoji_recent', JSON.stringify(next)) } catch { /* ignore */ }
    onSelect(emoji)
  }

  const cats = [{ id: 'recent', icon: '🕐', label: 'Recent' }, ...PICKER_CATS]
  const q = query.trim().toLowerCase()
  const displayEmojis = q
    ? PICKER_SEARCH_INDEX.filter(e => e.name.includes(q)).map(e => e.emoji)
    : activeCat === 'recent'
      ? recentEmojis
      : PICKER_CATS.find(c => c.id === activeCat)?.emojis ?? []

  return (
    <div className="emoji-picker-panel">
      <div className="emoji-picker-panel__search">
        <svg className="emoji-picker-panel__search-icon" fill="none" viewBox="0 0 16 16">
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="m10 10 3 3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"/>
        </svg>
        <input
          autoFocus
          className="emoji-picker-panel__search-input"
          onChange={e => setQuery(e.target.value)}
          placeholder="Search emoji…"
          type="text"
          value={query}
        />
        {query && <button className="emoji-picker-panel__search-clear" onClick={() => setQuery('')} type="button">×</button>}
      </div>
      {!q && (
        <div className="emoji-picker-panel__cats">
          {cats.map(cat => (
            <button
              className={`emoji-picker-panel__cat-btn${activeCat === cat.id ? ' is-active' : ''}`}
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              title={cat.label}
              type="button"
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}
      {!q && <div className="emoji-picker-panel__cat-label">{cats.find(c => c.id === activeCat)?.label}</div>}
      <div className="emoji-picker-panel__grid">
        {displayEmojis.length === 0 ? (
          <div className="emoji-picker-panel__empty">
            {q ? 'No results 🔍' : 'No recent emoji yet'}
          </div>
        ) : displayEmojis.map((emoji, i) => (
          <button
            className="emoji-picker-panel__btn"
            key={`${emoji}-${i}`}
            onClick={() => handleSelect(emoji)}
            title={emoji}
            type="button"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
const THREAD_AVATAR_PALETTE = [
  { bg: 'var(--purple-dim)', fg: 'var(--purple-ink)' },
  { bg: 'var(--blue-dim)', fg: 'var(--blue-ink)' },
  { bg: 'var(--green-dim)', fg: 'var(--green-ink)' },
  { bg: 'var(--yellow-dim)', fg: 'var(--yellow-ink)' },
  { bg: 'var(--red-dim)', fg: 'var(--red-ink)' },
  { bg: 'var(--cyan-dim)', fg: 'var(--cyan-ink)' },
] as const

function normalizeReactions(value: unknown): Record<string, number[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([emoji, userIds]) => [
      emoji,
      Array.isArray(userIds) ? userIds.filter((id): id is number => typeof id === 'number') : [],
    ]),
  )
}

// ── SVG icon atoms ─────────────────────────────────────────────────────────
const IcoSearch = () => (
  <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14">
    <circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" />
  </svg>
)
const IcoLock = () => (
  <svg fill="none" height="11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="11">
    <rect height="7" rx="1.5" width="10" x="3" y="8" /><path d="M5 8V6a3 3 0 0 1 6 0v2" />
  </svg>
)
const IcoMute = () => (
  <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="12">
    <path d="M8 2a4 4 0 0 1 4 4v2.5l1.5 2.5h-11L4 8.5V6a4 4 0 0 1 4-4Z" />
    <path d="M6.5 14a1.5 1.5 0 0 0 3 0" />
    <line x1="2" x2="14" y1="2" y2="14" />
  </svg>
)
const IcoUsers = () => (
  <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13">
    <circle cx="6" cy="5" r="2.5" /><path d="M1.5 14c0-3 2-4.5 4.5-4.5s4.5 1.5 4.5 4.5" />
    <circle cx="11.5" cy="5" r="2" /><path d="M13.5 14c0-2.5-1.5-4-3.5-4.5" />
  </svg>
)
const IcoGlobe = () => (
  <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13">
    <circle cx="8" cy="8" r="6" />
    <path d="M2 8h12M8 2a9 9 0 0 1 0 12M8 2a9 9 0 0 0 0 12" />
  </svg>
)
const IcoSettings = () => (
  <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14">
    <circle cx="8" cy="8" r="2.5" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" />
  </svg>
)
const IcoTarget = () => (
  <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14">
    <circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="3" />
    <circle cx="8" cy="8" fill="currentColor" r="0.75" stroke="none" />
  </svg>
)
const IcoPaperclip = () => (
  <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14">
    <path d="M13 7 7.5 12.5a4 4 0 0 1-5.7-5.7l5.5-5.5a2.5 2.5 0 0 1 3.5 3.5L5.3 10.3a1 1 0 0 1-1.4-1.4l5-5" />
  </svg>
)
const IcoSmile = () => (
  <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14">
    <circle cx="8" cy="8" r="6" />
    <path d="M5.5 9.5s.8 1.5 2.5 1.5 2.5-1.5 2.5-1.5" />
    <circle cx="6" cy="6.5" fill="currentColor" r=".75" stroke="none" />
    <circle cx="10" cy="6.5" fill="currentColor" r=".75" stroke="none" />
  </svg>
)
const IcoChat = () => (
  <svg fill="none" height="32" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="32">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)
const IcoStarFilled = () => (
  <svg fill="currentColor" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 16 16" width="14">
    <path d="M8 2l1.8 3.6 4 .6-2.9 2.8.7 4L8 11.1l-3.6 1.9.7-4-2.9-2.8 4-.6Z" />
  </svg>
)
const IcoStarOutline = () => (
  <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14">
    <path d="M8 2l1.8 3.6 4 .6-2.9 2.8.7 4L8 11.1l-3.6 1.9.7-4-2.9-2.8 4-.6Z" />
  </svg>
)
const IcoPin = () => (
  <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13">
    <path d="M10 2 14 6l-3 3-1 4-3-3-4 4M6 6 2 10" />
  </svg>
)
const IcoPencil = () => (
  <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13">
    <path d="M11 2.5a2 2 0 0 1 2.5 2.5L5 13.5 2 14l.5-3Z" />
  </svg>
)
const IcoBookmark = () => (
  <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13">
    <path d="M4 2h8a1 1 0 0 1 1 1v11l-5-3-5 3V3a1 1 0 0 1 1-1Z" />
  </svg>
)
const IcoBookmarkFilled = () => (
  <svg fill="currentColor" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 16 16" width="13">
    <path d="M4 2h8a1 1 0 0 1 1 1v11l-5-3-5 3V3a1 1 0 0 1 1-1Z" />
  </svg>
)
const IcoTrash = () => (
  <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13">
    <path d="M3.5 4.5h9" />
    <path d="M6 2.5h4" />
    <path d="M5 4.5v7a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-7" />
    <path d="M6.75 6.5v4" />
    <path d="M9.25 6.5v4" />
  </svg>
)
const IcoWarning = () => (
  <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13">
    <path d="M8 2 14.5 13.5H1.5Z" /><path d="M8 6.5v3" /><circle cx="8" cy="11.5" fill="currentColor" r=".75" stroke="none" />
  </svg>
)
const IcoDecision = () => (
  <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="12">
    <path d="M8 1.5a3 3 0 0 1 1 5.8V9H7V7.3A3 3 0 0 1 8 1.5Z" /><circle cx="8" cy="12" fill="currentColor" r=".9" stroke="none" />
  </svg>
)

function DeletedMessageNotice({ content, isOwnMessage }: { content: string; isOwnMessage: boolean }) {
  const label = isOwnMessage ? 'You deleted this message.' : content.trim() || 'This message was deleted.'

  return (
    <div className={`message-card__deleted ${isOwnMessage ? 'message-card__deleted--own' : ''}`}>
      <span aria-hidden="true" className="message-card__deleted-icon">
        <IcoTrash />
      </span>
      <span className="message-card__deleted-text">{label}</span>
    </div>
  )
}

function FileTypeIcon({ mime, name, size = 28 }: { mime: string; name: string; size?: number }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const r = Math.round(size * 0.2)
  const fs = Math.round(size * 0.34)
  const fsSmall = Math.round(size * 0.3)
  const cy = Math.round(size * 0.68)

  type Spec = { color: string; label: string }
  let spec: Spec

  if (mime === 'application/pdf' || ext === 'pdf')
    spec = { color: '#E53935', label: 'PDF' }
  else if (['xlsx','xls','ods'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel'))
    spec = { color: '#1E7E34', label: 'XLS' }
  else if (['csv'].includes(ext))
    spec = { color: '#388E3C', label: 'CSV' }
  else if (['docx','doc','odt','rtf'].includes(ext) || mime.includes('wordprocessingml') || mime.includes('msword'))
    spec = { color: '#1565C0', label: 'DOC' }
  else if (['pptx','ppt','odp'].includes(ext) || mime.includes('presentationml') || mime.includes('powerpoint'))
    spec = { color: '#D84315', label: 'PPT' }
  else if (['zip','rar','7z','tar','gz'].includes(ext) || mime.includes('zip') || mime.includes('compressed'))
    spec = { color: '#6D4C41', label: 'ZIP' }
  else if (['txt','md','log'].includes(ext) || mime.startsWith('text/'))
    spec = { color: '#546E7A', label: 'TXT' }
  else
    spec = { color: '#78909C', label: ext.toUpperCase().slice(0, 4) || 'FILE' }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} fill="none">
      <rect width={size} height={size} rx={r} fill={spec.color}/>
      <text
        x={size / 2} y={cy}
        textAnchor="middle"
        fontSize={spec.label.length > 3 ? fsSmall : fs}
        fontWeight="800"
        fill="white"
        fontFamily="system-ui,Arial,sans-serif"
        letterSpacing="-0.5"
      >{spec.label}</text>
    </svg>
  )
}
function PdfThumbnail({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function render() {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
        const pdf = await pdfjsLib.getDocument(url).promise
        if (cancelled) return
        const page = await pdf.getPage(1)
        if (cancelled) return
        const canvas = canvasRef.current
        if (!canvas) return
        const viewport = page.getViewport({ scale: 1.5 })
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        await page.render({ canvas, canvasContext: ctx, viewport }).promise
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void render()
    return () => { cancelled = true }
  }, [url])

  if (failed) return null
  return <canvas className="doc-pdf-thumb" ref={canvasRef} />
}

function ImageLightbox({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  useEscKey(onClose)
  return createPortal(
    <div
      className="lightbox-overlay"
      onClick={onClose}
    >
      <button aria-label="Close" className="lightbox-close" onClick={onClose} type="button">
        <svg fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
          <path d="M18 6 6 18M6 6l12 12"/>
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
          <path d="M12 3v13M5 16l7 7 7-7"/><path d="M3 21h18"/>
        </svg>
        Download
      </a>
    </div>,
    document.body,
  )
}

const IcoBlocker = () => (
  <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="12">
    <circle cx="8" cy="8" r="6" /><path d="m3.8 3.8 8.4 8.4" />
  </svg>
)
const IcoUpdate = () => (
  <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="12">
    <path d="M9.5 2h3.5v3.5" /><path d="M13 2 7 8M3 7v6h6" />
  </svg>
)
const IcoClose = () => (
  <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12">
    <path d="m1 1 10 10M11 1 1 11" />
  </svg>
)
const IcoClock = () => (
  <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13">
    <circle cx="8" cy="8" r="6" /><path d="M8 5v3.5l2.5 1.5" />
  </svg>
)
const IcoUnread = () => (
  <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13">
    <path d="M2 4h12v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4Z" /><path d="M2 4l6 5 6-5" /><line stroke="var(--accent)" strokeWidth="2" x1="12" x2="12" y1="1" y2="5" />
  </svg>
)
const IcoReply = () => (
  <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13">
    <path d="M6 4 2 8l4 4" /><path d="M2 8h8a4 4 0 0 1 0 8H9" />
  </svg>
)

function formatMessageDayLabel(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(value))
}

function formatTypingLabel(users: { userName: string }[]): string {
  if (users.length === 1) return `${users[0]!.userName} is typing…`
  if (users.length === 2) return `${users[0]!.userName} and ${users[1]!.userName} are typing…`
  return 'Several people are typing…'
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })
}

function channelKind(name: string): 'program' | 'blocker' | 'control' | 'knowledge' | 'general' {
  const n = name.toLowerCase()
  if (n.includes('blocker') || n.includes('blk') || n.includes('command-center')) return 'blocker'
  if (n.includes('program') || n.includes('prog') || n.includes('dashboard')) return 'program'
  if (n.includes('control') || n.includes('decision') || n.includes('approval')) return 'control'
  if (n.includes('knowledge') || n.includes('collab') || n.includes('feed')) return 'knowledge'
  return 'general'
}

const DELETED_MESSAGE_PLACEHOLDER = 'This message was deleted.'

function getChannelPreview(
  lastMessage: ChannelSummary['lastMessage'],
  currentUserId: number | null,
): { isDeleted: boolean; isOwn: boolean; text: string } | null {
  if (!lastMessage) return null

  const raw = lastMessage.content.trim()
  const isOwn = currentUserId != null && lastMessage.userId === currentUserId
  const isDeleted = Boolean(lastMessage.isDeletedForEveryone) || raw === DELETED_MESSAGE_PLACEHOLDER

  if (isDeleted) {
    return {
      isDeleted: true,
      isOwn,
      text: isOwn ? 'You deleted this message.' : DELETED_MESSAGE_PLACEHOLDER,
    }
  }

  const tag = raw.match(/^\[(Decision|Blocker|Update)\]\s*/i)?.[1]
  const content = raw.replace(/^\[(Decision|Blocker|Update)\]\s*/i, '')
  const normalized = tag ? `${tag}: ${content}` : content
  const text = normalized.trim() || 'Attachment'

  return {
    isDeleted: false,
    isOwn,
    text: isOwn ? `You: ${text}` : text,
  }
}

type UserOption = { id: number; name: string; roleType: string }
type DMPartner = { id: number; name: string; roleType: string; status?: string }
export type ChannelAttachment = { url: string; name: string; type: string; size?: number }

// Parse "dm-{a}-{b}" channel name → returns the partner ID (the one that's not currentUserId)
function parseDmPartnerId(channelName: string, currentUserId: number | null): number | null {
  const match = channelName.match(/^dm-(\d+)-(\d+)$/)
  if (!match || currentUserId == null) return null
  const a = Number(match[1])
  const b = Number(match[2])
  if (a === currentUserId) return b
  if (b === currentUserId) return a
  return null
}

/** Auto-convert user input into a valid channel slug.
 *  Uppercase → lowercase, spaces/special chars → hyphens, collapses multiples. */
function slugifyChannelName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_]+/g, '-')          // spaces & underscores → hyphen
    .replace(/[^a-z0-9-]/g, '')       // strip anything else
    .replace(/-{2,}/g, '-')           // collapse consecutive hyphens
}

type ChannelsViewProps = {
  channels: ChannelSummary[]
  selectedChannelId: number | null
  selectedChannel: ChannelSummary | null
  currentUserId: number | null
  addableUsers: UserOption[]
  workspaceUsers: UserOption[]
  programs: Program[]
  tasks: Task[]
  channelMembers: ChannelMember[]
  messages: ChannelMessage[]
  selectedThreadId: number | null
  threadParent: ChannelMessage | null
  threadReplies: ChannelMessage[]
  channelStatus: { loading: boolean; message: string | null }
  composerValue: string
  typingUsers: { userId: number; userName: string }[]
  onComposerChange: (value: string) => void
  onSelectChannel: (channelId: number) => void
  onCloseConversation: () => void
  onSelectThread: (threadId: number | null) => void
  onReactEmoji: (messageId: number, emoji: string) => void
  onEditMessage: (messageId: number, content: string) => Promise<void>
  onDeleteMessage: (messageId: number, scope: 'self' | 'all') => Promise<void>
  onPinMessage: (messageId: number) => Promise<void>
  onSendMessage: (event: FormEvent<HTMLFormElement>, attachments?: ChannelAttachment[]) => void
  onSendThreadReply: (parentId: number, content: string, alsoToChannel?: boolean) => Promise<void>
  onUploadFiles: (formData: FormData) => Promise<ChannelAttachment[]>
  onTyping: () => void
  onMarkAllAsRead: () => void
  onOpenDM: (userId: number) => Promise<void>
  onToggleStar: (channelId: number, isStarred: boolean) => Promise<void>
  onlineUserIds: Set<number>
  presenceStatusMap: Map<number, string>
  dmPartnerPresence: { status: string; lastActivityAt: string } | null
  onBrowseChannels: () => Promise<Array<{ id: number; name: string; description?: string; memberCount: number; messageCount: number; isMember: boolean }>>
  onJoinChannel: (channelId: number) => Promise<void>
  savedMessageIds: Set<number>
  onToggleSaveMessage: (messageId: number, currentlySaved: boolean) => Promise<void>
  onToggleMuteChannel: (channelId: number, mute: boolean) => Promise<void>
  isChannelMuted: (channelId: number) => boolean
  onCreateChannel: (data: { name: string; description?: string; type: 'PUBLIC' | 'PRIVATE' }) => Promise<void>
  onUpdateChannel: (channelId: number, data: { name?: string; description?: string }) => Promise<void>
  onArchiveChannel: (channelId: number) => Promise<void>
  onAddMember: (channelId: number, userId: number) => Promise<void>
  onRemoveMember: (channelId: number, userId: number) => Promise<void>
  onLeaveChannel: (channelId: number) => Promise<void>
  onMarkAsRead: (channelId: number) => void
  onMarkMessageUnread: (messageId: number) => Promise<void>
  onRemindMessage: (messageId: number, remindAt: Date, note?: string) => Promise<void>
  sending: boolean
  /** Unread count captured at channel-entry time, before optimistic mark-as-read clears it */
  channelEntryUnread: number
}

export function ChannelsView({
  channels = [],
  selectedChannelId,
  selectedChannel,
  currentUserId,
  addableUsers = [],
  workspaceUsers = [],
  programs = [],
  tasks = [],
  channelMembers = [],
  messages = [],
  selectedThreadId,
  threadParent,
  threadReplies = [],
  channelStatus,
  composerValue,
  typingUsers = [],
  onComposerChange,
  onSelectChannel,
  onCloseConversation,
  onSelectThread,
  onReactEmoji,
  onEditMessage,
  onDeleteMessage,
  onPinMessage,
  onSendMessage,
  onSendThreadReply,
  onUploadFiles,
  onTyping,
  onMarkAllAsRead,
  onOpenDM,
  onToggleStar,
  onlineUserIds,
  presenceStatusMap,
  dmPartnerPresence,
  onBrowseChannels,
  onJoinChannel,
  savedMessageIds,
  onToggleSaveMessage,
  onToggleMuteChannel,
  isChannelMuted,
  onCreateChannel,
  onUpdateChannel,
  onArchiveChannel,
  onAddMember,
  onRemoveMember,
  onLeaveChannel,
  onMarkAsRead,
  onMarkMessageUnread,
  onRemindMessage,
  sending,
  channelEntryUnread,
}: ChannelsViewProps) {
  const toast = useInlineToast()
  const [channelQuery, setChannelQuery] = useState('')
  const [channelFilter, setChannelFilter] = useState<'all' | 'priority' | 'unread'>('all')
  const [streamMode, setStreamMode] = useState<'all' | 'threads' | 'pinned' | 'saved'>('all')
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('atlas.channels.collapsed')
      if (stored) return new Set<string>(JSON.parse(stored) as string[])
    } catch { /* ignore parse error */ }
    return new Set<string>()
  })
  const toggleSection = (id: string) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      try { localStorage.setItem('atlas.channels.collapsed', JSON.stringify([...next])) } catch { /* noop */ }
      return next
    })

  // Message action state
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [emojiPickerFor, setEmojiPickerFor] = useState<number | null>(null)
  const [messageMenuFor, setMessageMenuFor] = useState<number | null>(null)
  const [messageMenuPlacement, setMessageMenuPlacement] = useState<'above' | 'below'>('below')
  const [messagePopoverAlign, setMessagePopoverAlign] = useState<'start' | 'end'>('start')
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number
    content: string
    authorName: string
    canDeleteForAll: boolean
    isDeletedForEveryone: boolean
  } | null>(null)
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null)
  const [deletingMessageScope, setDeletingMessageScope] = useState<'self' | 'all' | null>(null)
  const [deleteMessageError, setDeleteMessageError] = useState<string | null>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const deleteConfirmRef = useDialogFocus<HTMLDivElement>(deleteTarget !== null)
  const deleteConfirmTitleId = useId()
  const deleteConfirmDescId = useId()

  // Thread composer state
  const [threadReplyValue, setThreadReplyValue] = useState('')
  const [sendingThreadReply, setSendingThreadReply] = useState(false)
  const [alsoToChannel, setAlsoToChannel] = useState(false)
  const threadReplyRef = useRef<HTMLTextAreaElement>(null)

  // Create channel modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const createChannelDialogRef = useDialogFocus<HTMLDivElement>(showCreateModal)
  const createChannelTitleId = useId()
  const createChannelDescId = useId()
  const [createForm, setCreateForm] = useState({ name: '', description: '', type: 'PUBLIC' as 'PUBLIC' | 'PRIVATE' })
  const [creatingChannel, setCreatingChannel] = useState(false)

  // Channel settings
  const [showSettings, setShowSettings] = useState(false)
  const [settingsForm, setSettingsForm] = useState({ name: '', description: '' })
  const [savingSettings, setSavingSettings] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  // Member management
  const [memberQuery, setMemberQuery] = useState('')
  const [addingMemberId, setAddingMemberId] = useState<number | null>(null)
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null)
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<{ userId: number; name: string } | null>(null)
  const [removeMemberError, setRemoveMemberError] = useState<string | null>(null)
  const confirmRemoveRef = useDialogFocus<HTMLDivElement>(confirmRemoveMember !== null)
  const confirmRemoveTitleId = useId()
  const confirmRemoveDescId = useId()

  // Right panel toggle (members visible by default OFF, like Slack)
  const [showRightPanel, setShowRightPanel] = useState(false)

  // Sidebar row context menu
  const [contextMenu, setContextMenu] = useState<{
    channelId: number
    isDm: boolean
    x: number
    y: number
    confirming: boolean
  } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const openContextMenu = (e: React.MouseEvent, channelId: number, isDm: boolean) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const menuHeight = 180
    const y = Math.min(rect.top, window.innerHeight - menuHeight - 8)
    setContextMenu({ channelId, isDm, x: rect.right + 4, y, confirming: false })
  }

  // Reminder modal
  const [reminderTarget, setReminderTarget] = useState<{ messageId: number } | null>(null)
  const reminderDialogRef = useDialogFocus<HTMLDivElement>(reminderTarget !== null)
  const reminderTitleId = useId()
  const reminderDescId = useId()
  const [reminderNote, setReminderNote] = useState('')
  const [reminderSaving, setReminderSaving] = useState(false)

  // URL unfurl cache: url → UnfurlData | null (null = fetch in progress or failed)
  const [unfurlCache, setUnfurlCache] = useState<Map<string, UnfurlData | 'loading' | 'error'>>(new Map())
  const apiBase = (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL) ?? ''
  // Cancel in-flight unfurl fetches on channel change / unmount so setState
  // never runs after the component is gone.
  const unfurlAbortRef = useRef<AbortController | null>(null)

  const fetchUnfurl = (url: string) => {
    if (unfurlCache.has(url)) return
    setUnfurlCache((prev) => new Map(prev).set(url, 'loading'))
    if (!unfurlAbortRef.current) unfurlAbortRef.current = new AbortController()
    const signal = unfurlAbortRef.current.signal
    fetch(`${apiBase}/unfurl?url=${encodeURIComponent(url)}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal,
    })
      .then((r) => r.json() as Promise<{ data: UnfurlData }>)
      .then(({ data }) => setUnfurlCache((prev) => new Map(prev).set(url, data)))
      .catch((err) => {
        if (err?.name === 'AbortError') {
          // Evict stale 'loading' so a return to this channel can retry.
          setUnfurlCache((prev) => { const next = new Map(prev); next.delete(url); return next })
          return
        }
        setUnfurlCache((prev) => new Map(prev).set(url, 'error'))
      })
  }

  // Extract first URL from message content
  const extractFirstUrl = (content: string): string | null => {
    const m = content.match(/https?:\/\/[^\s)>'"]+/)
    return m ? m[0] : null
  }

  // In-channel search
  const [searchActive, setSearchActive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Reset view state when channel changes — prevents filter "stuck" across channels
  useEffect(() => {
    setStreamMode('all')
    setSearchActive(false)
    setSearchQuery('')
    setEmojiPickerFor(null)
    setMessageMenuFor(null)
    setMessageMenuPlacement('below')
    setMessagePopoverAlign('start')
    setPendingAttachments([])
    setUploadError(null)
    setShowFormatting(false)
    unfurlAbortRef.current?.abort()
    unfurlAbortRef.current = null
  }, [selectedChannelId])

  // Abort any in-flight unfurl on unmount.
  useEffect(() => () => { unfurlAbortRef.current?.abort() }, [])

  // ── Scroll management ────────────────────────────────────────
  const streamRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  // Ref mirror of isAtBottom — avoids stale closure in the auto-scroll effect
  const isAtBottomRef = useRef(true)
  const [floatingNewCount, setFloatingNewCount] = useState(0)
  const prevMsgLengthRef = useRef(0)

  // ONBOARDING channels start scroll position at top (reading order) instead of bottom (chat order).
  const isOnboardingChannel = selectedChannel?.topicType === 'ONBOARDING'

  // Position scroll on channel switch
  useEffect(() => {
    setFloatingNewCount(0)
    if (isOnboardingChannel) {
      isAtBottomRef.current = false
      setIsAtBottom(false)
      if (streamRef.current) streamRef.current.scrollTop = 0
    } else {
      isAtBottomRef.current = true
      setIsAtBottom(true)
      if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [selectedChannelId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll on new message — only when already at bottom
  // Uses isAtBottomRef to avoid stale-closure issue with [messages.length] dep array
  useEffect(() => {
    const delta = messages.length - prevMsgLengthRef.current
    const isInitialLoad = prevMsgLengthRef.current === 0
    if (delta > 0 && messages.length > 0) {
      if (isAtBottomRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      } else if (!isInitialLoad) {
        // Suppress floating "new messages" bump on initial load (e.g., ONBOARDING starts at top)
        setFloatingNewCount((c) => c + delta)
      }
    }
    prevMsgLengthRef.current = messages.length
  }, [messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStreamScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    isAtBottomRef.current = atBottom
    setIsAtBottom(atBottom)
    if (atBottom) setFloatingNewCount(0)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    isAtBottomRef.current = true
    setIsAtBottom(true)
    setFloatingNewCount(0)
  }

  // ── "New messages" divider ────────────────────────────────────
  // channelEntryUnread is the unread count captured at selection time (before mark-as-read clears it).
  // We resolve the exact first-unread message once messages load, then freeze the divider there.
  const [firstUnreadId, setFirstUnreadId] = useState<number | null>(null)
  // Tracks message IDs already marked unread this session — prevents double-firing
  const [markedUnreadIds, setMarkedUnreadIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    // Reset on channel switch; will be resolved by the effect below once messages load
    setFirstUnreadId(null)
    setMarkedUnreadIds(new Set())
  }, [selectedChannelId])

  useEffect(() => {
    if (firstUnreadId !== null) return // already pinned — don't move it
    if (channelEntryUnread <= 0) return // no unread messages when we entered
    const topLevel = messages.filter((m) => !m.parentMessageId)
    if (topLevel.length >= channelEntryUnread) {
      const idx = topLevel.length - channelEntryUnread
      setFirstUnreadId(topLevel[idx]?.id ?? null)
    }
  }, [messages.length, channelEntryUnread]) // eslint-disable-line react-hooks/exhaustive-deps

  // Activity drawer (mentions / notifications inbox)
  const [showActivity, setShowActivity] = useState(false)

  // File attachments (pending upload before send)
  const [pendingAttachments, setPendingAttachments] = useState<ChannelAttachment[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [showFormatting, setShowFormatting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Image lightbox
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)
  const openLightbox = useCallback((url: string, name: string) => setLightbox({ url, name }), [])
  const closeLightbox = useCallback(() => setLightbox(null), [])

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return
    setUploadError(null)
    setUploadingFiles(true)
    try {
      // Kompres gambar besar di browser (foto HP 2-5MB → <2MB) supaya lolos
      // batas upload server (audit 2026-06-17). Non-gambar diteruskan apa adanya.
      const processed = await Promise.all(files.map((f) => compressImageFile(f)))

      // Guard pesan jelas: yang tetap di atas batas server (mis. PDF besar yang
      // tak bisa dikompres) ditolak di sini, bukan gagal membingungkan di server.
      const tooBig = processed.find((f) => f.size > MAX_UPLOAD_BYTES)
      if (tooBig) {
        const mb = (tooBig.size / (1024 * 1024)).toFixed(1)
        setUploadError(`File "${tooBig.name}" terlalu besar (${mb} MB, maks 2 MB). Perkecil dulu.`)
        return
      }

      // 'files[]' (BUKAN 'files') — tanpa bracket, PHP terima sbg file tunggal →
      // validasi server `files: array` gagal "files must be an array" (bug yang
      // bikin upload single-file selalu 422; ketahuan dari verifikasi browser 2026-06-17).
      const formData = new FormData()
      processed.forEach((f) => formData.append('files[]', f))
      const result = await onUploadFiles(formData)
      setPendingAttachments((prev) => [...prev, ...result])
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingFiles(false)
    }
  }

  const handleFilePick = () => fileInputRef.current?.click()
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    void uploadFiles(files)
    e.target.value = '' // reset so selecting same file again triggers change
  }
  const handleDrop = (e: React.DragEvent<HTMLFormElement>) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files ?? [])
    void uploadFiles(files)
  }
  const removeAttachment = (idx: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))
  }

  // Composer emoji picker
  const [showComposerEmoji, setShowComposerEmoji] = useState(false)
  const composerEmojiRef = useRef<HTMLDivElement>(null)
  const composerEmojiBtnRef = useRef<HTMLButtonElement>(null)
  const composerEmojiPanelRef = useRef<HTMLDivElement>(null)
  const [emojiPickerPos, setEmojiPickerPos] = useState<{ bottom: number; left: number } | null>(null)

  useEffect(() => {
    if (!showComposerEmoji) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (composerEmojiRef.current?.contains(target) || composerEmojiPanelRef.current?.contains(target)) return
      setShowComposerEmoji(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showComposerEmoji])

  // Mention autocomplete
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const composerInputWrapRef = useRef<HTMLDivElement>(null)
  const mentionDropdownRef = useRef<HTMLDivElement>(null)
  const wiDropdownRef = useRef<HTMLDivElement>(null)
  const [mentionState, setMentionState] = useState<{
    active: boolean
    query: string
    startIndex: number
    activeIdx: number
  }>({ active: false, query: '', startIndex: -1, activeIdx: 0 })

  const filteredMentionMembers = useMemo(() => {
    if (!mentionState.active) return []
    const q = mentionState.query.toLowerCase()
    const candidates = new Map<number, { userId: number; name: string; roleType: string }>()
    channelMembers.forEach((m) => candidates.set(m.userId, m))
    workspaceUsers.forEach((u) => {
      if (!candidates.has(u.id)) candidates.set(u.id, { userId: u.id, name: u.name, roleType: u.roleType })
    })
    return Array.from(candidates.values())
      .filter((m) => m.name.toLowerCase().includes(q) || m.roleType.toLowerCase().includes(q))
      .slice(0, 6)
  }, [mentionState.active, mentionState.query, channelMembers, workspaceUsers])

  // Special mentions (@channel, @here, @everyone) shown when typing matches
  const filteredSpecialMentions = useMemo(() => {
    if (!mentionState.active) return []
    const q = mentionState.query.toLowerCase()
    return [
      { key: 'channel', label: 'channel', desc: 'Notify everyone in this channel' },
      { key: 'here', label: 'here', desc: 'Notify online members only' },
      { key: 'everyone', label: 'everyone', desc: 'Notify all workspace members' },
    ].filter((s) => s.key.startsWith(q))
  }, [mentionState.active, mentionState.query])
  const mentionSuggestionCount = filteredSpecialMentions.length + filteredMentionMembers.length
  const mentionActiveDescendant = (() => {
    if (!mentionState.active || mentionSuggestionCount === 0) return undefined
    if (mentionState.activeIdx < filteredSpecialMentions.length) {
      const special = filteredSpecialMentions[mentionState.activeIdx]
      return special ? `composer-mention-special-${special.key}` : undefined
    }
    const member = filteredMentionMembers[mentionState.activeIdx - filteredSpecialMentions.length]
    return member ? `composer-mention-member-${member.userId}` : undefined
  })()

  useEffect(() => {
    if (!mentionState.active) return
    const lastIdx = mentionSuggestionCount - 1
    if (mentionSuggestionCount === 0 && mentionState.activeIdx !== 0) {
      setMentionState((s) => ({ ...s, activeIdx: 0 }))
      return
    }
    if (mentionSuggestionCount > 0 && mentionState.activeIdx > lastIdx) {
      setMentionState((s) => ({ ...s, activeIdx: lastIdx }))
    }
  }, [mentionState.active, mentionState.activeIdx, mentionSuggestionCount])

  useEffect(() => {
    if (!mentionState.active || mentionSuggestionCount === 0) return
    mentionDropdownRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [mentionState.active, mentionState.activeIdx, mentionSuggestionCount])

  const memberNames = useMemo(() => channelMembers.map((m) => m.name), [channelMembers])
  // Fallback to workspaceUsers so mentionMessages works even before channelMembers loads
  const currentUserName = useMemo(
    () =>
      channelMembers.find((m) => m.userId === currentUserId)?.name ??
      workspaceUsers.find((u) => u.id === currentUserId)?.name,
    [channelMembers, currentUserId, workspaceUsers],
  )
  const taskCodes = useMemo(() => tasks.map((wi) => wi.code), [tasks])

  // Detect @ mention or @WI- work item as user types
  const handleComposerInput = (value: string, cursorOverride?: number | null) => {
    onComposerChange(value)
    onTyping()
    const textarea = composerRef.current
    const cursor = cursorOverride ?? textarea?.selectionStart ?? value.length
    const before = value.slice(0, cursor)

    // Check for @WI- pattern first (work item mention)
    const wiMatch = before.match(/(?:^|\s)@(WI-[A-Z0-9-]*)$/i)
    if (wiMatch) {
      const startIndex = cursor - wiMatch[1].length - 1
      setWiMentionState({ active: true, query: wiMatch[1].slice(3), startIndex, activeIdx: 0 })
      setMentionState((s) => ({ ...s, active: false }))
      return
    }

    // Regular @user mention
    const match = before.match(/(?:^|\s)@([^\s@]*)$/)
    if (match) {
      const startIndex = cursor - match[1].length - 1
      setMentionState({ active: true, query: match[1], startIndex, activeIdx: 0 })
      setWiMentionState((s) => ({ ...s, active: false }))
    } else {
      if (mentionState.active) setMentionState((s) => ({ ...s, active: false }))
      if (wiMentionState.active) setWiMentionState((s) => ({ ...s, active: false }))
    }
  }

  const openMentionAutocomplete = () => {
    const textarea = composerRef.current
    const cursor = textarea?.selectionStart ?? composerValue.length
    const selectionEnd = textarea?.selectionEnd ?? cursor
    const nextValue = `${composerValue.slice(0, cursor)}@${composerValue.slice(selectionEnd)}`
    onComposerChange(nextValue)
    onTyping()
    setMentionState({ active: true, query: '', startIndex: cursor, activeIdx: 0 })
    setWiMentionState((s) => ({ ...s, active: false }))
    requestAnimationFrame(() => {
      composerRef.current?.focus()
      composerRef.current?.setSelectionRange(cursor + 1, cursor + 1)
    })
  }

  // Rich text toolbar — wrap selection with markdown markers
  const wrapSelection = (before: string, after: string = before) => {
    const ta = composerRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = composerValue.slice(start, end) || 'text'
    const wrapped = before + selected + after
    const newValue = composerValue.slice(0, start) + wrapped + composerValue.slice(end)
    onComposerChange(newValue)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }
  const prefixEachLine = (prefix: string) => {
    const ta = composerRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = composerValue.slice(start, end) || 'item'
    const lines = selected.split('\n').map((l) => `${prefix}${l}`).join('\n')
    const newValue = composerValue.slice(0, start) + lines + composerValue.slice(end)
    onComposerChange(newValue)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start, start + lines.length)
    })
  }

  const insertTask = (task: Task) => {
    if (!wiMentionState.active || wiMentionState.startIndex < 0) return
    const textarea = composerRef.current
    if (!textarea) return
    const before = composerValue.slice(0, wiMentionState.startIndex)
    const after = composerValue.slice(textarea.selectionStart)
    const insertion = `@${task.code} `
    const newValue = before + insertion + after
    onComposerChange(newValue)
    setWiMentionState({ active: false, query: '', startIndex: -1, activeIdx: 0 })
    requestAnimationFrame(() => {
      textarea.focus()
      const newCursor = before.length + insertion.length
      textarea.setSelectionRange(newCursor, newCursor)
    })
  }

  const insertMention = (memberName: string) => {
    if (!mentionState.active || mentionState.startIndex < 0) return
    const textarea = composerRef.current
    if (!textarea) return
    const before = composerValue.slice(0, mentionState.startIndex)
    const after = composerValue.slice(textarea.selectionStart)
    const insertion = `@${memberName} `
    const newValue = before + insertion + after
    onComposerChange(newValue)
    setMentionState({ active: false, query: '', startIndex: -1, activeIdx: 0 })
    // Restore cursor after the inserted mention
    requestAnimationFrame(() => {
      textarea.focus()
      const newCursor = before.length + insertion.length
      textarea.setSelectionRange(newCursor, newCursor)
    })
  }

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Markdown shortcuts
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      if (e.key === 'b') { e.preventDefault(); wrapSelection('**'); return }
      if (e.key === 'i') { e.preventDefault(); wrapSelection('_'); return }
    }
    // Work item mention navigation
    if (wiMentionState.active) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setWiMentionState((s) => ({ ...s, active: false }))
        return
      }
      if (filteredTasks.length === 0) {
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          setWiMentionState((s) => ({ ...s, active: false }))
          if (e.key === 'Enter' && selectedChannelId && !sending && (composerValue.trim() || pendingAttachments.length > 0)) {
            e.currentTarget.form?.requestSubmit()
          }
        }
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setWiMentionState((s) => ({ ...s, activeIdx: (s.activeIdx + 1) % filteredTasks.length }))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setWiMentionState((s) => ({ ...s, activeIdx: (s.activeIdx - 1 + filteredTasks.length) % filteredTasks.length }))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const target = filteredTasks[wiMentionState.activeIdx]
        if (target) insertTask(target)
        return
      }
    }
    if (!mentionState.active) return
    const total = mentionSuggestionCount
    if (e.key === 'Escape') {
      e.preventDefault()
      setMentionState((s) => ({ ...s, active: false }))
      return
    }
    if (total === 0) {
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionState((s) => ({ ...s, active: false }))
        if (e.key === 'Enter' && selectedChannelId && !sending && (composerValue.trim() || pendingAttachments.length > 0)) {
          e.currentTarget.form?.requestSubmit()
        }
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setMentionState((s) => ({ ...s, activeIdx: (s.activeIdx + 1) % total }))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMentionState((s) => ({ ...s, activeIdx: (s.activeIdx - 1 + total) % total }))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const idx = mentionState.activeIdx
      if (idx < filteredSpecialMentions.length) {
        const special = filteredSpecialMentions[idx]
        if (special) insertMention(special.key)
      } else {
        const target = filteredMentionMembers[idx - filteredSpecialMentions.length]
        if (target) insertMention(target.name)
      }
    }
  }

  // Close settings dropdown on outside click
  useEffect(() => {
    if (!showSettings) return
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false)
        setShowArchiveConfirm(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSettings])

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return
    const onMouse = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null) }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  const openSettings = () => {
    setSettingsForm({ name: selectedChannel?.name ?? '', description: '' })
    setShowSettings(true)
    setShowArchiveConfirm(false)
  }

  // ── DM ──────────────────────────────────────────────────
  const [showDmModal, setShowDmModal] = useState(false)
  const directMessageDialogRef = useDialogFocus<HTMLDivElement>(showDmModal)
  const directMessageTitleId = useId()
  const directMessageDescId = useId()
  const [dmQuery, setDmQuery] = useState('')
  const [openingDm, setOpeningDm] = useState(false)

  const navigate = useInertiaNavigate()

  // ── Linked Program / Workstream for context banner ──────
  const linkedProgram = useMemo(
    () => selectedChannel?.linkedProgramId
      ? programs.find((p) => p.id === selectedChannel.linkedProgramId)
      : undefined,
    [selectedChannel, programs],
  )
  // Canonical health/status labels (On Track / At Risk / Delayed, Active, …)
  // — keeps banner vocabulary aligned with the rest of ATLAS.
  const linkedProgramHealth = useMemo(
    () => (linkedProgram ? getProgramHealthDisplay(linkedProgram) : null),
    [linkedProgram],
  )
  const linkedProgramStatusLabel = useMemo(
    () => (linkedProgram ? getProgramDisplayStatus(linkedProgram).label : ''),
    [linkedProgram],
  )

  // ── Smart @WI- mention state ────────────────────────────
  const [wiMentionState, setWiMentionState] = useState<{
    active: boolean
    query: string
    startIndex: number
    activeIdx: number
  }>({ active: false, query: '', startIndex: -1, activeIdx: 0 })

  const filteredTasks = useMemo(() => {
    if (!wiMentionState.active) return []
    const q = wiMentionState.query.toLowerCase()
    return tasks
      .filter((wi) => wi.code.toLowerCase().includes(q) || wi.title.toLowerCase().includes(q))
      .slice(0, 6)
  }, [wiMentionState.active, wiMentionState.query, tasks])
  const wiActiveDescendant = (() => {
    if (!wiMentionState.active || filteredTasks.length === 0) return undefined
    const task = filteredTasks[wiMentionState.activeIdx]
    return task ? `composer-work-item-${task.id}` : undefined
  })()

  useEffect(() => {
    if (!wiMentionState.active) return
    const lastIdx = filteredTasks.length - 1
    if (filteredTasks.length === 0 && wiMentionState.activeIdx !== 0) {
      setWiMentionState((s) => ({ ...s, activeIdx: 0 }))
      return
    }
    if (filteredTasks.length > 0 && wiMentionState.activeIdx > lastIdx) {
      setWiMentionState((s) => ({ ...s, activeIdx: lastIdx }))
    }
  }, [filteredTasks.length, wiMentionState.active, wiMentionState.activeIdx])

  useEffect(() => {
    if (!wiMentionState.active || filteredTasks.length === 0) return
    wiDropdownRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [filteredTasks.length, wiMentionState.active, wiMentionState.activeIdx])

  useEffect(() => {
    if (!mentionState.active && !wiMentionState.active) return
    const handleOutsideMentionClick = (event: MouseEvent) => {
      if (composerInputWrapRef.current?.contains(event.target as Node)) return
      setMentionState((s) => ({ ...s, active: false }))
      setWiMentionState((s) => ({ ...s, active: false }))
    }
    document.addEventListener('mousedown', handleOutsideMentionClick)
    return () => document.removeEventListener('mousedown', handleOutsideMentionClick)
  }, [mentionState.active, wiMentionState.active])

  // ── Channel browser ─────────────────────────────────────
  const [showBrowse, setShowBrowse] = useState(false)
  const browseDialogRef = useDialogFocus<HTMLDivElement>(showBrowse)
  const browseTitleId = useId()
  const browseDescId = useId()
  const [browseQuery, setBrowseQuery] = useState('')
  const [browseList, setBrowseList] = useState<Array<{ id: number; name: string; description?: string; memberCount: number; messageCount: number; isMember: boolean }>>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [joiningId, setJoiningId] = useState<number | null>(null)

  const openBrowse = async () => {
    setShowBrowse(true)
    setBrowseQuery('')
    setBrowseLoading(true)
    try {
      const data = await onBrowseChannels()
      setBrowseList(data)
    } finally {
      setBrowseLoading(false)
    }
  }

  const filteredBrowseList = useMemo(() => {
    const q = browseQuery.trim().toLowerCase()
    if (!q) return browseList
    return browseList.filter((c) => c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q))
  }, [browseList, browseQuery])

  const userLookup = useMemo(() => {
    const map = new Map<number, UserOption>()
    workspaceUsers.forEach((u) => map.set(u.id, u))
    return map
  }, [workspaceUsers])

  // ── Quick switcher (Cmd+K) ──────────────────────────────
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [switcherQuery, setSwitcherQuery] = useState('')
  const [switcherIdx, setSwitcherIdx] = useState(0)
  const switcherDialogRef = useDialogFocus<HTMLDivElement>(showSwitcher)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSwitcherQuery('')
        setSwitcherIdx(0)
        setShowSwitcher((v) => !v)
      }
      if (e.key === 'Escape' && showSwitcher) {
        setShowSwitcher(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showSwitcher])

  // ── ESC key handlers for overlays ─────────────────────────────────────────
  useEscKey(() => setShowRightPanel(false), showRightPanel)
  useEscKey(() => setShowActivity(false), showActivity)
  useEscKey(() => setShowCreateModal(false), showCreateModal)
  useEscKey(() => setShowDmModal(false), showDmModal)
  useEscKey(() => setShowBrowse(false), showBrowse)
  useEscKey(() => setReminderTarget(null), reminderTarget !== null)
  useEscKey(() => {
    setDeleteTarget(null)
    setDeleteMessageError(null)
    setDeletingMessageScope(null)
  }, deleteTarget !== null)
  useEscKey(() => { setConfirmRemoveMember(null); setRemoveMemberError(null) }, confirmRemoveMember !== null)

  const switcherItems = useMemo(() => {
    const q = switcherQuery.trim().toLowerCase()
    const items: Array<{ channel: ChannelSummary; displayName: string; kind: 'channel' | 'dm' }> = []
    for (const c of channels) {
      const partnerId = parseDmPartnerId(c.name, currentUserId)
      if (partnerId != null) {
        const partner = userLookup.get(partnerId)
        items.push({ channel: c, displayName: partner?.name ?? c.name, kind: 'dm' })
      } else {
        items.push({ channel: c, displayName: c.name, kind: 'channel' })
      }
    }
    return items
      .filter((it) => !q || it.displayName.toLowerCase().includes(q))
      .slice(0, 10)
  }, [channels, switcherQuery, currentUserId, userLookup])

  const dmCandidates = useMemo(() => {
    const q = dmQuery.trim().toLowerCase()
    return workspaceUsers
      .filter((u) => u.id !== currentUserId)
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.roleType.toLowerCase().includes(q))
      .slice(0, 10)
  }, [workspaceUsers, dmQuery, currentUserId])

  const filteredAddableUsers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase()
    if (!q) return addableUsers.slice(0, 8)
    return addableUsers.filter((u) => u.name.toLowerCase().includes(q) || u.roleType.toLowerCase().includes(q)).slice(0, 8)
  }, [addableUsers, memberQuery])

  const isSelectedDirectMessage = Boolean(
    selectedChannel?.isDirectMessage ?? (selectedChannel ? parseDmPartnerId(selectedChannel.name, currentUserId) !== null : false),
  )
  const canManageChannelMembers = Boolean(selectedChannel?.canManageMembers) && !isSelectedDirectMessage
  const resolveMessageMenuPlacement = (trigger: HTMLElement, estimatedHeight = 270): 'above' | 'below' => {
    const rect = trigger.getBoundingClientRect()
    const bottomSpace = window.innerHeight - rect.bottom
    const topSpace = rect.top
    return bottomSpace < estimatedHeight && topSpace > bottomSpace ? 'above' : 'below'
  }
  const resolveMessagePopoverAlign = (
    trigger: HTMLElement,
    preferred: 'start' | 'end',
    estimatedWidth = 304,
  ): 'start' | 'end' => {
    const rect = trigger.getBoundingClientRect()
    const gutter = 16
    if (preferred === 'start' && rect.left + estimatedWidth > window.innerWidth - gutter) return 'end'
    if (preferred === 'end' && rect.right - estimatedWidth < gutter) return 'start'
    return preferred
  }

  // Close message action popovers on outside click
  useEffect(() => {
    if (!emojiPickerFor && !messageMenuFor) return
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setEmojiPickerFor(null)
        setMessageMenuFor(null)
        setMessageMenuPlacement('below')
        setMessagePopoverAlign('start')
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEmojiPickerFor(null)
        setMessageMenuFor(null)
        setMessageMenuPlacement('below')
        setMessagePopoverAlign('start')
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [emojiPickerFor, messageMenuFor])

  const startEdit = (message: ChannelMessage) => {
    setEditingMessageId(message.id)
    setEditContent(message.content)
    setEmojiPickerFor(null)
    setMessageMenuFor(null)
    setMessageMenuPlacement('below')
    setMessagePopoverAlign('start')
  }

  const cancelEdit = () => {
    setEditingMessageId(null)
    setEditContent('')
  }

  const saveEdit = async (messageId: number) => {
    const trimmed = editContent.trim()
    if (!trimmed) return
    setSavingEdit(true)
    try {
      await onEditMessage(messageId, trimmed)
      setEditingMessageId(null)
      setEditContent('')
    } finally {
      setSavingEdit(false)
    }
  }

  const topLevelMessages = useMemo(
    () => messages.filter((message) => !message.parentMessageId),
    [messages],
  )
  const normalizedQuery = channelQuery.trim().toLowerCase()

  const visibleChannels = useMemo(() => {
    return channels.filter((channel) => {
      const matchesQuery =
        !normalizedQuery ||
        channel.name.toLowerCase().includes(normalizedQuery) ||
        channel.type.toLowerCase().includes(normalizedQuery) ||
        channel.lastMessage?.content.toLowerCase().includes(normalizedQuery)

      if (!matchesQuery) return false
      if (channelFilter === 'priority') return channel.isStarred
      if (channelFilter === 'unread') return channel.unreadCount > 0
      return true
    })
  }, [channelFilter, channels, normalizedQuery])

  // Split visible channels into DMs (name dm-X-Y) vs regular channels
  const dmEntries = useMemo(() => {
    const out: Array<{ channel: ChannelSummary; partner: DMPartner | null }> = []
    for (const channel of visibleChannels) {
      const partnerId = parseDmPartnerId(channel.name, currentUserId)
      if (partnerId == null) continue
      const partner = userLookup.get(partnerId)
      out.push({
        channel,
        partner: partner ? { id: partner.id, name: partner.name, roleType: partner.roleType } : null,
      })
    }
    return out
  }, [visibleChannels, currentUserId, userLookup])

  const nonDmChannels = useMemo(
    () => visibleChannels.filter((c) => parseDmPartnerId(c.name, currentUserId) == null),
    [visibleChannels, currentUserId],
  )
  const starredChannels = nonDmChannels.filter((channel) => channel.isStarred)
  const regularChannels = nonDmChannels.filter((channel) => !channel.isStarred)

  // For DM channels, derive display partner for the currently selected channel header
  const selectedDmPartner: DMPartner | null = useMemo(() => {
    if (!selectedChannel) return null
    const partnerId = parseDmPartnerId(selectedChannel.name, currentUserId)
    if (partnerId == null) return null
    const partner = userLookup.get(partnerId)
    return partner ? { id: partner.id, name: partner.name, roleType: partner.roleType } : null
  }, [selectedChannel, currentUserId, userLookup])

  const unreadTotal = channels.reduce((sum, channel) => sum + channel.unreadCount, 0)

  // Draft indicator: which channel IDs have a saved draft in localStorage?
  // Re-evaluate when selectedChannelId changes (saving/restoring drafts happens on channel switch).
  const draftChannelIds = useMemo(() => {
    const ids = new Set<number>()
    channels.forEach((c) => {
      if (localStorage.getItem(`atlas.draft.${c.id}`)?.trim()) ids.add(c.id)
    })
    return ids
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, selectedChannelId])

  const renderChannelPreview = (channel: ChannelSummary) => {
    if (channel.id === selectedChannelId) return null
    const preview = getChannelPreview(channel.lastMessage, currentUserId)
    if (!preview) return null

    return (
      <div className={`channel-row__preview${preview.isDeleted ? ' channel-row__preview--deleted' : ''}${preview.isOwn ? ' channel-row__preview--own' : ''}`}>
        {preview.text}
      </div>
    )
  }

  // Tab counts — computed from all top-level messages (not filtered stream)
  const threadCount = topLevelMessages.filter((m) => m.replyCount > 0).length
  const pinnedCount = topLevelMessages.filter((m) => m.isPinned).length
  const savedCount = topLevelMessages.filter((m) => savedMessageIds.has(m.id)).length

  // Mentions — messages in this channel that mention the current user or @channel/@here.
  // Primary: use mentionedUserIds (stored at creation, immune to name changes).
  // Fallback: name-based search for old messages that predate the mentionedUserIds field.
  const mentionMessages = useMemo(() => {
    if (!currentUserId) return []
    return topLevelMessages.filter((m) => {
      // New messages: use stored userId array
      if (m.mentionedUserIds && m.mentionedUserIds.length > 0) {
        return m.mentionedUserIds.includes(currentUserId)
      }
      // Legacy fallback: name-based search
      if (!currentUserName) return false
      const lower = m.content.toLowerCase()
      return (
        lower.includes(`@${currentUserName.toLowerCase()}`) ||
        lower.includes('@channel') ||
        lower.includes('@here') ||
        lower.includes('@everyone')
      )
    })
  }, [topLevelMessages, currentUserId, currentUserName])

  const streamMessages = useMemo(() => {
    let list = topLevelMessages
    if (streamMode === 'threads') list = list.filter((m) => m.replyCount > 0)
    else if (streamMode === 'pinned') list = list.filter((m) => m.isPinned)
    else if (streamMode === 'saved') list = list.filter((m) => savedMessageIds.has(m.id))
    if (searchActive && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter((m) =>
        m.content.toLowerCase().includes(q) ||
        (m.authorName?.toLowerCase().includes(q) ?? false)
      )
    }
    return list
  }, [streamMode, topLevelMessages, searchActive, searchQuery, savedMessageIds])

  const groupedMessages = useMemo(() => {
    const groups = new Map<string, ChannelMessage[]>()
    streamMessages.forEach((message) => {
      const d = new Date(message.createdAt)
      const key = isNaN(d.getTime()) ? 'unknown' : d.toISOString().slice(0, 10)
      const current = groups.get(key) ?? []
      current.push(message)
      groups.set(key, current)
    })
    return Array.from(groups.entries()).map(([dateKey, items]) => ({
      dateKey,
      label: formatMessageDayLabel(items[0]?.createdAt ?? dateKey),
      items,
    }))
  }, [streamMessages])

  return (
    <div className="ds channels-v2 view-channels ds-stagger">
      <PageHeader
        className="ds-page-header--inset"
        title="Channels"
        subtitle="Team communication, discussions, and project updates."
        actions={
          unreadTotal > 0 ? (
            <div className="view-toolbar__stats">
              <span className="text-red">{unreadTotal} <em>unread</em></span>
            </div>
          ) : undefined
        }
      />
    <section className={`channels-layout channels-layout--polished${selectedChannelId ? ' has-conversation' : ''}`} style={{ flex: 1, minHeight: 0 }}>
      {/* ── Channel sidebar (compact, Slack-style) ──────────── */}
      <aside className="panel channel-panel">
        <div className="channel-sidebar channel-sidebar--compact">
          <div className="channel-sidebar__top">
            <div className="channel-sidebar__search">
              <span className="channel-sidebar__search-icon"><IcoSearch /></span>
              <input
                onChange={(e) => setChannelQuery(e.target.value)}
                placeholder="Jump to channel…"
                value={channelQuery}
              />
              <span className="channel-sidebar__search-hint">⌘K</span>
            </div>
            <div className="channel-sidebar__actions-row">
              <button
                className="channel-sidebar__browse-btn"
                onClick={() => void openBrowse()}
                type="button"
              >
                <IcoGlobe /> Browse all channels
              </button>
              <div className="channel-sidebar__filter-pills">
                {(['all', 'unread', 'priority'] as const).map((f) => (
                  <button
                    className={`sidebar-filter-pill${channelFilter === f ? ' is-active' : ''}`}
                    key={f}
                    onClick={() => setChannelFilter(f)}
                    type="button"
                  >
                    {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'Starred'}
                  </button>
                ))}
                {unreadTotal > 0 && (
                  <button
                    className="sidebar-filter-pill sidebar-filter-pill--mark-read"
                    onClick={onMarkAllAsRead}
                    title="Mark all as read"
                    type="button"
                  >
                    ✓ All read
                  </button>
                )}
              </div>
            </div>
          </div>

          {channels.length > 0 ? (
            <div className="channel-list-compact">
              {starredChannels.length > 0 && (
                <div className="channel-section-compact">
                  <button
                    className="channel-section-compact__header"
                    onClick={() => toggleSection('starred')}
                    type="button"
                  >
                    <span className={`channel-section-compact__caret${collapsedSections.has('starred') ? ' is-collapsed' : ''}`}>▾</span>
                    <span>Starred</span>
                    <span className="channel-section-compact__count">{starredChannels.length}</span>
                  </button>
                  {!collapsedSections.has('starred') && starredChannels.map((channel) => (
                    <div className="channel-row-wrap" key={channel.id}>
                      <button
                        className={`channel-row ${channel.id === selectedChannelId ? 'is-active' : ''} ${channel.unreadCount > 0 ? 'has-unread' : ''}`}
                        data-kind={channelKind(channel.name)}
                        onClick={() => onSelectChannel(channel.id)}
                        type="button"
                      >
                        <span className="channel-row__hash">{channel.type === 'PRIVATE' ? <IcoLock /> : '#'}</span>
                        <div className="channel-row__content">
                          <div className="channel-row__top">
                            <span className="channel-row__name">{channel.name}</span>
                            {draftChannelIds.has(channel.id) && channel.id !== selectedChannelId && <span className="composer-draft-badge" title="Draft">Draft</span>}
                            {channel.lastMessage && <span className="channel-row__time">{relativeTime(channel.lastMessage.createdAt)}</span>}
                            {channel.unreadCount > 0 && <span className="channel-row__unread">{channel.unreadCount}</span>}
                          </div>
                          {renderChannelPreview(channel)}
                        </div>
                      </button>
                      <button className="channel-row__menu-btn" onClick={(e) => openContextMenu(e, channel.id, false)} title="More options" type="button">···</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="channel-section-compact">
                <div
                  className="channel-section-compact__header"
                  onClick={() => toggleSection('channels')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleSection('channels')
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <span className={`channel-section-compact__caret${collapsedSections.has('channels') ? ' is-collapsed' : ''}`}>▾</span>
                  <span>Channels</span>
                  <span className="channel-section-compact__count">{regularChannels.length}</span>
                  <button
                    className="channel-section-compact__add"
                    onClick={(e) => {
                      e.stopPropagation()
                      setCreateForm({ name: '', description: '', type: 'PUBLIC' })
                      setShowCreateModal(true)
                    }}
                    title="Create new channel"
                    type="button"
                  >
                    +
                  </button>
                </div>
                {!collapsedSections.has('channels') && regularChannels.map((channel) => (
                  <div className="channel-row-wrap" key={channel.id}>
                    <button
                      className={`channel-row ${channel.id === selectedChannelId ? 'is-active' : ''} ${channel.unreadCount > 0 ? 'has-unread' : ''}`}
                      data-kind={channelKind(channel.name)}
                      onClick={() => onSelectChannel(channel.id)}
                      type="button"
                    >
                      <span className="channel-row__hash">{channel.type === 'PRIVATE' ? <IcoLock /> : '#'}</span>
                      <div className="channel-row__content">
                        <div className="channel-row__top">
                          <span className="channel-row__name">{channel.name}</span>
                          {isChannelMuted(channel.id) && <span className="channel-row__mute" title="Muted"><IcoMute /></span>}
                          {channel.lastMessage && !isChannelMuted(channel.id) && <span className="channel-row__time">{relativeTime(channel.lastMessage.createdAt)}</span>}
                          {channel.unreadCount > 0 && !isChannelMuted(channel.id) && <span className="channel-row__unread">{channel.unreadCount}</span>}
                        </div>
                        {renderChannelPreview(channel)}
                      </div>
                    </button>
                    <button className="channel-row__menu-btn" onClick={(e) => openContextMenu(e, channel.id, false)} title="More options" type="button">···</button>
                  </div>
                ))}
                {regularChannels.length === 0 && starredChannels.length === 0 && (
                  <p className="channel-list-compact__empty subtle">No channels match.</p>
                )}
              </div>

              {/* Direct Messages section */}
              <div className="channel-section-compact">
                <div
                  className="channel-section-compact__header"
                  onClick={() => toggleSection('dms')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleSection('dms')
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <span className={`channel-section-compact__caret${collapsedSections.has('dms') ? ' is-collapsed' : ''}`}>▾</span>
                  <span>Direct Messages</span>
                  {dmEntries.length > 0 && <span className="channel-section-compact__count">{dmEntries.length}</span>}
                  <button
                    className="channel-section-compact__add"
                    onClick={(e) => { e.stopPropagation(); setDmQuery(''); setShowDmModal(true) }}
                    title="Start a direct message"
                    type="button"
                  >
                    +
                  </button>
                </div>
                {dmEntries.length === 0 && !collapsedSections.has('dms') && (
                  <div className="channel-dm-empty">
                    <p>No conversations yet.</p>
                    <button
                      className="channel-dm-empty__btn"
                      onClick={() => { setDmQuery(''); setShowDmModal(true) }}
                      type="button"
                    >
                      + New message
                    </button>
                  </div>
                )}
                {!collapsedSections.has('dms') && dmEntries.map(({ channel, partner }) => {
                  const displayName = partner?.name ?? `User #${parseDmPartnerId(channel.name, currentUserId) ?? '?'}`
                  const isOnline = partner ? onlineUserIds.has(partner.id) : false
                  return (
                    <div className="channel-row-wrap" key={channel.id}>
                      <button
                        className={`channel-row channel-row--dm ${channel.id === selectedChannelId ? 'is-active' : ''} ${channel.unreadCount > 0 ? 'has-unread' : ''}`}
                        onClick={() => onSelectChannel(channel.id)}
                        type="button"
                      >
                        <div className="dm-avatar-wrap">
                          <Avatar name={displayName} />
                          <span className={`dm-presence-dot dm-presence-dot--${isOnline ? 'online' : 'offline'}`} />
                        </div>
                        <div className="channel-row__content">
                          <div className="channel-row__top">
                            <span className="channel-row__name">{displayName}</span>
                            {draftChannelIds.has(channel.id) && channel.id !== selectedChannelId && <span className="composer-draft-badge" title="Draft">Draft</span>}
                            {channel.lastMessage && <span className="channel-row__time">{relativeTime(channel.lastMessage.createdAt)}</span>}
                            {channel.unreadCount > 0 && <span className="channel-row__unread">{channel.unreadCount}</span>}
                          </div>
                          {renderChannelPreview(channel)}
                        </div>
                      </button>
                      <button className="channel-row__menu-btn" onClick={(e) => openContextMenu(e, channel.id, true)} title="More options" type="button">···</button>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="channel-empty-cta">
              <div className="channel-empty-cta__icon"><IcoChat /></div>
              <h3>Welcome to Channels</h3>
              <p>Create your first channel or start a DM with a teammate.</p>
              <button
                className="btn btn--primary"
                onClick={() => { setCreateForm({ name: '', description: '', type: 'PUBLIC' }); setShowCreateModal(true) }}
                type="button"
              >
                + Create your first channel
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => { setDmQuery(''); setShowDmModal(true) }}
                type="button"
                style={{ marginTop: 6 }}
              >
                <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" style={{ verticalAlign: 'middle' }} viewBox="0 0 16 16" width="13"><path d="M14 10a2 2 0 0 1-2 2H5l-3 3V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" /></svg> Send a direct message
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Message stream ──────────────────────────────────── */}
      <main className="panel channel-stream channel-stream--polished">
        {/* Slim 1-row header — only when a channel or DM is selected */}
        {(selectedChannel || selectedDmPartner) && (
        <div className="channel-header-slim">
          <button
            className="channel-header-slim__back"
            onClick={onCloseConversation}
            type="button"
            aria-label="Kembali ke daftar channel"
          >
            <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="16"><path d="M10 3L5 8l5 5" /></svg>
          </button>
          <div className="channel-header-slim__title">
            {selectedDmPartner ? (
              <>
                <Avatar name={selectedDmPartner.name} size={40} />
                <div className="channel-header-slim__dm-info">
                  <div className="channel-header-slim__dm-top">
                    <h3>{selectedDmPartner.name}</h3>
                    <span className="ch-role-badge">{formatRoleLabel(selectedDmPartner.roleType)}</span>
                  </div>
                  {dmPartnerPresence && (() => {
                    // Use lastActivityAt as primary truth for display — status alone
                    // can be stale if the user was idle but hasn't pinged recently.
                    const msSince = Date.now() - new Date(dmPartnerPresence.lastActivityAt).getTime()
                    const isReallyOnline = dmPartnerPresence.status === 'ONLINE' && msSince < 3 * 60_000
                    const label = dmPartnerPresence.status === 'DO_NOT_DISTURB'
                      ? 'Do not disturb'
                      : isReallyOnline
                        ? 'Online now'
                        : `Last active ${formatRelativeTime(dmPartnerPresence.lastActivityAt).text}`
                    const tone = isReallyOnline ? 'online' : dmPartnerPresence.status === 'DO_NOT_DISTURB' ? 'do_not_disturb' : 'offline'
                    return <span className={`dm-last-seen dm-last-seen--${tone}`}>{label}</span>
                  })()}
                </div>
              </>
            ) : (
              <>
                <span className="channel-header-slim__hash">{selectedChannel?.type === 'PRIVATE' ? <IcoLock /> : '#'}</span>
                <h3>{selectedChannel ? selectedChannel.name : 'Select channel'}</h3>
                {selectedChannel && (
                  <button
                    className="channel-header-slim__members"
                    onClick={() => setShowRightPanel((v) => !v)}
                    title={`${selectedChannel.memberCount} members`}
                    type="button"
                  >
                    <IcoUsers /> {selectedChannel.memberCount}
                  </button>
                )}
                {selectedChannel && pinnedCount > 0 && (
                  <button
                    className="channel-header-slim__pinned-chip"
                    onClick={() => setStreamMode('pinned')}
                    title={`${pinnedCount} pinned message${pinnedCount > 1 ? 's' : ''}`}
                    type="button"
                  >
                    <IcoPin /> {pinnedCount}
                  </button>
                )}
                {selectedChannel?.description && (
                  <span className="channel-header-slim__topic" title={selectedChannel.description}>
                    {selectedChannel.description}
                  </span>
                )}
              </>
            )}
          </div>
          {selectedChannel && (
            <div className="channel-header-slim__actions">
              {/* Mentions/activity button */}
              <button
                className={`tb-action-btn${showActivity ? ' is-active' : ''}${mentionMessages.length > 0 ? ' has-badge' : ''}`}
                data-badge={mentionMessages.length > 0 ? mentionMessages.length : undefined}
                onClick={() => { setShowActivity((v) => !v); setShowRightPanel(false) }}
                title="Mentions & activity"
                type="button"
              >
                <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14">
                  <path d="M8 2a4.5 4.5 0 0 1 4.5 4.5V9l1 2H2.5l1-2V6.5A4.5 4.5 0 0 1 8 2z" />
                  <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
                </svg>
              </button>
              {!selectedDmPartner && (
                <button
                  className={`tb-action-btn${selectedChannel.isStarred ? ' is-active' : ''}`}
                  onClick={() => void onToggleStar(selectedChannel.id, !selectedChannel.isStarred)}
                  title={selectedChannel.isStarred ? 'Unstar' : 'Star this channel'}
                  type="button"
                >
                  {selectedChannel.isStarred ? <IcoStarFilled /> : <IcoStarOutline />}
                </button>
              )}
              {searchActive ? (
                <div className="channel-search-bar">
                  <span className="channel-search-bar__icon"><IcoSearch /></span>
                  <input
                    autoFocus
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setSearchActive(false); setSearchQuery('') } }}
                    placeholder={`Search in #${selectedChannel.name}…`}
                    value={searchQuery}
                  />
                  <button
                    className="channel-search-bar__close"
                    onClick={() => { setSearchActive(false); setSearchQuery('') }}
                    title="Close search (Esc)"
                    type="button"
                  >
                    <IcoClose />
                  </button>
                </div>
              ) : (
                <button
                  className="tb-action-btn"
                  onClick={() => setSearchActive(true)}
                  title="Search in channel"
                  type="button"
                >
                  <IcoSearch />
                </button>
              )}
              <div className="channel-settings-anchor" ref={settingsRef}>
                <button
                  className={`tb-action-btn${showSettings ? ' is-active' : ''}`}
                  onClick={openSettings}
                  title="Channel settings"
                  type="button"
                >
                  <IcoSettings />
                </button>
                {showSettings && (
                  <div className="channel-settings-dropdown">
                    {!showArchiveConfirm ? (
                      <>
                        <p className="channel-settings-dropdown__label">Channel settings</p>
                        <div className="channel-settings-dropdown__field">
                          <label>Name</label>
                          <input
                            onChange={(e) => setSettingsForm((f) => ({ ...f, name: slugifyChannelName(e.target.value) }))}
                            placeholder="channel-name"
                            value={settingsForm.name}
                          />
                        </div>
                        <div className="channel-settings-dropdown__field">
                          <label>Description</label>
                          <input
                            onChange={(e) => setSettingsForm((f) => ({ ...f, description: e.target.value }))}
                            placeholder="What's this channel about?"
                            value={settingsForm.description}
                          />
                        </div>
                        <label className="channel-settings-dropdown__mute">
                          <input
                            checked={selectedChannelId ? isChannelMuted(selectedChannelId) : false}
                            onChange={(e) => {
                              if (selectedChannelId) void onToggleMuteChannel(selectedChannelId, e.target.checked)
                            }}
                            type="checkbox"
                          />
                          <span><IcoMute /> Mute notifications for this channel</span>
                        </label>
                        <div className="channel-settings-dropdown__actions">
                          <button
                            className="channel-settings-dropdown__danger"
                            onClick={() => setShowArchiveConfirm(true)}
                            type="button"
                          >
                            Archive channel
                          </button>
                          <button
                            className="btn btn--primary btn--sm"
                            disabled={savingSettings || !settingsForm.name.trim()}
                            onClick={async () => {
                              if (!selectedChannelId) return
                              setSavingSettings(true)
                              try {
                                await onUpdateChannel(selectedChannelId, {
                                  name: settingsForm.name.trim() || undefined,
                                  description: settingsForm.description.trim() || undefined,
                                })
                                setShowSettings(false)
                              } finally {
                                setSavingSettings(false)
                              }
                            }}
                            type="button"
                          >
                            {savingSettings ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="channel-settings-dropdown__confirm">
                        <p>Archive <strong>#{selectedChannel?.name}</strong>?</p>
                        <p className="subtle">Members won't be able to send new messages.</p>
                        <div className="channel-settings-dropdown__actions">
                          <button className="btn btn--ghost btn--sm" onClick={() => setShowArchiveConfirm(false)} type="button">
                            Cancel
                          </button>
                          <button
                            className="channel-settings-dropdown__danger"
                            onClick={async () => {
                              if (!selectedChannelId) return
                              const channelName = selectedChannel?.name ?? 'channel'
                              try {
                                await onArchiveChannel(selectedChannelId)
                                toast.show(`Channel #${channelName} archived`, 'success')
                              } catch (err) {
                                toast.show(
                                  err instanceof Error ? err.message : 'Failed to archive channel',
                                  'error',
                                )
                              }
                              setShowSettings(false)
                              setShowArchiveConfirm(false)
                            }}
                            type="button"
                          >
                            Yes, archive
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Channel context banner — show linked Program/Workstream info */}
        {linkedProgram && (
          <button
            className="channel-context-banner channel-context-banner--clickable"
            onClick={() => navigate(`/programs/${linkedProgram.id}`)}
            title={`Open program: ${linkedProgram.name}`}
            type="button"
          >
            <div className="channel-context-banner__icon"><IcoTarget /></div>
            <div className="channel-context-banner__main">
              <div className="channel-context-banner__title">
                <span className="eyebrow">Linked program</span>
                <strong>{linkedProgram.name}</strong>
                <span className={`channel-context-banner__health-pill channel-context-banner__health-pill--${linkedProgram.healthStatus.toLowerCase()}`}>
                  {linkedProgramHealth?.label ?? linkedProgram.healthStatus}
                </span>
              </div>
              {/* Mini progress bar */}
              <div className="channel-context-banner__progress-row">
                <div className="channel-context-banner__progress-track">
                  <div
                    className={`channel-context-banner__progress-fill channel-context-banner__progress-fill--${linkedProgram.healthStatus.toLowerCase()}`}
                    style={{ width: `${linkedProgram.progressPercent}%` }}
                  />
                </div>
                <span className="channel-context-banner__progress-pct">{linkedProgram.progressPercent}%</span>
              </div>
              <div className="channel-context-banner__metrics">
                <span>Status: <strong>{linkedProgramStatusLabel || linkedProgram.status.replace(/_/g, ' ')}</strong></span>
                <span className="channel-context-banner__sep" />
                <span>Priority: <strong>{linkedProgram.priority}</strong></span>
              </div>
            </div>
            {/* Arrow — slides in on hover */}
            <div className="channel-context-banner__arrow" aria-hidden="true">
              <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="14">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </div>
          </button>
        )}

        {/* Compact filter tabs (only when channel selected) */}
        {selectedChannel && (
          <div className="channel-stream-toolbar--slim">
            {([
              { key: 'all',     label: 'All',     count: null },
              { key: 'threads', label: 'Threads', count: threadCount },
              { key: 'pinned',  label: 'Pinned',  count: pinnedCount },
              { key: 'saved',   label: 'Saved',   count: savedCount },
            ] as const).map((item) => (
              <button
                className={`stream-tab${streamMode === item.key ? ' is-active' : ''}`}
                key={item.key}
                onClick={() => setStreamMode(item.key)}
                type="button"
              >
                {item.label}
                {item.count !== null && item.count > 0 && (
                  <span className="stream-tab__badge">{item.count}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {channelStatus.message && <InlineNotice tone="error">{channelStatus.message}</InlineNotice>}

        {!selectedChannelId && !selectedChannel && !selectedDmPartner ? (
          <div className="channel-stream-empty">
            <div className="channel-stream-empty__icon" aria-hidden="true">
              <svg fill="none" height="40" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="40">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </div>
            <h3 className="channel-stream-empty__title">Select a channel to start</h3>
            <p className="channel-stream-empty__text">Choose a channel or DM from the left panel to open a conversation.</p>
          </div>
        ) : (channelStatus.loading || (!selectedChannel && !selectedDmPartner)) ? (
          <div className="detail-skeleton">
            <SkeletonBlock height={18} width="30%" />
            {[0, 1, 2].map((item) => (
              <div className="message-card message-card--slackish message-card--skeleton" key={item}>
                <SkeletonBlock className="message-card__avatar-skeleton" height={42} width="42px" />
                <div className="message-card__body">
                  <SkeletonBlock height={14} width="34%" />
                  <SkeletonStack lines={[100, 78]} />
                </div>
              </div>
            ))}
          </div>
        ) : groupedMessages.length > 0 ? (
          <div
            className="message-stream message-stream--slackish"
            onScroll={handleStreamScroll}
            ref={streamRef}
          >
            {/* Jump-to-bottom floating button */}
            {!isAtBottom && (
              <button className="jump-to-bottom" onClick={scrollToBottom} type="button">
                {floatingNewCount > 0
                  ? <><span className="jump-to-bottom__count">{floatingNewCount} new</span> ↓</>
                  : '↓'}
              </button>
            )}
            {groupedMessages.map((group) => (
              <div className="message-group" key={group.dateKey}>
                <div className="message-group__separator">
                  <span>{group.label}</span>
                </div>
                <div className="message-group__stack">
                  {group.items.map((message, msgIdx) => {
                    const tag = message.content.match(/^\[(Decision|Blocker|Update)\]/i)?.[1]?.toLowerCase() ?? null
                    const displayContent = tag ? message.content.replace(/^\[(Decision|Blocker|Update)\]\s*/i, '') : message.content
                    const hasAttachments = Boolean(message.attachments?.length)
                    const hasVisibleText = displayContent.trim().length > 0
                    const prevMsg = group.items[msgIdx - 1]
                    const prevTag = prevMsg?.content.match(/^\[(Decision|Blocker|Update)\]/i)?.[1]?.toLowerCase() ?? null
                    const nextMsg = group.items[msgIdx + 1]
                    const nextTag = nextMsg?.content.match(/^\[(Decision|Blocker|Update)\]/i)?.[1]?.toLowerCase() ?? null
                    const isOwnMessage = message.userId === currentUserId
                    const isDeletedMessage = Boolean(message.isDeletedForEveryone)
                    const isAttachmentOnly = !tag && !isDeletedMessage && hasAttachments && !hasVisibleText
                    const reactions = normalizeReactions(message.reactions)
                    const hasClusterPrev = !tag && !prevTag && !!prevMsg && prevMsg.userId === message.userId &&
                      (new Date(message.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() < 5 * 60 * 1000)
                    const hasClusterNext = !tag && !nextTag && !!nextMsg && nextMsg.userId === message.userId &&
                      (new Date(nextMsg.createdAt).getTime() - new Date(message.createdAt).getTime() < 5 * 60 * 1000)
                    const isGrouped = hasClusterPrev
                    const clusterClass = hasClusterPrev
                      ? hasClusterNext
                        ? 'message-card--cluster-middle'
                        : 'message-card--cluster-end'
                      : hasClusterNext
                        ? 'message-card--cluster-start'
                        : 'message-card--cluster-solo'
                    const timeOnlyLabel = new Date(message.createdAt).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                    const messageMenuId = `message-actions-${message.id}`
                    const showUnreadDivider = firstUnreadId !== null && message.id === firstUnreadId
                    return (
                    <React.Fragment key={message.id}>
                    {showUnreadDivider && (
                      <div className="new-messages-divider">
                        <span>New messages</span>
                      </div>
                    )}
                    <article className={`message-card message-card--slackish ${isSelectedDirectMessage ? 'message-card--dm' : ''} ${isOwnMessage ? 'message-card--own' : ''} ${isGrouped ? 'message-card--grouped' : ''} ${clusterClass} ${isDeletedMessage ? 'message-card--deleted-state' : ''} ${isAttachmentOnly ? 'message-card--attachment-only' : ''} ${tag ? `message-card--tagged message-card--tag-${tag}` : ''}`} key={message.id}>
                      {isGrouped ? (
                        <div className="message-card__avatar-space">
                          <span className="message-card__hover-time">{new Date(message.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ) : (
                        <div className="message-card__avatar">
                          <div className="message-card__avatar-wrap">
                            <Avatar name={message.authorName ?? 'Unknown'} />
                            {presenceStatusMap.has(message.userId) && (
                              <span className={`message-card__presence-dot msg-dot--${presenceStatusMap.get(message.userId)!}`} />
                            )}
                          </div>
                        </div>
                      )}
                      <div className="message-card__body">
                        {!isGrouped && !isSelectedDirectMessage && <div className="message-card__meta">
                          <div className="message-card__author">
                            <strong className="message-card__author-name">{message.authorName ?? 'Unknown'}</strong>
                            <span className="ch-role-badge">{message.authorRole ?? 'Contributor'}</span>
                            {message.isEdited && <span className="message-card__edited">(edited)</span>}
                          </div>
                          <time className="message-card__time">{formatDate(message.createdAt)}</time>
                        </div>}
                        {tag && !isDeletedMessage && (
                          <div className={`message-tag-banner message-tag-banner--${tag}`}>
                            {tag === 'decision' && <IcoDecision />} {tag === 'blocker' && <IcoBlocker />} {tag === 'update' && <IcoUpdate />} {tag.toUpperCase()}
                          </div>
                        )}

                        {/* Inline edit or content */}
                        {editingMessageId === message.id ? (
                          <div className="message-edit-form">
                            <textarea
                              autoFocus
                              className="message-edit-form__input"
                              onChange={(e) => setEditContent(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') cancelEdit()
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void saveEdit(message.id)
                              }}
                              value={editContent}
                            />
                            <div className="message-edit-form__actions">
                              <span className="subtle">Esc to cancel · ⌘Enter to save</span>
                              <div>
                                <button className="btn btn--ghost btn--sm" onClick={cancelEdit} type="button">Cancel</button>
                                <button
                                  className="btn btn--primary btn--sm"
                                  disabled={savingEdit || !editContent.trim()}
                                  onClick={() => void saveEdit(message.id)}
                                  type="button"
                                >
                                  {savingEdit ? 'Saving…' : 'Save'}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          message.isDeletedForEveryone ? (
                            <DeletedMessageNotice content={message.content} isOwnMessage={isOwnMessage} />
                          ) : !hasVisibleText && hasAttachments ? (
                            null
                          ) : (
                            <RichTextPreview compact currentUserName={currentUserName} emptyText="" mentionNames={memberNames}
              taskCodes={taskCodes} value={displayContent} />
                          )
                        )}

                        {/* Attachments */}
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="message-attachments">
                            {message.attachments.map((att, idx) =>
                              att.type.startsWith('image/') ? (
                                <button
                                  className="attachment-card attachment-card--image"
                                  key={idx}
                                  onClick={() => openLightbox(att.url, att.name)}
                                  type="button"
                                >
                                  <img alt={att.name} src={att.url} />
                                </button>
                              ) : (
                                <a
                                  className="attachment-card attachment-card--doc"
                                  href={att.url}
                                  key={idx}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  <div className="attachment-doc__preview">
                                    {(att.type === 'application/pdf' || att.name.endsWith('.pdf')) ? (
                                      <PdfThumbnail url={att.url} />
                                    ) : (
                                      <FileTypeIcon mime={att.type} name={att.name} size={32} />
                                    )}
                                  </div>
                                  <div className="attachment-doc__footer">
                                    <FileTypeIcon mime={att.type} name={att.name} size={16} />
                                    <span className="attachment-doc__name">{att.name}</span>
                                  </div>
                                </a>
                              )
                            )}
                          </div>
                        )}

                        {/* Reactions display */}
                        {Object.keys(reactions).length > 0 && (
                          <div className="message-reactions">
                            {Object.entries(reactions).map(([emojiKey, userIds]) =>
                              userIds.length > 0 ? (
                                <button
                                  className={`reaction-chip ${currentUserId && userIds.includes(currentUserId) ? 'reaction-chip--active' : ''}`}
                                  key={emojiKey}
                                  onClick={() => onReactEmoji(message.id, emojiKey)}
                                  title={emojiKey}
                                  type="button"
                                >
                                  <span className="reaction-chip__emoji">{resolveEmoji(emojiKey)}</span>
                                  <span className="reaction-chip__count">{userIds.length}</span>
                                </button>
                              ) : null
                            )}
                          </div>
                        )}

                        {/* Pin indicator */}
                        {message.isPinned && (
                          <div className="msg-pinned-chip">
                            <IcoPin />
                            <span>Pinned</span>
                          </div>
                        )}

                        {/* URL unfurl preview */}
                        {(() => {
                          const url = extractFirstUrl(displayContent)
                          if (!url) return null
                          if (!unfurlCache.has(url)) { fetchUnfurl(url); return null }
                          const data = unfurlCache.get(url)
                          if (!data || data === 'loading' || data === 'error') return null
                          if (!data.title && !data.description) return null
                          return (
                            <a
                              className="unfurl-card"
                              href={url}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {data.image && <img alt="" className="unfurl-card__img" src={data.image} />}
                              <div className="unfurl-card__body">
                                {data.siteName && <span className="unfurl-card__site">{data.siteName}</span>}
                                {data.title && <strong className="unfurl-card__title">{data.title}</strong>}
                                {data.description && <p className="unfurl-card__desc">{data.description}</p>}
                              </div>
                            </a>
                          )
                        })()}

                        {/* Thread footer — shown when there are replies */}
                        {message.replyCount > 0 && (
                          <button
                            className={`thread-footer ${selectedThreadId === message.id ? 'thread-footer--active' : ''}`}
                            onClick={() => onSelectThread(message.id)}
                            type="button"
                          >
                            <div className="thread-footer__avatars">
                              {channelMembers.slice(0, Math.min(message.replyCount, 3)).map((m, i) => (
                                (() => {
                                  const tone = THREAD_AVATAR_PALETTE[m.userId % THREAD_AVATAR_PALETTE.length]
                                  return (
                                    <div
                                      className="thread-footer__avatar"
                                      key={m.userId}
                                      style={{ zIndex: 3 - i, background: tone.bg, color: tone.fg }}
                                      title={m.name}
                                    >
                                      {m.name.charAt(0).toUpperCase()}
                                    </div>
                                  )
                                })()
                              ))}
                            </div>
                            <span className="thread-footer__count">
                              <strong>{message.replyCount}</strong> {message.replyCount === 1 ? 'reply' : 'replies'}
                            </span>
                            <span className="thread-footer__cta">View thread →</span>
                          </button>
                        )}

                        {isSelectedDirectMessage && !hasClusterNext && (
                          <div className={`message-card__inline-footer ${isOwnMessage ? 'message-card__inline-footer--own' : ''}`}>
                            {message.isEdited && <span className="message-card__edited">edited</span>}
                            <time className="message-card__time message-card__time--inline">{timeOnlyLabel}</time>
                          </div>
                        )}
                      </div>

                      {/* Floating action bar — appears on hover */}
                      <div
                        className={`message-action-bar ${(messageMenuFor === message.id || emojiPickerFor === message.id) && messageMenuPlacement === 'above' ? 'message-action-bar--popover-above' : ''} ${(messageMenuFor === message.id || emojiPickerFor === message.id) ? `message-action-bar--popover-${messagePopoverAlign}` : ''}`}
                        ref={(emojiPickerFor === message.id || messageMenuFor === message.id) ? emojiPickerRef : undefined}
                      >
                        <div className="message-action-bar__inner">
                          {!isDeletedMessage && (
                            <>
                              <button
                                aria-controls={`message-reactions-${message.id}`}
                                aria-expanded={emojiPickerFor === message.id}
                                aria-haspopup="dialog"
                                aria-label="Add reaction"
                                className="message-action-bar__btn"
                                onClick={(e) => {
                                  const isOpen = emojiPickerFor === message.id
                                  const preferredAlign = isOwnMessage ? 'end' : 'start'
                                  setMessageMenuFor(null)
                                  setMessageMenuPlacement(isOpen ? 'below' : resolveMessageMenuPlacement(e.currentTarget, 380))
                                  setMessagePopoverAlign(isOpen ? 'start' : resolveMessagePopoverAlign(e.currentTarget, preferredAlign, 284))
                                  setEmojiPickerFor(isOpen ? null : message.id)
                                }}
                                title="React"
                                type="button"
                              >
                                <IcoSmile />
                              </button>
                              <button
                                aria-label="Reply in thread"
                                className="message-action-bar__btn"
                                onClick={() => {
                                  setEmojiPickerFor(null)
                                  setMessageMenuFor(null)
                                  setMessageMenuPlacement('below')
                                  setMessagePopoverAlign('start')
                                  onSelectThread(message.id)
                                }}
                                title="Reply in thread"
                                type="button"
                              >
                                <IcoReply />
                              </button>
                              <button
                                aria-controls={messageMenuId}
                                aria-expanded={messageMenuFor === message.id}
                                aria-haspopup="menu"
                                aria-label="More message actions"
                                className={`message-action-bar__btn ${messageMenuFor === message.id ? 'is-active' : ''}`}
                                onClick={(e) => {
                                  const isOpen = messageMenuFor === message.id
                                  const preferredAlign = isOwnMessage ? 'end' : 'start'
                                  setEmojiPickerFor(null)
                                  setMessageMenuPlacement(isOpen ? 'below' : resolveMessageMenuPlacement(e.currentTarget))
                                  setMessagePopoverAlign(isOpen ? 'start' : resolveMessagePopoverAlign(e.currentTarget, preferredAlign, 178))
                                  setMessageMenuFor(isOpen ? null : message.id)
                                }}
                                title="More actions"
                                type="button"
                              >
                                <span aria-hidden="true" className="message-action-bar__dots">···</span>
                              </button>
                            </>
                          )}
                          {isDeletedMessage && (
                            <button
                              aria-label="Delete from my view"
                              className="message-action-bar__btn message-action-bar__btn--danger"
                              onClick={() => {
                                setDeleteMessageError(null)
                                setDeletingMessageScope(null)
                                setDeleteTarget({
                                  id: message.id,
                                  content: message.content,
                                  authorName: message.authorName ?? 'User',
                                  canDeleteForAll: message.userId === currentUserId && !message.isDeletedForEveryone,
                                  isDeletedForEveryone: Boolean(message.isDeletedForEveryone),
                                })
                              }}
                              title="Delete from my view"
                              type="button"
                            >
                              <IcoTrash />
                            </button>
                          )}
                        </div>

                        {/* Secondary actions */}
                        {!isDeletedMessage && messageMenuFor === message.id && (
                          <div aria-label="Message actions" className="message-action-menu" id={messageMenuId} role="menu">
                            {message.userId === currentUserId && (
                              <button
                                className="message-action-menu__item"
                                onClick={() => startEdit(message)}
                                role="menuitem"
                                type="button"
                              >
                                <IcoPencil />
                                Edit message
                              </button>
                            )}
                            <button
                              className="message-action-menu__item"
                              onClick={() => {
                                setMessageMenuFor(null)
                                void onPinMessage(message.id)
                              }}
                              role="menuitem"
                              type="button"
                            >
                              <IcoPin />
                              {message.isPinned ? 'Unpin message' : 'Pin message'}
                            </button>
                            <button
                              className="message-action-menu__item"
                              onClick={() => {
                                setMessageMenuFor(null)
                                void onToggleSaveMessage(message.id, savedMessageIds.has(message.id))
                              }}
                              role="menuitem"
                              type="button"
                            >
                              {savedMessageIds.has(message.id) ? <IcoBookmarkFilled /> : <IcoBookmark />}
                              {savedMessageIds.has(message.id) ? 'Unsave' : 'Save for later'}
                            </button>
                            <button
                              className="message-action-menu__item"
                              onClick={() => {
                                setMessageMenuFor(null)
                                setReminderTarget({ messageId: message.id })
                                setReminderNote('')
                              }}
                              role="menuitem"
                              type="button"
                            >
                              <IcoClock />
                              Remind me
                            </button>
                            <button
                              aria-disabled={markedUnreadIds.has(message.id)}
                              className="message-action-menu__item"
                              disabled={markedUnreadIds.has(message.id)}
                              onClick={() => {
                                if (markedUnreadIds.has(message.id)) return
                                setMessageMenuFor(null)
                                setMarkedUnreadIds((prev) => new Set(prev).add(message.id))
                                void onMarkMessageUnread(message.id)
                              }}
                              role="menuitem"
                              type="button"
                            >
                              <IcoUnread />
                              {markedUnreadIds.has(message.id) ? 'Already unread' : 'Mark unread'}
                            </button>
                            <div className="message-action-menu__sep" />
                            <button
                              className="message-action-menu__item message-action-menu__item--danger"
                              onClick={() => {
                                setMessageMenuFor(null)
                                setDeleteMessageError(null)
                                setDeletingMessageScope(null)
                                setDeleteTarget({
                                  id: message.id,
                                  content: message.content,
                                  authorName: message.authorName ?? 'User',
                                  canDeleteForAll: message.userId === currentUserId && !message.isDeletedForEveryone,
                                  isDeletedForEveryone: Boolean(message.isDeletedForEveryone),
                                })
                              }}
                              role="menuitem"
                              type="button"
                            >
                              <IcoTrash />
                              Delete message
                            </button>
                          </div>
                        )}

                        {/* Emoji picker */}
                        {!isDeletedMessage && emojiPickerFor === message.id && (
                          <div aria-label="Select reaction" className="message-reaction-picker" id={`message-reactions-${message.id}`} role="dialog">
                            <EmojiPickerPanel
                              onSelect={(emoji) => {
                                onReactEmoji(message.id, emoji)
                                setEmojiPickerFor(null)
                                setMessageMenuPlacement('below')
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </article>
                    </React.Fragment>
                    )
                  })}
                </div>
              </div>
            ))}
            {/* DM read receipt */}
            {(() => {
              if (!selectedChannel || !currentUserId) return null
              // Only show for DM channels
              const isDm = parseDmPartnerId(selectedChannel.name, currentUserId) !== null
              if (!isDm) return null
              const partner = channelMembers.find((m) => m.userId !== currentUserId)
              if (!partner?.lastViewedAt) return null
              // Find last message sent by current user
              const myMessages = topLevelMessages.filter((m) => m.userId === currentUserId)
              if (myMessages.length === 0) return null
              const lastMine = myMessages[myMessages.length - 1]
              if (new Date(partner.lastViewedAt) >= new Date(lastMine.createdAt)) {
                return (
                  <div className="dm-seen-receipt">
                    <span>Seen</span>
                  </div>
                )
              }
              return null
            })()}
            {/* Sentinel for auto-scroll */}
            <div ref={messagesEndRef} style={{ height: 1 }} />
          </div>
        ) : (
          <div className="channel-empty-state">
            <div className="channel-empty-state__icon">
              {streamMode === 'threads' ? '↩' : streamMode === 'pinned' ? '📌' : streamMode === 'saved' ? '🔖' : '#'}
            </div>
            <p className="channel-empty-state__title">
              {streamMode === 'all'
                ? `No messages yet${selectedDmPartner ? ` with ${selectedDmPartner.name}` : ` in #${selectedChannel?.name ?? 'this channel'}`}`
                : streamMode === 'threads'
                  ? 'No threads yet'
                  : streamMode === 'pinned'
                    ? 'No pinned messages yet'
                    : 'No saved messages yet'}
            </p>
            <p className="channel-empty-state__sub">
              {streamMode === 'all'
                ? 'Start a conversation and build team collaboration context here.'
                : streamMode === 'threads'
                  ? 'Threads appear when members start replying in the context of a message.'
                  : streamMode === 'pinned'
                    ? 'Pin important messages so everyone can find them again easily.'
                    : 'Save messages you want to reference again later.'}
            </p>
          </div>
        )}

        {/* Slim composer (Slack-style) — hidden when no channel/DM is selected */}
        {(selectedChannel || selectedDmPartner) && (
        <form
          className={`composer-slim ${dragOver ? 'is-drag-over' : ''}`}
          onDragLeave={() => setDragOver(false)}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDrop={handleDrop}
          onSubmit={(e) => {
            e.preventDefault()
            if (!selectedChannelId || sending) return
            if (!composerValue.trim() && pendingAttachments.length === 0) return
            const sent = pendingAttachments
            onSendMessage(e, sent.length > 0 ? sent : undefined)
            setPendingAttachments([])
            setUploadError(null)
          }}
        >
          {dragOver && (
            <div className="composer-slim__drop-overlay"><IcoPaperclip /> Drop files to attach</div>
          )}
          <input
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.md"
            hidden
            multiple
            onChange={handleFileSelected}
            ref={fileInputRef}
            type="file"
          />
          {uploadError && (
            <div className="composer-slim__error"><IcoWarning /> {uploadError}</div>
          )}
          {pendingAttachments.length > 0 && (
            <div className="attachment-tray">
              {pendingAttachments.map((att, idx) => (
                <div className={`attachment-chip ${att.type.startsWith('image/') ? 'attachment-chip--image' : ''}`} key={`${att.url}-${idx}`}>
                  {att.type.startsWith('image/') ? (
                    <img alt={att.name} src={att.url} />
                  ) : (
                    <span className="attachment-chip__icon">📄</span>
                  )}
                  <div className="attachment-chip__meta">
                    <strong>{att.name}</strong>
                    {att.size && <span>{(att.size / 1024).toFixed(0)} KB</span>}
                  </div>
                  <button
                    className="attachment-chip__remove"
                    onClick={() => removeAttachment(idx)}
                    title="Remove"
                    type="button"
                  >
                    <IcoClose />
                  </button>
                </div>
              ))}
              {uploadingFiles && <div className="attachment-tray__uploading">Uploading…</div>}
            </div>
          )}
          {/* Typing indicator (above input) */}
          {typingUsers.length > 0 && (
            <div className="typing-indicator typing-indicator--above">
              <span className="typing-indicator__dots">
                <span /><span /><span />
              </span>
              <span className="typing-indicator__label">{formatTypingLabel(typingUsers)}</span>
            </div>
          )}

          {selectedThreadId && threadParent && (
            <div className="composer-slim__context">
              <span>↩</span>
              <span>Replying to <strong>{threadParent.authorName ?? 'thread'}</strong></span>
            </div>
          )}

          <div className="composer-slim__box">
            {showFormatting && (
              <div className="composer-slim__format-bar">
                <button className="composer-slim__fmt-btn" onClick={() => wrapSelection('**')} title="Bold (⌘B)" type="button"><strong>B</strong></button>
                <button className="composer-slim__fmt-btn" onClick={() => wrapSelection('_')} title="Italic (⌘I)" type="button"><em>I</em></button>
                <button className="composer-slim__fmt-btn" onClick={() => wrapSelection('~')} title="Strikethrough" type="button"><s>S</s></button>
                <button className="composer-slim__fmt-btn" onClick={() => wrapSelection('`')} title="Inline code" type="button"><code>{'<>'}</code></button>
                <span className="composer-slim__fmt-sep" />
                <button className="composer-slim__fmt-btn" onClick={() => prefixEachLine('- ')} title="Bullet list" type="button">•</button>
                <button className="composer-slim__fmt-btn" onClick={() => prefixEachLine('> ')} title="Quote" type="button">❝</button>
                <button className="composer-slim__fmt-btn" onClick={() => wrapSelection('```\n', '\n```')} title="Code block" type="button">{'{}'}</button>
                <span className="composer-slim__fmt-sep" />
                <button className="composer-slim__fmt-btn" onClick={() => onComposerChange(composerValue + '[Decision] ')} title="Insert Decision tag" type="button"><IcoDecision /></button>
                <button className="composer-slim__fmt-btn" onClick={() => onComposerChange(composerValue + '[Blocker] ')} title="Insert Blocker tag" type="button"><IcoBlocker /></button>
              </div>
            )}
            <div className="composer-input-wrap" ref={composerInputWrapRef}>
              <textarea
                aria-activedescendant={mentionActiveDescendant ?? wiActiveDescendant}
                aria-autocomplete="list"
                aria-controls={
                  mentionState.active
                    ? 'composer-mention-listbox'
                    : wiMentionState.active
                      ? 'composer-work-item-listbox'
                      : undefined
                }
                aria-expanded={mentionState.active || wiMentionState.active}
                aria-haspopup="listbox"
                className="composer-slim__textarea"
                onChange={(e) => handleComposerInput(e.target.value, e.target.selectionStart)}
                onKeyDown={(e) => {
                  handleComposerKeyDown(e)
                  // Enter to send — but not when any autocomplete dropdown is active
                  if (!mentionState.active && !wiMentionState.active && e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (selectedChannelId && !sending && (composerValue.trim() || pendingAttachments.length > 0)) {
                      // Trigger the form submit so all cleanup (attachments, error) runs
                      e.currentTarget.form?.requestSubmit()
                    }
                  }
                }}
                placeholder={
                  selectedChannel
                    ? selectedThreadId
                      ? `Reply…`
                      : selectedDmPartner
                        ? `Message ${selectedDmPartner.name}`
                        : `Message #${selectedChannel.name}`
                    : 'Select a channel to start messaging'
                }
                ref={composerRef}
                rows={1}
                value={composerValue}
              />
              {mentionState.active && (
                <div aria-label="Mention suggestions" className="mention-dropdown" id="composer-mention-listbox" ref={mentionDropdownRef} role="listbox">
                  {filteredSpecialMentions.length > 0 && (
                    <>
                      <p className="mention-dropdown__label" role="presentation">Notify groups</p>
                      {filteredSpecialMentions.map((sp, idx) => (
                        <button
                          aria-selected={idx === mentionState.activeIdx}
                          className={`mention-dropdown__item mention-dropdown__item--special ${idx === mentionState.activeIdx ? 'is-active' : ''}`}
                          id={`composer-mention-special-${sp.key}`}
                          key={sp.key}
                          onClick={() => insertMention(sp.key)}
                          onMouseEnter={() => setMentionState((s) => ({ ...s, activeIdx: idx }))}
                          onMouseDown={(e) => e.preventDefault()}
                          role="option"
                          type="button"
                        >
                          <span className="mention-dropdown__special-icon">📣</span>
                          <div>
                            <strong>@{sp.label}</strong>
                            <span>{sp.desc}</span>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                  {filteredMentionMembers.length > 0 && (
                    <>
                      <p className="mention-dropdown__label" role="presentation">People in this channel</p>
                      {filteredMentionMembers.map((member, idx) => {
                        const realIdx = filteredSpecialMentions.length + idx
                        return (
                          <button
                            aria-selected={realIdx === mentionState.activeIdx}
                            className={`mention-dropdown__item ${realIdx === mentionState.activeIdx ? 'is-active' : ''}`}
                            id={`composer-mention-member-${member.userId}`}
                            key={member.userId}
                            onClick={() => insertMention(member.name)}
                            onMouseEnter={() => setMentionState((s) => ({ ...s, activeIdx: realIdx }))}
                            onMouseDown={(e) => e.preventDefault()}
                            role="option"
                            type="button"
                          >
                            <Avatar name={member.name} />
                            <div>
                              <strong>{member.name}</strong>
                              <span>{formatRoleLabel(member.roleType)}</span>
                            </div>
                          </button>
                        )
                      })}
                    </>
                  )}
                  {filteredSpecialMentions.length === 0 && filteredMentionMembers.length === 0 && (
                    <div className="mention-dropdown__empty">
                      No matching mentions.
                    </div>
                  )}
                </div>
              )}

              {/* Work item mention dropdown */}
              {wiMentionState.active && (
                <div aria-label="Work item suggestions" className="mention-dropdown" id="composer-work-item-listbox" ref={wiDropdownRef} role="listbox">
                  {filteredTasks.length > 0 ? (
                    <>
                      <p className="mention-dropdown__label" role="presentation">Work items</p>
                      {filteredTasks.map((wi, idx) => (
                        <button
                          aria-selected={idx === wiMentionState.activeIdx}
                          className={`mention-dropdown__item mention-dropdown__item--wi ${idx === wiMentionState.activeIdx ? 'is-active' : ''}`}
                          id={`composer-work-item-${wi.id}`}
                          key={wi.id}
                          onClick={() => insertTask(wi)}
                          onMouseEnter={() => setWiMentionState((s) => ({ ...s, activeIdx: idx }))}
                          onMouseDown={(e) => e.preventDefault()}
                          role="option"
                          type="button"
                        >
                          <span className="mention-dropdown__wi-icon">
                            <svg fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 16 16" width="13">
                              <rect height="11" rx="1.5" width="10" x="3" y="2.5" /><path d="M6 2.5h4v2H6zM5.5 7h5M5.5 10h5" />
                            </svg>
                          </span>
                          <div>
                            <strong>{wi.code}</strong>
                            <span>{wi.title}</span>
                          </div>
                          <span className={`badge badge--soft mention-dropdown__wi-status mention-dropdown__wi-status--${wi.status.toLowerCase()}`}>{wi.status}</span>
                        </button>
                      ))}
                    </>
                  ) : (
                    <div className="mention-dropdown__empty">
                      No matching work items.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="composer-slim__toolbar">
              <div className="composer-slim__tools">
                <button
                  className={`composer-slim__icon-btn${showFormatting ? ' is-active' : ''}`}
                  onClick={() => setShowFormatting((value) => !value)}
                  title={showFormatting ? 'Hide formatting tools' : 'Show formatting tools'}
                  type="button"
                >
                  <span className="composer-slim__fmt-toggle-label">Aa</span>
                </button>
                <button
                  className="composer-slim__icon-btn"
                  disabled={uploadingFiles}
                  onClick={handleFilePick}
                  title="Attach file"
                  type="button"
                >
                  <IcoPaperclip />
                </button>
                <div ref={composerEmojiRef}>
                  <button
                    ref={composerEmojiBtnRef}
                    className={`composer-slim__icon-btn${showComposerEmoji ? ' composer-slim__icon-btn--active' : ''}`}
                    onClick={() => {
                      if (showComposerEmoji) { setShowComposerEmoji(false); return }
                      const btn = composerEmojiBtnRef.current
                      if (btn) {
                        const rect = btn.getBoundingClientRect()
                        setEmojiPickerPos({ bottom: window.innerHeight - rect.top + 8, left: rect.left })
                      }
                      setShowComposerEmoji(true)
                    }}
                    title="Add emoji"
                    type="button"
                  >
                    <IcoSmile />
                  </button>
                </div>
                <button
                  className="composer-slim__icon-btn"
                  onClick={openMentionAutocomplete}
                  title="Mention someone"
                  type="button"
                >
                  <span className="composer-slim__at">@</span>
                </button>
              </div>
              <span className="composer-slim__helper">Enter to send · Shift+Enter for a new line</span>
              <button
                className="composer-slim__send"
                disabled={!selectedChannelId || sending || (!composerValue.trim() && pendingAttachments.length === 0)}
                title="Send (Enter)"
                type="submit"
              >
                <svg fill="none" height="15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 16 16" width="15" style={{ opacity: sending ? 0.5 : 1 }}>
                  <path d="M2 8h10M8 4l6 4-6 4" />
                </svg>
              </button>
            </div>
          </div>
        </form>
        )}
      </main>

      {/* ── Activity / mentions panel ── */}
      {showActivity && !selectedThreadId && (
        <aside className="panel activity-panel">
          <div className="activity-panel__header">
            <div>
              <h4 className="activity-panel__title">Mentions &amp; Activity</h4>
              <span className="activity-panel__sub">#{selectedChannel?.name ?? 'channel'}</span>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowActivity(false)} type="button">
              <IcoClose />
            </button>
          </div>
          {mentionMessages.length === 0 ? (
            <div className="activity-panel__empty">
              <div className="activity-panel__empty-icon">🔔</div>
              <p>No mentions in this channel yet.</p>
              <span>Messages that @mention you or use @channel will appear here.</span>
            </div>
          ) : (
            <div className="activity-panel__list">
              {mentionMessages.map((m) => (
                <div
                  className="activity-item"
                  key={m.id}
                  onClick={() => { setShowActivity(false); onSelectThread(m.id) }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="activity-item__meta">
                    <strong>{m.authorName ?? 'Unknown'}</strong>
                    <span className="ch-role-badge">{m.authorRole}</span>
                    <span className="activity-item__time">{relativeTime(m.createdAt)}</span>
                  </div>
                  <div className="activity-item__text">
                    <RichTextPreview compact currentUserName={currentUserName} emptyText="" mentionNames={memberNames} taskCodes={taskCodes} value={m.content} />
                  </div>
                  {m.replyCount > 0 && (
                    <span className="activity-item__replies">↩ {m.replyCount} {m.replyCount === 1 ? 'reply' : 'replies'}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      )}

      {/* ── Thread / members panel (toggleable, like Slack) ── */}
      {(selectedThreadId || showRightPanel) && (
      <aside className="panel thread-panel thread-panel--polished">
        {selectedThreadId && threadParent ? (
          <>
            {/* Thread panel header */}
            <div className="thread-panel-header">
              <div className="thread-panel-header__title">
                <span className="eyebrow">Thread</span>
                <strong>{selectedDmPartner ? selectedDmPartner.name : `#${selectedChannel?.name ?? 'channel'}`}</strong>
                <div className="thread-panel-header__meta">
                  <span>{threadReplies.length > 0 ? `${threadReplies.length} ${threadReplies.length === 1 ? 'reply' : 'replies'}` : 'No replies yet'}</span>
                  <span>{isSelectedDirectMessage ? 'Private conversation' : 'Channel context'}</span>
                </div>
              </div>
              <button
                className="panel-close-btn"
                onClick={() => { onSelectThread(null); setThreadReplyValue('') }}
                title="Close thread (Esc)"
                type="button"
              >
                <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 12 12" width="10"><path d="m1 1 10 10M11 1 1 11" /></svg>
                <kbd>Esc</kbd>
              </button>
            </div>

            {/* Scrollable thread messages */}
            <div className="thread-stack">
              {/* Parent message */}
              <article className={`thread-root thread-root--featured ${threadParent.userId === currentUserId ? 'thread-root--own' : ''}`}>
                <div className="message-card__meta">
                  <div>
                    <strong>{threadParent.authorName ?? 'Unknown'}</strong>
                    {!isSelectedDirectMessage && <span className="ch-role-badge">{threadParent.authorRole ?? 'Contributor'}</span>}
                  </div>
                  <span>{formatDate(threadParent.createdAt)}</span>
                </div>
                {threadParent.isDeletedForEveryone ? (
                  <DeletedMessageNotice
                    content={threadParent.content}
                    isOwnMessage={threadParent.userId === currentUserId}
                  />
                ) : (
                  <RichTextPreview compact currentUserName={currentUserName} emptyText="" mentionNames={memberNames}
              taskCodes={taskCodes} value={threadParent.content} />
                )}
              </article>

              {/* Reply count divider */}
              {threadReplies.length > 0 && (
                <div className="thread-replies-divider">
                  <span>{threadReplies.length} {threadReplies.length === 1 ? 'reply' : 'replies'}</span>
                </div>
              )}

              {/* Replies */}
              {threadReplies.length > 0 ? (
                threadReplies.map((reply) => (
                  <article className={`thread-reply ${reply.userId === currentUserId ? 'thread-reply--own' : ''}`} key={reply.id}>
                    <div className="message-card__meta">
                      <div>
                        <strong>{reply.authorName ?? 'Unknown'}</strong>
                        {!isSelectedDirectMessage && <span className="ch-role-badge">{reply.authorRole ?? 'Contributor'}</span>}
                      </div>
                      <span>{formatDate(reply.createdAt)}</span>
                    </div>
                    {reply.isDeletedForEveryone ? (
                      <DeletedMessageNotice
                        content={reply.content}
                        isOwnMessage={reply.userId === currentUserId}
                      />
                    ) : (
                      <RichTextPreview compact currentUserName={currentUserName} emptyText="" mentionNames={memberNames}
              taskCodes={taskCodes} value={reply.content} />
                    )}
                  </article>
                ))
              ) : (
                <SectionState icon="↩️" title="No replies yet" text="Be the first to reply in this thread." compact />
              )}
            </div>

            {/* Thread composer — sticky at bottom */}
            <div className="thread-composer">
              <div className="thread-composer__meta">
                <span className="subtle">
                  Replying to <strong>{threadParent.authorName ?? 'this message'}</strong>
                </span>
              </div>
              <textarea
                className="thread-composer__input"
                disabled={sendingThreadReply}
                onChange={(e) => setThreadReplyValue(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    const content = threadReplyValue.trim()
                    if (!content || sendingThreadReply) return
                    setSendingThreadReply(true)
                    try {
                      await onSendThreadReply(selectedThreadId, content, alsoToChannel)
                      setThreadReplyValue('')
                      setAlsoToChannel(false)
                    } finally {
                      setSendingThreadReply(false)
                    }
                  }
                }}
                placeholder="Write a reply in the thread…"
                ref={threadReplyRef}
                rows={3}
                value={threadReplyValue}
              />
              <label className="thread-composer__also">
                <input
                  checked={alsoToChannel}
                  onChange={(e) => setAlsoToChannel(e.target.checked)}
                  type="checkbox"
                />
                <span>Also send to <strong>#{selectedChannel?.name}</strong></span>
              </label>
              <div className="thread-composer__actions">
                <span className="subtle">Cmd/Ctrl+Enter to send</span>
                <button
                  className="btn btn--primary btn--sm"
                  disabled={sendingThreadReply || !threadReplyValue.trim()}
                  onClick={async () => {
                    const content = threadReplyValue.trim()
                    if (!content || sendingThreadReply) return
                    setSendingThreadReply(true)
                    try {
                      await onSendThreadReply(selectedThreadId, content, alsoToChannel)
                      setThreadReplyValue('')
                      setAlsoToChannel(false)
                      threadReplyRef.current?.focus()
                    } finally {
                      setSendingThreadReply(false)
                    }
                  }}
                  type="button"
                >
                  {sendingThreadReply ? 'Sending…' : 'Reply'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <PanelHeader onClose={() => setShowRightPanel(false)} subtitle={`${channelMembers.length} members`} title="People in channel" />

            {/* Add member */}
            {selectedChannelId && canManageChannelMembers && (
              <div className="member-add-section">
                <input
                  className="member-add-section__search"
                  onChange={(e) => setMemberQuery(e.target.value)}
                  placeholder="Add member…"
                  value={memberQuery}
                />
                {memberQuery.trim() && filteredAddableUsers.length > 0 && (
                  <div className="member-add-section__results">
                    {filteredAddableUsers.map((user) => (
                      <button
                        className="member-add-section__result"
                        disabled={addingMemberId === user.id}
                        key={user.id}
                        onClick={async () => {
                          setAddingMemberId(user.id)
                          try {
                            await onAddMember(selectedChannelId, user.id)
                            setMemberQuery('')
                          } finally {
                            setAddingMemberId(null)
                          }
                        }}
                        type="button"
                      >
                        <Avatar name={user.name} />
                        <div>
                          <strong>{user.name}</strong>
                          <span>{formatRoleLabel(user.roleType)}</span>
                        </div>
                        <span className="member-add-section__add-icon">
                          {addingMemberId === user.id ? '…' : '+'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {memberQuery.trim() && filteredAddableUsers.length === 0 && (
                  <p className="member-add-section__empty subtle">No users found</p>
                )}
              </div>
            )}
            {selectedChannelId && isSelectedDirectMessage && (
              <p className="member-add-section__empty subtle">Direct messages can only be managed by each participant for themselves.</p>
            )}
            {selectedChannelId && !isSelectedDirectMessage && !canManageChannelMembers && (
              <p className="member-add-section__empty subtle">Only the channel creator or an admin can add or remove members.</p>
            )}

            {/* Current member list */}
            {channelMembers.length > 0 ? (
              <div className="presence-list">
                {channelMembers.map((member) => (
                  <div className="member-row member-row--channel member-row--manageable" key={member.userId}>
                    <Avatar name={member.name} />
                    <div>
                      <strong>{member.name}</strong>
                      <p>
                        {formatRoleLabel(member.roleType)}
                        {member.status ? ` · ${member.status}` : ''}
                      </p>
                    </div>
                    {member.userId !== currentUserId && selectedChannelId && canManageChannelMembers && (
                      <button
                        className="member-remove-btn"
                        disabled={removingMemberId === member.userId}
                        onClick={() => {
                          setRemoveMemberError(null)
                          setConfirmRemoveMember({ userId: member.userId, name: member.name })
                        }}
                        title={`Remove ${member.name} from channel`}
                        type="button"
                      >
                        {removingMemberId === member.userId ? '…' : <IcoClose />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <SectionState title="No member details yet" text="Open a channel to inspect the member list." compact />
            )}
          </>
        )}
      </aside>
      )}
      {/* ── Quick switcher (Cmd+K) ──────────────────────────── */}
      {/* Phase 5B: portal-mount semua 4 modal (switcher, browse, DM, create)
          ke document.body. Sebelumnya inline → ter-scope ke .ds (yang akan
          dapat ds-stagger transform). Sekarang modal escape ke viewport. */}
      {showSwitcher && createPortal(
        <div className="modal-backdrop modal-backdrop--top" onClick={(e) => { if (e.target === e.currentTarget) setShowSwitcher(false) }}>
          <div aria-label="Quick switcher" aria-modal="true" className="switcher" ref={switcherDialogRef} role="dialog" tabIndex={-1}>
            <div className="switcher__input-wrap">
              <span className="switcher__icon">⌘</span>
              <input
                autoFocus
                onChange={(e) => { setSwitcherQuery(e.target.value); setSwitcherIdx(0) }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSwitcherIdx((i) => Math.min(i + 1, switcherItems.length - 1)) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setSwitcherIdx((i) => Math.max(i - 1, 0)) }
                  else if (e.key === 'Enter') {
                    const target = switcherItems[switcherIdx]
                    if (target) {
                      onSelectChannel(target.channel.id)
                      setShowSwitcher(false)
                    }
                  }
                }}
                placeholder="Jump to a channel or DM…"
                value={switcherQuery}
              />
              <span className="switcher__hint">ESC</span>
            </div>
            <div className="switcher__list">
              {switcherItems.length === 0 && <p className="subtle" style={{ padding: '12px', margin: 0 }}>No matching results.</p>}
              {switcherItems.map((it, idx) => (
                <button
                  className={`switcher__item ${idx === switcherIdx ? 'is-active' : ''}`}
                  key={it.channel.id}
                  onClick={() => { onSelectChannel(it.channel.id); setShowSwitcher(false) }}
                  onMouseEnter={() => setSwitcherIdx(idx)}
                  type="button"
                >
                  <span className="switcher__item-icon">
                    {it.kind === 'dm' ? <Avatar name={it.displayName} /> : (it.channel.type === 'PRIVATE' ? <IcoLock /> : '#')}
                  </span>
                  <span className="switcher__item-name">{it.displayName}</span>
                  {it.channel.unreadCount > 0 && <span className="channel-row__unread">{it.channel.unreadCount}</span>}
                  {idx === switcherIdx && <span className="switcher__item-enter">↵</span>}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Channel browser modal ───────────────────────────── */}
      {showBrowse && createPortal(
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowBrowse(false) }}>
          <div aria-describedby={browseDescId} aria-labelledby={browseTitleId} aria-modal="true" className="modal modal--wide" ref={browseDialogRef} role="dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Channels</span>
                <h3 className="modal__title" id={browseTitleId}>Browse Channels</h3>
                <p className="modal-subtitle" id={browseDescId}>Explore available channels, check their activity, then open or join them from one place.</p>
              </div>
              <button className="modal__close" onClick={() => setShowBrowse(false)} type="button"><IcoClose /></button>
            </div>
            <div className="modal__body">
              <section className="modal-section modal-section--soft">
                <div className="modal-section__intro">
                  <h4>Search channels</h4>
                  <p>Use a name or description to find the most relevant discussion space.</p>
                </div>
                <input
                  autoFocus
                  onChange={(e) => setBrowseQuery(e.target.value)}
                  placeholder="Search channels by name or description…"
                  value={browseQuery}
                />
              </section>
              <section className="modal-section">
                <div className="modal-keyline">
                  <span>{filteredBrowseList.length} channels shown</span>
                  <span>{browseLoading ? 'Loading list…' : 'Select a channel to join or open directly.'}</span>
                </div>
                <div className="browse-list">
                {browseLoading && <p className="subtle">Loading…</p>}
                {!browseLoading && filteredBrowseList.length === 0 && (
                  <div className="modal-empty">No matching channels.</div>
                )}
                {filteredBrowseList.map((c) => (
                  <div className="browse-row" key={c.id}>
                    <div className="browse-row__main">
                      <div className="browse-row__title">
                        <span className="browse-row__hash">#</span>
                        <strong>{c.name}</strong>
                        {c.isMember && <span className="badge badge--soft">Joined</span>}
                      </div>
                      {c.description && <p>{c.description}</p>}
                      <div className="browse-row__meta subtle">
                        {c.memberCount} members · {c.messageCount} messages
                      </div>
                    </div>
                    {c.isMember ? (
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => { onSelectChannel(c.id); setShowBrowse(false) }}
                        type="button"
                      >
                        Open
                      </button>
                    ) : (
                      <button
                        className="btn btn--primary btn--sm"
                        disabled={joiningId === c.id}
                        onClick={async () => {
                          setJoiningId(c.id)
                          try {
                            await onJoinChannel(c.id)
                            setBrowseList((prev) => prev.map((b) => b.id === c.id ? { ...b, isMember: true, memberCount: b.memberCount + 1 } : b))
                          } finally {
                            setJoiningId(null)
                          }
                        }}
                        type="button"
                      >
                        {joiningId === c.id ? 'Joining…' : 'Join'}
                      </button>
                    )}
                  </div>
                ))}
                </div>
              </section>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── New DM modal ────────────────────────────────────── */}
      {showDmModal && createPortal(
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowDmModal(false) }}>
          <div aria-describedby={directMessageDescId} aria-labelledby={directMessageTitleId} aria-modal="true" className="modal" ref={directMessageDialogRef} role="dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Channels</span>
                <h3 className="modal__title" id={directMessageTitleId}>New Direct Message</h3>
                <p className="modal-subtitle" id={directMessageDescId}>Start a private conversation by searching for a teammate's name or role.</p>
              </div>
              <button className="modal__close" onClick={() => setShowDmModal(false)} type="button"><IcoClose /></button>
            </div>
            <div className="modal__body">
              <section className="modal-section modal-section--soft">
                <div className="modal-section__intro">
                  <h4>Select recipient</h4>
                  <p>Search for a person by name or role to open a new direct message right away.</p>
                </div>
                <div className="form-field">
                  <label>To</label>
                  <input
                    autoFocus
                    onChange={(e) => setDmQuery(e.target.value)}
                    placeholder="Search by name or role…"
                    value={dmQuery}
                  />
                </div>
              </section>
              <section className="modal-section">
                <div className="modal-keyline">
                  <span>{dmCandidates.length} candidates</span>
                  <span>{openingDm ? 'Opening conversation…' : 'Select a person to continue.'}</span>
                </div>
                <div className="dm-candidates">
                {dmCandidates.length === 0 ? (
                  <div className="modal-empty">No matching users.</div>
                ) : (
                  dmCandidates.map((u) => (
                    <button
                      className="dm-candidate"
                      disabled={openingDm}
                      key={u.id}
                      onClick={async () => {
                        setOpeningDm(true)
                        try {
                          await onOpenDM(u.id)
                          setShowDmModal(false)
                          setDmQuery('')
                        } finally {
                          setOpeningDm(false)
                        }
                      }}
                      type="button"
                    >
                      <Avatar name={u.name} />
                      <div>
                        <strong>{u.name}</strong>
                        <span>{formatRoleLabel(u.roleType)}</span>
                      </div>
                    </button>
                  ))
                )}
                </div>
              </section>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Create channel modal ────────────────────────────── */}
      {showCreateModal && createPortal(
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false) }}>
          <div aria-describedby={createChannelDescId} aria-labelledby={createChannelTitleId} aria-modal="true" className="modal" ref={createChannelDialogRef} role="dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <div className="modal-headcopy">
                <span className="modal-kicker">Channels</span>
                <h3 className="modal__title" id={createChannelTitleId}>Create Channel</h3>
                <p className="modal-subtitle" id={createChannelDescId}>Create a new discussion space with a clear name, a short description, and the right visibility.</p>
              </div>
              <button className="modal__close" onClick={() => setShowCreateModal(false)} type="button"><IcoClose /></button>
            </div>
            <div className="modal__body">
              <section className="modal-section">
                <div className="modal-section__intro">
                  <h4>Channel identity</h4>
                  <p>The name and description should be specific enough that members immediately know what this channel is for.</p>
                </div>
                <div className="form-field">
                  <label>Channel name <span className="form-field__required">*</span></label>
                  <input
                    autoFocus
                    maxLength={80}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: slugifyChannelName(e.target.value) }))}
                    placeholder="e.g. sgn-penyehatan"
                    value={createForm.name}
                  />
                  <p className="form-field__hint">Capital letters and spaces are converted automatically — just type naturally.</p>
                </div>
                <div className="form-field">
                  <label>Description</label>
                  <input
                    maxLength={280}
                    onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="What's this channel about?"
                    value={createForm.description}
                  />
                </div>
              </section>
              <section className="modal-section modal-section--soft">
                <div className="modal-section__intro">
                  <h4>Visibility</h4>
                  <p>Decide whether this channel is open to the entire workspace or only to invited members.</p>
                </div>
                <div className="form-field">
                  <label>Visibility</label>
                  <div className="channel-type-toggle">
                    {(['PUBLIC', 'PRIVATE'] as const).map((t) => (
                      <button
                        className={`channel-type-toggle__btn ${createForm.type === t ? 'is-active' : ''}`}
                        key={t}
                        onClick={() => setCreateForm((f) => ({ ...f, type: t }))}
                        type="button"
                      >
                        {t === 'PUBLIC' ? <><IcoGlobe /> Public</> : <><IcoLock /> Private</>}
                      </button>
                    ))}
                  </div>
                  <p className="form-field__hint">
                    {createForm.type === 'PUBLIC' ? 'Everyone in the workspace can join.' : 'Only invited members can see this channel.'}
                  </p>
                </div>
              </section>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => setShowCreateModal(false)} type="button">Cancel</button>
              <button
                className="btn btn--primary"
                disabled={creatingChannel || !createForm.name.trim()}
                onClick={async () => {
                  setCreatingChannel(true)
                  try {
                    await onCreateChannel({
                      name: createForm.name.trim(),
                      description: createForm.description.trim() || undefined,
                      type: createForm.type,
                    })
                    setShowCreateModal(false)
                    setCreateForm({ name: '', description: '', type: 'PUBLIC' })
                  } finally {
                    setCreatingChannel(false)
                  }
                }}
                type="button"
              >
                {creatingChannel ? 'Creating…' : 'Create channel'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>

    {/* ── Sidebar context menu (portal → document.body, position: fixed) ── */}
    {contextMenu && createPortal((() => {
      const ch = channels.find((c) => c.id === contextMenu.channelId)
      const muted = isChannelMuted(contextMenu.channelId)
      const starred = ch?.isStarred ?? false
      const unread = ch?.unreadCount ?? 0
      const chName = contextMenu.isDm
        ? (dmEntries.find((d) => d.channel.id === contextMenu.channelId)?.partner?.name ?? 'this conversation')
        : (ch?.name ?? 'this channel')
      return (
        <div
          className="channel-ctx-menu"
          ref={contextMenuRef}
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {!contextMenu.confirming ? (
            <>
              {!contextMenu.isDm && (
                <button
                  className="channel-ctx-menu__item"
                  onClick={() => { void onToggleStar(contextMenu.channelId, !starred); setContextMenu(null) }}
                  type="button"
                >
                  {starred ? <IcoStarFilled /> : <IcoStarOutline />}
                  {starred ? 'Unstar' : 'Star'}
                </button>
              )}
              <button
                className="channel-ctx-menu__item"
                onClick={() => { void onToggleMuteChannel(contextMenu.channelId, !muted); setContextMenu(null) }}
                type="button"
              >
                <IcoMute />
                {muted ? 'Unmute' : 'Mute'}
              </button>
              {unread > 0 && (
                <button
                  className="channel-ctx-menu__item"
                  onClick={() => { onMarkAsRead(contextMenu.channelId); setContextMenu(null) }}
                  type="button"
                >
                  <span style={{ fontSize: 11 }}>✓</span>
                  Mark as read
                </button>
              )}
              <div className="channel-ctx-menu__sep" />
              <button
                className="channel-ctx-menu__item channel-ctx-menu__item--danger"
                onClick={() => setContextMenu((prev) => prev ? { ...prev, confirming: true } : null)}
                type="button"
              >
                {contextMenu.isDm ? <IcoClose /> : <span style={{ fontSize: 11 }}>↩</span>}
                {contextMenu.isDm ? 'Close conversation' : 'Leave channel'}
              </button>
            </>
          ) : (
            <div className="channel-ctx-menu__confirm">
              <p>{contextMenu.isDm ? `Close conversation with ${chName}?` : `Leave #${chName}?`}</p>
              <div className="channel-ctx-menu__confirm-actions">
                <button onClick={() => setContextMenu((prev) => prev ? { ...prev, confirming: false } : null)} type="button">
                  Cancel
                </button>
                <button
                  className="is-danger"
                  onClick={async () => {
                    const id = contextMenu.channelId
                    setContextMenu(null)
                    await onLeaveChannel(id)
                  }}
                  type="button"
                >
                  {contextMenu.isDm ? 'Close' : 'Leave'}
                </button>
              </div>
            </div>
          )}
        </div>
      )
    })(), document.body)}

    {/* ── Reminder modal ── */}
    {reminderTarget && createPortal(
      <div className="modal-overlay" onClick={() => setReminderTarget(null)}>
        <div aria-describedby={reminderDescId} aria-labelledby={reminderTitleId} aria-modal="true" className="modal-box remind-modal" ref={reminderDialogRef} role="dialog" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
          <div className="modal-box__header">
            <div className="modal-headcopy">
              <span className="modal-kicker">Channels</span>
              <strong className="modal-title" id={reminderTitleId}>Remind Me About This Message</strong>
              <p className="modal-subtitle" id={reminderDescId}>Pick a reminder time now and add a short note if needed.</p>
            </div>
            <button className="modal-box__close" onClick={() => setReminderTarget(null)} type="button"><IcoClose /></button>
          </div>
          <div className="modal-body">
            <div className="remind-modal__options">
              {[
                { label: 'In 20 minutes', ms: 20 * 60_000 },
                { label: 'In 1 hour', ms: 60 * 60_000 },
                { label: 'In 3 hours', ms: 3 * 60 * 60_000 },
                { label: 'Tomorrow morning (09:00)', ms: (() => {
                  const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0); return t.getTime() - Date.now()
                })() },
                { label: 'Next Monday (09:00)', ms: (() => {
                  const t = new Date(); const dow = t.getDay(); const daysUntilMon = (8 - dow) % 7 || 7
                  t.setDate(t.getDate() + daysUntilMon); t.setHours(9, 0, 0, 0); return t.getTime() - Date.now()
                })() },
              ].map(({ label, ms }) => (
                <button
                  className="remind-modal__option"
                  disabled={reminderSaving}
                  key={label}
                  onClick={async () => {
                    setReminderSaving(true)
                    try {
                      await onRemindMessage(reminderTarget.messageId, new Date(Date.now() + ms), reminderNote || undefined)
                      setReminderTarget(null)
                    } finally { setReminderSaving(false) }
                  }}
                  type="button"
                >
                  <IcoClock /> {label}
                </button>
              ))}
            </div>
          </div>
          <div className="modal-footer remind-modal__note">
            <p className="remind-modal__note-copy">An optional note helps you remember why this message matters when the reminder appears later.</p>
            <input
              maxLength={160}
              onChange={(e) => setReminderNote(e.target.value)}
              placeholder="Optional note..."
              type="text"
              value={reminderNote}
            />
          </div>
        </div>
      </div>,
      document.getElementById('workspace-modal-root') ?? document.body,
    )}
    {/* ── Confirm Delete Message ── */}
    {deleteTarget && createPortal(
      <div className="modal-backdrop" onClick={() => { setDeleteTarget(null); setDeleteMessageError(null); setDeletingMessageScope(null) }}>
        <div
          aria-describedby={deleteConfirmDescId}
          aria-labelledby={deleteConfirmTitleId}
          aria-modal="true"
          className="modal schedule-modal schedule-modal--confirm"
          onClick={(e) => e.stopPropagation()}
          ref={deleteConfirmRef}
          role="dialog"
          tabIndex={-1}
        >
          <div className="modal__header">
            <div className="modal-headcopy">
              <h3 className="modal__title" id={deleteConfirmTitleId}>Delete Message?</h3>
              <p className="modal-subtitle" id={deleteConfirmDescId}>
                {deleteTarget.canDeleteForAll
                  ? `Choose whether the message only disappears from your view or is replaced with a "This message was deleted." trace for ${isSelectedDirectMessage ? 'everyone in the conversation' : 'all channel members'}.`
                  : `This message from ${deleteTarget.authorName} will only disappear from your view.`}
              </p>
            </div>
            <button className="modal__close" onClick={() => { setDeleteTarget(null); setDeleteMessageError(null); setDeletingMessageScope(null) }} type="button">
              <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
            </button>
          </div>
          <div className="modal__body">
            <div className="modal-helper-note modal-helper-note--danger">
              {deleteTarget.canDeleteForAll
                ? 'If you choose "Delete for Everyone", the message content is replaced with a deletion trace and does not simply vanish from the conversation.'
                : 'If you choose "Delete for Me", this message is only hidden from your account\'s view.'} {deleteTarget.content.trim() ? `Preview: "${deleteTarget.content.trim().slice(0, 140)}${deleteTarget.content.trim().length > 140 ? '…' : ''}"` : deleteTarget.isDeletedForEveryone ? 'This message is already a deletion trace for all participants.' : 'This message has no text, only an attachment or empty content.'}
            </div>
            {deleteMessageError && <InlineNotice tone="error">{deleteMessageError}</InlineNotice>}
          </div>
          <div className="modal__footer">
            <button
              className="btn btn--ghost"
              disabled={deletingMessageId === deleteTarget.id}
              onClick={() => { setDeleteTarget(null); setDeleteMessageError(null); setDeletingMessageScope(null) }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="btn btn--ghost"
              disabled={deletingMessageId === deleteTarget.id}
              onClick={async () => {
                setDeletingMessageId(deleteTarget.id)
                setDeletingMessageScope('self')
                setDeleteMessageError(null)
                try {
                  await onDeleteMessage(deleteTarget.id, 'self')
                  setDeleteTarget(null)
                } catch (err) {
                  setDeleteMessageError(extractErrorMessage(err, 'Failed to delete the message from your view.'))
                } finally {
                  setDeletingMessageId(null)
                  setDeletingMessageScope(null)
                }
              }}
              type="button"
            >
              {deletingMessageId === deleteTarget.id && deletingMessageScope === 'self' ? 'Hiding…' : 'Delete for Me'}
            </button>
            {deleteTarget.canDeleteForAll && (
              <button
                className="btn btn--danger"
                disabled={deletingMessageId === deleteTarget.id}
                onClick={async () => {
                  setDeletingMessageId(deleteTarget.id)
                  setDeletingMessageScope('all')
                  setDeleteMessageError(null)
                  try {
                    await onDeleteMessage(deleteTarget.id, 'all')
                    setDeleteTarget(null)
                  } catch (err) {
                    setDeleteMessageError(extractErrorMessage(err, 'Failed to delete the message for all members.'))
                  } finally {
                    setDeletingMessageId(null)
                    setDeletingMessageScope(null)
                  }
                }}
                type="button"
              >
                {deletingMessageId === deleteTarget.id && deletingMessageScope === 'all' ? 'Deleting…' : 'Delete for Everyone'}
              </button>
            )}
          </div>
        </div>
      </div>,
      document.getElementById('workspace-modal-root') ?? document.body,
    )}
    {/* ── Confirm Remove Member ── */}
    {confirmRemoveMember && createPortal(
      <div className="modal-backdrop" onClick={() => { setConfirmRemoveMember(null); setRemoveMemberError(null) }}>
        <div
          aria-describedby={confirmRemoveDescId}
          aria-labelledby={confirmRemoveTitleId}
          aria-modal="true"
          className="modal schedule-modal schedule-modal--confirm"
          onClick={(e) => e.stopPropagation()}
          ref={confirmRemoveRef}
          role="dialog"
          tabIndex={-1}
        >
          <div className="modal__header">
            <div className="modal-headcopy">
              <h3 className="modal__title" id={confirmRemoveTitleId}>Remove Member?</h3>
              <p className="modal-subtitle" id={confirmRemoveDescId}>
                <strong>{confirmRemoveMember.name}</strong> will be removed from this channel and can no longer read or send messages.
              </p>
            </div>
            <button className="modal__close" onClick={() => { setConfirmRemoveMember(null); setRemoveMemberError(null) }} type="button">
              <svg fill="none" height="12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 12 12" width="12"><path d="m1 1 10 10M11 1 1 11" /></svg>
            </button>
          </div>
          <div className="modal__body">
            <div className="modal-helper-note modal-helper-note--danger">
              This action cannot be undone. The member must be added back manually if needed.
            </div>
            {removeMemberError && <InlineNotice tone="error">{removeMemberError}</InlineNotice>}
          </div>
          <div className="modal__footer">
            <button className="btn btn--ghost" disabled={removingMemberId === confirmRemoveMember.userId} onClick={() => { setConfirmRemoveMember(null); setRemoveMemberError(null) }} type="button">Cancel</button>
            <button
              className="btn btn--danger"
              disabled={removingMemberId === confirmRemoveMember.userId}
              onClick={async () => {
                if (!selectedChannelId) return
                const { userId } = confirmRemoveMember
                setRemovingMemberId(userId)
                setRemoveMemberError(null)
                try {
                  await onRemoveMember(selectedChannelId, userId)
                  setConfirmRemoveMember(null)
                } catch (err) {
                  setRemoveMemberError(extractErrorMessage(err, 'Failed to remove the member from the channel.'))
                } finally {
                  setRemovingMemberId(null)
                }
              }}
              type="button"
            >
              {removingMemberId === confirmRemoveMember.userId ? 'Removing…' : 'Remove from Channel'}
            </button>
          </div>
        </div>
      </div>,
      document.getElementById('workspace-modal-root') ?? document.body,
    )}

    {/* Emoji picker portal — escapes composer overflow:hidden */}
    {showComposerEmoji && emojiPickerPos && createPortal(
      <div
        ref={composerEmojiPanelRef}
        style={{ position: 'fixed', bottom: emojiPickerPos.bottom, left: emojiPickerPos.left, zIndex: 1200 }}
      >
        <EmojiPickerPanel
          onSelect={emoji => {
            const ta = composerRef.current
            if (ta) {
              const start = ta.selectionStart ?? composerValue.length
              const end = ta.selectionEnd ?? composerValue.length
              const next = composerValue.slice(0, start) + emoji + composerValue.slice(end)
              onComposerChange(next)
              setTimeout(() => { ta.focus(); ta.setSelectionRange(start + emoji.length, start + emoji.length) }, 0)
            } else {
              onComposerChange(composerValue + emoji)
            }
            setShowComposerEmoji(false)
          }}
        />
      </div>,
      document.body,
    )}

    {/* Image lightbox */}
    {lightbox && <ImageLightbox name={lightbox.name} onClose={closeLightbox} url={lightbox.url} />}
    <toast.View />
    </div>
  )
}
