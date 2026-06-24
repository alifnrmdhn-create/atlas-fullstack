import i18n from './i18n'

const DISPLAY_OVERRIDES: Record<string, string> = {
  BOD: 'Board of Directors',
}

export function formatRoleLabel(role?: string | null, fallback = ''): string {
  if (!role) return fallback
  const upper = role.toUpperCase()
  return i18n.t(DISPLAY_OVERRIDES[upper] ?? role)
}

export function formatRoleLabelTitleCase(role?: string | null, fallback = ''): string {
  if (!role) return fallback
  const upper = role.toUpperCase()
  if (DISPLAY_OVERRIDES[upper]) return i18n.t(DISPLAY_OVERRIDES[upper])
  return i18n.t(role.charAt(0).toUpperCase() + role.slice(1).toLowerCase())
}
