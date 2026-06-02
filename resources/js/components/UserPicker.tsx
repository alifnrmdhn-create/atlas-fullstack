import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

export type UserOption = {
  id: number
  name: string
  positionTitle?: string | null
}

type SingleProps = {
  value: number | null
  onChange: (id: number | null) => void
  options: UserOption[]
  placeholder?: string
  disabled?: boolean
  allowClear?: boolean
  clearLabel?: string
  currentUserId?: number
  autoOpen?: boolean
  inputClassName?: string
  className?: string
  required?: boolean
}

export function UserPicker({
  value,
  onChange,
  options,
  placeholder = 'Select a user…',
  disabled,
  allowClear,
  clearLabel = '— Clear selection —',
  currentUserId,
  autoOpen,
  inputClassName = 'form-input',
  className,
}: SingleProps) {
  const [open, setOpen] = useState(!!autoOpen)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selected = useMemo(() => options.find(u => u.id === value) ?? null, [options, value])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(u =>
      u.name.toLowerCase().includes(q) ||
      (u.positionTitle ?? '').toLowerCase().includes(q),
    )
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => window.clearTimeout(t)
    }
  }, [open])

  useEffect(() => { setActiveIdx(0) }, [query])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, open])

  const pick = (id: number | null) => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = filtered[activeIdx]
      if (hit) pick(hit.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setQuery('')
    }
  }

  const displayLabel = selected
    ? `${selected.name}${selected.id === currentUserId ? ' (You)' : ''}${selected.positionTitle ? ` — ${selected.positionTitle}` : ''}`
    : ''

  return (
    <div className={`user-picker${className ? ` ${className}` : ''}`} ref={wrapRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`${inputClassName} user-picker__trigger${selected ? '' : ' is-empty'}`}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        type="button"
      >
        <span className="user-picker__trigger-label">
          {selected ? displayLabel : placeholder}
        </span>
        <svg aria-hidden className="user-picker__chevron" fill="none" height="6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" viewBox="0 0 10 6" width="10">
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="user-picker__dropdown">
          <div className="user-picker__searchbox">
            <svg aria-hidden fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 14 14" width="14">
              <circle cx="6" cy="6" r="4.5" />
              <path d="m12.5 12.5-3-3" />
            </svg>
            <input
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="Search by name or position…"
              ref={inputRef}
              type="text"
              value={query}
            />
          </div>
          {filtered.length === 0 ? (
            <p className="user-picker__empty">No matching names.</p>
          ) : (
            <ul className="user-picker__results" ref={listRef} role="listbox">
              {filtered.map((u, idx) => (
                <li key={u.id}>
                  <button
                    className={`user-picker-item${idx === activeIdx ? ' user-picker-item--active' : ''}${u.id === value ? ' user-picker-item--selected' : ''}`}
                    data-idx={idx}
                    onClick={() => pick(u.id)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    type="button"
                  >
                    <span className="user-picker-item__name">
                      {u.name}{u.id === currentUserId ? ' (You)' : ''}
                    </span>
                    {u.positionTitle && (
                      <span className="user-picker-item__meta">{u.positionTitle}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {allowClear && value != null && (
            <button
              className="user-picker__clear"
              onClick={() => pick(null)}
              type="button"
            >
              {clearLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

type MultiProps = {
  value: number[]
  onChange: (ids: number[]) => void
  options: UserOption[]
  excludeIds?: number[]
  maxSuggestions?: number
  searchPlaceholder?: string
  emptyAllPickedLabel?: string
  className?: string
}

export function UserPickerMulti({
  value,
  onChange,
  options,
  excludeIds = [],
  maxSuggestions = 6,
  searchPlaceholder = 'Search by name or position…',
  emptyAllPickedLabel = 'All users are already selected.',
  className,
}: MultiProps) {
  const [query, setQuery] = useState('')

  const selectedUsers = useMemo(
    () => value.map(id => options.find(u => u.id === id)).filter((u): u is UserOption => !!u),
    [value, options],
  )

  const filtered = useMemo(() => {
    const exclude = new Set<number>([...value, ...excludeIds])
    const q = query.trim().toLowerCase()
    const base = options.filter(u => !exclude.has(u.id))
    const list = q
      ? base.filter(u =>
          u.name.toLowerCase().includes(q) ||
          (u.positionTitle ?? '').toLowerCase().includes(q),
        )
      : base
    return list.slice(0, maxSuggestions)
  }, [options, value, excludeIds, query, maxSuggestions])

  const add = (id: number) => {
    if (value.includes(id)) return
    onChange([...value, id])
    setQuery('')
  }
  const remove = (id: number) => onChange(value.filter(x => x !== id))

  return (
    <div className={`user-picker user-picker--multi${className ? ` ${className}` : ''}`}>
      {selectedUsers.length > 0 && (
        <div className="user-picker__chips">
          {selectedUsers.map(u => (
            <span className="user-picker__chip" key={u.id}>
              <span className="user-picker__chip-name">{u.name}</span>
              <button
                aria-label={`Remove ${u.name}`}
                className="user-picker__chip-remove"
                onClick={() => remove(u.id)}
                type="button"
              >
                <svg fill="none" height="10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 10 10" width="10">
                  <path d="m1 1 8 8M9 1 1 9" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="user-picker__searchbox">
        <svg aria-hidden fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 14 14" width="14">
          <circle cx="6" cy="6" r="4.5" />
          <path d="m12.5 12.5-3-3" />
        </svg>
        <input
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && filtered[0]) {
              e.preventDefault()
              add(filtered[0].id)
            }
          }}
          placeholder={searchPlaceholder}
          type="text"
          value={query}
        />
      </div>
      {filtered.length === 0 ? (
        <p className="user-picker__empty">
          {query ? 'No matching names.' : emptyAllPickedLabel}
        </p>
      ) : (
        <ul className="user-picker__results user-picker__results--inline">
          {filtered.map(u => (
            <li key={u.id}>
              <button
                className="user-picker-item"
                onClick={() => add(u.id)}
                type="button"
              >
                <span className="user-picker-item__name">{u.name}</span>
                {u.positionTitle && (
                  <span className="user-picker-item__meta">{u.positionTitle}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
