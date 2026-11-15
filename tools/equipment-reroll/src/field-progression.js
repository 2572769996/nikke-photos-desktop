// Only a real user choice advances focus. Draft restoration/imports never open pickers.
export function installFieldProgression() {
  let popup=null
  function closePicker(focus=false) {
    if(!popup)return
    const current=popup;popup=null
    current.panel.hidePopover();current.panel.remove()
    if(focus&&current.select.isConnected)current.select.focus({preventScroll:true})
  }
  function openTierPicker(select) {
    closePicker()
    select.focus({preventScroll:true})
    try { if(select.showPicker){select.showPicker();return} } catch { /* Cross-origin iframe native pickers are restricted. */ }
    const panel=document.createElement('div')
    panel.className='tier-picker';panel.setAttribute('popover','auto');panel.setAttribute('role','listbox')
    panel.setAttribute('aria-label',select.getAttribute('aria-label')||'选择档位与数值')
    for(const option of select.options) {
      const button=document.createElement('button');button.type='button';button.setAttribute('role','option')
      button.setAttribute('aria-selected',String(option.value===select.value));button.textContent=option.textContent;button.disabled=option.disabled
      button.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));closePicker(true)})
      panel.append(button)
    }
    panel.addEventListener('keydown',event=>{
      const choices=[...panel.querySelectorAll('button:not(:disabled)')],index=choices.indexOf(document.activeElement)
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault()
        const next=event.key==='Home'?0:event.key==='End'?choices.length-1:Math.max(0,Math.min(choices.length-1,index+(event.key==='ArrowDown'?1:-1)))
        choices[next]?.focus()
      } else if(event.key==='Escape'){event.preventDefault();closePicker(true)}
      else if(event.key==='Tab')closePicker(true)
    })
    panel.addEventListener('toggle',event=>{if(event.newState==='closed'&&popup?.panel===panel){popup=null;panel.remove()}})
    document.body.append(panel);popup={panel,select}
    const rect=select.getBoundingClientRect(),width=Math.min(Math.max(180,rect.width),innerWidth-24)
    panel.style.width=width+'px';panel.style.left=Math.max(12,Math.min(rect.left,innerWidth-width-12))+'px'
    panel.showPopover()
    const height=panel.getBoundingClientRect().height
    panel.style.top=Math.max(8,rect.bottom+height+8<=innerHeight?rect.bottom+4:rect.top-height-4)+'px'
    const active=panel.querySelector('[aria-selected=true]')||panel.querySelector('button')
    active?.focus({preventScroll:true});if(active)panel.scrollTop=Math.max(0,active.offsetTop-panel.clientHeight/2)
  }
  window.addEventListener('resize',()=>closePicker())
  window.addEventListener('scroll',()=>closePicker(),{passive:true})
  document.addEventListener('change', event => {
    if (!event.isTrusted || event.target.value === '空词条') return
    const select = event.target
    let next
    if (select.matches('.stat-select')) next = select.closest('.form-row')?.querySelector('.tier-select')
    else if (select.matches('.global-stat-select')) next = select.closest('.global-condition-row')?.querySelector('.global-min-count')
    else if (select.matches('.character-target-stat')) next = select.closest('.character-target-row')?.querySelector('.character-target-total')
    if (!next || next.disabled) return
    next.focus({preventScroll:true})
    if (next instanceof HTMLSelectElement) {
      openTierPicker(next)
    } else next.select?.()
  })
}
