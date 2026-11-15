import {useMemo, useState} from 'react'
import {DAMAGE_CATALOG} from '../lib/damageSimulator.js'

const eventTypes = [['ammo','装弹数历史'],['reload','装填事件'],['buffs','Buff事件'],['instant','瞬时技能'],['gauge','爆裂充能'],['control','操作区间'],['hits','命中与伤害']]
const names = new Map(DAMAGE_CATALOG.characters.filter(character=>character.engineName).map(character=>[character.engineName,character.name]))
const label = value => names.get(value) || value || '—'
const format = value => typeof value === 'number' ? new Intl.NumberFormat('zh-CN',{maximumFractionDigits:3}).format(value) : value
const save = (text,filename) => {
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'}))
  const link=document.createElement('a')
  link.href=url;link.download=filename;link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export default function DamageEventDetails({run}) {
  const details=run.result.desktop?.events
  const [type,setType]=useState('ammo')
  const [character,setCharacter]=useState('')
  const [query,setQuery]=useState('')
  const [page,setPage]=useState(0)
  const [start,setStart]=useState(0)
  const [end,setEnd]=useState(run.result.duration)
  const rows=useMemo(()=> (details?.[type]?.rows || []).filter(event =>
    (!character || event.caster===character || event.target===character)
    && (event.t ?? event.t0)>=Number(start) && (event.t ?? event.t0)<=Number(end)
    && (!query || JSON.stringify(event).toLowerCase().includes(query.toLowerCase()))
  ),[details,type,character,query,start,end])
  if (!details) return <section className="damage-card"><h3>详细战斗日志</h3><p className="damage-muted">在战斗条件中启用“记录详细战斗日志”后重新计算，可查看装弹、装填、Buff、技能与操作事件。</p></section>
  const pages=Math.max(1,Math.ceil(rows.length/100))
  const current=Math.min(page,pages-1)
  const selected=details[type]
  const change=setter=>event=>{setter(event.target.value);setPage(0)}
  const detailText=event=> {
    if(type==='ammo')return '剩余弹药 '+format(event.ammo)
    if(type==='reload')return event.event==='재장전 시작'?'开始装填':event.event==='재장전 완료'?'完成装填':event.event
    if(type==='buffs')return `${event.kind==='activate'?'生效 / 刷新':'失效'} · ${event.name} · ${event.stat || ''} ${format(event.value ?? '')} · 到期 ${event.expires_at===null?'永久':format(event.expires_at)+'秒'}`
    if(type==='hits')return `${event.skill_name==='기본 공격'?'普通攻击':event.skill_name} · ${format(event.damage)} · ${event.hit_tag} ${event.is_crit?'暴击':''}`
    if(type==='gauge')return `${event.source} · 增加 ${format(event.amount)}% · 当前 ${format(event.gauge)}%`
    if(type==='control')return `${event.input} / ${event.mode} · 至 ${format(event.t1)}秒 · ${event.producer}`
    return `${event.name} · ${event.stat} · ${format(event.value)}`
  }
  return <section className="damage-card">
    <div className="comparison-actions"><h3>详细战斗日志</h3><button onClick={()=>save(JSON.stringify({engine:DAMAGE_CATALOG.commit,draft:run.draft,events:details},null,2),'NIKKE-战斗日志.json')}>导出战斗日志</button></div>
    <div className="damage-fields">
      <label className="damage-field"><span>事件类型</span><select value={type} onChange={change(setType)}>{eventTypes.map(([key,text])=><option key={key} value={key}>{text}</option>)}</select></label>
      <label className="damage-field"><span>角色</span><select value={character} onChange={change(setCharacter)}><option value="">全部</option>{run.result.members.map(member=><option key={member.name} value={member.name}>{label(member.name)}</option>)}</select></label>
      <label className="damage-field"><span>检索事件原文</span><input value={query} onChange={change(setQuery)}/></label>
      <label className="damage-field"><span>开始时间 · 秒</span><input type="number" min={0} max={run.result.duration} value={start} onChange={change(setStart)}/></label>
      <label className="damage-field"><span>结束时间 · 秒</span><input type="number" min={0} max={run.result.duration} value={end} onChange={change(setEnd)}/></label>
    </div>
    {selected?.truncated&&<p className="damage-notice">此类事件共 {selected.total} 条，当前结果保留前 {selected.rows.length} 条。导出日志包含相同范围。</p>}
    <p className="damage-muted">事件来自固定上游运行日志。Buff名称与内部事件标识保留原文，永久效果的到期时间标记为永久。</p>
    <div className="damage-table-wrap"><table><thead><tr><th>时间 · 秒</th><th>来源</th><th>目标</th><th>事件</th></tr></thead><tbody>
      {rows.slice(current*100,(current+1)*100).map((event,index)=><tr key={index}><td>{format(event.t ?? event.t0)}</td><td>{label(event.caster)}</td><td>{label(event.target)}</td><td style={{whiteSpace:'normal',minWidth:260}}>{detailText(event)}</td></tr>)}
    </tbody></table></div>
    {!rows.length&&<p>当前筛选范围没有事件。</p>}
    <div className="comparison-actions"><button disabled={current===0} onClick={()=>setPage(current-1)}>上一页</button><span>{current+1} / {pages} 页 · {rows.length} 条</span><button disabled={current>=pages-1} onClick={()=>setPage(current+1)}>下一页</button></div>
  </section>
}
