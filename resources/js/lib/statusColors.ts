import type { CSSProperties } from 'react'
import type { MeetingType, PresenceStatus, RsvpStatus } from '../types'

export interface StatusColor {
  bg: string
  fg: string
  border?: string
}

export interface HealthColor extends StatusColor {
  bar: string
}

export interface CalendarColor {
  bg: string
  accent: string
  text: string
  border: string
}

const TONES = {
  RED:    { bg: 'var(--red-dim)', fg: 'var(--red-ink)', border: 'var(--red-subtle)' },
  YELLOW: { bg: 'var(--yellow-dim)', fg: 'var(--yellow-ink)', border: 'var(--yellow-subtle)' },
  GREEN:  { bg: 'var(--green-dim)', fg: 'var(--green-ink)', border: 'var(--green-subtle)' },
  BLUE:   { bg: 'var(--blue-dim)', fg: 'var(--blue-ink)', border: 'var(--blue-subtle)' },
  PURPLE: { bg: 'var(--purple-dim)', fg: 'var(--purple-ink)', border: 'var(--purple-subtle)' },
  GRAY:   { bg: 'var(--gray-dim)', fg: 'var(--gray-ink)', border: 'var(--gray-subtle)' },
  CYAN:   { bg: 'var(--cyan-dim)', fg: 'var(--cyan-ink)', border: 'var(--cyan-subtle)' },
} as const

const AVATAR_PALETTE = [
  { bg: 'var(--purple-dim)', fg: 'var(--purple-ink)' },
  { bg: 'var(--blue-dim)', fg: 'var(--blue-ink)' },
  { bg: 'var(--green-dim)', fg: 'var(--green-ink)' },
  { bg: 'var(--yellow-dim)', fg: 'var(--yellow-ink)' },
  { bg: 'var(--red-dim)', fg: 'var(--red-ink)' },
  { bg: 'var(--cyan-dim)', fg: 'var(--cyan-ink)' },
  { bg: 'var(--pink-dim)', fg: 'var(--pink-ink)' },
  { bg: 'var(--orange-dim)', fg: 'var(--orange-ink)' },
] as const

const MEETING_TYPES: Record<MeetingType, StatusColor> = {
  RAPAT_DIREKSI: TONES.RED,
  RAPAT_KOORDINASI: TONES.PURPLE,
  RAPAT_DIVISI: TONES.BLUE,
  RAPAT_TIM: TONES.GREEN,
  ONE_ON_ONE: TONES.YELLOW,
}

const CALENDAR_EVENTS: Record<MeetingType, CalendarColor> = {
  RAPAT_DIREKSI:    { bg: 'var(--red-dim)', accent: 'var(--red)', text: 'var(--red-ink)', border: 'var(--red-subtle)' },
  RAPAT_KOORDINASI: { bg: 'var(--purple-dim)', accent: 'var(--purple)', text: 'var(--purple-ink)', border: 'var(--purple-subtle)' },
  RAPAT_DIVISI:     { bg: 'var(--blue-dim)', accent: 'var(--blue)', text: 'var(--blue-ink)', border: 'var(--blue-subtle)' },
  RAPAT_TIM:        { bg: 'var(--green-dim)', accent: 'var(--green)', text: 'var(--green-ink)', border: 'var(--green-subtle)' },
  ONE_ON_ONE:       { bg: 'var(--yellow-dim)', accent: 'var(--yellow)', text: 'var(--yellow-ink)', border: 'var(--yellow-subtle)' },
}

type ToneName = keyof typeof TONES
type TonePalette = Record<ToneName, StatusColor & { border: string }>
type RoleToneName = 'RED' | 'YELLOW' | 'GREEN' | 'GRAY'

const ROLE_TONE_KEY: Record<string, RoleToneName> = {
  SUPERADMIN: 'RED',
  ADMIN: 'GRAY',
  BOD: 'RED',
  KADIV: 'YELLOW',
  KASUBDIV: 'YELLOW',
  ASISTEN: 'GREEN',
  OFFICER: 'GREEN',
}

export function tonePalette(dark: boolean): TonePalette {
  void dark
  return TONES
}

