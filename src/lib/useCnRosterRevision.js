import { useSyncExternalStore } from 'react'
import definition from '../data/cn-roster.json' with { type: 'json' }
import { isCnCharacter } from './cnRoster.js'

// The snapshot changes only when a scheduled identity changes availability.
const snapshot = () => Object.keys(definition.unlockAt || {}).map(nameCode => Number(isCnCharacter({ nameCode }))).join('')
const subscribe = notify => {
  const timer = setInterval(notify, 1000)
  window.addEventListener('focus', notify)
  document.addEventListener('visibilitychange', notify)
  return () => {
    clearInterval(timer)
    window.removeEventListener('focus', notify)
    document.removeEventListener('visibilitychange', notify)
  }
}
export const useCnRosterRevision = () => useSyncExternalStore(subscribe, snapshot)
