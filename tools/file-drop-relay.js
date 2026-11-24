import { listenForClickEffect, listenForUiClicks } from './ui-click.js'
import './ui-click.css'
import { installToolMotionPreference } from './tool-motion.js'
import './tool-motion.css'

function send(data) {
  if (parent === window) return
  const origin = location.protocol === 'nikke:' ? 'nikke://app' : location.origin
  const parentOrigin = parent === top ? origin : (location.protocol === 'nikke:' ? 'nikke://reroll' : location.origin)
  parent.postMessage(data, parentOrigin)
}

export function sendToolSound(cue) {
  send({ type:'nikke-tools:ui-sound', cue })
}

export function installFileDropRelay() {
  installToolMotionPreference()
  listenForUiClicks(document, sendToolSound)
  listenForClickEffect(document)
  const files = event => Array.from(event.dataTransfer?.types || []).includes('Files')
  window.addEventListener('dragenter', event => { if (files(event)) send({ type:'nikke-tools:file-drag', active:true }) })
  window.addEventListener('dragover', event => { if(files(event)){ event.preventDefault(); event.dataTransfer.dropEffect='copy' } })
  window.addEventListener('dragleave', event => { if(!event.relatedTarget) send({ type:'nikke-tools:file-drag', active:false }) })
  window.addEventListener('drop', event => {
    if(!files(event)) return
    event.preventDefault()
    send({ type:'nikke-tools:file-drag', active:false })
    send({ type:'nikke-tools:file-drop', files:Array.from(event.dataTransfer.files) })
  })
  // The nested simulator is the only allowed child. Forward its drop to the host.
  window.addEventListener('message', event => {
    const child=document.querySelector('#simulator-frame')
    if(!child || event.source!==child.contentWindow || event.origin!==new URL(child.src,location.href).origin) return
    if(['nikke-tools:file-drop','nikke-tools:file-drag','nikke-tools:ui-sound'].includes(event.data?.type)) send(event.data)
  })
}
