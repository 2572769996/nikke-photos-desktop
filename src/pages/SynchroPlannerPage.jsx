import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HOURS, RESOURCES, MAX_LEVEL, STORAGE_KEY, emptyPlanner, decodePlanner, parsePlanner, baseRates, analyzePlanner } from '../lib/synchroPlanner.js'
import '../styles/synchroPlanner.css'

const fmt = value => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const time = value => `${fmt(value)} h${value >= 24 ? `（${fmt(value / 24)} 天）` : ''}`
const levelText = value => `${value}${value === MAX_LEVEL ? '+' : ''}`

function Input({ label, value, onChange, id, integer = false }) {
  return <input id={id} aria-label={label} inputMode={integer ? 'numeric' : 'decimal'} type="text" value={value}
    onChange={event => onChange(event.target.value)} autoComplete="off" spellCheck={false} />
}

function PlanTable({ plan, title, rates }) {
  return <section className="syn-plan">
    <h3>{title}</h3>
    <div className="syn-table-scroll"><table><thead><tr><th>时长</th>{RESOURCES.map((r, i) => <th key={r.id} style={{ color: r.color }}>{r.name}<small>开箱 {fmt(plan[i].hours)} h</small></th>)}</tr></thead>
      <tbody>{HOURS.map((hour, j) => <tr key={hour}><th>{hour} h</th>{plan.map((row, i) => <td key={i}>{row.used[j] || '—'}</td>)}</tr>)}</tbody>
    </table></div>
    {plan.map((row, i) => <p key={i} className={row.deficit ? 'syn-shortfall' : ''}><b>{RESOURCES[i].name}</b>：{row.deficit ? <>仍缺 {fmt(row.deficit)} · {time(row.deficit / rates[i])}</> : <>目标后余量 {fmt(row.surplus)}</>}</p>)}
    <details><summary>查看开箱后剩余库存</summary><div className="syn-table-scroll"><table><thead><tr><th>时长</th>{RESOURCES.map(r => <th key={r.id}>{r.name}</th>)}</tr></thead>
      <tbody>{HOURS.map((hour, j) => <tr key={hour}><th>{hour} h</th>{plan.map((row, i) => <td key={i}>{fmt(row.left[j])}</td>)}</tr>)}</tbody>
    </table></div></details>
  </section>
}

