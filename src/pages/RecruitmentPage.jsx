import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { recruitMotionReduced } from '../lib/motionPreference.js'
import '../styles/recruitment.css'
import { assetUrl, BUILTIN_CHARACTERS, labelFor } from '../lib/roster.js'
import { commitSpecialRecruit, readSpecialSimulation, recruitDay, resetSpecialRecruit, specialRecruitBanners } from '../lib/recruitment.js'
import { collabGroups, collabPools, commitCollabRecruit, readCollabSimulation, resetCollabRecruit, selectCollabRecruit } from '../lib/collabRecruitment.js'
import RecruitmentResults, { RecruitmentHeader, RecruitmentPayment, RecruitCost, RecruitDialog, RecruitPoolRates } from '../components/RecruitmentResults.jsx'
import RecruitmentMovie from '../components/RecruitmentMovie.jsx'
import RecruitSsrHistory from '../components/RecruitSsrHistory.jsx'
import RecruitRecordStats from '../components/RecruitRecordStats.jsx'
import OrdinaryRecruitment from '../components/OrdinaryRecruitment.jsx'
import CollabRecruitStage from '../components/CollabRecruitStage.jsx'

const characters = new Map(BUILTIN_CHARACTERS.map(character => [character.resourceId, character]))
const collabCharacters = collabGroups.flatMap(group => group.members.map(id => characters.get(id)))
const presentations = {
  marian: { movie: 'marian-queen', period: '10 月 29 日维护后至 11 月 19 日 03:59:59', publication: '10 月 29 日' },
  sky: { movie: 'sky', period: '11 月 19 日维护后至 12 月 3 日 03:59:59', publication: '11 月 19 日' },
  scarlet: { movie: 'scarlet-goddeath', period: '11 月 5 日 04:00 至 11 月 26 日 03:59:59', publication: '10 月 29 日' },
}
const media = file => assetUrl('recruitment/' + file)
const number = value => value.toLocaleString('zh-CN')

function loadSimulation(pool) {
  try {
    const initial = pool === 'collab' ? readCollabSimulation(localStorage) : readSpecialSimulation(localStorage, specialRecruitBanners[pool])
    return { ...initial, error: '' }
  } catch (error) {
    return { record: null, tickets: null, error: '无法读取本地招募记录：' + error.message }
  }
}

export default function RecruitmentPage() {
  const [params] = useSearchParams()
  const [day, setDay] = useState(recruitDay)
  useEffect(() => {
    const refresh = () => setDay(recruitDay())
    const remaining = 86400000 - (Date.now() + 4 * 3600000) % 86400000
    const timer = setTimeout(refresh, remaining + 10)
    window.addEventListener('focus', refresh)
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh) }
  }, [day])

  const requestedPool = params.get('pool')
  const pool = ['ordinary', 'collab', ...Object.keys(specialRecruitBanners)].includes(requestedPool) ? requestedPool : 'marian'
  return <main className="recruit-page" aria-label="招募模拟">
    {pool === 'ordinary' ? <OrdinaryRecruitment day={day} /> : <SpecialRecruitment key={pool} pool={pool} day={day} />}
  </main>
}

