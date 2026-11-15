import catalog from './catalog.json' with { type:'json' }
import { AFFIX_TIER_VALUES } from './affixTiers.mjs'

export { catalog as DAMAGE_CATALOG }
export const DAMAGE_STORAGE_KEY = 'nikke-photos/damage-simulator/v1'
export const DAMAGE_STATS = [
  ['atk_pct','攻击力','StatAtk'], ['element_bonus','优越代码伤害','IncElementDmg'],
  ['max_ammo_pct','最大装弹数','StatAmmoLoad'], ['charge_speed_pct','蓄力速度','StatChargeTime'],
  ['charge_dmg_pct','蓄力伤害','StatChargeDamage'], ['crit_rate','暴击率','StatCritical'],
  ['crit_dmg','暴击伤害','StatCriticalDamage'], ['accuracy_pct','命中率','StatAccuracyCircle'], ['def_pct','防御力','StatDef'],
]
export const ELEMENTS = [['작열','燃烧'],['수냉','水冷'],['풍압','风压'],['전격','电击'],['철갑','铁甲']]
export const entryFor = code => catalog.characters.find(c=>c.code===String(code))
export const defaultBattle = () => ({ duration:180, defense:31784, element:'풍압', core:52, distance:30,
  firstBurst:3, detail:false, expected:true, seed:42, hasParts:false, operation:'auto', gauge:'fixed' })
export function presetMember(code) {
  if (!entryFor(code)?.supported) throw Error('该角色尚未得到此版本上游支持')
  return { code:String(code), source:'统一预设', growth:{ level:400, breakthrough:3, core:0, affinity:30,
    skills:[10,10,10], cubeId:10003, cubeLevel:15, collection:'SR15', favorite:0,
    gear:'overload', gearLevel:5, common:180, classResearch:100, companyResearch:100 },
    lines:Object.fromEntries(DAMAGE_STATS.map(([key])=>[key,key==='atk_pct'?'11.11,11.11':key==='element_bonus'?'22.15,22.15,22.15,22.15':key==='max_ammo_pct'?'64.82,64.82':''])) }
}
const integer = (v,min,max,label) => {
  if (v==='' || v==null || typeof v==='boolean' || !Number.isInteger(Number(v)) || Number(v)<min || Number(v)>max) throw Error(`${label}须为 ${min}～${max} 的整数`)
  return Number(v)
}
const decimal = (v,min,max,label) => {
  if (v==='' || v==null || typeof v==='boolean' || !Number.isFinite(Number(v)) || Number(v)<min || Number(v)>max) throw Error(`${label}须在 ${min}～${max} 之间`)
  return Number(v)
}
export function parseDamageLines(text, label) {
  if (typeof text!=='string' || text.length>500) throw Error(`${label}词条格式无效`)
  if (!text.trim()) return []
  const parts=text.trim().split(/[,，\s]+/)
  if(parts.length>4) throw Error(`${label}最多可填四条（每件装备一条）`)
  return parts.map(v=>decimal(v,0,100,label))
}

export const DAMAGE_EQUIPMENT_PARTS = [['head','头部','머리'],['body','躯干','몸통'],['arms','手臂','팔'],['legs','腿部','다리']]
export const DAMAGE_CORPORATIONS = [['엘리시온','极乐净土'],['미실리스','米西利斯'],['테트라','泰特拉'],['필그림','朝圣者'],['어브노말','反常']]
export function damageEquipment(member) {
  if (member.equipment == null) {
    const growth = member.growth
    const level = integer(growth.gearLevel,0,5,'装备强化等级')
    return Object.fromEntries(DAMAGE_EQUIPMENT_PARTS.map(([, , part]) => [
      part, growth.gear === 'none' ? {tier:'없음'} : growth.gear === 'T9' ? {tier:'T9',level,skills:[]} : {level,skills:[]},
    ]))
  }
  if (!Array.isArray(member.equipment) || member.equipment.length !== 4) throw Error('分部位装备须包含四件装备')
  return Object.fromEntries(DAMAGE_EQUIPMENT_PARTS.map(([, label, part], index) => {
    const item = member.equipment[index]
    if (!item || !['overload','corporate','none',...Array.from({length:9},(_,i)=>'T'+(i+1))].includes(item.type)) throw Error(label+'装备品质无效')
    const level = integer(item.level,0,5,label+'装备强化等级')
    if (item.type === 'none') return [part,{tier:'없음'}]
    if (item.type === 'overload') return [part,{level,skills:[]}]
    if (item.type === 'corporate') {
      if (!DAMAGE_CORPORATIONS.some(([key])=>key===item.corporation)) throw Error(label+'装备企业无效')
      return [part,{tier:'T9',corp:item.corporation,level,skills:[]}]
    }
    return [part,{tier:item.type,skills:[]}]
  }))
}