export default function SynchroPlannerPage() {
  const [initial] = useState(() => {
    try { const stored = localStorage.getItem(STORAGE_KEY); return { form: stored ? decodePlanner(stored) : emptyPlanner(), error: '' } }
    catch (error) { return { form: emptyPlanner(), error: `无法恢复升级规划草稿：${error.message}。原草稿未覆盖，修改输入后将保存新草稿。` } }
  })
  const [form, setForm] = useState(initial.form)
  const [saveError, setSaveError] = useState(initial.error)
  const [saved, setSaved] = useState(false)
  const parsed = useMemo(() => parsePlanner(form), [form])
  const result = useMemo(() => parsed.errors.length ? null : analyzePlanner(parsed.value), [parsed])
  const update = patch => {
    const next = { ...form, ...patch }
    setForm(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setSaveError(''); setSaved(true) }
    catch (error) { setSaveError(`草稿保存失败：${error.message}`); setSaved(false) }
  }
  const list = (key, i, value) => update({ [key]: form[key].map((old, j) => j === i ? value : old) })
  const rates = parsed.value.rates
  function toggleCustom(checked) {
    const base = Number(form.base)
    update({ customRates: checked, ...(checked && Number.isInteger(base) && base >= 1 && base <= 800 ? { rates: baseRates(base, form.academy).map(String) } : {}) })
  }
  return <section className="synchro-planner" aria-label="同步器升级计算">
    <header className="syn-hero"><div><span>升级规划 / 资源模拟</span><h1>同步器升级计算</h1><p>盘点现有资源，找到升级短板，为目标只开需要的箱子。</p></div><small>{saved ? '输入已保存到本机' : '独立本机草稿 · 不修改角色档案'}</small></header>
    {saveError && <p className="syn-error" role="alert">{saveError}</p>}
    <div className="syn-layout">
      <aside className="syn-inventory">
        <section className="syn-card"><h2>资源与库存</h2>
          <label className="syn-field">当前同步等级<Input label="当前同步等级" id="syn-current" value={form.current} onChange={value => update({ current: value })} integer /></label>
          <label className="syn-field">前哨基地等级<Input label="前哨基地等级" id="syn-base" value={form.base} onChange={value => update({ base: value })} integer /></label>
          <label className="syn-check"><input type="checkbox" checked={form.academy} disabled={form.customRates} onChange={event => update({ academy: event.target.checked })} />战术学院满加成（60% / 45% / 45%）</label>
          <label className="syn-check"><input id="syn-custom" type="checkbox" checked={form.customRates} onChange={event => toggleCustom(event.target.checked)} />手填游戏内每小时产出</label>
          <p className="syn-hint">数量可用 K、M、B、万、亿，例如 7M = 700 万。现有数量不包含未开箱资源。</p>
          {RESOURCES.map((r, i) => <div className="syn-stock" key={r.id} style={{ '--resource': r.color }}>
            <label><b>{r.name}</b><Input label={`${r.name}现有数量`} id={`syn-cash-${r.id}`} value={form.cash[i]} onChange={value => list('cash', i, value)} /></label>
            <div className="syn-rate">{form.customRates ? <label>每小时<Input label={`${r.name}每小时产出`} value={form.rates[i]} onChange={value => list('rates', i, value)} /></label> : <><strong>{rates ? fmt(rates[i]) : '—'} / h</strong><small>基地表产出</small></>}</div>
          </div>)}
        </section>
        <section className="syn-card"><h2>资源箱库存</h2><div className="syn-table-scroll"><table className="syn-boxes"><thead><tr><th>时长</th>{RESOURCES.map(r => <th key={r.id} style={{color:r.color}}>{r.name}</th>)}</tr></thead>
          <tbody>{HOURS.map((hour, j) => <tr key={hour}><th>{hour} h</th>{RESOURCES.map((r, i) => <td key={r.id}><Input label={`${r.name} ${hour} 小时箱`} id={`syn-box-${r.id}-${hour}`} integer value={form.boxes[i][j]} onChange={value => update({boxes:form.boxes.map((row, k) => k === i ? row.map((old, n) => n === j ? value : old) : row)})} /></td>)}</tr>)}</tbody>
          <tfoot><tr><th>合计</th>{RESOURCES.map((r, i) => <td key={r.id}>{result ? `${fmt(result.hours[i])} h` : '—'}</td>)}</tr></tfoot>
        </table></div>
        <h3>特殊箱</h3>
        <label className="syn-field">大月卡箱<Input label="大月卡箱数量" id="syn-monthly" value={form.monthly} onChange={value => update({monthly:value})} integer /></label>
        <label className="syn-field">三选一箱<Input label="三选一箱数量" id="syn-choice" value={form.choice} onChange={value => update({choice:value})} integer /></label>
        <p className="syn-hint">每个大月卡箱：信用点 30 h / 数据 10 h / 芯尘 10 h，三选一。每个三选一箱：信用点 3 h / 数据 1 h / 芯尘 1 h。均按兑换出的 1 h 箱计。</p>
        </section>
      </aside>
      <div className="syn-results">
        <section className="syn-card syn-target-input"><label>目标同步等级<Input label="目标同步等级" id="syn-target" value={form.target} onChange={value => update({target:value})} integer /></label><label className="syn-check"><input id="syn-reserve" type="checkbox" checked={form.reserve} onChange={event => update({reserve:event.target.checked})} />目标方案每种资源、每档时长留 1 箱</label></section>
        {parsed.errors.length > 0 ? <div className="syn-error" role="alert"><strong>请修正输入后查看结果</strong><ul>{parsed.errors.map(error => <li key={error}>{error}</li>)}</ul></div> : <>
          <div className="syn-summary" aria-live="polite">
            <div className="syn-summary-joint"><span>共同可达等级</span><strong id="syn-joint">{levelText(result.joint)}<small>级</small></strong><span>当前 {parsed.value.current} · 可升 {result.joint - parsed.value.current} 级</span></div>
            {RESOURCES.map((r, i) => <div key={r.id} style={{'--resource':r.color}}><span>{r.name}可达</span><strong>{levelText(result.reach[i].level)}<small>级</small></strong><span>+{result.reach[i].level - parsed.value.current} 级</span></div>)}
          </div>
          <section className="syn-card"><h2>升级分析</h2><p className="syn-hint">现有资源 + 全部普通箱，不含特殊箱。可达等级只看资源，不代表账号等级上限。</p>
            <div className="syn-chart" role="img" aria-label={RESOURCES.map((r,i)=>`${r.name}可达${levelText(result.reach[i].level)}级`).join('，')}>
              {RESOURCES.map((r, i) => <div className="syn-bar-col" key={r.id} style={{'--resource':r.color}}><b>{levelText(result.reach[i].level)}</b><div style={{height:`${12 + 100 * (result.reach[i].level-parsed.value.current) / Math.max(1,result.highest-parsed.value.current)}px`}}/><span>{r.name}</span></div>)}
              <small>基线 {parsed.value.current} 级</small>
            </div>
            {RESOURCES.map((r, i) => { const row = result.reach[i]; return <div className="syn-analysis-row" key={r.id} style={{'--resource':r.color}}>
              <h3>{r.name}</h3><div><b>{levelText(row.level)} 级</b><span> · {result.highest === row.level ? '当前最高' : `距最高差 ${result.highest-row.level} 级`}</span>
                {row.next === null ? <p>已达本工具 1000 级计算边界</p> : <><div className="syn-progress"><span>下一级</span><progress value={row.fraction} max="1" aria-label={`${r.name}下一级进度`} /><b>{fmt(row.fraction * 100)}%</b></div><p>余量 {time(row.remaining / rates[i])} / 下一级需 {time(row.next / rates[i])}</p></>}
              </div><div className="syn-catch"><small>追平当前最高所需时间</small><b>{result.catchHours[i] ? time(result.catchHours[i]) : '已达最高'}</b></div>
            </div> })}
          </section>
          <section className="syn-card"><h2>特殊箱升级</h2><p className="syn-hint">仅此模块加入特殊箱，普通箱按全部使用。优先提高共同可达等级，同等级下少开箱；未带来整级提升的箱子保留。</p>
            <div className="syn-special-summary"><strong id="syn-special-level">{levelText(result.special.level)} 级</strong><span>共同等级 +{result.special.level-result.joint}</span><span>剩余：大月卡 {fmt(result.special.leftMonthly)} 箱 / 三选一 {fmt(result.special.leftChoice)} 箱</span></div>
            <div className="syn-table-scroll"><table><thead><tr><th>资源</th><th>开后可达</th><th>大月卡箱</th><th>三选一箱</th><th>获得时长</th></tr></thead><tbody>{RESOURCES.map((r,i)=><tr key={r.id}><th style={{color:r.color}}>{r.name}</th><td>{levelText(result.special.reach[i].level)}</td><td>{result.special.monthly[i] || '不开'}</td><td>{result.special.choice[i] || '不开'}</td><td>{fmt(result.special.hours[i])} h</td></tr>)}</tbody></table></div>
          </section>
          <section className="syn-card"><h2>目标与开箱方案 <small>→ {parsed.value.target} 级</small></h2>
            <p className="syn-hint">两套方案任选一套，不叠加。均先使用散装资源，再最小化开箱总时长；时长相同才按大小箱偏好分配。芯尘统一采用最少箱数方案，不含特殊箱。</p>
            <div className="syn-table-scroll"><table className="syn-costs"><thead><tr><th>资源</th><th>升级总需求</th><th>已有散装</th><th>需开箱补足</th></tr></thead><tbody>{RESOURCES.map((r,i)=><tr key={r.id}><th style={{color:r.color}}>{r.name}</th><td>{fmt(result.cost[i])}</td><td>{fmt(parsed.value.cash[i])}</td><td>{fmt(Math.max(0,result.cost[i]-parsed.value.cash[i]))}</td></tr>)}</tbody></table></div>
            <div className="syn-plan-grid"><PlanTable title={`大箱优先${form.reserve ? '（留 1）' : ''}`} plan={result.plans[0]} rates={rates}/><PlanTable title={`小箱优先${form.reserve ? '（留 1）' : ''}`} plan={result.plans[1]} rates={rates}/></div>
            <p className="syn-hint">{form.reserve ? '每个非零库存档留 1 箱；原库存为 0 时不扣减。缺口按保留后的可用箱计算。' : '使用全部可用普通箱，仍不足的部分显示为资源缺口。'}</p>
          </section>
        </>}
        <details className="syn-card syn-boundary"><summary>计算口径与范围</summary><p>适用于同步器 200 级后的升级，计算至 1000 级。升级需求逐级累加，分段按升到的等级查表。1000+ 表示达到本工具计算边界，未继续推算。</p><p>基地表覆盖 1～800 级，表内值已有精度限制。默认学院满加成；未满学院可取消或手填游戏内每小时产出。箱子按所选基地的产出 × 时长估算，游戏逐箱取整可能存在小额差异。</p><p>等待时间仅按当前基地自然产出，不含派遣、活动、歼灭及未来基地升级。推图提高基地后再开箱收益可能更高；本工具只规划当前产出下的库存使用。</p><p>普通分析使用全部普通箱，“留 1”仅影响目标开箱方案。特殊箱建议只考虑升级，不预留装备或魔方等其他消耗。</p><Link to="/about">数据来源与第三方说明 →</Link></details>
      </div>
    </div>
  </section>
}
