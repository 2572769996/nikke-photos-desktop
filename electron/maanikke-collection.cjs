const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const {pathToFileURL}=require('node:url');
const execute=promisify(execFile),SLOTS=['head','chest','hands','legs'];
const atomic=(file,value)=>{fs.writeFileSync(file+'.next',JSON.stringify(value,null,2));fs.renameSync(file+'.next',file)};
function emptyRows(reason){return [1,2,3].map(position=>({position,status:reason==='unreadable'?'unreadable':'empty',empty:reason!=='unreadable',reason,name:null,value:null}));}
function normalizeRows(result){return [1,2,3].map(position=>{
 const row=result.rows?.find(r=>r.position===position);
 if(row?.status==='empty'&&!row.needsConfirm)return {...row,reason:'unearned'};
 if(row?.status==='ok'&&!row.needsConfirm&&Number.isFinite(row.value)&&row.name)return {...row,reason:null};
 // Preserve the engine's closest candidate. It remains non-writable until
 // manually confirmed, including rows where only the name was recognized.
 if(row&&(row.name||row.functionType||row.status==='empty'))return {...row,status:'unreadable',empty:false,reason:Number.isFinite(row.value)?'needs_confirmation':'value_missing',suggested:Number.isFinite(row.value),suggestedEmpty:row.status==='empty',needsConfirm:true};
 return {...emptyRows('unreadable')[position-1],flags:row?.flags||[],needsConfirm:true};
});}
function createCollection({project,cacheRoot,screenshots,shortcuts,launch=execute,ocr}){
 const base=path.join(cacheRoot,'maanikke-collection'),latest=path.join(base,'latest.json');fs.mkdirSync(base,{recursive:true});
 const roster=JSON.parse(fs.readFileSync(path.join(project,'src/data/roster.json'),'utf8')).characters;
 const cnDefinition=JSON.parse(fs.readFileSync(path.join(project,'src/data/cn-roster.json'),'utf8'));
 const cnCodes={has(code){const unlockAt=cnDefinition.unlockAt?.[code];return cnDefinition.nameCodes.includes(code)&&(!unlockAt||Date.now()>=Date.parse(unlockAt));}};
 const byCode=new Map(roster.map(c=>[c.nameCode,c]));let active=null,last=null,promise=null;
 const preferencesFile=path.join(base,'preferences.json');
 function preferences(value){
  const validate=v=>{
   if(!Array.isArray(v.nameCodes)||new Set(v.nameCodes).size!==v.nameCodes.length||v.nameCodes.some(c=>!byCode.has(c)||!cnCodes.has(c)))throw Error('无效角色选择');
   if(!v.keys||['pause','stop'].some(k=>typeof v.keys[k]!=='string'||!v.keys[k].trim()||v.keys[k].length>60)||v.keys.pause===v.keys.stop)throw Error('请设置两个不同的有效快捷键');
   return {nameCodes:v.nameCodes,keys:{pause:v.keys.pause,stop:v.keys.stop}};
  };
  if(value!==undefined){if(active)throw Error('任务期间不能更改采集设置');const checked=validate(value);atomic(preferencesFile,checked);return checked;}
  try{return validate(JSON.parse(fs.readFileSync(preferencesFile,'utf8')))}catch{return {nameCodes:[],keys:{pause:'F8',stop:'F9'}};}
 }
 function inactiveRun(runId){if(active)throw Error('请等待采集及后台识别结束');if(!last||last.runId!==runId)throw Error('结果任务已变化，请刷新后重试');return last;}
 async function editRow({runId,nameCode,slot,position,row}){
  const value=inactiveRun(runId),entry=value.draft[nameCode];
  if(!entry||entry.status==='skipped'||!SLOTS.includes(slot)||![1,2,3].includes(position)||!entry.equipment[slot]||!row)throw Error('无效词条位置');
  const {AFFIX_TIER_VALUES,FUNCTION_LABELS}=await import(pathToFileURL(path.join(project,'src/data/affixTiers.js')).href);let next;
  if(row.status==='empty'||row.status==='unreadable')next=emptyRows(row.status==='empty'?'manual':'unreadable')[position-1];
  else{const levels=AFFIX_TIER_VALUES[row.functionType],tier=levels?.findIndex(v=>typeof row.value==='number'&&Math.abs(v-row.value)<1e-6);if(row.status!=='ok'||tier===undefined||tier<0)throw Error('请选择词条和有效档位数值');next={position,status:'ok',empty:false,functionType:row.functionType,name:FUNCTION_LABELS[row.functionType],value:levels[tier],tier:tier+1,needsConfirm:false};}
  inactiveRun(runId);entry.equipment[slot].rows=entry.equipment[slot].rows.map(r=>r.position===position?{...next,manual:true,editedAt:Date.now()}:r);
  atomic(path.join(value.folder,'draft.json'),value.draft);atomic(path.join(value.folder,'status.json'),value);return status();
 }
 function reviewDone({runId}){const value=inactiveRun(runId);screenshots.releaseReview(value.reviewImageIds||[]);if(value.screenshotTaskId)screenshots.endTask(value.screenshotTaskId,{failed:value.stage!=='completed',resumeProtected:false});value.reviewReleasedAt=Date.now();atomic(path.join(value.folder,'status.json'),value);return status();}
 function archiveReceipt({runId,profileId,profileName,nameCodes}){
  const value=inactiveRun(runId);
  if(typeof profileId!=='string'||typeof profileName!=='string'||!Array.isArray(nameCodes)||!nameCodes.length||nameCodes.some(code=>value.draft[code]?.status!=='complete'))throw Error('无效档案写入回执');
  value.archiveReceipts??=[];value.archiveReceipts.push({profileId,profileName,nameCodes,savedAt:Date.now()});
  atomic(path.join(value.folder,'status.json'),value);
  return {...clearSession(),archiveSaved:{profileName,count:nameCodes.length}};
 }
 function clearHistory(value){
  if(!value||!/^[a-f0-9-]{36}$/.test(value.runId))throw Error('无效采集任务标识');
  const folder=path.join(base,value.runId);
  if(fs.existsSync(folder)){
   if(fs.lstatSync(folder).isSymbolicLink()||fs.realpathSync(folder).toLowerCase()!==folder.toLowerCase())throw Error('拒绝清理重定向任务目录');
   screenshots.releaseReview(value.reviewImageIds||[]);
   if(value.screenshotTaskId)screenshots.endTask(value.screenshotTaskId,{failed:!['completed','cleared'].includes(value.stage),resumeProtected:false});
   // No recursive delete: discard only known extracted-result files. Keep
   // action locks and operational logs, never touch profile data or exports.
   for(const name of fs.readdirSync(folder))if(/^ocr-\d+-(head|chest|hands|legs)\.json$/.test(name)){
    const file=path.join(folder,name);if(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink())fs.unlinkSync(file);
   }
   atomic(path.join(folder,'draft.json'),{});
   atomic(path.join(folder,'progress.json'),{});
   atomic(path.join(folder,'status.json'),{runId:value.runId,active:false,stage:'cleared',nameCodes:[],draft:{},logs:[],clearedAt:Date.now()});
  }
  if(fs.existsSync(latest)){if(fs.lstatSync(latest).isSymbolicLink())throw Error('任务索引不能为链接');fs.unlinkSync(latest);}
 }
 function clearSession(){
  if(active)throw Error('请等待采集停止后清理会话');
  if(last)clearHistory(last);
  const saved=preferences();preferences({nameCodes:[],keys:saved.keys});last=null;return status();
 }
 // Startup also clears an interrupted previous session, including after a
 // forced exit where before-quit did not run.
 if(fs.existsSync(latest)){
  const {runId}=JSON.parse(fs.readFileSync(latest,'utf8'));
  if(!/^[a-f0-9-]{36}$/.test(runId))throw Error('无效采集索引');
  clearHistory(JSON.parse(fs.readFileSync(path.join(base,runId,'status.json'),'utf8')));
 }
 const savedPreferences=preferences();preferences({nameCodes:[],keys:savedPreferences.keys});
 const persist=job=>{atomic(path.join(job.folder,'status.json'),job.status);atomic(path.join(job.folder,'draft.json'),job.status.draft)};
 function status(){
  const value=active?.status||last||{active:false,stage:'idle',draft:{},logs:[],keys:{pause:'F8',stop:'F9'}};
  let progress=null;if(active){try{progress=JSON.parse(fs.readFileSync(path.join(active.folder,'progress.json'),'utf8'))}catch{}}
  return {...value,progress};
 }
 const appendLog=(job,text)=>{job.status.logs.push(new Date().toLocaleTimeString()+' '+text);job.status.logs=job.status.logs.slice(-80)};
 const log=(job,text)=>{appendLog(job,text);persist(job)};
 function cancel(){if(active){active.stopRequested=true;fs.writeFileSync(path.join(active.folder,'cancel'),'user stop');log(active,'已请求停止；保留已截图内容的后台识别与进度');}}
 function pause(){if(active&&!active.navigationDone){const file=path.join(active.folder,'pause');if(fs.existsSync(file)){fs.unlinkSync(file);active.status.paused=false;log(active,'继续前重新核对当前页面');}else{fs.writeFileSync(file,'paused');active.status.paused=true;log(active,'已请求暂停游戏操作，后台继续识别已截图内容');}}return status();}
 async function readEquipment(job,event,png){
  const {classification,nameCode,slot}=event.data;
  if(!byCode.has(nameCode)||!job.status.nameCodes.includes(nameCode)||!SLOTS.includes(slot))throw Error('Invalid equipment event');
  let raw,rows;
  if(['unequipped','non_overload'].includes(classification))rows=emptyRows(classification);
  else if(classification==='overload'){
   const report=path.join(job.folder,`ocr-${nameCode}-${slot}.json`);
   try{
    if(ocr)raw=await ocr(png,report);
    else{
     await execute(process.execPath,[path.join(project,'scripts/ocr-equipment.mjs'),'--image',png,'--engine','v2','--report',report],{cwd:project,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,maxBuffer:4*1024*1024,timeout:30000});
     raw=JSON.parse(fs.readFileSync(report,'utf8'));
    }
    rows=normalizeRows(raw);
   }catch(error){rows=emptyRows('unreadable');raw={engineError:{message:error.message}};}
   if(raw?.engineError)rows=rows.map(r=>({...r,reason:'engine_error'}));
  }else rows=emptyRows('unreadable').map(r=>({...r,reason:'equipment_unknown'}));
  return {slot,classification,rows,readAt:Date.now(),engineError:raw?.engineError||null};
 }
 function finishCharacter(job,code){
  const entry=job.status.draft[code];
  if(!entry||entry.status==='skipped'||entry.status==='complete'||!entry.captureComplete)return;
  if(SLOTS.some(slot=>!entry.equipment[slot]||entry.equipment[slot].status==='pending'))return;
  entry.status='complete';persist(job);screenshots.characterDone(job.screenshotTask,code);log(job,'完成 '+entry.name);
 }
 function queueEquipment(job,event,png,imageId){
  const {nameCode,slot,classification}=event.data;
  if(!byCode.has(nameCode)||!job.status.nameCodes.includes(nameCode)||!SLOTS.includes(slot)||!imageId)throw Error('Invalid equipment event');
  const entry=job.status.draft[nameCode];if(!entry||entry.status!=='collecting')throw Error('角色截图事件顺序异常');
  const generation=job.generations[nameCode];
  // Persist intake before replying. This file remains readable until OCR ends,
  // even when navigation has already moved to another role or returned home.
  entry.equipment[slot]={slot,classification,status:'pending',rows:[],imageId,capturedAt:event.savedAt*1000};
  screenshots.holdReview(imageId);job.status.reviewImageIds??=[];job.status.reviewImageIds.push(imageId);
  job.status.pendingOCR++;persist(job);
  job.ocrTail=job.ocrTail.then(async()=>{
   try{
    const result=await readEquipment(job,event,png);
    if(job.generations[nameCode]===generation&&job.status.draft[nameCode]?.status!=='skipped'){
     job.status.draft[nameCode].equipment[slot]={...result,imageId,capturedAt:event.savedAt*1000};persist(job);
    }
   }finally{
    job.status.pendingOCR--;
    if(fs.existsSync(png))fs.unlinkSync(png);
    if(job.generations[nameCode]===generation)finishCharacter(job,nameCode);
    persist(job);
   }
  }).catch(error=>{
   job.ocrFailure=error;job.status.error='后台识别保存失败：'+error.message;
   fs.writeFileSync(path.join(job.folder,'cancel'),'OCR persistence failed');
  });
  return {queued:true,imageId,nameCode,slot};
 }
 async function handle(job,event){
  if(!Number.isSafeInteger(event.id)||event.id<1||!['frame','equipment','character','characterBegin','candidate','identity','started','skipped','done','failed'].includes(event.kind))throw Error('Invalid helper event');
  const png=path.join(job.folder,'spool',event.id+'.png');let imageId=null,result=null;
  if(event.image){
   if(!fs.existsSync(png)||fs.lstatSync(png).isSymbolicLink())throw Error('Missing helper screenshot');
   imageId=screenshots.add({taskId:job.screenshotTask,kind:event.kind==='equipment'?'equipment':event.kind==='failed'?'exception':'process',character:event.kind==='equipment'?event.data.nameCode:null,png:fs.readFileSync(png),savedAt:event.savedAt*1000});
   if(event.kind==='frame'&&event.data.phase==='等待搜索结果'&&event.data.nameCode===job.status.nameCodes[job.status.currentIndex]){
    const {nameCode,searchTerm,clientSize}=event.data;
    job.searchFrame={nameCode,searchTerm,clientSize,imageId};
   }
  }
  if(event.kind==='equipment')result=queueEquipment(job,event,png,imageId);
  if(event.kind==='characterBegin'){
   const code=event.data.nameCode;if(!job.requestedCodes.includes(code))throw Error('Invalid character begin');
   job.searchFrame=null;
   job.status.currentIndex=job.status.nameCodes.indexOf(code);job.status.currentName=byCode.get(code).nameCn;
   job.generations[code]=(job.generations[code]||0)+1;
   job.status.draft[code]={nameCode:code,name:byCode.get(code).nameCn,status:'collecting',equipment:{}};log(job,'开始 '+job.status.currentName);
  }
  if(event.kind==='candidate')log(job,'候选确认：'+byCode.get(event.data.nameCode)?.nameCn+'（'+event.data.reason+'）');
  if(event.kind==='identity')log(job,'立绘辅助核对：'+byCode.get(event.data.nameCode)?.nameCn+' · '+(event.data.artwork?.hit?'命中本地皮肤参考':'未命中，使用已确认文字和属性'));
  if(event.kind==='started'){job.status.stage='collecting';log(job,event.data.listConfirmed?'已确认妮姬列表，直接开始角色搜索':'已确认大厅，开始角色采集');}
  if(event.kind==='character'){
   const code=event.data.nameCode,entry=job.status.draft[code];
   if(!entry||SLOTS.some(slot=>!entry.equipment[slot]))throw Error('角色四槽结果尚未保存');
   entry.captureComplete=true;entry.status='recognizing';persist(job);finishCharacter(job,code);
   if(entry.status!=='complete')log(job,'截图完成 '+entry.name+'，后台识别中');
  }
  if(event.kind==='skipped'){
   const code=event.data.nameCode;if(!job.requestedCodes.includes(code))throw Error('Invalid skip');
   job.generations[code]=(job.generations[code]||0)+1;
   const frame=job.searchFrame?.nameCode===code?job.searchFrame:null;
   const {searchTerm,clientSize}=frame||event.data;
   const searchEvidence={searchTerm,clientSize,imageId:frame?.imageId};
   if(frame)screenshots.markException(frame.imageId,code);
   job.status.draft[code]={nameCode:code,name:byCode.get(code).nameCn,status:'skipped',reason:String(event.data.reason).slice(0,500),equipment:{},searchEvidence};
   persist(job);screenshots.characterDone(job.screenshotTask,code);log(job,'跳过 '+byCode.get(code).nameCn+'：'+event.data.reason);
  }
  if(event.kind==='done'){
   if(!event.data.returnedToLobby||job.requestedCodes.some(code=>{const e=job.status.draft[code];return !e||e.status!=='skipped'&&(!e.captureComplete||SLOTS.some(s=>!e.equipment[s]))}))throw Error('角色截图或大厅验证未完成');
   job.navigationDone=true;job.status.stage='recognizing';job.status.inputRequests=event.data.inputRequests||0;job.status.returnedToLobby=true;log(job,'已返回大厅，等待后台识别保存');
   const paused=path.join(job.folder,'pause');if(fs.existsSync(paused))fs.unlinkSync(paused);job.status.paused=false;persist(job);
  }
  if(event.kind==='failed'){job.terminal=event.data.canceled?'canceled':'failed';job.status.inputRequests=event.data.inputRequests||0;job.status.error=String(event.data.error);log(job,'停止：'+event.data.error);}
  if(event.kind!=='equipment'&&event.image&&fs.existsSync(png))fs.unlinkSync(png);
  return result;
 }
 async function start({nameCodes,resumeRunId,retrySkipped=false,keys={pause:'F8',stop:'F9'},target}){
  if(active)throw Error('已有角色采集任务正在运行');
  if(last?.reviewImageIds?.length&&!last.reviewReleasedAt&&!resumeRunId)throw Error('请先在结果页结束上一轮截图核对，再开始新任务；未完成任务可以续接。');
  if(!Array.isArray(nameCodes)||!nameCodes.length||nameCodes.length>roster.length||new Set(nameCodes).size!==nameCodes.length||nameCodes.some(c=>!byCode.has(c)||!cnCodes.has(c)))throw Error('请选择有效国服内置角色');
  if(!target||!/^\d+$/.test(target.hwnd)||!Number.isSafeInteger(target.pid))throw Error('无效游戏目标');
  if(typeof keys.pause!=='string'||typeof keys.stop!=='string'||!keys.pause.trim()||!keys.stop.trim()||keys.pause===keys.stop)throw Error('暂停和停止快捷键必须有效且不同');
  const registered=[];
  const runId=crypto.randomUUID(),folder=path.join(base,runId);
  let screenshotTask;
  let draft={},requestedCodes=nameCodes,completedCodes=[],reviewImageIds=[];
  if(retrySkipped&&!resumeRunId)throw Error('补采需要选择当前任务');
  try{
   for(const [key,callback] of [[keys.pause,()=>pause()],[keys.stop,()=>cancel()]]){
    if(!shortcuts.register(key,callback))throw Error('快捷键 '+key+' 已被占用，未启动任务，请改键');
    registered.push(key);
   }
   fs.mkdirSync(path.join(folder,'spool'),{recursive:true});
   if(resumeRunId){
    if(!/^[a-f0-9-]{36}$/.test(resumeRunId))throw Error('无效续接任务');
    const previous=inactiveRun(resumeRunId);
    if(JSON.stringify(previous.nameCodes)!==JSON.stringify(nameCodes))throw Error('续接名单不一致');
    draft=structuredClone(previous.draft);reviewImageIds=[...(previous.reviewImageIds||[])];
    if(retrySkipped){
     requestedCodes=nameCodes.filter(code=>draft[code]?.status==='skipped');
     if(!requestedCodes.length)throw Error('本轮没有已跳过的角色');
    }else{
     if(previous.stage==='completed')throw Error('任务已完成');
     completedCodes=nameCodes.filter(code=>['complete','skipped'].includes(draft[code]?.status));
    }
   }
   screenshotTask=screenshots.beginTask();
   const job={folder,registered,screenshotTask,requestedCodes,generations:{},ocrTail:Promise.resolve(),status:{runId,folder,nameCodes,keys,active:true,stage:'starting',paused:false,pendingOCR:0,reviewImageIds,createdAt:Date.now(),currentIndex:0,currentName:'',draft,logs:[],screenshotTaskId:screenshotTask}};
   persist(job);
   atomic(path.join(folder,'request.json'),{version:1,action:'collect-roster',runId,createdAt:Date.now()/1000,ownerPid:process.pid,capturePolicy:process.env.NIKKE_CAPTURE_POLICY==='printwindow-only'?'printwindow-only':'auto',nameCodes:requestedCodes,completedCodes,target:{hwnd:target.hwnd,pid:target.pid}});
   // Publish only after all startup files exist; a failed start keeps the previous run available.
   atomic(latest,{runId});active=job;last=job.status;
   let index=1,handling=false;
   const tick=async()=>{
    if(handling)return;const request=path.join(folder,'spool',index+'.json');if(!fs.existsSync(request))return;
    handling=true;const reply=path.join(folder,'spool',index+'.reply.json');
    try{const event=JSON.parse(fs.readFileSync(request,'utf8'));if(event.id!==index)throw Error('Event sequence mismatch');const result=await handle(job,event);atomic(reply,{ok:true,result});}
    catch(error){
     job.status.error=error.message;
     try{atomic(reply,{ok:false,error:error.message});}
     catch(replyError){job.status.error+='；发送失败回执时出错：'+replyError.message;}
     // The event may have failed while persisting this very run. Flush the error log during finalization.
     appendLog(job,'处理失败：'+job.status.error);
    }
    finally{index++;handling=false;}
   };
   const timer=setInterval(()=>void tick(),80);
   promise=(async()=>{
    try{
     log(job,'等待本人确认 UAC；任务只导航并读取装备');
     // Apply only to this launcher process; do not change user/machine policy or UAC.
     const output=await launch('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(project,'desktop-scripts/request-maanikke-collection.ps1'),'-ProjectRoot',project,'-CacheRoot',cacheRoot,'-RequestFile',path.join(folder,'request.json')],{cwd:project,windowsHide:true,timeout:Math.max(1900000,nameCodes.length*185000),maxBuffer:1024*1024,encoding:'utf8'});
     const launchResult=JSON.parse(output.stdout.replace(/^\uFEFF/,''));
     if(launchResult.canceled){job.terminal='canceled';job.status.error='UAC已取消，未输入';}
     await job.ocrTail;
     if(job.ocrFailure)throw job.ocrFailure;
     if(job.navigationDone){
      const processed=code=>['complete','skipped'].includes(job.status.draft[code]?.status);
      if(!requestedCodes.every(processed)||retrySkipped&&requestedCodes.some(code=>!job.generations[code]))throw Error('后台结果尚未完整保存');
      const finished=nameCodes.every(processed);
      job.terminal=job.stopRequested?'canceled':finished?'completed':'interrupted';
      log(job,finished?'任务结束，全部结果已保存':'跳过角色补采结束，可从中断角色继续');
     }
     if(!job.terminal){
      const reportFile=path.join(folder,'run-result.json');
      if(fs.existsSync(reportFile)){
       const result=JSON.parse(fs.readFileSync(reportFile,'utf8'));
       if(!['failed','canceled'].includes(result.phase)||typeof result.error!=='string')throw Error('采集模块终态报告无效');
       job.terminal=result.phase;job.status.error=result.error;
      }else{
       job.terminal='failed';
       const exit=launchResult.exitCode?`（退出码 ${launchResult.exitCode}）`:'';
       job.status.error=(job.status.error||'采集模块退出，进度已保存')+exit;
      }
     }
    }catch(error){
     job.terminal='failed';job.status.error=error.message;
     try{fs.writeFileSync(path.join(folder,'cancel'),'launcher failed');}
     catch(cancelError){job.status.error+='；停止标记写入失败：'+cancelError.message;}
    }
    finally{
     clearInterval(timer);
     const reportError=(label,error)=>{
      if(job.terminal==='completed')job.terminal='failed';
      job.status.error=[job.status.error,label+'：'+error.message].filter(Boolean).join('；');
     };
     try{
      while(handling)await new Promise(r=>setTimeout(r,30));
      try{await job.ocrTail;}catch(error){reportError('后台识别收尾失败',error);}
      try{
       // Only our own numeric spool PNGs and fixed scratch image are temporary.
       for(const name of fs.readdirSync(path.join(folder,'spool'))){if(/^\d+\.png$/.test(name)){const p=path.join(folder,'spool',name);if(!fs.lstatSync(p).isSymbolicLink())fs.unlinkSync(p);}}
       const scratch=path.join(folder,'runtime','latest-game.png');if(fs.existsSync(scratch)&&!fs.lstatSync(scratch).isSymbolicLink())fs.unlinkSync(scratch);
      }catch(error){reportError('清理临时截图失败',error);}
      try{screenshots.endTask(screenshotTask,{failed:job.terminal!=='completed'});}
      catch(error){reportError('结束截图任务失败',error);}
      job.status.active=false;job.status.stage=job.terminal||'failed';job.status.finishedAt=Date.now();
      try{persist(job);}catch(error){reportError('保存采集终态失败',error);job.status.stage=job.terminal||'failed';}
     }finally{
      active=null;
      registered.forEach(k=>shortcuts.unregister(k));
     }
    }
    return status();
   })();
   return status();
  }catch(error){
   registered.forEach(k=>shortcuts.unregister(k));
   if(screenshotTask){
    try{screenshots.endTask(screenshotTask,{failed:true});}
    catch(cleanupError){throw Error(error.message+'；结束截图任务失败：'+cleanupError.message,{cause:error});}
   }
   throw error;
  }
 }
 return {start,status,preferences,editRow,reviewDone,archiveReceipt,clearSession,pause,cancel,wait:()=>promise||Promise.resolve(status()),active:()=>!!active};
}
module.exports={createCollection,normalizeRows,emptyRows};
