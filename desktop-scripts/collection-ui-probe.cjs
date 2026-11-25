const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async({window,cacheRoot,ipcMain})=>{
 const cnDefinition=require('../src/data/cn-roster.json'),effectiveCn=cnDefinition.nameCodes.filter(code=>!cnDefinition.unlockAt?.[code]||Date.now()>=Date.parse(cnDefinition.unlockAt[code])),cnCount=effectiveCn.length;
 const web=window.webContents;let preferences={nameCodes:[],keys:{pause:'F8',stop:'F9'}},status={active:false,stage:'idle',draft:{},logs:[]};const calls=[];
 const shots=require('../electron/maanikke-screenshots.cjs').createScreenshotStore({cacheRoot});
 ipcMain.removeHandler('maanikke:screenshots');ipcMain.handle('maanikke:screenshots',(_e,command,args)=>{
  if(command==='stats')return shots.stats();if(command==='refresh')return shots.refresh();if(command==='read')return shots.read(args.id);if(command==='settings')return shots.settings(args);throw Error('Unexpected screenshot command');
 });
 // Replaces only this isolated check process's handler. No production test API.
 ipcMain.removeHandler('maanikke:request');ipcMain.handle('maanikke:request',(_event,command,args)=>{
  calls.push({command,args});
  if(command==='collectionPreferences'){if(args)preferences=args;return preferences}
  if(command==='collectionStatus')return status;
  if(command==='windows')return {count:1,windows:[{hwnd:'123',pid:123,title:'测试国服窗口'}]};
  if(command==='prepareGame')return {connected:true,captureBackend:'PrintWindow',captureFallback:true,target:{hwnd:'123',pid:123,title:'测试国服窗口'},windows:[{hwnd:'123',pid:123,title:'测试国服窗口'}]};
  if(command==='collectionEditRow'){const r={position:args.position,status:args.row.status,functionType:args.row.functionType,name:'攻击力增加',value:args.row.value,tier:4,manual:true};status.draft[args.nameCode].equipment[args.slot].rows[args.position-1]=r;return status;}
  if(command==='collectionArchiveReceipt'){shots.releaseReview(status.reviewImageIds||[]);status={active:false,stage:'idle',draft:{},logs:[]};preferences={...preferences,nameCodes:[]};return {...status,archiveSaved:{profileName:args.profileName,count:args.nameCodes.length}};}
  if(command==='collectionReviewDone'){shots.releaseReview(status.reviewImageIds||[]);status.reviewReleasedAt=Date.now();return status;}
  if(command==='collectionStart'){status={...status,runId:'fixture-run',active:true,stage:'starting',paused:false,error:null,createdAt:Date.now(),nameCodes:args.nameCodes,keys:args.keys,progress:{phase:'确认大厅',captureBackend:'PrintWindow',captureFallback:true},logs:['测试任务开始']};return status}
  if(command==='collectionPause'){status={...status,paused:!status.paused};return status}
  if(command==='collectionCancel'){status={...status,active:false,stage:'canceled',finishedAt:Date.now(),error:'测试停止，进度已保存'};return status}
  throw Error('Unexpected UI check command: '+command);
 });
 async function until(expr,label){for(let i=0;i<90;i++){const v=await web.executeJavaScript(expr);if(v)return v;await delay(100)}throw Error('UI timeout: '+label)}
 async function click(text){await until(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&b.getClientRects().length);return b&&!b.disabled})()`,text);await web.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&b.getClientRects().length);b.click()})()`);await delay(60)}
 async function input(label,value){await web.executeJavaScript(`(()=>{const el=document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);await delay(80)}
 async function snapshot(name){for(let attempt=0;attempt<3;attempt++){await delay(200);try{fs.writeFileSync(path.join(cacheRoot,name+'.png'),(await web.capturePage()).toPNG());return}catch(e){if(attempt===2)throw Error('Snapshot '+name+': '+e.message)}}}
 await until("!!document.querySelector('.topbar')",'host mounted');
 await web.executeJavaScript("document.querySelector('.cl-mute input')?.click();Array.from(document.querySelectorAll('.dlg-mask button')).find(el=>el.textContent.trim()==='知道了')?.click();location.hash='/equipment-collection'");
 window.setMinimumSize(500,600);window.setContentSize(1380,1000);
 await until("document.querySelector('[aria-label=\"采集角色列表\"]')?.querySelectorAll('input').length==="+cnCount,'roster');await delay(500);
 // Collection stays CN-only, with no global bar or extra CN toggle.
 assert.equal(await web.executeJavaScript("!!document.querySelector('.roster-scope-bar')"),false);
 assert.equal(await web.executeJavaScript("document.querySelectorAll('.collection-shared-filters .switch').length"),2);
 assert.equal(await web.executeJavaScript("document.querySelectorAll('[aria-label=\"采集角色列表\"] input').length"),cnCount);
 assert.equal(await web.executeJavaScript("!!document.querySelector('[aria-label=\"采集 米哈拉：羁绊锁链\"]')"),false);
 assert.equal(await web.executeJavaScript("document.querySelectorAll('.collection-shared-filters .fgroup').length"),6);
 assert.ok(await web.executeJavaScript("(()=>{const b=[...document.querySelectorAll('.collection-shared-filters .fgroup-btn')];return Math.abs(b[0].getBoundingClientRect().top-b[1].getBoundingClientRect().top)<2})()"));
 await until("[...document.querySelectorAll('.collection-role-icons img')].every(img=>img.complete&&img.naturalWidth>0)",'role icons');
 assert.equal(await web.executeJavaScript("document.querySelectorAll('.collection-element-icon').length"),cnCount);
 assert.equal(await web.executeJavaScript("document.querySelectorAll('.collection-burst-icon').length"),cnCount);
 assert.ok(await web.executeJavaScript("[...document.querySelectorAll('.collection-role-icons img')].every(img=>img.alt&&img.title)"));
 const filterRoster=require('../src/data/roster.json').characters,cnCodes=new Set(effectiveCn),cn=filterRoster.filter(c=>cnCodes.has(c.nameCode));
 async function option(group,choice){await web.executeJavaScript(`(()=>{const root=document.querySelector('.collection-shared-filters');const g=[...root.querySelectorAll('.fgroup')].find(g=>g.querySelector('.fgroup-btn').textContent.includes(${JSON.stringify(group)}));if(!g.classList.contains('open'))g.querySelector('.fgroup-btn').click()})()`);await delay(30);await web.executeJavaScript(`(()=>{const g=document.querySelector('.collection-shared-filters .fgroup.open');[...g.querySelectorAll('.fopt')].find(b=>b.querySelector('.name').textContent===${JSON.stringify(choice)}).click()})()`);await delay(50)}
 const count=()=>web.executeJavaScript("document.querySelectorAll('[aria-label=\"采集角色列表\"] input').length");
 await option('属性','燃烧');await option('属性','水冷');
 assert.equal(await count(),cn.filter(c=>['Fire','Water'].includes(c.element)).length);
 await option('企业',"泰特拉");
 assert.equal(await count(),cn.filter(c=>['Fire','Water'].includes(c.element)&&c.corporation==='TETRA').length);
 await web.executeJavaScript("document.querySelector('.collection-browser').scrollIntoView({block:'start'})");await snapshot('shared-filters-light');
 await web.executeJavaScript("document.querySelector('.collection-shared-filters .link-btn').click()");await delay(80);
 assert.equal(await count(),cnCount);
 await web.executeJavaScript("document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))");await delay(50);
 const storeBefore=await web.executeJavaScript('JSON.stringify({...localStorage})');
 assert.equal(await web.executeJavaScript("document.documentElement.lang==='zh-CN'&&!document.querySelector('.lang-toggle')"),true);
 await click('初始化并连接游戏');assert.ok(await web.executeJavaScript("document.body.innerText.includes('已连接：测试国服窗口')"));assert.equal(calls.filter(c=>c.command==='prepareGame').length,1);assert.ok(await web.executeJavaScript("document.body.innerText.includes('PrintWindow / GDI（备用）')"));
 assert.equal(await web.executeJavaScript("document.body.innerText.includes('连接与识别诊断')"),false);
 await input('采集角色搜索','taolesi');assert.ok(await web.executeJavaScript("document.querySelector('[aria-label=\"采集 桃乐丝\"]')!==null"));
 await input('采集角色搜索','');
 for(const name of ['桃乐丝','吉洛','小红帽']){await web.executeJavaScript(`document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify('采集 '+name))}+']').click()`);await delay(80)}
 await web.executeJavaScript("document.querySelector('[aria-label=\"上移 小红帽\"]').click()");
 await until('window.document.querySelectorAll("[aria-label=采集顺序] li")[1].textContent.includes("小红帽")','reorder');
 await delay(650);assert.equal(preferences.nameCodes.length,3);
 await snapshot('selection-light');
 await click('采集设置');await input('采集暂停快捷键','Ctrl+F8');await delay(650);assert.equal(preferences.keys.pause,'Ctrl+F8');
 await until("!!document.querySelector('[aria-label=\"截图管理\"]').textContent.includes('当前截图')",'screenshot settings');
 await click('刷新截图占用');
 await snapshot('settings-light');
 await click('选择角色');await click('启动所选角色采集（UAC）');
 assert.equal(await web.executeJavaScript("document.querySelector('.collection-shared-filters').disabled"),true);
 assert.ok(status.active);assert.equal(await web.executeJavaScript("[...document.querySelectorAll('[aria-label=\"采集角色列表\"] input')].every(i=>i.disabled)"),true);
 await click('暂停采集');assert.equal(status.paused,true);await click('继续采集');assert.equal(status.paused,false);
 await click('停止采集并保存进度');await until("document.body.innerText.includes('从中断角色继续')",'resume');await click('从中断角色继续（UAC）');
 assert.equal(calls.filter(c=>c.command==='collectionStart').at(-1).args.resumeRunId,'fixture-run');
 status={...status,active:true,stage:'recognizing',pendingOCR:8,returnedToLobby:true};
 await until("document.body.innerText.includes('后台待识别 8 件装备')",'background OCR status');
 assert.ok(await web.executeJavaScript("[...document.querySelectorAll('button')].find(b=>b.textContent==='暂停采集').disabled"));
 await snapshot('background-recognition');
 const roster=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../src/data/roster.json'))).characters,byCode=new Map(roster.map(c=>[c.nameCode,c]));
 const makeRows=()=>[1,2,3].map(position=>({position,status:'empty',reason:'unearned'}));
 const equipment=()=>Object.fromEntries(['head','chest','hands','legs'].map(slot=>[slot,{slot,rows:makeRows()}]));
 status.draft=Object.fromEntries(status.nameCodes.map(code=>[code,{nameCode:code,name:byCode.get(code).nameCn,status:'complete',equipment:equipment()}]));
 status.draft[status.nameCodes[0]].equipment.head.rows[0]={position:1,status:'unreadable',name:'攻击力增加',functionType:'StatAtk',value:6.88,suggested:true,needsConfirm:true,flags:['NAME_LOW_CONFIDENCE']};
 status.draft[status.nameCodes[0]].equipment.head.rows[2]={position:3,status:'unreadable',name:'防御力增加',functionType:'StatDef',value:4.77,suggested:true,needsConfirm:true};
 const {PNG}=require('pngjs'),testImage=path.resolve(__dirname,'../../codex temp/nikke-desktop/automation-dev-copy/admin-nikke/aae6f3c9-8a52-4492-91be-0ce5f96faa91/031-equipment-0-头.png');
 const png=fs.existsSync(testImage)?fs.readFileSync(testImage):PNG.sync.write(new PNG({width:1920,height:1080})),taskId=shots.beginTask();
 status.reviewImageIds=[];
 for(const c of Object.values(status.draft))for(const s of Object.values(c.equipment)){const id=shots.add({taskId,kind:'equipment',character:c.nameCode,png});shots.holdReview(id);s.imageId=id;status.reviewImageIds.push(id)}
 const skippedCode=status.nameCodes[1],searchTerm=byCode.get(skippedCode).nameCn;
 const searchId=shots.add({taskId,kind:'exception',character:skippedCode,png:PNG.sync.write(new PNG({width:2560,height:1440}))});
 shots.endTask(taskId);
 status.draft[skippedCode]={nameCode:skippedCode,name:searchTerm,status:'skipped',reason:'测试：候选身份无法判别',equipment:{},searchEvidence:{searchTerm,clientSize:[2560,1440],imageId:searchId}};
 status={...status,active:false,stage:'completed',pendingOCR:0,returnedToLobby:true,finishedAt:Date.now(),folder:path.join(cacheRoot,'synthetic-task'),logs:['测试：大厅确认','测试：角色完成','测试：歧义角色跳过','测试：已返回大厅']};
 await until("document.body.innerText.includes('本轮已完成')",'finished');await snapshot('progress-light');await click('查看本轮结果');
 await until("document.querySelectorAll('.collection-result').length===3",'results');
 assert.equal(await web.executeJavaScript("document.querySelectorAll('td.collection-unreadable').length"),2);
 assert.ok(await web.executeJavaScript("document.body.innerText.includes('候选身份无法判别')"));
 await click('查看当时截图');
 await until("document.querySelector('[aria-label=搜索结果完整截图] img')?.naturalWidth===2560",'original search screenshot');
 await click('原尺寸');
 await web.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
 const beforeRetry=status;
 await click('仅重试跳过角色（UAC）');
 assert.equal(calls.filter(c=>c.command==='collectionStart').at(-1).args.retrySkipped,true);
 assert.deepEqual(calls.filter(c=>c.command==='collectionStart').at(-1).args.nameCodes,beforeRetry.nameCodes);
 status=beforeRetry;
 await until("document.body.innerText.includes('本轮已完成')",'retry finished');await click('查看本轮结果');
 await snapshot('results-light');await click('需要核对');assert.equal(await web.executeJavaScript("document.querySelectorAll('.collection-result').length"),1);
 await click('已跳过');assert.equal(await web.executeJavaScript("document.querySelectorAll('.collection-result').length"),1);await click('全部结果');
 const first=status.draft[status.nameCodes[0]].name;
 assert.ok(await web.executeJavaScript("document.body.innerText.includes('攻击力增加 6.88% · 需核对')"));
 await web.executeJavaScript("document.querySelector('.collection-result').scrollIntoView({block:'start'})");

 assert.ok(await web.executeJavaScript("document.body.innerText.includes('防御力增加 4.77% · 需核对')"));
 await click('确认写入所选角色（2）');await until("!!document.querySelector('[role=dialog][aria-label=写入装备词条]')",'pending can save confirmed portion');
 assert.ok(await web.executeJavaScript("document.querySelector('[role=dialog][aria-label=写入装备词条]').textContent.includes('不进行核对也可保存至档案内')"));await click('取消');
 status.draft[status.nameCodes[0]].equipment.head.rows[2].value=null;
 await until("document.body.innerText.includes('防御力增加 · 数值未识别（不可写入）')",'truly missing value explicit');
 assert.equal(await web.executeJavaScript("document.querySelectorAll('.collection-result:first-child .collection-adopt-candidate').length"),1);
 status.draft[status.nameCodes[0]].equipment.head.rows[2].value=4.77;
 await until("document.body.innerText.includes('防御力增加 4.77% · 需核对')",'numeric candidate restored');
 await snapshot('candidate-review');
 assert.ok(status.draft[status.nameCodes[0]].equipment.head.rows[0].needsConfirm);
 assert.equal(calls.filter(c=>c.command==='collectionEditRow').length,0);
 await web.executeJavaScript(`document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify('查看 '+first+' 头部截图'))}+']').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))`);
 await until("!!document.querySelector('.collection-popup-crop img')?.complete",'equipment preview');
 assert.ok(await web.executeJavaScript("(()=>{const a=document.querySelector('.collection-result tbody tr').getBoundingClientRect(),b=document.querySelector('.collection-review-preview').getBoundingClientRect();return b.left>=a.right})()"));
 await web.executeJavaScript("document.querySelector('.collection-result').scrollIntoView({block:'start'})");await snapshot('review-preview-light');
 await click('查看完整截图');await until("!!document.querySelector('[aria-label=装备完整截图大图]')",'large screenshot');
 assert.ok(await web.executeJavaScript("document.querySelector('[aria-label=\"装备完整截图大图\"]').getBoundingClientRect().width>innerWidth*.9"));
 await click('原尺寸');await until("document.querySelector('.collection-image-dialog footer').textContent.includes('100%')",'original size');
 await web.executeJavaScript("document.querySelector('[aria-label=放大截图]').click()");await until("document.querySelector('.collection-image-dialog footer').textContent.includes('125%')",'zoom');
 await click('适应窗口');await snapshot('full-screenshot-modal');
 await web.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
 await until("!document.querySelector('[aria-label=装备完整截图大图]')",'close screenshot');
 await web.executeJavaScript(`document.querySelector('[aria-label='+${JSON.stringify(JSON.stringify('修改 '+first+' 头部 第1条'))}+']').click()`);await delay(100);
 await web.executeJavaScript("(()=>{const e=document.querySelector('[aria-label=修改词条类型]');e.value='StatAtk';e.dispatchEvent(new Event('change',{bubbles:true}))})()");await delay(80);
 await web.executeJavaScript("(()=>{const e=document.querySelector('[aria-label=修改词条数值]');e.value='6.88';e.dispatchEvent(new Event('change',{bubbles:true}))})()");await click('保存修改');
 await until("document.body.innerText.includes('词条修改已保存')",'edit saved');
 status.draft[status.nameCodes[0]].equipment.head.rows[0]={position:1,status:'unreadable',name:'攻击力增加',functionType:'StatAtk',value:6.88,suggested:true,needsConfirm:true};
 status.draft[status.nameCodes[0]].equipment.head.rows[2].value=null;
 // Seed only this isolated test profile; never touch the user's real data.
 const fixtureCode=status.nameCodes[0];
 await web.executeJavaScript(`(()=>{const index=JSON.parse(localStorage.getItem('nikke-photos/profiles/v1/index'));const key='nikke-photos/profiles/v1/data/'+index.currentId;localStorage.setItem(key,JSON.stringify({version:index.version,characters:{[${JSON.stringify(fixtureCode)}]:{combat:1234,skills:{skill1:7},equipments:[[{functionType:'StatDef',level:1,value:4.77},{functionType:'StatDef',level:1,value:4.77},{functionType:'StatDef',level:8,value:9.70}],[],[],[]]}}}))})()`);
 await web.executeJavaScript("document.documentElement.setAttribute('data-theme','dark')");await snapshot('results-dark');
 await web.executeJavaScript("document.querySelector('.collection-result').scrollIntoView({block:'center'})");await snapshot('results-table-dark');
 window.setContentSize(650,900);await snapshot('results-narrow');
 assert.equal(await web.executeJavaScript('innerWidth'),650);
 assert.ok(await web.executeJavaScript('document.documentElement.scrollWidth<=innerWidth+1'));
 await web.executeJavaScript('scrollTo(0,0)');await click('选择角色');await web.executeJavaScript("document.querySelector('.collection-browser').scrollIntoView({block:'start'})");await snapshot('selection-narrow');
 window.setContentSize(1380,1000);await web.executeJavaScript('scrollTo(0,0)');await snapshot('selection-dark');
 // Route round-trip restores persisted configuration, without modifying profiles.
 await web.executeJavaScript("location.hash='/automation-lab'");await delay(250);await web.executeJavaScript("location.hash='/equipment-collection'");
 await until("!!document.querySelector('[aria-label=\"采集 桃乐丝\"]')?.checked",'selection restored');
 await web.executeJavaScript("document.documentElement.setAttribute('data-theme','light');document.querySelector('#collection-tab-results').click()");await delay(100);
 // A preserved old row can conflict with a newly accepted OCR row: block the merged gear.
 const rulesBefore=await web.executeJavaScript("(()=>{const index=JSON.parse(localStorage.getItem('nikke-photos/profiles/v1/index'));return localStorage.getItem('nikke-photos/profiles/v1/data/'+index.currentId)})()");
 await web.executeJavaScript(`(()=>{const index=JSON.parse(localStorage.getItem('nikke-photos/profiles/v1/index')),key='nikke-photos/profiles/v1/data/'+index.currentId,data=JSON.parse(localStorage.getItem(key));data.characters[${JSON.stringify(fixtureCode)}].equipments[0][2]={functionType:'StatAtk',level:4,value:6.88};localStorage.setItem(key,JSON.stringify(data))})()`);
 const conflictRaw=await web.executeJavaScript("(()=>{const index=JSON.parse(localStorage.getItem('nikke-photos/profiles/v1/index'));return localStorage.getItem('nikke-photos/profiles/v1/data/'+index.currentId)})()");
 await click('确认写入所选角色（2）');await until("document.body.innerText.includes('词条重复')",'merged gear conflict blocked');
 assert.equal(await web.executeJavaScript("!!document.querySelector('[role=dialog][aria-label=写入装备词条]')"),false);
 assert.ok(await web.executeJavaScript("document.querySelector('.maa-error').textContent.includes('桃乐丝') && document.querySelector('.maa-error').textContent.includes('保留档案原值')"));
 await web.executeJavaScript("document.querySelector('.maa-error').scrollIntoView({block:'center'})");await snapshot('merged-conflict-explained');
 assert.equal(await web.executeJavaScript("(()=>{const index=JSON.parse(localStorage.getItem('nikke-photos/profiles/v1/index'));return localStorage.getItem('nikke-photos/profiles/v1/data/'+index.currentId)})()"),conflictRaw);
 await web.executeJavaScript(`(()=>{const index=JSON.parse(localStorage.getItem('nikke-photos/profiles/v1/index'));localStorage.setItem('nikke-photos/profiles/v1/data/'+index.currentId,${JSON.stringify(rulesBefore)})})()`);
 await click('确认写入所选角色（2）');await until("!!document.querySelector('[role=dialog][aria-label=写入装备词条]')",'archive confirm');await click('取消');
 assert.equal(await web.executeJavaScript(`(()=>{const index=JSON.parse(localStorage.getItem('nikke-photos/profiles/v1/index'));return JSON.parse(localStorage.getItem('nikke-photos/profiles/v1/data/'+index.currentId)).characters[${JSON.stringify(fixtureCode)}].equipments[0][0].functionType})()`),'StatDef');
 // A failed local archive write must leave all review data available.
 await web.executeJavaScript("window.__originalArchiveSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('nikke-photos/profiles/v1/data/'))throw new DOMException('测试写入失败','QuotaExceededError');return window.__originalArchiveSet.call(this,k,v)};true");
 await click('确认写入所选角色（2）');await click('写入档案');await until("document.body.innerText.includes('测试写入失败')",'failed write retained');
 assert.equal(await web.executeJavaScript("document.querySelectorAll('.collection-result').length"),3);
 assert.equal(calls.filter(c=>c.command==='collectionArchiveReceipt').length,0);assert.ok(Object.keys(status.draft).length===3);
 await web.executeJavaScript("Storage.prototype.setItem=window.__originalArchiveSet;delete window.__originalArchiveSet");
 await click('确认写入所选角色（2）');await click('写入档案');await until("document.body.innerText.includes('已写入「')",'archive saved');
 const saved=await web.executeJavaScript(`(()=>{const index=JSON.parse(localStorage.getItem('nikke-photos/profiles/v1/index'));return JSON.parse(localStorage.getItem('nikke-photos/profiles/v1/data/'+index.currentId)).characters[${JSON.stringify(fixtureCode)}]})()`);
 assert.equal(saved.equipments[0][0].functionType,'StatAtk');assert.equal(saved.equipments[0][0].level,4);assert.equal(saved.equipments[0][2].value,9.7);assert.equal(saved.equipments[0][1],null);assert.equal(saved.skills.skill1,7);assert.equal(saved.combat,1234);
 await snapshot('review-written-light');
 assert.equal(shots.stats().count,1);assert.ok(shots.read(searchId).available);
 await until("document.querySelector('#collection-tab-select').getAttribute('aria-selected')==='true'",'return to clean selection');
 assert.equal(await web.executeJavaScript("document.querySelectorAll('[aria-label=\"采集角色列表\"] input:checked').length"),0);
 assert.equal(await web.executeJavaScript("document.querySelectorAll('.collection-result').length"),0);
 assert.equal(preferences.nameCodes.length,0);assert.equal(status.stage,'idle');assert.deepEqual(status.draft,{});
 await snapshot('archive-reset-ready');

 return {passed:true,fixtureOnly:true,gameInputs:0,UAC:false,cnRosterCount:cnCount,sharedMultiSelectFilters:true,cnOnlyWithoutGlobalSwitch:true,elementAndBurstIcons:true,pinyinSearch:true,orderedSelection:true,persistedPreferences:true,pauseResumeStop:true,checkpointResumePayload:true,skipAndUnreadableVisible:true,resultFilters:true,lightDarkNarrow:true,oneClickConnect:true,previewDoesNotCoverRow:true,editSaved:true,confirmedProfileWrite:true,unreviewedCandidatesSavedWithoutAdoption:true,missingRowsPreserveAndSave:true,mergedConflictShowsNameAndSources:true,fullNumericCandidates:true,missingValueCannotAdopt:true,fallbackBackendVisible:true,cancelDoesNotWrite:true,unknownPreservesOriginal:true,otherFieldsPreserved:true,reviewCleanup:true,archiveReturnsCleanSession:true,failedWriteKeepsReview:true,isolatedProfileOnly:true};
};
