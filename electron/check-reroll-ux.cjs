const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async({window:win,cacheRoot})=>{
 const web=win.webContents,host=s=>web.executeJavaScript(s),report={};
 win.show();win.focus();web.focus();
 assert.equal(await host("document.querySelector('#tab-key-strategy > span').textContent"),'洗词条计算器');
 assert.equal(await host("document.querySelector('#tab-key-strategy > small').textContent"),'（允许自订秘钥）');
 for(const [id,entry] of [['equipment-reroll','/equipment-reroll/index.html'],['key-strategy','/keys/index.html']]) {
  await host(`document.querySelector('#tab-${id}').click()`);
  const frame=web.mainFrame.frames.find(f=>f.url.includes(entry)),js=s=>frame.executeJavaScript(s);
  const select=async(selector,value)=>{await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await delay(40)};
  await select('#collection-select','single-equipment');
  await select('#initial-rows .stat-select','最大装弹数增加');await select('#initial-rows .tier-select','15');
  for(const value of ['cn-legacy','global-current']){await select('#calculation-rule',value);assert.match(await js("document.querySelector('#calculation-rule-help').textContent"),value==='cn-legacy'?/^旧规则：/:/^新规则：/)}
  const rule=await js("(()=>{const e=document.querySelector('#calculation-rule-help'),s=getComputedStyle(e);return {text:e.textContent,underline:s.textDecorationLine.includes('underline'),padding:parseFloat(s.paddingTop),color:s.color}})()");
  assert.match(rule.text,/^(新|旧)规则：/);assert.ok(rule.underline&&rule.padding>=12);
  // Actual trusted keyboard input exercises the automatic next-field path;
  // Cross-origin native picker restrictions must fall back to an actual selectable list.
  await host(`document.querySelector('#panel-${id} iframe').focus()`);
  await js("(()=>{const stat=document.querySelector('#initial-rows .stat-select'),tier=document.querySelector('#initial-rows .tier-select');stat.selectedIndex=0;stat.dispatchEvent(new Event('change',{bubbles:true}));stat.focus()})()");
  web.debugger.attach('1.3');await web.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
  await web.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});await web.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});await delay(120);
  web.debugger.detach();
  assert.ok(await js("document.querySelector('.tier-picker')?.matches(':popover-open')"),'trusted stat selection should open an actual tier list');
  assert.equal(await js("document.querySelectorAll('.tier-picker [role=option]').length"),15);
  await js("document.querySelector('.tier-picker [role=option]:last-child').click()");
  assert.equal(await js("document.querySelector('#initial-rows .tier-select').value"),'15');
  assert.equal(await js("!!document.querySelector('.tier-picker')"),false);
  for(const scope of ['single-equipment','manual-four-equipment']) {
   await select('#collection-select',scope);
   if(id==='key-strategy'&&scope==='manual-four-equipment'){
    assert.equal(await js("document.querySelector('#calculation-rule [value=global-current]').disabled"),true);
    await select('#calculation-rule','global-current');assert.equal(await js("document.querySelector('#calculation-rule').value"),'cn-legacy');
    await js("while(document.querySelectorAll('.character-target-row').length<6)document.querySelector('#add-character-target').click()");
    assert.equal(await js("document.querySelectorAll('.character-target-row').length"),6);
    assert.equal(await js("document.querySelector('#add-character-target').disabled"),true);
    await js("document.querySelector('.remove-character-target').click()");assert.equal(await js("document.querySelectorAll('.character-target-row').length"),5);
    await js("document.querySelector('#add-character-target').click()");
   }
   await js("for(const row of document.querySelectorAll('.form-row')){const s=row.querySelector('.stat-select');if(!s.disabled){s.value='最大装弹数增加';s.dispatchEvent(new Event('change',{bubbles:true}));const t=row.querySelector('.tier-select');t.value='15'}}");
   for(const width of [null,650,390]) {
    await host(`document.querySelector('#panel-${id} iframe').style.width=${JSON.stringify(width?width+'px':'100%')}`);await delay(90);
    const result=await js("(()=>{const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');return {overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...document.querySelectorAll('.tier-select')].filter(e=>!e.disabled&&e.getClientRects().length).some(e=>{const s=getComputedStyle(e);ctx.font=s.font;return ctx.measureText(e.selectedOptions[0].textContent).width+parseFloat(s.paddingLeft)+parseFloat(s.paddingRight)+8>e.clientWidth})}})()");
    assert.deepEqual(result,{overflow:false,clipped:false},`${id} ${scope} ${width}`);
    await js("document.querySelector('#app').scrollIntoView({block:'start'})");await delay(80);
    fs.writeFileSync(path.join(cacheRoot,`ux-${id}-${scope}-${width||'wide'}.png`),(await web.capturePage()).toPNG());
   }
   await host(`document.querySelector('#panel-${id} iframe').style.width='100%'`);
  }
  await select('#collection-select','single-equipment');
  assert.equal(await js("document.querySelector('#calculation-rule [value=global-current]').disabled"),false);
  report[id]={trustedTierPicker:true,fullTierLabels:true,noOverflow:true,scopeRuleBoundary:true};
 }
 return {...report,twoLineKeyName:true,characterTargetsAddRemoveSix:true};
};
