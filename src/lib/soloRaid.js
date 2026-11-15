import { DAMAGE_CATALOG, DAMAGE_STATS, damageEquipment, damageMemberOperations, buildDamageRequest, defaultBattle, entryFor } from './damageSimulator.js'

export const SOLO_RAID_KEY='nikke-photos/solo-raid/v1'
const copy=value=>JSON.parse(JSON.stringify(value))
export function createSoloRaid() {
  return {name:'个人突袭方案',battle:defaultBattle(),teams:Array.from({length:5},(_,i)=>({id:`team-${i+1}`,name:`第${i+1}队`,enabled:true,members:[]}))}
}
export const raidTeamDraft=(raid,team)=>({name:team.name||`第${raid.teams.findIndex(t=>t.id===team.id)+1}队`,members:copy(team.members),battle:copy(raid.battle)})
const text=(v,max)=>typeof v==='string'&&v.length<=max
const editableNumber=v=>v===''||(typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e9)
// Drafts retain temporarily empty/invalid numeric inputs; calculation has stricter validation.
export function validateSoloRaidDraft(input) {
  if(!input||!text(input.name,60)||!input.battle||!Array.isArray(input.teams)||input.teams.length!==5)throw Error('个人突袭方案须包含五支队伍及完整战斗设置')
  const base=defaultBattle(),battle={}
  for(const [key,value] of Object.entries(base)){
    const incoming=key==='detail'&&input.battle[key]===undefined?false:input.battle[key]
    if(typeof value==='number'?!editableNumber(incoming):typeof incoming!==typeof value)throw Error('战斗设置格式无效')
    battle[key]=incoming
  }
  if(!['작열','수냉','풍압','전격','철갑'].includes(battle.element)||!['auto','upstream'].includes(battle.operation)||!['fixed','accumulate'].includes(battle.gauge))throw Error('战斗设置选项无效')
  const teams=input.teams.map((team,index)=>{
    if(!team||team.id!==`team-${index+1}`||!text(team.name,50)||typeof team.enabled!=='boolean'||!Array.isArray(team.members)||team.members.length>5)throw Error(`第${index+1}队格式无效`)
    const used=new Set()
    const members=team.members.map(member=>{
      const c=entryFor(member?.code),g=member?.growth
      if(!c?.supported||used.has(c.engineName)||!text(member.source,100)||!g||!Array.isArray(g.skills)||g.skills.length!==3||!g.skills.every(editableNumber))throw Error(`第${index+1}队角色数据无效或重复`)
      used.add(c.engineName)
      const growth={}
      for(const key of ['level','breakthrough','core','affinity','cubeId','cubeLevel','favorite','gearLevel','common','classResearch','companyResearch']){
        if(!editableNumber(g[key]))throw Error(`${c.name}的养成格式无效`)
        growth[key]=g[key]
      }
      if(!['overload','none','T9'].includes(g.gear)||!text(g.collection,10)||(!/^(R|SR)([0-9]|1[0-5])$/.test(g.collection)&&g.collection!=='없음'))throw Error(`${c.name}的装备设置无效`)
      Object.assign(growth,{skills:[...g.skills],gear:g.gear,collection:g.collection})
      const lines=Object.fromEntries(DAMAGE_STATS.map(([key])=>{if(!text(member.lines?.[key],500))throw Error(`${c.name}的词条格式无效`);return [key,member.lines[key]]}))
      if(member.equipment!=null)damageEquipment(member)
      if(member.operations!=null)damageMemberOperations(member)
      return {code:c.code,source:member.source,growth,lines,...(member.equipment?{equipment:copy(member.equipment)}:{}),...(member.operations?{operations:copy(member.operations)}:{})}
    })
    return {id:team.id,name:team.name,enabled:team.enabled,members}
  })
  return {name:input.name,battle,teams}
}
export function soloRaidConflicts(raid) {
  const used=new Map(),conflicts=[]
  for(const [index,team] of raid.teams.entries()){
    if(!team.enabled)continue
    for(const member of team.members){
      const c=entryFor(member.code)
      if(!c?.engineName)continue
      const first=used.get(c.engineName)
      if(first)conflicts.push({code:c.code,name:c.name,teamIds:[first.id,team.id],message:`${c.name}同时出现在第${first.index+1}队与第${index+1}队，请移除其中一处或取消该队参与计算`})
      else used.set(c.engineName,{id:team.id,index})
    }
  }
  return conflicts
}
export function prepareSoloRaidQueue(input,teamId=null) {
  const raid=validateSoloRaidDraft(input),conflicts=soloRaidConflicts(raid)
  if(conflicts.length)throw Error(conflicts.map(c=>c.message).join('；'))
  if(teamId&&!raid.teams.some(t=>t.id===teamId&&t.enabled))throw Error('请先勾选当前队伍参与计算')
  const candidates=raid.teams.filter(t=>t.enabled&&(!teamId||t.id===teamId)),queue=[]
  for(const team of candidates){
    if(!team.members.length){if(teamId)throw Error('当前队伍尚未配置');continue}
    if(team.members.length!==5)throw Error(`${team.name||team.id}尚未编满五名角色，请补齐或取消该队参与计算`)
    const draft=raidTeamDraft(raid,team)
    try{buildDamageRequest(draft)}catch(e){throw Error(`${team.name||team.id}：${e.message}`)}
    queue.push({teamId:team.id,draft})
  }
  if(!queue.length)throw Error('请至少编成一支五人队伍并勾选参与计算')
  return {raid,queue,skipped:raid.teams.filter(t=>!queue.some(q=>q.teamId===t.id)).map(t=>t.id)}
}
export function validateSoloRaidResult(result,draft) {
  const names=buildDamageRequest(draft).squad
  if(result?.schema_version!==2||result.evaluator?.commit!==DAMAGE_CATALOG.commit||!Number.isFinite(result.total_damage)||result.total_damage<0||!Array.isArray(result.members)||result.members.length!==names.length||!Number.isFinite(result.duration)||Number(result.duration)!==Number(draft.battle.duration))throw Error('伤害结果与当前引擎或输入不一致')
  if(result.members.some((m,i)=>m.name!==names[i]||!Number.isFinite(m.damage)||m.damage<0))throw Error('伤害结果角色与输入不一致')
  if(result.members.reduce((sum,m)=>sum+m.damage,0)!==result.total_damage)throw Error('成员伤害之和与队伍总伤害不一致')
  return result
}
export async function runSoloRaidBatch(input,{simulate,onProgress=()=>{},signal,teamId=null}) {
  const prepared=prepareSoloRaidQueue(input,teamId)
  const run={raid:prepared.raid,queueIds:prepared.queue.map(q=>q.teamId),skipped:prepared.skipped,results:[],status:'running',activeTeamId:null,error:null}
  const notify=()=>onProgress({...run,results:[...run.results]})
  for(const item of prepared.queue){
    if(signal?.aborted){run.status='cancelled';run.activeTeamId=null;notify();return run}
    run.activeTeamId=item.teamId;notify()
    try{
      const result=await simulate(copy(item.draft))
      if(signal?.aborted){run.status='cancelled';run.activeTeamId=null;notify();return run}
      validateSoloRaidResult(result,item.draft)
      run.results.push({...item,result})
      notify()
    }catch(error){
      run.status=signal?.aborted?'cancelled':'failed'
      run.error=signal?.aborted?null:`${item.draft.name}：${error.message}`
      run.activeTeamId=null;notify();return run
    }
  }
  run.status='completed';run.activeTeamId=null;notify();return run
}
export function soloRaidTotal(run) {return run?.results?.reduce((sum,item)=>sum+item.result.total_damage,0)||0}
export function readSoloRaidWorkspace(storage) {
  try{
    const raw=storage.getItem(SOLO_RAID_KEY)
    if(!raw)return {raid:createSoloRaid(),records:[],error:''}
    if(raw.length>8e6)throw Error('个人突袭本地数据超过读取上限')
    const parsed=JSON.parse(raw)
    if(parsed.version!==1)throw Error('个人突袭数据版本不匹配')
    const raid=validateSoloRaidDraft(parsed.raid)
    const records=(Array.isArray(parsed.records)?parsed.records:[]).slice(0,10).filter(record=>{
      try{
        if(!text(record.id,80)||!text(record.createdAt,80)||record.status!=='completed')return false
        const wanted=record.queueIds
        if(!Array.isArray(wanted)||!wanted.length||new Set(wanted).size!==wanted.length||!Array.isArray(record.results)||record.results.length!==wanted.length)return false
        const prepared=prepareSoloRaidQueue(record.raid,wanted.length===1?wanted[0]:null)
        if(prepared.queue.length!==wanted.length)return false
        for(const [i,id]of wanted.entries()){
          const q=prepared.queue.find(q=>q.teamId===id),item=record.results[i]
          if(!q||item.teamId!==id||JSON.stringify(q.draft)!==JSON.stringify(item.draft))return false
          validateSoloRaidResult(item.result,item.draft)
        }
        return true
      }catch{return false}
    })
    return {raid,records,error:''}
  }catch(e){return {raid:createSoloRaid(),records:[],error:`个人突袭本地方案未能读取，原始数据已保留：${e.message}`}}
}
export function parseSoloRaidFile(textValue) {
  if(typeof textValue!=='string'||textValue.length>2e6)throw Error('五队方案文件不得超过 2 MB')
  const value=JSON.parse(textValue)
  if(value.format!=='nikke-solo-raid'||value.version!==1||value.engine!==DAMAGE_CATALOG.commit)throw Error('五队方案格式或引擎版本不匹配')
  return validateSoloRaidDraft(value.raid)
}
