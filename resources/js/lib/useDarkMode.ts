import { useState, useEffect } from 'react'
import { getThemeSnapshot, subscribeThemeChange } from './theme'

export function useDarkMode(): boolean {
  const [dark, setDark] = useState(() =>
    getThemeSnapshot().resolved === 'dark'
  )

  useEffect(() => {
    return subscribeThemeChange(({ resolved }) => {
      setDark(resolved === 'dark')
    })
  }, [])

  return dark
}
