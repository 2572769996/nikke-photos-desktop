// Native controls also emit click for keyboard activation and associated labels.
export function listenForUiClicks(doc, play) {
  const handle = event => {
    const control = event.target.closest?.('button, a[href], summary, select, input:is([type=checkbox],[type=radio],[type=button],[type=submit]), [role=button], [role=tab], [role=option], [role=switch], [role=combobox], [data-ui-sound]')
    if (!control || event.button > 0 || control.closest(':disabled, [aria-disabled=true], .is-disabled')) return
    const isAction = control.matches('button, [role=button], input[type=button], input[type=submit], a.btn') && !control.matches('[role=tab], [role=switch], [aria-pressed]')
    const cue = control.dataset.uiSound || (isAction ? 'button' : 'click')
    if (cue !== 'silent') play(cue)
  }
  doc.addEventListener('click', handle, true)
  return () => doc.removeEventListener('click', handle, true)
}

export function prefersReducedMotion(view = window) {
  return view.document.documentElement.dataset.reduceMotion === 'true' ||
    view.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function effectMotionReduced(effect, view = window) {
  return view.document.documentElement.dataset[effect + 'Effect'] === 'false' ||
    view.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function listenForClickEffect(doc) {
  const view = doc.defaultView
  const lerp = (first, last, t) => first + (last - first) * t

  function createLayer(name, x, y) {
    const layer = doc.createElement('span')
    layer.className = name
    layer.popover = 'manual'
    layer.setAttribute('aria-hidden', 'true')
    layer.style.left = x + 'px'
    layer.style.top = y + 'px'
    return layer
  }

  function emitParticle(layer, delay) {
    const particle = doc.createElement('span')
    particle.className = 'nikke-click-particle'
    const style = particle.style
    const angle = Math.random() * 2 * Math.PI
    // The UI particle emitter is a flat torus. Positions below are relative to its 1.8-unit main quad.
    const radius = .53 + .07 * Math.sqrt(Math.random()) * Math.cos(Math.random() * 2 * Math.PI)
    const endRadius = radius + .35 * lerp(.3, .5, Math.random())
    for (const [axis, direction] of [['x', Math.cos(angle)], ['y', Math.sin(angle)]]) {
      style.setProperty('--from-' + axis, (50 + 100 * radius * direction / 1.8) + '%')
      style.setProperty('--to-' + axis, (50 + 100 * endRadius * direction / 1.8) + '%')
    }
    const tint = Math.random()
    style.backgroundColor = `rgb(${lerp(83, 134, tint)} ${lerp(175, 215, tint)} 255)`
    style.width = (100 * lerp(.2, .6, Math.random()) / 1.8) + '%'
    style.setProperty('--burst-delay', delay + 'ms')
    const gradient = Math.random()
    style.setProperty('--peak-alpha', lerp(.68627, .49020, gradient))
    style.setProperty('--mid-alpha', lerp(.68627, .49020 * (1 - .31542) / (1 - .07886), gradient))
    layer.append(particle)
  }

  let press = null
  const start = event => {
    if (event.isPrimary && event.button === 0) press = { id: event.pointerId, x: event.clientX, y: event.clientY }
  }
  const cancel = () => { press = null }
  const move = event => {
    if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) cancel()
  }
  const finish = event => {
    const clicked = press?.id === event.pointerId
    cancel()
    if (!clicked || event.button !== 0 || !event.detail || effectMotionReduced('click', view)) return
    if (event.target.closest('textarea, [contenteditable]:not([contenteditable=false]), [role=slider], input:not([type=checkbox], [type=radio], [type=button], [type=submit], [type=reset])')) return
    const { clientX, clientY } = event
    // Let an opening or closing modal finish changing the top layer before drawing.
    view.requestAnimationFrame(() => {
      if (effectMotionReduced('click', view)) return
      const base = createLayer('nikke-click-spark', clientX, clientY)
      const light = createLayer('nikke-click-light', clientX, clientY)
      // Sibling layers let the additive material blend with the actual surface behind the click.
      for (const delay of [0, 0, 50, 50]) emitParticle(light, delay)
      doc.body.append(base, light)
      base.showPopover()
      light.showPopover()
      view.setTimeout(() => { base.remove(); light.remove() }, 400)
    })
  }
  const listeners = { pointerdown: start, pointermove: move, pointercancel: cancel, dragstart: cancel, click: finish }
  for (const [type, handle] of Object.entries(listeners)) doc.addEventListener(type, handle, { capture: true, passive: true })
  return () => {
    for (const [type, handle] of Object.entries(listeners)) doc.removeEventListener(type, handle, true)
  }
}