export function sc(dark: boolean): Record<ToneName, StatusColor> {
  const palette = tonePalette(dark)
  return {
    RED: { bg: palette.RED.bg, fg: palette.RED.fg },
    YELLOW: { bg: palette.YELLOW.bg, fg: palette.YELLOW.fg },
    GREEN: { bg: palette.GREEN.bg, fg: palette.GREEN.fg },
    BLUE: { bg: palette.BLUE.bg, fg: palette.BLUE.fg },
    PURPLE: { bg: palette.PURPLE.bg, fg: palette.PURPLE.fg },
    GRAY: { bg: palette.GRAY.bg, fg: palette.GRAY.fg },
    CYAN: { bg: palette.CYAN.bg, fg: palette.CYAN.fg },
  }
}

export const trackBg = (dark: boolean) => {
  void dark
  return 'var(--surface-quiet)'
}
export const subtleSurface = (dark: boolean) => {
  void dark
  return 'var(--surface-overlay-soft)'
}
export const accentInfoText = (dark: boolean) => {
  void dark
  return 'var(--blue-ink)'
}
export const accentInfoBorder = (dark: boolean) => {
  void dark
  return 'var(--blue-subtle)'
}

export function healthColors(dark: boolean): Record<'RED' | 'YELLOW' | 'GREEN', HealthColor> {
  const palette = tonePalette(dark)
  return {
    RED: { ...palette.RED, bar: 'var(--red)' },
    YELLOW: { ...palette.YELLOW, bar: 'var(--yellow)' },
    GREEN: { ...palette.GREEN, bar: 'var(--green)' },
  }
}

export function severityColors(dark: boolean): Record<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW', StatusColor & { border: string }> {
  const palette = tonePalette(dark)
  return {
    CRITICAL: palette.RED,
    HIGH: palette.YELLOW,
    MEDIUM: palette.BLUE,
    LOW: palette.GREEN,
  }
}

export const neutralBadge = (dark: boolean) => tonePalette(dark).GRAY
export const warningBadge = (dark: boolean) => tonePalette(dark).YELLOW
export const focusBlockTone = (dark: boolean) => tonePalette(dark).PURPLE

export function roleTone(dark: boolean, role: string): StatusColor & { border: string } {
  const palette = tonePalette(dark)
  const key = ROLE_TONE_KEY[role.toUpperCase()] ?? 'GRAY'
  return palette[key]
}

export function roleBadgeStyle(dark: boolean, role: string): CSSProperties {
  const tone = roleTone(dark, role)
  return { background: tone.bg, color: tone.fg }
}

export function roleAccentColor(role: string): string {
  const key = ROLE_TONE_KEY[role.toUpperCase()] ?? 'GRAY'
  if (key === 'RED') return 'var(--red)'
  if (key === 'YELLOW') return 'var(--yellow)'
  if (key === 'GREEN') return 'var(--green)'
  return 'var(--gray)'
}

export function avatarPalette(dark: boolean) {
  void dark
  return AVATAR_PALETTE
}

export function meetingTypeColors(dark: boolean): Record<MeetingType, StatusColor> {
  void dark
  return MEETING_TYPES
}

export function calendarEventColors(dark: boolean): Record<MeetingType, CalendarColor> {
  void dark
  return CALENDAR_EVENTS
}

export function focusCalendarColor(dark: boolean): CalendarColor {
  void dark
  return { bg: 'var(--surface-2)', accent: 'var(--gray)', text: 'var(--gray-ink)', border: 'var(--gray-subtle)' }
}

export function rsvpTextColors(dark: boolean): Record<RsvpStatus, string> {
  const palette = tonePalette(dark)
  return {
    PENDING: palette.GRAY.fg,
    HADIR: palette.GREEN.fg,
    TIDAK_HADIR: palette.RED.fg,
    DELEGASI: palette.YELLOW.fg,
  }
}

export function presenceDotColors(dark: boolean): Record<PresenceStatus, string> {
  void dark
  return {
    ONLINE: 'var(--green)',
    AWAY: 'var(--yellow)',
    DO_NOT_DISTURB: 'var(--purple)',
    OFFLINE: 'var(--gray)',
  }
}

export const errorBox = (dark: boolean): CSSProperties => dark
  ? { background: TONES.RED.bg, color: TONES.RED.fg, border: `1px solid ${TONES.RED.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 500 }
  : { background: TONES.RED.bg, color: TONES.RED.fg, border: `1px solid ${TONES.RED.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 500 }
