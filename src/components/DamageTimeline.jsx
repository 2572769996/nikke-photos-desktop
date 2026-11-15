import {useMemo,useState} from 'react'
import {DAMAGE_CATALOG} from '../lib/damageSimulator.js'
import {buildDamageTimeline} from '../lib/damageTimeline.js'
import '../styles/damageTimeline.css'
const names=new Map(DAMAGE_CATALOG.characters.map(c=>[c.engineName,c.name]))
const name=value=>names.get(value)||value||'全队'
const fmt=v=>Number(v).toFixed(2)
const labelEvent=v=>v.replaceAll('stage:','阶段 ').replaceAll('reenter:','再次进入阶段 ').replaceAll('사용','发动')
export default function DamageTimeline({run}) {
  const result=run.result
  const model=useMemo(()=>buildDamageTimeline(result),[result])
  const [hideConstant,setHideConstant]=useState(true)
  const [kind,setKind]=useState('all'),[character,setCharacter]=useState(''),[query,setQuery]=useState(''),[start,setStart]=useState(0),[end,setEnd]=useState(result.duration),[page,setPage]=useState(0),[selected,setSelected]=useState('')
  const valid=Number.isFinite(Number(start))&&Number.isFinite(Number(end))&&start!==''&&end!==''&&Number(start)>=0&&Number(end)<=result.duration&&Number(end)>Number(start)
  const lo=valid?Number(start):0,hi=valid?Number(end):result.duration
  const lanes=model.lanes.filter(l=>(!hideConstant||l.kind!=='buff'||l.segments.length!==1||l.segments[0].start>0||l.segments[0].end<result.duration)&&(kind==='all'||l.kind===kind)&&(!character||l.caster===character||l.target===character||!l.caster)&&(!query||(l.label+' '+name(l.caster)+' '+name(l.target)).toLowerCase().includes(query.toLowerCase())))
  const pages=Math.max(1,Math.ceil(lanes.length/20)),current=Math.min(page,pages-1),visible=lanes.slice(current*20,(current+1)*20)
  const x=t=>200+(t-lo)/(hi-lo)*780
  const change=setter=>e=>{setter(e.target.value);setPage(0);setSelected('')}
  const describe=(lane,segment)=>name(lane.caster)+(lane.target?' → '+name(lane.target):'')+' · '+lane.label+' · '+fmt(segment.start)+'–'+fmt(segment.end)+' 秒'+(segment.value!=null?' · 数值 '+segment.value:'')+' · '+(segment.detail||'')
  return <section className="damage-card damage-timeline">
    <h3>Buff、爆裂与装弹时间线</h3>
    <div className="damage-fields">
      <label className="damage-field"><span>时间线类型</span><select value={kind} onChange={change(setKind)}><option value="all">全部</option><option value="buff">Buff</option><option value="burst">爆裂</option><option value="reload">装填</option><option value="ammo">弹药</option></select></label>
      <label className="damage-field"><span>时间线角色</span><select value={character} onChange={change(setCharacter)}><option value="">全部</option>{result.members.map(m=><option key={m.name} value={m.name}>{name(m.name)}</option>)}</select></label>
      <label className="damage-field"><span>筛选 Buff 名称</span><input value={query} onChange={change(setQuery)}/></label>
      <label className="damage-field"><span>时间线起点 · 秒</span><input type="number" value={start} min="0" max={result.duration} step=".1" onChange={change(setStart)}/></label>
      <label className="damage-field"><span>时间线终点 · 秒</span><input type="number" value={end} min="0" max={result.duration} step=".1" onChange={change(setEnd)}/></label>
    </div>
    <label className="damage-checkbox"><input type="checkbox" checked={hideConstant} onChange={e=>{setHideConstant(e.target.checked);setPage(0)}}/>隐藏全程常驻 Buff</label>
    <div className="comparison-actions"><button onClick={()=>{setStart(0);setEnd(result.duration)}}>显示全程</button><button disabled={!valid} onClick={()=>{const middle=(lo+hi)/2;setStart(middle-(hi-lo)/4);setEnd(middle+(hi-lo)/4)}}>放大中间时段</button></div>
    {!valid&&<p role="alert" className="damage-error">时间范围须在战斗时长内，终点大于起点。</p>}
    {!result.desktop?.events&&<p className="damage-notice">当前仅有爆裂事件。启用“记录详细战斗日志”后重新运行可查看 Buff、弹药和装填。</p>}
    {model.warnings.map(w=><p className="damage-notice" key={w}>{w}</p>)}
    <p className="damage-muted">横轴为秒。悬停、点击或键盘聚焦图形可查看数值。Buff按来源、目标、名称与属性分轨，刷新处分段；同名失效事件无属性编号时关闭同名轨道，无法区分上游未记录的效果实例。装填虚线表示未记录到结束。</p>
    {valid&&<div className="timeline-scroll"><svg width="1000" height={60+visible.length*62} viewBox={'0 0 1000 '+(60+visible.length*62)} role="img" aria-label="战斗事件图形时间线">
      {Array.from({length:6},(_,i)=>{const t=lo+(hi-lo)*i/5;return <g key={i}><line x1={x(t)} x2={x(t)} y1="30" y2={50+visible.length*62} stroke="currentColor" opacity=".15"/><text x={x(t)} y="20" textAnchor={i===5?'end':'start'}>{fmt(t)}s</text></g>})}
      {visible.map((lane,index)=>{const y=45+index*62,color=lane.kind==='buff'?'var(--lab-series-1)':lane.kind==='reload'?'var(--lab-series-3)':'var(--lab-series-2)'
        const segments=lane.segments.filter(s=>s.end>=lo&&s.start<=hi)
        const points=lane.points||[],max=Math.max(1,...points.map(p=>p.ammo))
        let path=''
        points.forEach((p,i)=>{
          const next=Math.min(points[i+1]?.t??lane.horizon,hi)
          if(next<lo||p.t>hi)return
          const a=x(Math.max(lo,p.t)),b=x(next),py=y+40-p.ammo/max*30
          path+=(path?' L':'M')+a+','+py+' H'+b
        })
        return <g key={index}>
          <text x="4" y={y+12}><title>{name(lane.caster)}{lane.target?' → '+name(lane.target):''}</title>{(name(lane.caster)+(lane.target?' → '+name(lane.target):'')).slice(0,20)}</text>
          <text x="4" y={y+31}><title>{lane.label}</title>{lane.label.slice(0,22)}</text>
          {segments.map((s,i)=>{const text=describe(lane,s);return <rect key={i} x={x(Math.max(lo,s.start))} y={y+5} width={Math.max(1,x(Math.min(hi,s.end))-x(Math.max(lo,s.start)))} height="26" fill={color} opacity=".8" stroke="currentColor" strokeDasharray={s.open?'4 3':undefined} tabIndex="0" onFocus={()=>setSelected(text)} onClick={()=>setSelected(text)} aria-label={text}><title>{text}</title></rect>})}
          {lane.marks?.filter(e=>e.t>=lo&&e.t<=hi).map((e,i)=>{const text=name(e.caster)+' · '+fmt(e.t)+'秒 · '+labelEvent(e.event);return <circle key={i} cx={x(e.t)} cy={y+19} r="5" fill={color} tabIndex="0" onFocus={()=>setSelected(text)} onClick={()=>setSelected(text)} aria-label={text}><title>{text}</title></circle>})}
          {lane.kind==='ammo'&&<><path d={path} fill="none" stroke="var(--lab-series-4)" strokeWidth="2"/><text x="145" y={y+49}>0–{max} 发</text>{points.filter(p=>p.t>=lo&&p.t<=hi).map((p,i)=>{const text=name(lane.caster)+' · '+fmt(p.t)+'秒 · 剩余 '+p.ammo+' 发';return <circle key={i} cx={x(p.t)} cy={y+40-p.ammo/max*30} r="3" fill="var(--lab-series-4)" tabIndex="0" onFocus={()=>setSelected(text)} onClick={()=>setSelected(text)} aria-label={text}><title>{text}</title></circle>})}</>}
        </g>
      })}
    </svg></div>}
    {selected&&<p role="status" className="damage-notice">{selected}</p>}
    {!lanes.length&&<p>当前筛选没有可显示的轨道。</p>}
    <div className="comparison-actions"><button disabled={current===0} onClick={()=>setPage(current-1)}>上一组轨道</button><span>{current+1} / {pages} · 共 {lanes.length} 条轨道</span><button disabled={current+1>=pages} onClick={()=>setPage(current+1)}>下一组轨道</button></div>
  </section>
}