export const defaultDamageOperations = () => ({
  noBurst:false, tap:false, tapRate:4, tapWindow:'burst_charge', release:0.03,
  reload:'off', reloadMargin:0.1, cancelOnFull:false, cover:false, hold:false,
  burstDelay:0, burstCycles:'', waitCooldown:0, weaponModeSwap:false,
})
export function damageMemberOperations(member) {
  if (member.operations == null) return null
  const value = member.operations
  const label = entryFor(member.code)?.name || '角色'
  for (const key of ['noBurst','tap','cancelOnFull','cover','hold','weaponModeSwap']) {
    if (typeof value[key] !== 'boolean') throw Error(label+'的操作开关格式无效')
  }
  if (!['always','burst_charge','own_full_burst'].includes(value.tapWindow)) throw Error(label+'的速射区间无效')
  if (!['off','before_fb_end','into_fb','finish_by_fb_end'].includes(value.reload)) throw Error(label+'的装填策略无效')
  if ((value.tap || value.hold) && !['SR','RL'].includes(entryFor(member.code)?.weapon)) throw Error(label+'的武器不支持蓄力速射或蓄力保持')
  if (value.tap && value.hold) throw Error(label+'请分别比较速射与蓄力保持配置')
  if (typeof value.burstCycles !== 'string' || value.burstCycles.length > 500) throw Error(label+'的爆裂轮次格式无效')
  const cycles = value.burstCycles.trim() ? value.burstCycles.trim().split(/[,，\s]+/).map(cycle => integer(cycle,1,600,label+'爆裂轮次')) : false
  if (cycles && new Set(cycles).size !== cycles.length) throw Error(label+'的爆裂轮次不能重复')
  const rate = decimal(value.tapRate,0.1,20,label+'速射频率')
  const release = decimal(value.release,0.001,1,label+'松开时间')
  const margin = decimal(value.reloadMargin,0,10,label+'装填提前量')
  const delay = decimal(value.burstDelay,0,600,label+'爆裂延迟')
  const wait = decimal(value.waitCooldown,0,3,label+'冷却等待')
  if (wait > 0 && wait < 0.5) throw Error(label+'冷却等待须为0或0.5～3秒')
  const reload = value.reload === 'off'
    ? (value.cancelOnFull ? {cancel_on_full:true} : false)
    : {policy:value.reload,cancel_on_full:value.cancelOnFull,...(value.reload==='before_fb_end'?{lead:margin}:{margin})}
  return {control:{
    tap_fire:value.tap ? {rate,release,window:value.tapWindow} : false,
    reload, cover:value.cover ? {policy:'own_full_burst'} : false,
    hold:value.hold ? {policy:'own_full_burst',lead:0.5} : false,
    burst:{pattern:cycles,delay,wait_own_cooldown:wait || false},
  },weapon_mode_swap:value.weaponModeSwap}
}

