// Desktop entry profiles; solver modules remain shared and unchanged.
export const IS_KEYS = globalThis.document?.documentElement?.dataset.calculator === 'keys'
export const STRATEGY = IS_KEYS ? 'zbx-keys' : 'workshop-stone'
export const storageKey = legacy => IS_KEYS ? legacy.replace('nikke-tools:workshop:', 'nikke-tools:keys:') : legacy
// Snapshot the former combined key session once, before either page persists its fixed strategy.
try {
  const marker = 'nikke-tools:keys:migration:v1'
  if (!localStorage.getItem(marker)) {
    const strategy = localStorage.getItem('nikke-tools:workshop:strategy-compare:v1')
    if (JSON.parse(strategy || '{}')?.strategy === 'zbx-keys') {
      for (const suffix of ['draft:v1','strategy-compare:v1']) {
        const source = localStorage.getItem('nikke-tools:workshop:'+suffix)
        if (source && !localStorage.getItem('nikke-tools:keys:'+suffix)) localStorage.setItem('nikke-tools:keys:'+suffix,source)
      }
    }
    localStorage.setItem(marker,'1')
  }
} catch { /* Malformed legacy storage does not block the calculator. */ }
