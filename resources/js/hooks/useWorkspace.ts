import { useContext } from 'react'
import { WorkspaceContext } from '../contexts/workspace'
import type { WorkspaceContextValue } from '../contexts/workspace'

export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext)
}
