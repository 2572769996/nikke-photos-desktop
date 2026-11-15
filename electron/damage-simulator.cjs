const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {spawn} = require('node:child_process');
const crypto = require('node:crypto');

function createDamageService({project, resourcesPath, packaged=false, spawnProcess=spawn, timeoutMs=120000}) {
  const engineRoot=packaged ? path.join(resourcesPath,'damage-simulator') : path.join(project,'tools/damage-simulator');
  const python=path.join(engineRoot,'python/python.exe'), bridge=path.join(engineRoot,'bridge.py');
  let active=null,verified=false;
  function verifyEngine() {
    if(verified)return;
    const vendor=path.join(engineRoot,'vendor');
    const hashes=JSON.parse(fs.readFileSync(path.join(engineRoot,'vendor-hashes.json'),'utf8'));
    for(const [name,hash] of Object.entries(hashes)) {
      const file=path.resolve(vendor,name);
      if(!file.startsWith(vendor+path.sep)||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==hash)throw Error('上游核心文件校验失败，请重新准备固定版本');
    }
    verified=true;
  }
  function cancel() {
    if(!active)return false;
    active.cancelled=true;active.child.kill();return true;
  }
  async function simulate(draft) {
    if(active)throw Error('已有伤害计算正在运行，请等待或取消');
    if(!fs.existsSync(python)||!fs.existsSync(bridge))throw Error('伤害计算运行环境不完整，请运行 setup-damage-simulator.ps1 准备独立引擎');
    if(JSON.stringify(draft).length>64000)throw Error('模拟方案过大');
    const {buildDamageRequest}=await import(pathToFileURL(packaged?path.join(engineRoot,'request.mjs'):path.join(project,'src/lib/damageSimulator.js')).href);
    const request=buildDamageRequest(draft);
    verifyEngine();
    // Recheck after import: concurrent IPC calls may have crossed the await.
    if(active)throw Error('已有伤害计算正在运行');
    return new Promise((resolve,reject)=>{
      const child=spawnProcess(python,['-I','-B',bridge],{cwd:engineRoot,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
      const job={child,cancelled:false,timedOut:false};active=job;
      let output='',stderr='',size=0,settled=false;
      const timer=setTimeout(()=>{job.timedOut=true;child.kill();},timeoutMs);
      const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);if(active===job)active=null;error?reject(error):resolve(result);};
      child.on('error',()=>finish(Error('无法启动本地伤害计算进程')));
      child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
      child.stdout.on('data',s=>{size+=Buffer.byteLength(s);if(size>8*1024*1024){child.kill();finish(Error('计算输出超过安全上限'));}else output+=s;});
      child.stderr.on('data',s=>{if(stderr.length<8192)stderr+=s;});
      child.stdin.on('error',()=>{});
      child.on('close',code=>{
        if(job.cancelled)return finish(Error('计算已取消'));
        if(job.timedOut)return finish(Error('计算超时，已停止本次任务'));
        try {
          const result=JSON.parse(output);
          if(result.error)throw Error(`上游引擎未能计算：${String(result.error.message).slice(0,1500)}`);
          if(code!==0||result.schema_version!==2||!Number.isFinite(result.total_damage)||!Array.isArray(result.members))throw Error('引擎返回格式不符合固定版本接口');
          finish(null,result);
        }catch(error){finish(Error(output?error.message:'本地引擎异常退出，请检查运行环境'));}
      });
      child.stdin.end(JSON.stringify({...request,_desktop_detail:draft.battle.detail===true}));
    });
  }
  return {simulate,cancel,status:()=>({running:!!active,ready:fs.existsSync(python)&&fs.existsSync(bridge)})};
}
module.exports={createDamageService};