export function buildDamageRequest(draft) {
  if (!draft || !Array.isArray(draft.members) || draft.members.length<1 || draft.members.length>5) throw Error('请添加 1～5 名角色')
  if(typeof draft.name!=='string' || draft.name.length>50) throw Error('编队名称须为不超过50字的文字')
  const battle=draft.battle, names=new Set(), chars={}
  if(battle?.detail!==undefined&&typeof battle.detail!=='boolean')throw Error('详细战斗日志开关格式无效')
  if (!battle || !ELEMENTS.some(([v])=>v===battle.element) || !['auto','upstream'].includes(battle.operation) || !['fixed','accumulate'].includes(battle.gauge) || typeof battle.expected!=='boolean' || typeof battle.hasParts!=='boolean') throw Error('战斗设置无效')
  const squad=draft.members.map(m=>{
    const c=entryFor(m?.code)
    if (!c?.supported) throw Error(`${c?.name || '该角色'}：此版本上游暂不支持`)
    if(names.has(c.engineName)) throw Error(`${c.name}不能重复编入同一队伍`)
    names.add(c.engineName)
    if(typeof m.source!=='string'||m.source.length>100)throw Error('角色配置来源无效')
    const g=m.growth
    if(!g || !Array.isArray(g.skills) || g.skills.length!==3 || !['overload','none','T9'].includes(g.gear)) throw Error(`${c.name}养成设置不完整`)
    const v=(val,min,max,label)=>integer(val,min,max,`${c.name}的${label}`)
    const cube=catalog.cubes.find(x=>x.id===Number(g.cubeId))
    if(!cube?.engineName || cube.limited) throw Error(`${c.name}请选择上游支持的魔方`)
    if(!/^(R|SR)([0-9]|1[0-5])$/.test(g.collection) && g.collection!=='없음') throw Error(`${c.name}收藏品无效`)
    const equip_skills=Object.fromEntries(DAMAGE_STATS.map(([key,label])=>[key,parseDamageLines(m.lines?.[key],`${c.name}的${label}`)]))
    const totalLines=Object.values(equip_skills).reduce((a,v)=>a+v.length,0)
    if(totalLines>12) throw Error(`${c.name}的词条合计不能超过十二条`)
    const overloadCount=m.equipment?m.equipment.filter(item=>item?.type==='overload').length:(g.gear==='overload'?4:0)
    if(totalLines>overloadCount*3||Object.values(equip_skills).some(lines=>lines.length>overloadCount))throw Error(c.name+'的词条数量超过已配置改造装备可容纳的数量')
    if(!m.equipment && g.gear!=='overload' && totalLines) throw Error(`${c.name}未选择改造装备，请先清空改造词条`)
    const gearLevel=v(g.gearLevel,0,5,'装备强化等级')
    chars[c.engineName]={ level:v(g.level,1,1000,'等级'), breakthrough:v(g.breakthrough,0,3,'突破'), core_enhancement:v(g.core,0,7,'核心'), affinity:v(g.affinity,1,40,'好感度'),
      skill_levels:g.skills.map((x,i)=>v(x,1,10,`技能${i+1}`)), cube:{name:cube.engineName,level:v(g.cubeLevel,1,15,'魔方等级')},
      collection_stage:g.collection, favorite_stage:v(g.favorite,0,3,'珍藏品阶段'),
      equipment:damageEquipment(m),
      equip_skills, console:{common_level:v(g.common,0,999,'通用研究'),class_level:v(g.classResearch,0,999,'职业研究'),company_level:v(g.companyResearch,0,999,'企业研究')} }
    if(chars[c.engineName].favorite_stage>0 && g.collection!=='SR15') throw Error(`${c.name}珍藏品须配合 SR15 属性使用`)
    if(chars[c.engineName].favorite_stage>0 && !c.favorite) throw Error(`${c.name}在此版本上游没有珍藏品机制`)
    return c.engineName
  })
  const operations=Object.fromEntries(draft.members.filter(member=>member.operations).map(member=>[entryFor(member.code).engineName,damageMemberOperations(member)]))
  const forbidden=draft.members.filter(member=>member.operations?.noBurst)
  if(forbidden.length>1)throw Error('固定上游接口每队仅支持指定一名禁止爆裂角色')
  return {schema_version:2, squad,...(Object.keys(operations).length?{chars:operations}:{}),
    sim:{duration:integer(battle.duration,1,600,'战斗时长'),expected:battle.expected,seed:integer(battle.seed,0,2147483647,'随机种子'),first_burst:decimal(battle.firstBurst,0,600,'首次爆裂时间'),burst_gauge_mode:battle.gauge,allow_unparsed:false},
    enemy:{def:decimal(battle.defense,0,1000000,'敌人防御'),code:battle.element,core_px:decimal(battle.core,0,1000,'核心大小'),distance:decimal(battle.distance,0,1000,'距离'),has_parts:battle.hasParts},
    operation:{auto:battle.operation==='auto',control_mode:'solo',...(forbidden.length?{no_burst:entryFor(forbidden[0].code).engineName}:{})},profile_level:'fixed', profile:{base:'ungrown',chars} }
}