function SpecialRecruitment({ pool, day }) {
  const banner = specialRecruitBanners[pool]
  const collab = pool === 'collab'
  const [simulation, setSimulation] = useState(() => loadSimulation(pool))
  const { record, tickets, error } = simulation
  const [currency, setCurrency] = useState('gems')
  const [batch, setBatch] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [panel, setPanel] = useState(null)
  const serial = useRef(0)
  const busy = useRef(false)
  const featuredId = collab ? record?.selectedId : banner.featuredId
  const character = featuredId ? characters.get(featuredId) : undefined
  const name = collab ? '联动自选' : banner.name
  const upName = character?.nameCn
  const canRecruit = Boolean(record && character)
  const voucher = currency === 'vouchers'
  const costItem = voucher ? 'advanced' : 'gems'
  const freeAvailable = record && record.lastFreeDay !== day

  function draw(kind, payment = currency) {
    if (!canRecruit || busy.current || (batch && phase !== 'done')) return
    busy.current = true
    try {
      const next = collab ? commitCollabRecruit(localStorage, kind, { currency: payment })
        : commitSpecialRecruit(localStorage, banner, kind, recruitDay(), { currency: payment })
      setSimulation({ record: next.record, tickets: next.tickets, error: '' })
      setPanel(null)
      setBatch({ serial: ++serial.current, pool, featuredId: collab ? next.record.selectedId : featuredId, kind, currency: payment, results: next.results, rewards: next.rewards })
      setPhase(recruitMotionReduced() || kind === 'exchange' ? 'done' : 'opening')
    } catch (problem) {
      setSimulation(previous => ({ ...previous, error: '招募未完成：' + problem.message }))
      setBatch(null)
      setPanel(null)
    } finally { busy.current = false }
  }

  function clearRecord() {
    try {
      const cleared = collab ? resetCollabRecruit(localStorage) : resetSpecialRecruit(localStorage, banner)
      setSimulation({ ...cleared, error: '' })
      setPanel(null)
    } catch (problem) {
      setSimulation(previous => ({ ...previous, error: '无法重置模拟记录：' + problem.message }))
      setPanel(null)
    }
  }

  function selectUp(id) {
    try {
      setSimulation({ ...selectCollabRecruit(localStorage, id || ''), error: '' })
    } catch (problem) {
      setSimulation(previous => ({ ...previous, error: '无法更换 UP：' + problem.message }))
    }
  }

  const probability = <button type="button" className="recruit-probability" onClick={() => setPanel('rates')}>概率情报 <span aria-hidden="true">ⓘ</span></button>
  const payment = <RecruitmentPayment value={currency} onChange={setCurrency} />
  const actions = <div className="recruit-draw-actions" role="group" aria-label="招募操作">
    {banner?.dailyFree && (pool !== 'scarlet' || freeAvailable) && <button type="button" className="recruit-free" disabled={!freeAvailable} onClick={() => draw('free')}>
      <span>免费单抽</span><small>{freeAvailable ? '每日 1 次免费' : '本日已使用'}</small>
    </button>}
    <button type="button" className="recruit-one" disabled={!canRecruit} onClick={() => draw('one')}>
      <span>招募 1 次</span><small><RecruitCost amount={voucher ? 1 : 300} item={costItem} /></small>
    </button>
    <button type="button" className="recruit-ten" disabled={!canRecruit} onClick={() => draw('ten')}>
      <span>招募 10 次</span><small><RecruitCost amount={voucher ? 10 : 3000} item={costItem} /></small>
    </button>
  </div>

  return <>
    <RecruitmentHeader pool={pool} onRecord={() => setPanel('record')} onReset={() => setSimulation(loadSimulation(pool))} />
    {error && <p className="recruit-error" role="alert">{error}</p>}
    {collab ? <CollabRecruitStage characters={collabCharacters} featuredId={featuredId || null} onSelect={selectUp}>
      {payment}<div className="recruit-stage-controls">{probability}{actions}</div>
    </CollabRecruitStage> : <FeaturedStage banner={banner} character={character} suspended={Boolean(batch || panel)}
      payment={payment} probability={probability} actions={actions} />}
    <section className="recruit-console" aria-label="卡池信息">
      {character ? <span className="recruit-faction"><b>SSR</b> {labelFor('corporation', character.corporation)} · {labelFor('class', character.class)} · {labelFor('weapon_type', character.weapon_type)}</span>
        : <span className="recruit-faction">联动自选 · UP 概率 2%</span>}
      <div className="recruit-mileage"><img className="recruit-gold-ticket" src={media('result/gold-ticket.webp')} alt="黄金积分券" title="黄金积分券 · 特殊招募共用" />
        <strong>{tickets === null ? '—' : number(tickets)} <small>/ 200</small></strong>
        <button type="button" disabled={!canRecruit || tickets < 200} onClick={() => setPanel('exchange')}>兑换{upName || '所选角色'} ›</button></div>
    </section>
    {batch && <RecruitmentResults key={batch.serial} batch={batch} phase={phase} onPhase={setPhase}
      onClose={() => { setBatch(null); setPhase('idle') }} onDraw={draw} />}
    {panel && <RecruitDialog title={{ rates: '概率情报', record: '模拟记录', exchange: '兑换确认', reset: '重置确认' }[panel]} onDismiss={() => setPanel(null)}>
      <div className="recruit-info"><header><h2>{{ rates: '概率情报', record: '模拟记录', exchange: '兑换' + upName, reset: '重置本池记录' }[panel]}</h2>
        <button type="button" aria-label="关闭" onClick={() => setPanel(null)}>×</button></header>
      {panel === 'rates' && <>
        {collab ? <>
          <p>这是自选联动模拟池。每次招募有 2% 概率获得当前选择的角色，其他联动角色不会在本次招募中出现。</p>
          {featuredId ? <RecruitPoolRates pools={collabPools(featuredId)} /> : <p>先在群像中选择 UP。其余概率为朝圣者／超规格 0.5%、普通 SSR 1.5%、SR 43%、R 53%。</p>}
        </> : <>
          <p>{name}特殊招募，2026 年{presentations[pool].period}（北京时间）。名单与概率取自{presentations[pool].publication}国际服公示的本池专栏。</p>
          <RecruitPoolRates pools={banner.pools} />
        </>}
        {banner?.dailyFree && <p>每日免费单抽于北京时间 04:00 刷新。免费抽不发放黄金积分券。</p>}
        <p>每使用 <RecruitCost amount={300} /> 或 <RecruitCost item="advanced" amount={1} /> 招募一次，可获得 1 张黄金积分券。特殊池和联动自选池共用余额，集齐 200 张可兑换所在池的 UP 角色。</p>
      </>}
      {panel === 'record' && <>{record && <dl>{[
        ['累计招募', number(record.pulls)],
        ...(banner?.dailyFree ? [['免费招募', number(record.free)]] : []),
        ['累计模拟消耗', <RecruitCost amount={(record.pulls - record.free - record.vouchersSpent) * 300} />],
        ['累计高级招募券消耗', <RecruitCost item="advanced" amount={record.vouchersSpent} />],
        [collab ? '抽得自选 UP' : '抽得' + name, number(record.featured)],
        [collab ? '兑换联动角色' : '已兑换' + name, number(record.redeemed)],
        ...(banner?.hasRecruitBenefits ? [['周年招募计数', number(record.pulls - record.free)]] : []),
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        {record && <RecruitRecordStats record={record} poolName={name} featuredName={collab ? '自选 UP' : name} />}
        {record && <RecruitSsrHistory record={record} banner={banner} />}
        {record ? <button className="recruit-secondary" onClick={() => setPanel('reset')}>重置本池记录</button> : <p role="alert">{error}</p>}</>}
      {panel === 'reset' && <><p>清空{name}池的招募、持有和兑换记录？共用的黄金积分券余额会保留。{collab && '当前选择的 UP 也会保留。'}{banner?.dailyFree && '免费单抽资格仍按北京时间每日 04:00 刷新。'}</p>
        <footer><button onClick={() => setPanel('record')}>取消</button><button className="gold-action" onClick={clearRecord}>确认重置</button></footer></>}
      {panel === 'exchange' && <><p>从共用余额中扣除 200 张黄金积分券，兑换 1 名{upName}？当前持有 {number(tickets)} 张。</p>
        <footer><button onClick={() => setPanel(null)}>取消</button><button className="gold-action" onClick={() => draw('exchange')}>确认兑换</button></footer></>}
      </div>
    </RecruitDialog>}
  </>
}

function FeaturedStage({ banner, character, suspended, payment, probability, actions }) {
  const { movie } = presentations[banner.id]
  const poster = banner.id === 'marian' ? assetUrl('ui-assets/nikke/character-artwork/' + character.artworks[0].file) : media(movie + '-poster.webp')
  return <section className={'recruit-banner special-' + banner.id} aria-labelledby="recruit-name" style={{ '--banner-art': `url("${poster}")` }}>
    <RecruitmentMovie src={media(movie + '.mp4')} poster={poster} label={banner.name + '国际服展示影片'} suspended={suspended} />
    {payment}
    <div className="recruit-stage-controls">
      <div className="recruit-copy">
        {banner.id !== 'sky' && <>
          <p className="recruit-period">国际服四周年 · 2026 年特殊招募</p>
          <p className="recruit-pilgrim" lang="en">{character.corporation}</p>
          <p className="recruit-pickup" lang="en">PICK UP</p>
          <p className="recruit-special">特殊招募</p>
        </>}
        <h2 id="recruit-name">{banner.name}</h2>
        {probability}
        {banner.id !== 'sky' && <p className="recruit-rate">期间内，出现概率 UP！<b>{banner.pools[0].percent}%</b></p>}
      </div>
      {actions}
    </div>
  </section>
}
