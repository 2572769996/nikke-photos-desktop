// Desktop integration only; the upstream calculation and storage modules stay unchanged.
const theme = new URLSearchParams(location.search).get('theme')
if (theme === 'light' || theme === 'dark') {
  document.documentElement.dataset.themeMode = theme
  document.documentElement.dataset.theme = theme
}
const targetOrigin = location.protocol === 'nikke:' ? 'nikke://app' : location.origin
const send = data => { if (parent !== window) parent.postMessage(data, targetOrigin) }
const files = event => Array.from(event.dataTransfer?.types || []).includes('Files')
window.addEventListener('dragenter', event => { if (files(event)) send({type:'nikke-tools:file-drag', active:true}) })
window.addEventListener('dragover', event => { if (files(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } })
window.addEventListener('dragleave', event => { if (!event.relatedTarget) send({type:'nikke-tools:file-drag', active:false}) })
window.addEventListener('drop', event => {
  if (!files(event)) return
  event.preventDefault()
  send({type:'nikke-tools:file-drag', active:false})
  send({type:'nikke-tools:file-drop', files:Array.from(event.dataTransfer.files)})
})
// Loaded after the upstream app has registered its public API and UI handlers.
send({type:window.__SR_CALCULATOR__ ? 'nikke-tools:ready' : 'nikke-tools:error'})
