// Capture the builder-generated, version-matched uninstaller before its cleanup.
const fs=require('node:fs'),path=require('node:path');
const [folder,dest]=process.argv.slice(2);let last='',size=-1,stable=0;
const timer=setInterval(()=>{
 try {
  const name=fs.existsSync(folder)&&fs.readdirSync(folder).find(n=>n.endsWith('__uninstaller.exe'));
  if(!name)return;
  const file=path.join(folder,name),bytes=fs.statSync(file).size;
  stable=file===last&&bytes===size?stable+1:0;last=file;size=bytes;
  if(stable>=3&&size>10000){fs.copyFileSync(file,dest);clearInterval(timer);process.exit(0)}
 } catch {}
},150);
setTimeout(()=>process.exit(1),900000).unref();
