import {DAMAGE_CATALOG, buildDamageRequest, defaultDamageOperations, entryFor} from './damageSimulator.js'
const clone = value => JSON.parse(JSON.stringify(value))
export const SEARCH_LIMIT = 240
export const OPERATION_FIELDS = {
  tap:['速射开关','boolean'], tapRate:['速射频率','number'], tapWindow:['速射区间',['always','burst_charge','own_full_burst']],
  release:['松开时间','number'], reload:['装填策略',['off','before_fb_end','into_fb','finish_by_fb_end']],
  reloadMargin:['装填提前量','number'], cancelOnFull:['补弹后取消装填','boolean'],
  cover:['自身爆裂掩体','boolean'], hold:['自身爆裂蓄力保持','boolean'],
  burstDelay:['爆裂延迟','number'], waitCooldown:['冷却等待','number'], weaponModeSwap:['武器模式切换','boolean'],
  noBurst:['禁止爆裂','boolean'], burstCycles:['爆裂轮次','cycles'],
}
export function parseSearchValues(field,text) {
  const type=OPERATION_FIELDS[field]?.[1]
  if(!type || typeof text!=='string' || text.length>1000)throw Error('搜索参数格式无效')
  const tokens=type==='cycles'?text.trim().split(/[;；]/).map(v=>v.trim()):text.trim().split(/[,，\s]+/).filter(Boolean)
  if(!tokens.length)throw Error('请填写候选值')
  const values=tokens.map(token=>{
    if(type==='cycles') {if(token==='all')return '';if(!/^\d+(?:[,，\s]+\d+)*$/.test(token))throw Error('爆裂轮次用逗号分隔，方案用分号分隔，all代表全部轮次');return token}
    if(type==='boolean') {if(!['true','false'].includes(token))throw Error('开关候选值使用 true 或 false');return token==='true'}
    if(type==='number') {if(!Number.isFinite(Number(token)))throw Error('候选值必须是有限数值');return Number(token)}
    if(!type.includes(token))throw Error('不支持的参数值：'+token)
    return token
  })
  return [...new Set(values)]
}
function product(dimensions,visit) {
  const count=dimensions.reduce((n,values)=>n*values.length,1)
  if(count>SEARCH_LIMIT)throw Error('组合空间超过240，请缩小成员或候选值范围')
  const walk=(index,values)=>index===dimensions.length?visit(values):dimensions[index].forEach(value=>walk(index+1,[...values,value]))
  walk(0,[])
}
export function cubeSearchCandidates(baseline,options) {
  buildDamageRequest(baseline)
  if(!Array.isArray(options?.codes)||!options.codes.length||new Set(options.codes).size!==options.codes.length||options.codes.some(code=>!baseline.members.some(m=>m.code===code)))throw Error('请选择有效且不重复的搜索成员')
  if(!Array.isArray(options.cubes)||!options.cubes.length)throw Error('请至少选择一种魔方')
  const ids=new Set()
  for(const item of options.cubes) {
    if(ids.has(item.id)||!DAMAGE_CATALOG.cubes.some(c=>c.id===item.id&&c.engineName&&!c.limited))throw Error('魔方无效或重复')
    ids.add(item.id)
    if(!Number.isInteger(item.level)||item.level<1||item.level>15||!Number.isInteger(item.capacity)||item.capacity<0||item.capacity>5)throw Error('魔方等级须为1～15，可装备人数须为0～5')
  }
  const rows=[]
  product(options.codes.map(()=>options.cubes),values=>{
    const draft=clone(baseline)
    options.codes.forEach((code,index)=>Object.assign(draft.members.find(m=>m.code===code).growth,{cubeId:values[index].id,cubeLevel:values[index].level}))
    if(options.cubes.some(cube=>draft.members.filter(m=>Number(m.growth.cubeId)===cube.id).length>cube.capacity))return
    buildDamageRequest(draft)
    const label=options.codes.map((code,index)=>entryFor(code).name+' '+DAMAGE_CATALOG.cubes.find(c=>c.id===values[index].id).name+' Lv'+values[index].level).join(' / ').slice(0,100)
    rows.push({id:crypto.randomUUID(),label,draft})
  })
  if(!rows.length)throw Error('没有满足魔方可装备人数限制的组合（包含未参与搜索成员）')
  return rows
}
export function operationSearchCandidates(baseline,dimensions) {
  buildDamageRequest(baseline)
  if(!Array.isArray(dimensions)||!dimensions.length||dimensions.length>12)throw Error('请选择1～12个搜索维度')
  const keys=new Set()
  const parsed=dimensions.map(d=>{
    const member=baseline.members.find(m=>m.code===d.code)
    if(!member)throw Error('搜索成员不存在')
    if(baseline.battle.operation==='upstream'&&!member.operations)throw Error(entryFor(d.code).name+'请先在基准角色配置中启用独立操作参数，明确设置后再搜索，避免覆盖上游默认运用')
    const key=d.code+':'+d.field
    if(keys.has(key))throw Error('同一成员的同一参数不能重复')
    keys.add(key)
    return parseSearchValues(d.field,d.values)
  })
  const rows=[]
  product(parsed,values=>{
    const draft=clone(baseline)
    dimensions.forEach((dimension,index)=>{
      const member=draft.members.find(m=>m.code===dimension.code)
      member.operations={...defaultDamageOperations(),...member.operations,[dimension.field]:values[index]}
    })
    // Reject the entire search before appending anything if even one input is invalid.
    buildDamageRequest(draft)
    const label=dimensions.map((d,i)=>entryFor(d.code).name+' '+OPERATION_FIELDS[d.field][0]+'='+values[i]).join(' / ').slice(0,100)
    rows.push({id:crypto.randomUUID(),label,draft})
  })
  return rows
}
export function createRandomExperiment(draft,count,seed) {
  buildDamageRequest(draft)
  if(!Number.isInteger(count)||count<2||count>240)throw Error('随机样本数须为2～240')
  if(!Number.isInteger(seed)||seed<0||seed+count-1>2147483647)throw Error('种子序列须在0～2147483647内')
  const baseline=clone(draft)
  baseline.battle.expected=false
  baseline.battle.seed=seed
  const workspace={name:'多次随机模拟统计',experiment:{type:'random',count,seed},baseline,candidates:[]}
  for(let i=1;i<count;i++) {
    const next=clone(baseline);next.battle.seed=seed+i
    workspace.candidates.push({id:'sample-'+i,label:'样本 '+(i+1)+' · 种子 '+(seed+i),draft:next})
  }
  return workspace
}
export function validateRandomExperiment(workspace) {
  const {experiment:e,baseline,candidates}=workspace
  if(!e||e.type!=='random')throw Error('实验类型无效')
  const expected=createRandomExperiment(baseline,e.count,e.seed)
  if(baseline.battle.expected!==false||baseline.battle.seed!==e.seed||candidates.length!==e.count-1)throw Error('随机样本队列无效')
  for(let i=0;i<candidates.length;i++) {
    const item=candidates[i],reference=expected.candidates[i]
    if(item.id!==reference.id||item.growth!=null||JSON.stringify(item.draft)!==JSON.stringify(reference.draft))throw Error('随机样本只允许改变预定种子，不能混入养成或操作比较')
  }
}
export function sampleStatistics(values) {
  if(!values.length)return null
  if(values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('样本数值无效')
  const sorted=[...values].sort((a,b)=>a-b),n=values.length
  let mean=0,m2=0
  values.forEach((v,i)=>{const delta=v-mean;mean+=delta/(i+1);m2+=delta*(v-mean)})
  const quantile=p=>{const pos=(n-1)*p,lo=Math.floor(pos);return sorted[lo]+(sorted[Math.ceil(pos)]-sorted[lo])*(pos-lo)}
  return {n,mean,min:sorted[0],max:sorted[n-1],median:quantile(.5),p05:quantile(.05),p95:quantile(.95),
    sd:n>1?Math.sqrt(Math.max(0,m2/(n-1))):null,se:n>1?Math.sqrt(Math.max(0,m2/(n-1))/n):null}
}
