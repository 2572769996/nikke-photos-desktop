const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
  const {spawn}=require('node:child_process');
  const experimentsCheck=process.argv.includes('--experiments');
  const growthCheck=process.argv.includes('--growth');
  const libraryCheck=process.argv.includes('--library');
  const raidCheck=process.argv.includes('--solo-raid');
  const comparisonCheck=process.argv.includes('--comparison');
  const dir=path.join(root,'.cache/damage-simulator/'+(experimentsCheck?'experiments-ui-check-':growthCheck?'growth-ui-check-':libraryCheck?'library-ui-check-':comparisonCheck?'comparison-ui-check-':raidCheck?'solo-raid-ui-check-':'ui-check-')+Date.now());fs.mkdirSync(dir,{recursive:true});
  const env={...process.env,DAMAGE_UI_CHECK_DIR:dir,EXPERIMENTS_UI_CHECK:experimentsCheck?'1':'0',GROWTH_UI_CHECK:growthCheck?'1':'0',LIBRARY_UI_CHECK:libraryCheck?'1':'0',SOLO_RAID_UI_CHECK:raidCheck?'1':'0',COMPARISON_UI_CHECK:comparisonCheck?'1':'0'};delete env.ELECTRON_RUN_AS_NODE;
  const fd=fs.openSync(path.join(dir,'runtime.log'),'a');
  const child=spawn(require('electron'),[__filename],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});
  child.on('error',e=>{console.error(e);process.exitCode=1});
  child.on('close',code=>{
    if(libraryCheck&&code===0){
      const second=spawn(require('electron'),[__filename],{cwd:root,env:{...env,LIBRARY_REOPEN_UI:'1'},windowsHide:true,stdio:['ignore',fd,fd]});
      second.on('error',error=>{console.error(error);process.exitCode=1});
      second.on('close',secondCode=>{fs.closeSync(fd);console.log(dir);console.log(fs.readFileSync(path.join(dir,'runtime.log'),'utf8'));process.exitCode=secondCode||0});
    }else{fs.closeSync(fd);console.log(dir);console.log(fs.readFileSync(path.join(dir,'runtime.log'),'utf8'));process.exitCode=code||0}
  });
}else{
  const {app,BrowserWindow,protocol,net,ipcMain,session}=require('electron');
  const {pathToFileURL}=require('node:url');
  const dir=process.env.DAMAGE_UI_CHECK_DIR;
  app.setPath('userData',path.join(dir,'userdata'));
  app.setPath('sessionData',path.join(dir,'userdata'));
  protocol.registerSchemesAsPrivileged([{scheme:'nikke',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
  let win,service;const errors=[];let external=0,simulationCalls=0,failureAt=0;
  const watchdog=setTimeout(()=>{console.error('UI check timeout');app.exit(1)},150000);
  app.whenReady().then(async()=>{
    const dist=path.join(root,'.cache/damage-simulator/ui-dist');
    protocol.handle('nikke',request=>{
      const url=new URL(request.url);const library=process.env.LIBRARY_UI_CHECK==='1'&&url.pathname.startsWith('/__library__/');if(library)url.pathname=url.pathname.slice('/__library__'.length);const base=library?path.join(root,'src'):url.host==='app'?dist:path.join(dist,'tools');
      const file=path.resolve(base,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
      return file.startsWith(base+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?net.fetch(pathToFileURL(file).href):new Response('not found',{status:404});
    });
    session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{const blocked=/^https?:/.test(details.url);if(blocked)external++;callback({cancel:blocked})});
    const exportPath=path.join(dir,'exported-scheme.json');let exportReady=false;
    session.defaultSession.on('will-download',(_event,item)=>{item.setSavePath(exportPath);item.once('done',(_e,state)=>{exportReady=state==='completed'})});
    service=require('../electron/damage-simulator.cjs').createDamageService({project:root});
    function guard(e){if(e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame||!e.senderFrame.url.startsWith('nikke://app/'))throw Error('Invalid sender')}
    ipcMain.handle('damage-simulator:status',e=>{guard(e);return service.status()});
    ipcMain.handle('damage-simulator:simulate',(e,draft)=>{guard(e);simulationCalls++;if(failureAt===simulationCalls)throw Error('隔离验收故障');return service.simulate(draft)});
    ipcMain.handle('damage-simulator:cancel',e=>{guard(e);return service.cancel()});
    ipcMain.handle('desktop:info',()=>({capabilities:{}}));
    win=new BrowserWindow({width:1480,height:1050,show:false,webPreferences:{preload:path.join(root,'electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message)});
    win.webContents.on('render-process-gone',(_e,detail)=>{throw Error(detail.reason)});
    const js=code=>win.webContents.executeJavaScript(code,true);
    const wait=async(code,timeout=20000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await js(code))return;await new Promise(r=>setTimeout(r,80))}throw Error('Wait failed: '+code)};
    const click=label=>js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing button '+${JSON.stringify(label)});b.click()})()`);
    const shot=async name=>{win.showInactive();win.webContents.invalidate();await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,250));fs.writeFileSync(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());win.hide()};
    await win.loadURL('nikke://app/#/tools');
    await wait(`!!document.querySelector('.tools-switcher')`);
    await js(`window.confirm=()=>true;document.querySelectorAll('[role=dialog] button').forEach(b=>{if(/知道|关闭|开始使用/.test(b.textContent))b.click()})`);
    await click('编队伤害模拟');
    await wait(`document.querySelector('.damage-engine')?.textContent.includes('已就绪')`);
    if(process.env.EXPERIMENTS_UI_CHECK==='1'){
      const report=await require('./experiments-ui-probe.cjs')({js,wait,click,shot,win,getExport:()=>({path:exportPath,ready:exportReady}),getCalls:()=>simulationCalls,setFailureAt:value=>failureAt=value});
      assert.equal(external,0);assert.deepEqual(errors,[]);report.offline=true;
      fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));
      console.log(JSON.stringify(report));clearTimeout(watchdog);service.cancel();app.exit(0);return;
    }
    if(process.env.GROWTH_UI_CHECK==='1'){
      const report=await require('./growth-ui-probe.cjs')({js,wait,click,shot,win,getExport:()=>({path:exportPath,ready:exportReady}),getCalls:()=>simulationCalls,setFailureAt:value=>failureAt=value});
      assert.equal(external,0);assert.deepEqual(errors,[]);report.offline=true;
      fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));
      fs.writeFileSync(path.join(root,'.cache/damage-simulator/latest-growth-ui.json'),JSON.stringify({dir,report},null,2));
      console.log(JSON.stringify(report));clearTimeout(watchdog);service.cancel();app.exit(0);return;
    }
    if(process.env.LIBRARY_UI_CHECK==='1'){
      const report=await require('./library-ui-probe.cjs')({js,wait,click,shot,win,getExport:()=>({path:exportPath,ready:exportReady}),getCalls:()=>simulationCalls,setFailureAt:value=>failureAt=value});
      assert.equal(external,0);assert.deepEqual(errors,[]);report.offline=true;
      const fullReport=process.env.LIBRARY_REOPEN_UI==='1'?{...JSON.parse(fs.readFileSync(path.join(dir,'result.json'),'utf8')),...report}:report;
      fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(fullReport,null,2));
      fs.writeFileSync(path.join(root,'.cache/damage-simulator/latest-library-ui.json'),JSON.stringify({dir,report:fullReport},null,2));
      console.log(JSON.stringify(report));clearTimeout(watchdog);service.cancel();app.exit(0);return;
    }
    if(process.env.COMPARISON_UI_CHECK==='1'){
      const report=await require('./comparison-ui-probe.cjs')({js,wait,click,shot,win,getExport:()=>({path:exportPath,ready:exportReady}),getCalls:()=>simulationCalls,setFailureAt:value=>failureAt=value});
      assert.equal(external,0);assert.deepEqual(errors,[]);report.offline=true;
      fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));
      fs.writeFileSync(path.join(root,'.cache/damage-simulator/latest-comparison-ui.json'),JSON.stringify({dir,report},null,2));
      console.log(JSON.stringify(report));clearTimeout(watchdog);service.cancel();app.exit(0);return;
    }
    if(process.env.SOLO_RAID_UI_CHECK==='1'){
      const report=await require('./solo-raid-ui-probe.cjs')({root,dir,win,js,wait,click,shot,getCalls:()=>simulationCalls,setFailureAt:value=>failureAt=value,getExport:()=>({path:exportPath,ready:exportReady})});
      assert.equal(external,0);assert.deepEqual(errors,[]);report.offline=true;
      fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));
      fs.writeFileSync(path.join(root,'.cache/damage-simulator/latest-solo-raid-ui.json'),JSON.stringify({dir,report},null,2));
      console.log(JSON.stringify(report));clearTimeout(watchdog);service.cancel();app.exit(0);return;
    }
    await click('载入示例');
    await wait(`document.querySelectorAll('.damage-member').length===5`);
    const visualAudit={};
    const audit=()=>js(`(()=>{const page=document.querySelector('.damage-page'),member=document.querySelector('.damage-member'),primary=document.querySelector('.damage-primary'),button=member.querySelector('button'),image=member.querySelector('img');return {font:getComputedStyle(page).fontFamily,bodySize:parseFloat(getComputedStyle(page).fontSize),nameSize:parseFloat(getComputedStyle(member.querySelector('h3')).fontSize),buttonHeight:button.getBoundingClientRect().height,avatarFit:getComputedStyle(image).objectFit,avatarSquare:Math.abs(image.getBoundingClientRect().width-image.getBoundingClientRect().height)<1,primaryColor:getComputedStyle(primary).color,primaryBg:getComputedStyle(primary).backgroundColor,controlBorder:getComputedStyle(document.querySelector('.damage-settings input')).borderColor,background:getComputedStyle(primary).getPropertyValue('--bg-2').trim()}})()`);
    const stored=await js(`JSON.parse(localStorage.getItem('nikke-photos/damage-simulator/v1'))`);
    const code=stored.draft.members[0].code;
    // Only synthetic profile data exists in this newly-created session directory.
    const roster=JSON.parse(fs.readFileSync(path.join(root,'src/data/roster.json'),'utf8')).characters;
    const character=roster.find(c=>c.nameCode===code);
    const record={limitBreak:{grade:3,core:0},affection:30,skills:{skill1:7,skill2:8,burst:9},cube:{resourceId:10003,level:15},favoriteItem:{rarity:'SR',level:15},equipments:Array.from({length:4},()=>[{functionType:'StatAtk',level:4,value:6.88}])};
    const index={version:2,currentId:'qa',profiles:[{id:'qa',name:'隔离验证档案',synchroLevel:400,research:{class:{Attacker:100,Defender:100,Supporter:100},corporation:{ELYSION:100,MISSILIS:100,TETRA:100,PILGRIM:100,ABNORMAL:100}},schemes:[]}]};
    await js(`localStorage.setItem('nikke-photos/profiles/v1/index',${JSON.stringify(JSON.stringify(index))});localStorage.setItem('nikke-photos/profiles/v1/data/qa',${JSON.stringify(JSON.stringify({version:2,characters:{[code]:record}}))})`);
    const profileBefore=await js(`localStorage.getItem('nikke-photos/profiles/v1/data/qa')`);
    await click('从本地档案导入养成');await wait(`!!document.querySelector('.damage-import-dialog')`);
    await click('取消');assert.equal(await js(`JSON.parse(localStorage.getItem('nikke-photos/damage-simulator/v1')).draft.members[0].source`),'统一预设');
    await click('从本地档案导入养成');await click('确认假设并导入快照');
    await wait(`document.querySelector('.damage-member small')?.textContent.includes('档案快照')`);
    assert.equal(await js(`JSON.parse(localStorage.getItem('nikke-photos/damage-simulator/v1')).draft.members[0].growth.skills.join('/')`),'7/8/9');
    assert.equal(await js(`localStorage.getItem('nikke-photos/profiles/v1/data/qa')`),profileBefore);
    await shot('formation-light');
    visualAudit.light=await audit();
    assert.ok(visualAudit.light.bodySize>=14);assert.ok(visualAudit.light.nameSize>=14);
    assert.ok(visualAudit.light.buttonHeight>=36);assert.equal(visualAudit.light.avatarFit,'contain');assert.equal(visualAudit.light.avatarSquare,true);
    await js(`document.querySelector('.damage-member>button').focus()`);
    await click('配置角色');await wait(`!!document.querySelector('.damage-dialog')`);
    assert.equal(await js(`document.activeElement===document.querySelector('.damage-dialog button')`),true,'dialog initial focus');
    await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}))`);
    assert.equal(await js(`document.activeElement===document.querySelector('.damage-dialog footer button:last-child')`),true,'shift-tab wraps');
    await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}))`);
    assert.equal(await js(`document.activeElement===document.querySelector('.damage-dialog button')`),true,'tab wraps');
    await shot('member-editor');await click('取消');
    assert.equal(await js(`document.activeElement===document.querySelector('.damage-member>button')`),true,'focus returns to trigger');
    await click('配置角色');await wait(`!!document.querySelector('.damage-dialog')`);
    await js(`(()=>{const input=[...document.querySelectorAll('.damage-dialog .damage-field')].find(l=>l.textContent.trim()==='技能一').querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'6');input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await click('应用到模拟');await wait(`!document.querySelector('.damage-dialog')`);
    assert.equal(await js(`JSON.parse(localStorage.getItem('nikke-photos/damage-simulator/v1')).draft.members[0].growth.skills[0]`),6);
    // Small duration keeps the UI contract test inexpensive; this still uses the real engine.
    await js(`(()=>{const input=[...document.querySelectorAll('.damage-settings label')].find(l=>l.textContent.includes('战斗时长')).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'15');input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await click('运行伤害模拟');
    await wait(`!!document.querySelector('.damage-metrics')`,60000);
    assert.equal(await js(`document.querySelectorAll('.damage-contribution').length`),5);
    await shot('results-light');
    await click('保存本次结果');await click('单队记录 · 1');await wait(`document.querySelectorAll('.damage-record').length===1`);
    await click('加载方案与结果');await wait(`!!document.querySelector('.damage-metrics')`);
    await click('编队与设置');
    await js(`document.querySelector('.damage-member-actions button[aria-label^="向右"]').click()`);
    await click('伤害结果');await wait(`document.querySelector('.damage-results')?.textContent.includes('配置已修改')`);
    await click('编队与设置');
    await click('导出方案');
    for(let i=0;i<80&&!exportReady;i++)await new Promise(r=>setTimeout(r,50));
    assert.equal(exportReady,true);
    const exported=JSON.parse(fs.readFileSync(exportPath,'utf8'));
    assert.equal(exported.format,'nikke-damage-workspace');assert.equal(exported.draft.members.length,5);
    const savedDraft=await js(`JSON.stringify(JSON.parse(localStorage.getItem('nikke-photos/damage-simulator/v1')).draft)`);
    const invalid={...exported,draft:{...exported.draft,name:{bad:true}}};
    const loadFile=data=>js(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(JSON.stringify(data))}],'scheme.json',{type:'application/json'}));const input=document.querySelector('.damage-head input[type=file]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await loadFile(invalid);await wait(`document.querySelector('.damage-error')?.textContent.includes('名称')`);
    assert.equal(await js(`JSON.stringify(JSON.parse(localStorage.getItem('nikke-photos/damage-simulator/v1')).draft)`),savedDraft,'failed file import preserves draft');
    await js(`document.querySelector('.damage-error button').click()`);
    await loadFile(exported);await wait(`document.querySelector('.damage-notice')?.textContent.includes('模拟方案已导入')`);
    await js(`document.documentElement.dataset.theme='dark'`);await shot('formation-dark');
    visualAudit.dark=await audit();
    assert.notEqual(visualAudit.dark.primaryBg,visualAudit.light.primaryBg);
    win.webContents.setZoomFactor(1.5);await new Promise(r=>setTimeout(r,200));
    assert.equal(await js(`document.querySelector('.damage-page').scrollWidth<=document.querySelector('.damage-page').clientWidth+1`),true,'150 percent zoom no horizontal overflow');
    await shot('formation-zoom150');win.webContents.setZoomFactor(1);
    win.setSize(844,520);await new Promise(r=>setTimeout(r,200));
    assert.equal(await js(`document.querySelector('.damage-page').scrollWidth<=document.querySelector('.damage-page').clientWidth+1`),true,'landscape no horizontal overflow');
    win.setSize(375,920);await new Promise(r=>setTimeout(r,200));
    assert.equal(await js(`document.querySelector('.damage-page').scrollWidth<=document.querySelector('.damage-page').clientWidth+1`),true,'375px no horizontal overflow');
    assert.equal(await js(`[...document.querySelectorAll('.damage-member-actions button')].every(b=>{const r=b.getBoundingClientRect(),p=b.closest('.damage-member').getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=p.left&&r.right<=p.right})`),true,'375px touch controls fully visible');
    await shot('formation-375');
    await win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal(await js(`matchMedia('(prefers-reduced-motion: reduce)').matches&&getComputedStyle(document.querySelector('.damage-member button')).transitionDuration==='0s'`),true,'reduced motion respected');
    win.webContents.debugger.detach();
    win.setSize(390,920);await new Promise(r=>setTimeout(r,200));
    assert.equal(await js(`document.querySelector('.damage-page').scrollWidth<=document.querySelector('.damage-page').clientWidth+1`),true,'390px no horizontal overflow');
    await shot('formation-390');
    await click('配置角色');await wait(`!!document.querySelector('.damage-dialog')`);await shot('editor-390');await click('取消');
    assert.equal(await js(`localStorage.getItem('nikke-photos/profiles/v1/data/qa')`),profileBefore);
    await win.reload();await wait(`!!document.querySelector('.tools-switcher')`);await click('编队伤害模拟');await wait(`document.querySelectorAll('.damage-member').length===5`);
    await click('单队记录 · 1');await wait(`document.querySelectorAll('.damage-record').length===1`);
    assert.equal(external,0);assert.equal(simulationCalls,1);
    const report={passed:true,realEngine:true,importAndCancel:true,editAndApply:true,profileUnchanged:true,results:true,recordAndReload:true,staleResult:true,fileRoundTrip:true,badFileKeepsDraft:true,narrow390:true,narrow375:true,zoom150:true,landscape:true,reducedMotion:true,dialogFocus:true,visualAudit,offline:true,errors};
    fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
    fs.writeFileSync(path.join(root,'.cache/damage-simulator/latest-ui.json'),JSON.stringify({dir,report},null,2));
    clearTimeout(watchdog);service.cancel();app.exit(errors.length?1:0);
  }).catch(async error=>{console.error(error.stack||error);if(errors.length)console.error(JSON.stringify(errors));service?.cancel();clearTimeout(watchdog);setTimeout(()=>app.exit(1),2000);try{if(win){win.showInactive();fs.writeFileSync(path.join(dir,'failed.png'),(await win.webContents.capturePage()).toPNG())}}catch{};app.exit(1)});
}
