import { useContext } from 'react'
import { WorkspaceContext } from '../context/workspace'
import type { WorkspaceContextValue } from '../context/workspace'

export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext)
}
