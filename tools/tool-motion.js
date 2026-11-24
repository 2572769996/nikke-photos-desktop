export function installToolMotionPreference() {
  const root = document.documentElement
  const params = new URLSearchParams(location.search)
  root.dataset.reduceMotion = String(params.get('reduceMotion') === 'true')
  root.dataset.clickEffect = String(params.get('clickEffect') !== 'false')
  root.dataset.washEffect = String(params.get('washEffect') !== 'false')
  const parentOrigin = location.protocol === 'nikke:' ? (parent === top ? 'nikke://app' : 'nikke://reroll') : location.origin
  const changed = () => window.dispatchEvent(new Event('nikke-tools:motion-change'))
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', changed)

  const keys = ['reduceMotion', 'clickEffect', 'washEffect']
  const syncNested = frame => {
    const message = { type: 'nikke-tools:motion' }
    for (const key of keys) message[key] = root.dataset[key] === 'true'
    frame.contentWindow.postMessage(message, new URL(frame.src, location.href).origin)
  }
  window.addEventListener('message', event => {
    const data = event.data
    if (event.source !== parent || event.origin !== parentOrigin || data?.type !== 'nikke-tools:motion') return
    if (!keys.every(key => typeof data[key] === 'boolean') || keys.every(key => root.dataset[key] === String(data[key]))) return
    for (const key of keys) root.dataset[key] = String(data[key])
    changed()
    const nested = document.querySelector('#simulator-frame')
    if (nested) syncNested(nested)
  })
  document.addEventListener('load', event => {
    if (event.target.id === 'simulator-frame') syncNested(event.target)
  }, true)
}
