const DISPLAY_OVERRIDES: Record<string, string> = {
  BOD: 'Direksi',
}

export function formatRoleLabel(role?: string | null, fallback = ''): string {
  if (!role) return fallback
  const upper = role.toUpperCase()
  return DISPLAY_OVERRIDES[upper] ?? role
}

export function formatRoleLabelTitleCase(role?: string | null, fallback = ''): string {
  if (!role) return fallback
  const upper = role.toUpperCase()
  if (DISPLAY_OVERRIDES[upper]) return DISPLAY_OVERRIDES[upper]
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}
