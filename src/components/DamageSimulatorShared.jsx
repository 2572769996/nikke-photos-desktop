import { useEffect, useId, useRef, useState } from 'react'
import { CHARACTERS } from '../lib/roster.js'
import { getCurrentProfile, listProfiles } from '../lib/profileStore.js'
import { DAMAGE_CATALOG as catalog, DAMAGE_STATS, DAMAGE_EQUIPMENT_PARTS, DAMAGE_CORPORATIONS, defaultDamageOperations, entryFor, defaultBattle, buildDamageRequest, importDamageMember } from '../lib/damageSimulator.js'
import DamageTimeline from './DamageTimeline.jsx'
import DamageEventDetails from './DamageEventDetails.jsx'
import { exportDamageResultImage } from '../lib/damageImageExport.js'
import '../styles/damageSimulator.css'
import '../styles/damageSimulatorPolish.css'

const clone = value => JSON.parse(JSON.stringify(value))
const number = value => new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0}).format(value || 0)
const compact = value => value>=1e8 ? `${(value/1e8).toFixed(2)} 亿` : value>=1e4 ? `${(value/1e4).toFixed(2)} 万` : number(value)
const memberName = code => entryFor(code)?.name || '未收录角色'
const identity = name => catalog.characters.find(c=>c.engineName===name)
const engineLabel = text => catalog.characters.filter(c=>c.engineName).sort((a,b)=>b.engineName.length-a.engineName.length).reduce((s,c)=>s.replaceAll(c.engineName,c.name),String(text||''))
const burstLabel = text => engineLabel(text).replaceAll('full_burst 시작','全面爆裂开始').replaceAll('full_burst 종료','全面爆裂结束').replaceAll('stage:','阶段：').replaceAll('reenter:','阶段再进入：').replaceAll('사용','发动')
function Icon({name,className=''}) {
  const paths={play:'m8 5 11 7-11 7Z',download:'M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4',upload:'M12 16V4m-5 5 5-5 5 5M5 17v4h14v-4',left:'m14 6-6 6 6 6',right:'m10 6 6 6-6 6',close:'m6 6 12 12M6 18 18 6',settings:'M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6',plus:'M12 5v14M5 12h14',check:'m5 12 4 4L19 6',clock:'M12 8v4l3 2'}
  return <svg className={`damage-icon ${className}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{name==='clock'&&<circle cx="12" cy="12" r="9"/>}<path d={paths[name]||paths.plus}/></svg>
}
export function useDialogFocus(onClose,error) {
  const ref=useRef(null),closeRef=useRef(onClose)
  closeRef.current=onClose
  useEffect(()=>{
    const dialog=ref.current,previous=document.activeElement
    if(!dialog)return
    const controls=()=>[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(n=>n.getClientRects().length)
    controls()[0]?.focus({preventScroll:true})
    const keydown=e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeRef.current();return}
      if(e.key!=='Tab')return
      const nodes=controls(),first=nodes[0],last=nodes.at(-1)
      if(!dialog.contains(document.activeElement)||(e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last)){e.preventDefault();(e.shiftKey?last:first)?.focus()}
    }
    document.addEventListener('keydown',keydown,true)
    return()=>{document.removeEventListener('keydown',keydown,true);if(previous?.isConnected)previous.focus({preventScroll:true})}
  },[])
  useEffect(()=>{if(error)ref.current?.querySelector('[role="alert"]')?.focus()},[error])
  return ref
}
function Field({label,value,onChange,min,max,step=1}) {
  const id=useId(),invalid=value===''||value==null||!Number.isFinite(Number(value))||Number(value)<min||Number(value)>max||(step===1&&!Number.isInteger(Number(value)))
  return <label className="damage-field"><span>{label}</span><input name={label} autoComplete="off" type="number" inputMode={step===1?'numeric':'decimal'} value={value ?? ''} min={min} max={max} step={step} aria-invalid={invalid||undefined} aria-describedby={invalid?id:undefined} onChange={e=>onChange(e.target.value===''?'':Number(e.target.value))}/>{invalid&&<small id={id} className="damage-field-error">请填写 {min}～{max}{step===1?' 的整数':''}</small>}</label>
}
function Select({label,value,onChange,children}) {
  return <label className="damage-field"><span>{label}</span><select name={label} autoComplete="off" value={value} onChange={e=>onChange(e.target.value)}>{children}</select></label>
}
function MemberEditor({member,onSave,onClose}) {
  const [value,setValue]=useState(()=>clone(member)), [error,setError]=useState('')
  const dialog=useDialogFocus(onClose,error)
  const g=value.growth, patch=(key,v)=>setValue(m=>({...m,source:'手动配置',growth:{...m.growth,[key]:v}}))
  const operation=(key,setting)=>setValue(member=>({...member,source:"手动配置",operations:{...member.operations,[key]:setting}}))
  const save=()=>{try{buildDamageRequest({name:'角色配置验证',members:[value],battle:defaultBattle()});onSave(value)}catch(e){setError(e.message)}}
  return <div className="damage-modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose()}}><section ref={dialog} className="damage-dialog" role="dialog" aria-modal="true" aria-labelledby="damage-edit-title">
    <header><div><small>角色配置</small><h2 id="damage-edit-title">{memberName(value.code)}</h2></div><button onClick={onClose} aria-label="关闭角色配置"><Icon name="close"/></button></header>
    <p className="damage-muted">{value.source}。这里的修改只影响模拟，不写入角色档案。</p>
    <div className="damage-fields">
      {[['level','等级',1,1000],['breakthrough','突破',0,3],['core','核心',0,7],['affinity','好感度',1,40]].map(([key,label,min,max])=><Field key={key} label={label} min={min} max={max} value={g[key]} onChange={v=>patch(key,v)}/>)}
      {['技能一','技能二','爆裂技能'].map((label,i)=><Field key={label} label={label} min={1} max={10} value={g.skills[i]} onChange={v=>patch('skills',g.skills.map((x,j)=>i===j?v:x))}/>)}
      <Select label="魔方" value={g.cubeId} onChange={v=>patch('cubeId',Number(v))}>{catalog.cubes.filter(c=>c.engineName&&!c.limited).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      <Field label="魔方等级" min={1} max={15} value={g.cubeLevel} onChange={v=>patch('cubeLevel',v)}/>
      <Select label="收藏品" value={g.collection} onChange={v=>patch('collection',v)}><option value="없음">未装备</option>{['R','SR'].flatMap(r=>Array.from({length:16},(_,i)=><option key={r+i} value={r+i}>{r} · {i}级</option>))}</Select>
      <Select label="珍藏品阶段" value={g.favorite} onChange={v=>patch('favorite',Number(v))}>{(entryFor(value.code)?.favorite?[0,1,2,3]:[0]).map(v=><option key={v} value={v}>{v?`第 ${v} 阶段（属性设 SR15）`:'未装备'}</option>)}</Select>
      <Select label="四件装备基础" value={g.gear} onChange={v=>patch('gear',v)}><option value="overload">改造装备</option><option value="T9">普通 T9（无企业加成）</option><option value="none">未装备</option></Select>
      <Field label="四件统一强化等级" min={0} max={5} value={g.gearLevel} onChange={v=>patch('gearLevel',v)}/>
      {[['common','通用研究'],['classResearch','职业研究'],['companyResearch','企业研究']].map(([key,label])=><Field key={key} label={label} min={0} max={999} value={g[key]} onChange={v=>patch(key,v)}/>)}
    </div>

    <h3>分部位装备</h3>
    <label className="damage-checkbox"><input type="checkbox" checked={Boolean(value.equipment)} onChange={event=>setValue(member=>{
      const next={...member,source:'手动配置'}
      if(event.target.checked) next.equipment=DAMAGE_EQUIPMENT_PARTS.map(()=>({type:g.gear,level:g.gearLevel,corporation:'엘리시온'}))
      else delete next.equipment
      return next
    })}/>分别配置四件装备</label>
    {value.equipment&&<><p className="damage-muted">启用后，各部位的品质与强化等级使用下方设置。普通 T1～T9 使用上游固定基础属性。</p>
      {DAMAGE_EQUIPMENT_PARTS.map(([key,label],index)=><div className="damage-fields" key={key} style={{marginBottom:14}}>
        <Select label={label+'品质'} value={value.equipment[index].type} onChange={type=>setValue(member=>({...member,source:'手动配置',equipment:member.equipment.map((item,i)=>i===index?{...item,type}:item)}))}>
          <option value="overload">改造装备</option><option value="corporate">企业 T9</option><option value="none">未装备</option>
          {Array.from({length:9},(_,i)=><option key={i} value={'T'+(i+1)}>普通 T{i+1}</option>)}
        </Select>
        {['overload','corporate'].includes(value.equipment[index].type)&&<Field label={label+'强化等级'} min={0} max={5} value={value.equipment[index].level} onChange={level=>setValue(member=>({...member,source:'手动配置',equipment:member.equipment.map((item,i)=>i===index?{...item,level}:item)}))}/>}
        {value.equipment[index].type==='corporate'&&<Select label={label+'企业'} value={value.equipment[index].corporation} onChange={corporation=>setValue(member=>({...member,source:'手动配置',equipment:member.equipment.map((item,i)=>i===index?{...item,corporation}:item)}))}>
          {DAMAGE_CORPORATIONS.map(([key,name])=><option key={key} value={key}>{name}</option>)}
        </Select>}
      </div>)}
    </>}


    <h3>角色操作与爆裂</h3>
    <label className="damage-checkbox"><input type="checkbox" checked={Boolean(value.operations)} onChange={event=>setValue(member=>{
      const next={...member,source:'手动配置'}
      if(event.target.checked)next.operations=defaultDamageOperations()
      else delete next.operations
      return next
    })}/>单独设置角色操作</label>
    {value.operations&&<div className="damage-fields">
      <Select label="速射" value={value.operations.tap?'on':'off'} onChange={choice=>operation('tap',choice==='on')}><option value="off">关闭</option><option value="on">启用（蓄力武器）</option></Select>
      <Field label="速射次数 / 秒" min={0.1} max={20} step={0.1} value={value.operations.tapRate} onChange={number=>operation('tapRate',number)}/>
      <Select label="速射区间" value={value.operations.tapWindow} onChange={choice=>operation('tapWindow',choice)}>
        <option value="always">全程</option><option value="burst_charge">爆裂充能期间</option><option value="own_full_burst">自身爆裂期间</option>
      </Select>
      <Field label="松开时间 · 秒" min={0.001} max={1} step={0.001} value={value.operations.release} onChange={number=>operation('release',number)}/>
      <Select label="装填控制" value={value.operations.reload} onChange={choice=>operation('reload',choice)}>
        <option value="off">关闭</option><option value="before_fb_end">全面爆裂结束前开始装填</option><option value="into_fb">下一轮全面爆裂开始时完成装填</option><option value="finish_by_fb_end">全面爆裂结束前完成装填</option>
      </Select>
      <Field label="装填提前量 · 秒" min={0} max={10} step={0.1} value={value.operations.reloadMargin} onChange={number=>operation('reloadMargin',number)}/>
      <Field label="爆裂延迟 · 秒" min={0} max={600} step={0.1} value={value.operations.burstDelay} onChange={number=>operation('burstDelay',number)}/>
      <Field label="等待自身冷却 · 秒（0为关闭）" min={0} max={3} step={0.1} value={value.operations.waitCooldown} onChange={number=>operation('waitCooldown',number)}/>
      <label className="damage-field"><span>允许爆裂的轮次（空白为全部）</span><input value={value.operations.burstCycles} placeholder="例如 1,3,5" onChange={event=>operation('burstCycles',event.target.value)}/></label>
      {[['noBurst','禁止该角色爆裂（每队最多一人）'],['cancelOnFull','弹药补满时取消装填'],['cover','自身全面爆裂期间保持掩体'],['hold','自身全面爆裂期间保持蓄力'],['weaponModeSwap','手动装填进入武器切换模式']].map(([key,label])=><label key={key} className="damage-checkbox"><input type="checkbox" checked={value.operations[key]} onChange={event=>operation(key,event.target.checked)}/>{label}</label>)}
    </div>}

    <h3>改造词条</h3><p className="damage-muted">每条填写百分比数值，用逗号分隔，例如 4.63,6.09。保留逐条数值参与上游取整；空白代表没有该词条，合计最多十二条。</p>
    <div className="damage-fields damage-affixes">{DAMAGE_STATS.map(([key,label])=><label className="damage-field" key={key}><span>{label} %</span><input name={key} autoComplete="off" inputMode="decimal" spellCheck={false} value={value.lines[key]} placeholder="无" onChange={e=>setValue(m=>({...m,source:'手动配置',lines:{...m.lines,[key]:e.target.value}}))}/></label>)}</div>
    {error&&<p role="alert" tabIndex={-1} className="damage-error">{error}</p>}
    <footer><button onClick={onClose}>取消</button><button className="damage-primary" onClick={save}>应用到模拟</button></footer>
  </section></div>
}
function ProfileImport({members,onImport,onClose}) {
  const [profileId,setProfileId]=useState(()=>getCurrentProfile().id),[selected,setSelected]=useState(()=>members[0]?.code||''),[common,setCommon]=useState(180),[gearLevel,setGear]=useState(5),[error,setError]=useState('')
  const profiles=listProfiles()
  const dialog=useDialogFocus(onClose,error)
  const apply=()=>{
    try{
      const profile=profiles.find(p=>p.id===profileId)
      // Read a selected saved profile without switching the host's current profile.
      const store=JSON.parse(localStorage.getItem(`nikke-photos/profiles/v1/data/${profileId}`)||'null')
      const record=store?.characters?.[selected]
      const character=CHARACTERS.find(c=>c.nameCode===selected)
      const imported=importDamageMember(selected,record,profile,character,{common,gearLevel})
      onImport(imported)
    }catch(e){setError(e.message)}
  }
  return <div className="damage-modal-backdrop"><section ref={dialog} className="damage-dialog damage-import-dialog" role="dialog" aria-modal="true" aria-labelledby="damage-import-title">
    <header><div><small>导入已保存数据</small><h2 id="damage-import-title">从档案导入角色</h2></div><button aria-label="关闭档案导入" onClick={onClose}><Icon name="close"/></button></header>
    <div className="damage-fields"><Select label="来源档案" value={profileId} onChange={setProfileId}>{profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</Select>
      <Select label="导入到编队角色" value={selected} onChange={setSelected}><option value="">请选择</option>{members.map(m=><option key={m.code} value={m.code}>{memberName(m.code)}</option>)}</Select>
      <Field label="四件改造装备统一强化等级" min={0} max={5} value={gearLevel} onChange={setGear}/><Field label="通用研究等级" min={0} max={999} value={common} onChange={setCommon}/></div>
    <p>档案未记录四件装备的基础品质、强化等级及通用研究。本次明确按“四件改造装备”、上方强化与通用研究设置计算。</p>
    <p className="damage-muted">技能、突破、好感度、魔方、收藏品、逐条装备词条、同步器等级及职业/企业研究取自所选档案。缺项会提示补录；取消或导入失败保留当前模拟配置。</p>
    {error&&<p className="damage-error" role="alert" tabIndex={-1}>{error}</p>}
    <footer><button onClick={onClose}>取消</button><button className="damage-primary" onClick={apply}>确认假设并导入快照</button></footer>
  </section></div>
}
function DamageResults({run,stale,onRecord,records}) {
  const [imageTitle,setImageTitle]=useState(''),[includeGrowth,setIncludeGrowth]=useState(true),[imageError,setImageError]=useState('')
  if(!run)return <div className="damage-empty"><Icon name="clock"/><h2>先组建你的队伍</h2><p>选择角色、确认养成与敌人条件，然后运行本地伤害模拟。</p></div>
  const result=run.result, colors=Array.from({length:5},(_,i)=>`var(--lab-series-${i+1})`)
  const series=result.desktop?.cumulative||{}, values=Object.values(series),max=Math.max(1,...values.map(v=>v.at(-1)||0))
  return <div className="damage-results">
    <section className="damage-card"><div className="damage-fields"><label className="damage-field"><span>结果图片标题</span><input maxLength={50} value={imageTitle} placeholder={run.draft.name} onChange={event=>setImageTitle(event.target.value)}/></label><label className="damage-checkbox"><input type="checkbox" checked={includeGrowth} onChange={event=>setIncludeGrowth(event.target.checked)}/>图片显示简要养成</label><button onClick={async()=>{try{setImageError('');await exportDamageResultImage(run,{title:imageTitle,includeGrowth})}catch(error){setImageError(error.message)}}}>保存结果图片</button></div>{imageError&&<p role="alert">{imageError}</p>}</section>
    {stale&&<p role="status" className="damage-notice">配置已修改，下方仍是上次运行的结果。请重新计算。</p>}
    <div className="damage-metrics"><div><small>编队总伤害</small><strong>{compact(result.total_damage)}</strong><span>{number(result.total_damage)}</span></div><div><small>平均每秒伤害</small><strong>{compact(result.total_damage/result.duration)}</strong><span>{result.duration} 秒 · {result.expected?'期望值':'固定种子随机'} · 种子 {result.seed}</span></div>{onRecord&&<button onClick={onRecord}>保存本次结果</button>}</div>
    <section className="damage-card"><h3>成员伤害贡献</h3>{result.members.map((m,i)=><div className="damage-contribution" key={m.name}><div><b>{identity(m.name)?.name||m.name}</b><span>{compact(m.damage)} · {(m.share*100).toFixed(1)}%</span></div><div className="damage-bar"><i style={{width:`${Math.max(0,m.share*100)}%`,background:colors[i]}}/></div></div>)}</section>
    {values.length>0&&<section className="damage-card"><h3>累计伤害曲线</h3><div className="damage-chart-legend">{Object.keys(series).map((name,i)=><span key={name}><i style={{borderColor:colors[i],borderTopStyle:i%2?'dashed':'solid'}} aria-hidden="true"/>{i+1}. {identity(name)?.name||name}</span>)}</div><svg className="damage-chart" viewBox="0 0 720 220" role="img" aria-label="各角色累计伤害曲线"><line x1="40" x2="700" y1="190" y2="190" stroke="currentColor" opacity=".2"/><text x="40" y="212">0 秒</text><text x="640" y="212">{result.duration} 秒</text><text x="40" y="16">{compact(max)}</text>{Object.entries(series).map(([name,v],i)=><polyline key={name} fill="none" stroke={colors[i]} strokeWidth="2.5" strokeDasharray={[undefined,'8 4','2 4','10 3 2 3','5 3'][i]} points={v.map((d,t)=>`${40+t/Math.max(1,v.length-1)*660},${190-d/max*160}`).join(' ')}><title>{identity(name)?.name||name}</title></polyline>)}</svg><p className="damage-muted">颜色与贡献条一致；按上游实际命中事件逐秒累计。</p></section>}
    <section className="damage-card"><h3>普通攻击与技能</h3><div className="damage-table-wrap"><table><thead><tr><th>角色</th><th>普通攻击</th><th>技能伤害</th><th>命中事件</th></tr></thead><tbody>{result.desktop?.analysis?.map(a=><tr key={a.char_name}><td>{identity(a.char_name)?.name||a.char_name}</td><td>{compact(a.normal_atk.damage)}</td><td>{compact(a.skill.damage)}</td><td>{number(a.normal_atk.hits+a.skill.hits)}</td></tr>)}</tbody></table></div></section>
    <section className="damage-card"><h3>爆裂事件</h3><div className="damage-burst-list">{result.desktop?.burst?.map((e,i)=><div key={i}><time>{e.t.toFixed(2)} s</time><b>{identity(e.caster)?.name||e.caster||'全队'}</b><span>{burstLabel(e.event)}</span></div>)}</div></section>
    <DamageTimeline key={JSON.stringify([run.draft,run.result.total_damage])} run={run}/>
    <DamageEventDetails key={JSON.stringify([run.draft,run.result.total_damage])} run={run}/>
    {records.length>0&&<section className="damage-card"><h3>与已保存结果对比</h3><div className="damage-table-wrap"><table><thead><tr><th>记录</th><th>总伤害</th><th>本次相对变化</th></tr></thead><tbody>{records.slice(0,5).map(r=><tr key={r.id}><td>{r.draft.name}</td><td>{compact(r.result.total_damage)}</td><td>{r.result.total_damage?`${((result.total_damage/r.result.total_damage-1)*100).toFixed(2)}%`:'—'}</td></tr>)}</tbody></table></div><p className="damage-muted">比较记录可能使用不同养成或敌人条件；可在记录页加载原方案核对。</p></section>}
    <details className="damage-card"><summary>本次计算条件与上游说明</summary><p>引擎 {catalog.commit.slice(0,7)} · {run.draft.members.map(m=>memberName(m.code)).join(' / ')} · {run.draft.battle.operation==='auto'?'全自动运用':'上游角色默认运用'}</p><p>敌人防御 {run.draft.battle.defense} · 核心 {run.draft.battle.core}px · 距离 {run.draft.battle.distance}m</p>{result.warnings?.map((w,i)=><p className="damage-upstream-note" key={i}>{engineLabel(w)}</p>)}<p className="damage-muted">以上保留上游说明及原始机制名称。模拟为参考值；静态敌人模式不模拟真实 Boss 攻击和阶段。</p></details>
  </div>
}


export { Icon, Field, Select, MemberEditor, ProfileImport, DamageResults, clone, number, compact, memberName, engineLabel }