// Import only the saved record. Missing fields never inherit the unified preset.
export function importDamageMember(code, record, profile, character, assumptions) {
  const c=entryFor(code)
  if(!c?.supported) throw Error('该角色尚未得到此版本上游支持')
  if(!record) throw Error(`${c.name}在所选档案中尚未录入`)
  const m=presetMember(code), cubeId=Number(record.cube?.resourceId)
  if(!catalog.cubes.some(x=>x.id===cubeId&&x.engineName)) throw Error(`${c.name}缺少可用魔方，请先补录`)
  const f=record.favoriteItem
  if(!f?.rarity || f.level==null) throw Error(`${c.name}收藏品信息不完整，请先补录`)
  const collection=f.rarity==='SSR'?'SR15':`${f.rarity}${f.level}`
  m.growth={ level:profile.synchroLevel, breakthrough:record.limitBreak?.grade,core:record.limitBreak?.core,affinity:record.affection,
    skills:[record.skills?.skill1,record.skills?.skill2,record.skills?.burst],cubeId,cubeLevel:record.cube?.level,
    collection,favorite:f.rarity==='SSR'?integer(f.level,0,2,'档案珍藏品阶段')+1:0,
    gear:'overload',gearLevel:assumptions.gearLevel,common:assumptions.common,
    classResearch:profile.research?.class?.[character.class],companyResearch:profile.research?.corporation?.[character.corporation] }
  if(!Array.isArray(record.equipments)||record.equipments.length!==4) throw Error(`${c.name}四件装备尚未完整录入`)
  const lines=Object.fromEntries(DAMAGE_STATS.map(([key])=>[key,[]]))
  for(const slot of record.equipments){
    if(!Array.isArray(slot) || slot.length>3 || (!slot[0]?.functionType && slot.slice(1).some(x=>x?.functionType))) throw Error(`${c.name}装备首条缺失或结构无效，请先修正`)
    const types=slot.filter(x=>x?.functionType).map(x=>x.functionType)
    if(new Set(types).size!==types.length) throw Error(`${c.name}同件装备词条重复，请先修正`)
    if(!slot.some(x=>x?.functionType)) throw Error(`${c.name}存在未录入装备，不能当作已知空词条`)
    for(const row of slot){
      if(!row?.functionType) continue
      const stat=DAMAGE_STATS.find(x=>x[2]===row.functionType), tiers=AFFIX_TIER_VALUES[row.functionType]
      if(!stat || !tiers) throw Error(`${c.name}存在未知词条`)
      const hasTier=row.level!==''&&row.level!=null, hasValue=row.value!==''&&row.value!=null
      const tier=hasTier?integer(row.level,1,15,'词条档位'):null
      const value=hasValue?Number(row.value):tiers[tier-1]
      if(!Number.isFinite(value)||!tiers.some(v=>Math.abs(v-value)<0.005)||(tier&&Math.abs(tiers[tier-1]-value)>=0.005)) throw Error(`${c.name}词条缺值或数值与档位不一致`)
      lines[stat[0]].push(value)
    }
  }
  m.lines=Object.fromEntries(Object.entries(lines).map(([k,v])=>[k,v.join(',')]))
  m.source=`档案快照：${profile.name}`
  buildDamageRequest({name:'档案快照验证',members:[m],battle:defaultBattle()})
  return m
}
export function readDamageWorkspace(storage) {
  try {
    const value=JSON.parse(storage.getItem(DAMAGE_STORAGE_KEY)||'null')
    if(value?.version!==1 || !Array.isArray(value.draft?.members) || !Array.isArray(value.records)) return null
    buildDamageRequest({...value.draft,members:value.draft.members.length?value.draft.members:[presetMember(catalog.characters.find(c=>c.supported).code)]})
    return {...value,records:value.records.slice(0,20).filter(r=>{
      try{buildDamageRequest(r.draft);return typeof r.id==='string' && typeof r.createdAt==='string' && r.result?.schema_version===2 && Number.isFinite(r.result.total_damage) && r.result.evaluator?.commit===catalog.commit}catch{return false}
    })}
  } catch {return null}
}
