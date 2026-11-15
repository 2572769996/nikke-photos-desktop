import {useState} from 'react'
import {DAMAGE_CATALOG} from '../lib/damageSimulator.js'
import {sampleStatistics} from '../lib/damageExperiments.js'
const names=new Map(DAMAGE_CATALOG.characters.map(c=>[c.engineName,c.name]))
const num=value=>value==null?'—':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value)
export default function DamageRandomStatistics({run,onDetail}) {
  const [member,setMember]=useState('')
  const rows=run.results.map((r,i)=>({i,seed:r.draft.battle.seed,damage:member?r.result.members.find(m=>m.name===member)?.damage:r.result.total_damage,id:r.id}))
  const stats=sampleStatistics(rows.map(r=>r.damage))
  const csv=()=>{
    const lines=[['样本','种子','全队伤害',...(run.results[0]?.result.members.map(m=>names.get(m.name)||m.name)||[])],
      ...run.results.map((r,i)=>[i+1,r.draft.battle.seed,r.result.total_damage,...r.result.members.map(m=>m.damage)])]
    const text='\uFEFF'+lines.map(row=>row.map(v=>'"'+String(v).replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n')
    const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a')
    a.href=url;a.download='NIKKE-随机样本.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  return <section className="damage-card random-statistics">
    <div className="comparison-actions"><h2>多次随机模拟统计</h2><button disabled={!rows.length} onClick={csv}>导出随机样本</button></div>
    <p role="status">已完成 {rows.length} / {run.total} 个样本{run.status!=='completed'?' · 部分统计':''}。种子从 {run.workspace.experiment.seed} 起逐次递增。</p>
    <p className="damage-muted">同一输入仅改变种子，统计来自实际随机运行。P5/P95为样本线性插值分位数，标准差使用 n−1；标准误反映均值的采样波动。样本范围不代表理论上下限或真实战斗保证。</p>
    {run.error&&<p className="damage-error" role="alert">{run.error}</p>}
    <label className="damage-field"><span>统计对象</span><select value={member} onChange={e=>setMember(e.target.value)}><option value="">整队</option>{run.results[0]?.result.members.map(m=><option key={m.name} value={m.name}>{names.get(m.name)||m.name}</option>)}</select></label>
    {stats&&<>
      <div className="damage-table-wrap"><table><thead><tr>{['均值','中位数','标准差','均值标准误','最小值','最大值','P5','P95'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody><tr>{['mean','median','sd','se','min','max','p05','p95'].map(key=><td key={key}>{num(stats[key])}</td>)}</tr></tbody></table></div>
      <div className="random-plot-scroll"><svg viewBox="0 0 720 180" className="damage-chart" role="img" aria-label="随机样本伤害分布">
        <text x="40" y="16">伤害 {num(stats.max)}</text><text x="40" y="175">样本 1</text><text x="600" y="175">样本 {rows.length}</text>
        <line x1="40" y1="150" x2="700" y2="150" stroke="currentColor"/>
        {rows.map(r=><circle key={r.id} cx={40+r.i/Math.max(1,rows.length-1)*660} cy={stats.max===stats.min?85:150-(r.damage-stats.min)/(stats.max-stats.min)*120} r="4" fill="var(--lab-series-1)"><title>样本 {r.i+1} · 种子 {r.seed} · {num(r.damage)}</title></circle>)}
        <text x="40" y="145">{num(stats.min)}</text>
      </svg></div>
    </>}
    <div className="damage-table-wrap"><table><thead><tr><th>样本</th><th>种子</th><th>伤害</th><th>详情</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.i+1}</td><td>{r.seed}</td><td>{num(r.damage)}</td><td><button onClick={()=>onDetail(r.id)}>查看样本详情</button></td></tr>)}</tbody></table></div>
  </section>
}
