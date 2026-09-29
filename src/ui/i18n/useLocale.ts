import { useEffect, useState } from 'react'
import { getLocale, onLocaleChange, setLocale, type Locale } from './i18n'

/** The active locale as React state (the app re-renders on change). */
export function useLocale(): [Locale, (l: Locale) => void] {
  const [l, setL] = useState(getLocale())
  useEffect(() => onLocaleChange(() => setL(getLocale())), [])
  return [l, setLocale]
}
