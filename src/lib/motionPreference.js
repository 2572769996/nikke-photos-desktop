const legacyKey = 'nikke-photos:reduce-motion'
const keyPrefix = 'nikke-photos:motion/'
const changes = new EventTarget()

export function effectEnabled(effect) {
  const saved = localStorage.getItem(keyPrefix + effect)
  // Existing profiles use their previous shared choice until each effect is first changed.
  return saved === null ? localStorage.getItem(legacyKey) !== 'true' : saved === 'true'
}

export function systemReducesMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function recruitMotionReduced() {
  return document.documentElement.dataset.recruitEffect === 'false'
}

function applyMotionPreference() {
  const systemReduced = systemReducesMotion()
  const root = document.documentElement.dataset
  root.reduceMotion = String(systemReduced || !effectEnabled('interface'))
  for (const effect of ['click', 'recruit', 'wash']) {
    root[effect + 'Effect'] = String(!systemReduced && effectEnabled(effect))
  }
  changes.dispatchEvent(new Event('change'))
}

export function initializeMotionPreference() {
  applyMotionPreference()
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', applyMotionPreference)
  window.addEventListener('storage', event => {
    if (event.key === null || event.key === legacyKey || event.key.startsWith(keyPrefix)) applyMotionPreference()
  })
}

export function setEffectEnabled(effect, enabled) {
  localStorage.setItem(keyPrefix + effect, String(enabled))
  applyMotionPreference()
}

export function subscribeMotionPreference(listener) {
  changes.addEventListener('change', listener)
  return () => changes.removeEventListener('change', listener)
}
