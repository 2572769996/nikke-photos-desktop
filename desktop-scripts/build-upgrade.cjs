// File-level differential update plus ASAR range reuse; no solver/runtime changes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
if(version!=='1.1.0')throw Error('This upgrade is explicitly for v1.0 -> v1.1.0');
const cache=path.resolve(root,'../codex temp/nikke-desktop/release-v'+version),stage=path.join(cache,'upgrade-stage-'+Date.now()),pkg=path.join(stage,'package');
const baseline=path.join(root,'release/v1.0/win-unpacked'),target=path.join(root,'release/v'+version+'/win-unpacked'),asar=require('@electron/asar');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function walk(dir,rel=''){let files=[];for(const e of fs.readdirSync(path.join(dir,rel),{withFileTypes:true})){const p=path.join(rel,e.name);if(e.isSymbolicLink())throw Error('Unexpected linked release file');if(e.isDirectory())files.push(...walk(dir,p));else{const b=fs.readFileSync(path.join(dir,p));files.push({path:p.replaceAll('\\','/'),size:b.length,sha256:sha(b)})}}return files.sort((a,b)=>a.path.localeCompare(b.path))}
function copy(from,to){fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to)}
function entries(header,prefix='',out=[]){for(const [name,v] of Object.entries(header.files||{})){const key=prefix+name;if(v.files)entries(v,key+'/',out);else if(v.offset!==undefined&&!v.unpacked&&!v.link)out.push({path:key,offset:Number(v.offset),size:v.size})}return out}
function makeAsarDelta(oldFile,newFile){
 const old=fs.readFileSync(oldFile),next=fs.readFileSync(newFile),oh=asar.getRawHeader(oldFile),nh=asar.getRawHeader(newFile),oldStart=8+oh.headerSize,newStart=8+nh.headerSize;
 const oldByHash=new Map();for(const f of entries(oh.header)){const bytes=old.subarray(oldStart+f.offset,oldStart+f.offset+f.size);oldByHash.set(f.size+':'+sha(bytes),oldStart+f.offset)}
 const chunks=[],recipe=[];let payloadOffset=0,cursor=0,reused=0;
 function segment(source,offset,length){if(!length)return;const last=recipe.at(-1);if(last&&last.source===source&&last.offset+last.length===offset)last.length+=length;else recipe.push({source,offset,length})}
 function payload(bytes){segment('payload',payloadOffset,bytes.length);chunks.push(bytes);payloadOffset+=bytes.length}
 payload(next.subarray(0,newStart));cursor=newStart;
 for(const f of entries(nh.header).sort((a,b)=>a.offset-b.offset)){
  const at=newStart+f.offset;if(at<cursor)throw Error('Overlapping ASAR entries');if(at>cursor)payload(next.subarray(cursor,at));
  const bytes=next.subarray(at,at+f.size),oldAt=oldByHash.get(f.size+':'+sha(bytes));
  if(oldAt!==undefined){segment('base',oldAt,f.size);reused+=f.size}else payload(bytes);
  cursor=at+f.size;
 }
 if(cursor<next.length)payload(next.subarray(cursor));
 const data=Buffer.concat(chunks),rebuilt=Buffer.concat(recipe.map(r=>(r.source==='base'?old:data).subarray(r.offset,r.offset+r.length)));
 if(!rebuilt.equals(next))throw Error('ASAR differential reconstruction is not byte-identical');
 fs.writeFileSync(path.join(pkg,'asar-pieces.bin'),data);fs.writeFileSync(path.join(pkg,'asar-recipe.json'),JSON.stringify(recipe));
 return {baseSha256:sha(old),targetSha256:sha(next),reusedBytes:reused,payloadBytes:data.length,targetBytes:next.length};
}
async function main(){
 fs.mkdirSync(pkg,{recursive:true});
 if(JSON.parse(asar.extractFile(path.join(baseline,'resources/app.asar'),'package.json')).version!=='1.0.0')throw Error('Wrong baseline');
 if(JSON.parse(asar.extractFile(path.join(target,'resources/app.asar'),'package.json')).version!==version)throw Error('Wrong target');
 const baseFiles=walk(baseline),targetFiles=walk(target),baseMap=new Map(baseFiles.map(f=>[f.path,f])),targetMap=new Map(targetFiles.map(f=>[f.path,f]));
 const changes=targetFiles.filter(f=>baseMap.get(f.path)?.sha256!==f.sha256),removed=baseFiles.filter(f=>!targetMap.has(f.path));
 for(const f of changes)if(f.path!=='resources/app.asar')copy(path.join(target,f.path),path.join(pkg,'files',f.path));
 const uninstaller=path.join(cache,'release-uninstaller.exe'),uninstallBytes=fs.readFileSync(uninstaller);
 const uninstallRecord={path:'Uninstall NIKKE Photos.exe',size:uninstallBytes.length,sha256:sha(uninstallBytes)};
 targetFiles.push(uninstallRecord);changes.push(uninstallRecord);copy(uninstaller,path.join(pkg,'files',uninstallRecord.path));
 const delta=makeAsarDelta(path.join(baseline,'resources/app.asar'),path.join(target,'resources/app.asar'));
 const payloadFiles=walk(pkg),manifest={version,baseVersion:'1.0.0',createdDate:'2026-11-03',baseFiles,targetFiles,changes,removed,payloadFiles,asarBaseSha256:delta.baseSha256};
 fs.writeFileSync(path.join(pkg,'manifest.json'),JSON.stringify(manifest,null,2));
 copy(path.join(root,'desktop-scripts/apply-upgrade.ps1'),path.join(stage,'apply-upgrade.ps1'));
 const output=path.join(root,'release/v'+version+'/NIKKE-Photos-v1.0-to-v1.1.0-Windows-x64-Upgrade.exe');
 const quote=s=>s.replaceAll('$','$$').replaceAll('"','$\\"');
 const source=`Unicode true
!include MUI2.nsh
!include LogicLib.nsh
Name "NIKKE Photos v1.0 升级至 v1.1.0"
OutFile "${quote(output)}"
InstallDir "$LOCALAPPDATA\\Programs\\NIKKE Photos"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 32
Icon "${quote(path.join(root,'build/icon.ico'))}"
VIProductVersion "1.1.0.0"
VIAddVersionKey /LANG=2052 "ProductName" "NIKKE Photos 升级包"
VIAddVersionKey /LANG=2052 "FileDescription" "NIKKE Photos v1.0 至 v1.1.0 升级包"
VIAddVersionKey /LANG=2052 "FileVersion" "1.1.0"
VIAddVersionKey /LANG=2052 "LegalCopyright" "小云雀来海"
!define MUI_WELCOMEPAGE_TEXT "此升级包仅适用于完整的 v1.0。请先退出 NIKKE Photos。升级会校验原程序并备份变更文件，保留角色档案与用户自留文件。若原程序文件缺失或已修改，请使用全量安装包。"
!insertmacro MUI_PAGE_WELCOME
!define MUI_DIRECTORYPAGE_TEXT_TOP "请选择现有 v1.0 的安装目录（含 NIKKE Photos.exe），不要选择 data 文件夹。"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TEXT "升级已完成。请手动启动 NIKKE Photos。原程序文件备份保存在本机 NIKKE Photos Upgrade Backups 目录。"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "SimpChinese"
Section
 InitPluginsDir
 SetOutPath "$PLUGINSDIR\\package"
 File /r "${quote(pkg)}\\*"
 SetOutPath "$PLUGINSDIR"
 File "${quote(path.join(stage,'apply-upgrade.ps1'))}"
 DetailPrint "正在校验并升级程序，请稍候……"
 nsExec::ExecToStack '\"$SYSDIR\\WindowsPowerShell\\v1.0\\powershell.exe\" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"$PLUGINSDIR\\apply-upgrade.ps1\" -TargetDir \"$INSTDIR\" -PackageRoot \"$PLUGINSDIR\\package\"'
 Pop $0
 Pop $1
 StrCmp $0 "0" upgrade_success
 MessageBox MB_OK|MB_ICONSTOP "升级未完成。请先退出软件，并确认选择的是完整的 v1.0 安装目录。详细原因：$1" /SD IDOK
 SetErrorLevel 1
 Abort
 upgrade_success:
 DetailPrint "升级完成，档案数据已保留。"
SectionEnd
`;
 const nsi=source;
 const nsiFile=path.join(stage,'upgrade.nsi');fs.writeFileSync(nsiFile,nsi,'utf8');
 const nsisRoot=path.resolve(root,'../codex temp/nikke-desktop/electron-builder/nsis-3.0.4.1');
 const inner=fs.readdirSync(nsisRoot).find(n=>fs.existsSync(path.join(nsisRoot,n,'makensis.exe'))),compiler=path.join(nsisRoot,inner,'makensis.exe');
 fs.writeFileSync(path.join(cache,'latest-upgrade.json'),JSON.stringify({stage,packageRoot:pkg,manifest:path.join(pkg,'manifest.json'),output,delta,changes:changes.length,removed:removed.length},null,2));
 console.log(JSON.stringify({stage,delta,changes:changes.length,removed:removed.length}));
 const r=spawnSync(compiler,['/INPUTCHARSET','UTF8',nsiFile],{cwd:stage,stdio:'inherit',windowsHide:true});if(r.error)throw r.error;if(r.status!==0)throw Error('NSIS upgrade build failed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
