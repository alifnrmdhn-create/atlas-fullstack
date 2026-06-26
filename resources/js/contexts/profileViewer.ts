import { createContext, useContext } from 'react'

// Context untuk membuka modal profil orang (UserProfileModal) dari mana saja.
// Dipisah dari UserProfileModal.tsx agar komponen low-level seperti <Avatar>
// (components/ui.tsx) bisa memakai hook ini TANPA circular import ke modal.
export type ProfileViewerCtx = { openProfile: (userId: number) => void; closeProfile: () => void }

export const ProfileViewerContext = createContext<ProfileViewerCtx | null>(null)

/** Hook untuk membuka modal profil. Aman di luar provider (jadi no-op). */
export function useProfileViewer(): ProfileViewerCtx {
  return useContext(ProfileViewerContext) ?? { openProfile: () => {}, closeProfile: () => {} }
}
