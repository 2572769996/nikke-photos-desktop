const assert=require('node:assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async({window:win})=>{
 const web=win.webContents,host=s=>web.executeJavaScript(s);
 const ready=async(id,path)=>{await host(`document.querySelector('#tab-${id}').click()`);for(let i=0;i<150;i++){const f=web.mainFrame.frames.find(f=>f.url.includes(path));if(f&&await f.executeJavaScript("document.documentElement.dataset.calculatorReady==='true'"))return f;await delay(100)}throw Error('split ready timeout')};
 let stone=await ready('equipment-reroll','/equipment-reroll/index.html');
 let keys=await ready('key-strategy','/keys/index.html');
 // Exercise the original Workshop Worker and result history in the split entry.
 await stone.executeJavaScript(`(()=>{const scope=document.querySelector('#collection-select');scope.value='single-equipment';scope.dispatchEvent(new Event('change',{bubbles:true}));for(const id of ['initial-rows','target-rows'])[...document.querySelectorAll('#'+id+' .form-row')].forEach((row,i)=>{const stat=row.querySelector('.stat-select');stat.value=i?'空词条':'攻击力增加';stat.dispatchEvent(new Event('change',{bubbles:true}));const tier=row.querySelector('.tier-select');tier.value=i?'0':'1';tier.dispatchEvent(new Event('change',{bubbles:true}));const flag=row.querySelector('.flag-input');flag.checked=id==='target-rows'&&!i;flag.dispatchEvent(new Event('change',{bubbles:true}));const force=row.querySelector('.force-retain-toggle');if(force?.getAttribute('aria-pressed')==='true')force.click()})})()`);
 for(const rule of ['cn-legacy','global-current']) {
  await stone.executeJavaScript(`(()=>{const e=document.querySelector('#calculation-rule');e.value='${rule}';e.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#calculate').click()})()`);
  let completed=false;for(let i=0;i<200;i++){if(await stone.executeJavaScript("document.querySelector('#app').getAttribute('aria-busy')==='false'")){completed=true;break}await delay(100)}assert.ok(completed);
  assert.equal(await stone.executeJavaScript("document.querySelector('#message').textContent"),'');
  assert.match(await stone.executeJavaScript("document.querySelector('#result').textContent"),/满足全部目标/);
 }

 const read=f=>f.executeJavaScript("JSON.stringify({rule:document.querySelector('#calculation-rule').value,scope:document.querySelector('#collection-select').value,rows:[...document.querySelectorAll('#initial-rows .tier-select')].map(e=>e.value)})");
 const change=async(f,rule)=>{await f.executeJavaScript(`const e=document.querySelector('#calculation-rule');e.value='${rule}';e.dispatchEvent(new Event('change',{bubbles:true}))`);await delay(80)};
 await change(stone,'global-current');const stoneState=await read(stone);
 await change(keys,'cn-legacy');const keyState=await read(keys);
 assert.notEqual(stoneState,keyState);assert.equal(await read(stone),stoneState);
 for(const [id,f,expected,strategy] of [['equipment-reroll',stone,stoneState,'workshop-stone'],['key-strategy',keys,keyState,'zbx-keys']]) {
  await host(`document.querySelector('#tab-${id}').click()`);
  assert.equal(await f.executeJavaScript("document.querySelector('#resource-strategy').value"),strategy);
  assert.equal(await f.executeJavaScript("document.querySelector('#resource-strategy').getClientRects().length"),0);
  assert.equal(await read(f),expected);
 }
 assert.equal(await keys.executeJavaScript("document.querySelectorAll('.character-target-row').length"),6);
 const data=await keys.executeJavaScript("({stone:localStorage.getItem('nikke-tools:workshop:draft:v1'),keys:localStorage.getItem('nikke-tools:keys:draft:v1')})");assert.ok(data.stone&&data.keys);assert.notEqual(data.stone,data.keys);
 await new Promise(resolve=>{web.once('did-finish-load',resolve);web.reload()});
 for(let i=0;i<150;i++){if(await host("!!document.querySelector('.topbar')"))break;await delay(100)}
 await host("[...document.querySelectorAll('button')].find(b=>b.textContent==='知道了')?.click();location.hash='/tools'");
 for(let i=0;i<150;i++){if(await host("!!document.querySelector('#tab-equipment-reroll')"))break;await delay(100)}
 stone=await ready('equipment-reroll','/equipment-reroll/index.html');keys=await ready('key-strategy','/keys/index.html');
 assert.equal(await read(stone),stoneState);assert.equal(await read(keys),keyState);
 assert.equal(await keys.executeJavaScript("document.querySelectorAll('.character-target-row').length"),6);
 return {workshopSingleBothRules:true,independentDrafts:true,pinnedStrategies:true,hiddenStrategySwitch:true,tabSwitchPreservesState:true,reloadPreservesBoth:true,sixTargetRowsPersist:true};
};

