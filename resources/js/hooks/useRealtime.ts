import { useContext } from 'react'
import { RealtimeContext } from '../contexts/RealtimeProvider'
import type { RealtimeContextValue } from '../contexts/RealtimeProvider'

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime harus dipakai di dalam <RealtimeProvider>')
  return ctx
}
