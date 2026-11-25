const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createScreenshotStore,DAY}=require('../electron/maanikke-screenshots.cjs');
const {PNG}=require('pngjs');
const cacheRoot=process.env.NIKKE_CACHE_DIR||path.resolve(__dirname,'../../codex temp/nikke-desktop/automation-dev-copy');
const root=path.join(cacheRoot,'screenshot-check-'+Date.now());
fs.mkdirSync(root,{recursive:true});
const png=PNG.sync.write(new PNG({width:2,height:2}));
let clock=1000000000000;
let store=createScreenshotStore({cacheRoot:root,now:()=>clock});
assert.equal(store.stats().settings.exceptionDays,3);
assert.equal(store.stats().settings.equipmentCleanup,'task');
let task=store.beginTask();
store.add({taskId:task,png});store.add({taskId:task,kind:'equipment',character:'fixture',png});
assert.equal(store.stats().count,2);
assert.equal(store.clean().deleted,0);assert.equal(store.stats().count,2);
assert.throws(()=>store.settings({exceptionDays:7}),/运行中/);
store.endTask(task);assert.equal(store.stats().count,0);
store.settings({equipmentCleanup:'character'});task=store.beginTask();
store.add({taskId:task,png});store.add({taskId:task,kind:'equipment',character:'A',png});store.add({taskId:task,kind:'equipment',character:'B',png});
store.characterDone(task,'A');assert.equal(store.stats().count,2);
store.endTask(task);assert.equal(store.stats().count,0);
task=store.beginTask();store.add({taskId:task,png});store.endTask(task,{failed:true});
assert.equal(store.stats().count,1);
clock+=3*DAY-1;store=createScreenshotStore({cacheRoot:root,now:()=>clock});store.startup();assert.equal(store.stats().count,1);
clock++;store=createScreenshotStore({cacheRoot:root,now:()=>clock});store.startup();assert.equal(store.stats().count,0);
// Saving time, not modified time, determines expiry.
task=store.beginTask();store.add({taskId:task,png});store.endTask(task,{failed:true});
let manifest=JSON.parse(fs.readFileSync(path.join(root,'maanikke-screenshots.json'))),entry=manifest.entries[0];
fs.utimesSync(path.join(entry.directory,entry.filename),new Date(0),new Date(0));store.startup();assert.equal(store.stats().count,1);
store.settings({exceptionDays:0});assert.equal(store.stats().count,0);
for(const days of [1,3,7]){store.settings({exceptionDays:days});task=store.beginTask();store.add({taskId:task,png});store.endTask(task,{failed:true});clock+=days*DAY;store.startup();assert.equal(store.stats().count,0);}
task=store.beginTask();store.add({taskId:task,png});
store=createScreenshotStore({cacheRoot:root,now:()=>clock});store.startup();clock+=10*DAY;assert.equal(store.clean().deleted,0);assert.equal(store.stats().count,1);
store.endTask(task,{failed:false,resumeProtected:false});assert.equal(store.stats().count,0);
// Only registered files are removed; unknown files and manifests stay intact.
const unrelated=path.join(store.stats().settings.directory,'user-file.txt');fs.writeFileSync(unrelated,'keep');
task=store.beginTask();store.add({taskId:task,png});store.endTask(task,{failed:true});
const previous=store.stats().settings.directory;
store.changeDirectory(path.join(root,'new-location'));assert.notEqual(store.stats().settings.directory,previous);
assert.equal(store.stats().locations[0].directory,previous);store.clean();assert.ok(fs.existsSync(unrelated));
assert.ok(fs.existsSync(path.join(root,'maanikke-screenshots.json')));
const batchRoot=path.join(root,'batch'),batch=createScreenshotStore({cacheRoot:batchRoot});
const batchTask=batch.beginTask(),batchIds=[];
let markerReads=0,addReads;
const originalRead=fs.readFileSync;
fs.readFileSync=function(file,...args){
 if(path.basename(String(file))==='.nikke-screenshots-owner.json')markerReads++;
 return originalRead.call(this,file,...args);
};
try{
 for(let i=0;i<100;i++)batchIds.push(batch.add({taskId:batchTask,png}));
 addReads=markerReads;
 batch.stats(); // The UI polls this during collection.
}finally{fs.readFileSync=originalRead;}
console.log(JSON.stringify({batchSize:batchIds.length,addReads,pollReads:markerReads-addReads}));
assert.ok(addReads<=200,'Saving 100 screenshots rechecked earlier images '+addReads+' times');
assert.equal(markerReads,addReads,'The routine status poll rescanned previously saved images');
const batchFile=path.join(batchRoot,'maanikke-screenshots',batchIds[0]+'.png');
assert.equal(batch.stats().bytes,png.length*100);
fs.appendFileSync(batchFile,Buffer.alloc(24));
assert.equal(batch.refresh().bytes,png.length*100+24);
fs.unlinkSync(batchFile);
const reopened=createScreenshotStore({cacheRoot:batchRoot});
reopened.startup();
assert.equal(reopened.stats().bytes,png.length*99);
reopened.markException(batchIds[1],'fixture-skip');
reopened.endTask(batchTask);
const assigned=JSON.parse(fs.readFileSync(path.join(batchRoot,'maanikke-screenshots.json'))).entries;
assert.equal(assigned.length,1);assert.equal(assigned[0].character,'fixture-skip');
assert.equal(reopened.stats().bytes,png.length);
assert.equal(reopened.read(assigned[0].id).available,true);
const blockedRoot=path.join(root,'start-failure');
const blocked=createScreenshotStore({cacheRoot:blockedRoot});
const indexTemp=path.join(blockedRoot,'maanikke-screenshots.json.next');
fs.mkdirSync(indexTemp);
assert.throws(()=>blocked.beginTask(),error=>['EISDIR','EPERM','EACCES'].includes(error.code));
assert.equal(blocked.stats().activeTasks,0);
fs.rmdirSync(indexTemp);
const nextTask=blocked.beginTask();blocked.endTask(nextTask);
assert.throws(()=>store.settings({exceptionDays:2}),/无效/);
assert.throws(()=>store.settings({maxMiB:0}),/无效/);
store.settings({maxMiB:16});task=store.beginTask();
const large=Buffer.alloc(16*1024*1024+1);png.copy(large);
assert.throws(()=>store.add({taskId:task,png:large}),/上限/);assert.equal(store.stats().count,0);store.endTask(task);
manifest=JSON.parse(fs.readFileSync(path.join(root,'maanikke-screenshots.json')));
manifest.entries.push({id:'bad',filename:'../../user-file.txt',directory:previous,taskId:'finished',kind:'exception',savedAt:0});
fs.writeFileSync(path.join(root,'maanikke-screenshots.json'),JSON.stringify(manifest));
store=createScreenshotStore({cacheRoot:root,now:()=>clock});assert.ok(store.clean().errors.length);assert.ok(fs.existsSync(unrelated));
fs.writeFileSync(path.join(root,'result.json'),JSON.stringify({passed:true,taskEnd:true,perCharacter:true,exactExpiry:true,savedTime:true,restartProtection:true,pathChange:true,capacity:true,noUnknownDeletion:true}));
console.log(JSON.stringify({passed:true,evidence:root}));
async function adminLifecycle(){
 const {createAdminNavigation}=require('../electron/maanikke-admin.cjs');
 const adminStore=createScreenshotStore({cacheRoot:path.join(root,'admin-store')});
 for(const passed of [true,false]){
  let session;
  const navigation=createAdminNavigation({project:path.join(root,'fixture-project'),screenshotStore:adminStore,run:async(_exe,args)=>{
   const requestFile=args[args.indexOf('-RequestFile')+1];session=path.dirname(requestFile);const request=JSON.parse(fs.readFileSync(requestFile));
   fs.mkdirSync(path.join(session,'runtime'),{recursive:true});fs.writeFileSync(path.join(session,'before.png'),png);fs.writeFileSync(path.join(session,'runtime','latest-game.png'),png);
   fs.writeFileSync(path.join(session,'result.json'),JSON.stringify({runId:request.runId,passed,after:[],inputRequests:0}));
   return {stdout:JSON.stringify({started:true,canceled:false})};
  }});
  const result=await navigation.request({hwnd:'123',pid:123});assert.equal(result.passed,passed);
  assert.equal(fs.existsSync(path.join(session,'before.png')),false);assert.equal(fs.existsSync(path.join(session,'runtime','latest-game.png')),false);
  assert.equal(adminStore.stats().count,passed?0:1);assert.equal(adminStore.stats().activeTasks,0);
 }
 console.log(JSON.stringify({adminImportAndTaskCleanup:true,failedFrameRetained:true}));
}
adminLifecycle().catch(error=>{console.error(error);process.exitCode=1});
