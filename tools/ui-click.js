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
