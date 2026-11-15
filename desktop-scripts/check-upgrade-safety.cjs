// Real PowerShell updater against tiny owned fixtures, never an installed client.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),qa=path.resolve(root,'../codex temp/nikke-desktop/release-v1.1.0/safety-'+Date.now()),pkg=path.join(qa,'package');
fs.mkdirSync(pkg,{recursive:true});const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const old={'NIKKE Photos.exe':'MZ old app','resources/app.asar':'old archive','resources/locked.txt':'old locked'},next={'NIKKE Photos.exe':'MZ new app','resources/app.asar':'new archive','resources/new-file.py':'new program','resources/locked.txt':'new locked'};
const records=object=>Object.entries(object).map(([file,value])=>({path:file,size:Buffer.byteLength(value),sha256:hash(value)}));
function write(base,file,value){const dest=path.join(base,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,value)}
write(pkg,'asar-pieces.bin',next['resources/app.asar']);write(pkg,'asar-recipe.json',JSON.stringify([{source:'payload',offset:0,length:Buffer.byteLength(next['resources/app.asar'])}]));
for(const [f,v]of Object.entries(next))if(f!=='resources/app.asar')write(pkg,'files/'+f,v);
const payloadFiles=[];function walk(folder,rel=''){for(const e of fs.readdirSync(path.join(folder,rel),{withFileTypes:true})){const f=path.join(rel,e.name);if(e.isDirectory())walk(folder,f);else payloadFiles.push({path:f.replaceAll('\\','/'),sha256:hash(fs.readFileSync(path.join(folder,f)))})}}walk(pkg);
const manifest={version:'1.1.0',baseVersion:'1.0.0',baseFiles:records(old),targetFiles:records(next),changes:records(next),removed:[],payloadFiles,asarBaseSha256:hash(old['resources/app.asar'])};
write(pkg,'manifest.json',JSON.stringify(manifest));
function fixture(name){const target=path.join(qa,name);for(const [f,v]of Object.entries(old))write(target,f,v);write(target,'data/player.json','KEEP DATA');write(target,'my-backup.txt','KEEP UNKNOWN');return target}
function contents(target){let out={};function scan(rel=''){for(const e of fs.readdirSync(path.join(target,rel),{withFileTypes:true})){const f=path.join(rel,e.name);if(e.isDirectory())scan(f);else out[f.replaceAll('\\','/')]=fs.readFileSync(path.join(target,f),'utf8')}}scan();return out}
const helper=path.join(root,'desktop-scripts/apply-upgrade.ps1'),ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),backups=path.join(qa,'backups');
function run(target,locked=false){const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,'-TargetDir',target,'-PackageRoot',pkg,'-BackupRoot',backups];
 if(!locked)return spawnSync(ps,args,{encoding:'utf8',windowsHide:true,timeout:120000});
 const literal=s=>"'"+s.replaceAll("'","''")+"'";
 const command=`$h=[IO.File]::Open(${literal(path.join(target,'resources/locked.txt'))},[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);try{& ${literal(ps)} ${args.map(literal).join(' ')};exit $LASTEXITCODE}finally{$h.Dispose()}`;
 return spawnSync(ps,['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:120000});
}
const report={qa,checks:{},gameInputs:0};
try{
 let target=fixture('success'),r=run(target);assert.equal(r.status,0,r.stdout+r.stderr);for(const[f,v]of Object.entries(next))assert.equal(fs.readFileSync(path.join(target,f),'utf8'),v);assert.equal(contents(target)['data/player.json'],'KEEP DATA');report.checks.validUpdateAndDataPreserved=true;
 r=run(target);assert.equal(r.status,0,r.stdout+r.stderr);report.checks.repeatIsSafe=true;
 target=fixture('modified');write(target,'NIKKE Photos.exe','modified app');let before=contents(target);r=run(target);assert.equal(r.status,1);assert.deepEqual(contents(target),before);report.checks.modifiedBaselineRejected=true;
 target=fixture('damaged-payload');before=contents(target);write(pkg,'files/NIKKE Photos.exe','damaged');r=run(target);assert.equal(r.status,1);assert.deepEqual(contents(target),before);write(pkg,'files/NIKKE Photos.exe',next['NIKKE Photos.exe']);report.checks.damagedPayloadRejected=true;
 target=fixture('write-failure');before=contents(target);r=run(target,true);assert.equal(r.status,1,r.stdout+r.stderr);assert.deepEqual(contents(target),before);const receipts=fs.readdirSync(backups).map(d=>JSON.parse(fs.readFileSync(path.join(backups,d,'result.json'),'utf8').replace(/^\uFEFF/,'')));assert.ok(receipts.some(v=>v.phase==='apply'&&v.rollbackErrors.length===0));report.checks.actualWriteFailureRollsBack=true;
 target=fixture('traversal');before=contents(target);const invalid=structuredClone(manifest);invalid.targetFiles.push({path:'../outside',sha256:hash('bad')});write(pkg,'manifest.json',JSON.stringify(invalid));r=run(target);assert.equal(r.status,1);assert.deepEqual(contents(target),before);write(pkg,'manifest.json',JSON.stringify(manifest));report.checks.traversalRejected=true;
 report.passed=true;
}catch(error){report.passed=false;report.error=error.stack;process.exitCode=1}
fs.writeFileSync(path.join(qa,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
