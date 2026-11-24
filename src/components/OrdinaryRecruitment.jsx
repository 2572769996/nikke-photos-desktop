import { useRef, useState } from 'react'
import { recruitMotionReduced } from '../lib/motionPreference.js'
import { assetUrl, BUILTIN_CHARACTERS } from '../lib/roster.js'
import { recruitDay } from '../lib/recruitment.js'
import {
  ORDINARY_KEY, bonusChoices, bonusPoints, emptyOrdinaryRecord, isWishlistActive,
  ordinaryPools, ordinaryRecruit, readOrdinaryRecord, setOrdinaryWishlist,
} from '../lib/ordinaryRecruitment.js'
import RecruitmentResults, { RecruitmentHeader, RecruitmentPayment, RecruitCost, RecruitDialog, RecruitPoolRates } from './RecruitmentResults.jsx'
import OrdinaryWishlist from './OrdinaryWishlist.jsx'
import RecruitmentMovie from './RecruitmentMovie.jsx'
import RecruitSsrHistory from './RecruitSsrHistory.jsx'
import RecruitRecordStats from './RecruitRecordStats.jsx'
import '../styles/ordinary-recruitment.css'

const characters = new Map(BUILTIN_CHARACTERS.map(character => [character.resourceId, character]))
const panelTitles = { rates: '概率情报', record: '模拟记录', bonus: '追加招募', reset: '重置普通招募记录' }
const format = value => value.toLocaleString('zh-CN')

function loadOrdinary() {
  try {
    return { record: readOrdinaryRecord(localStorage), error: '' }
  } catch (problem) {
    return { record: null, error: '无法读取普通招募记录：' + problem.message }
  }
}

export default function OrdinaryRecruitment({ day }) {
  const [{ record, error }, setSimulation] = useState(loadOrdinary)
  const [currency, setCurrency] = useState('gems')
  const [panel, setPanel] = useState(null)
  const [choice, setChoice] = useState('')
  const [batch, setBatch] = useState(null)
  const [phase, setPhase] = useState('idle')
  const serial = useRef(0)
  const activeWishlist = record && isWishlistActive(record)
  const wishCount = record ? Object.values(record.wishlist).reduce((sum, ids) => sum + ids.length, 0) : 0
  const availablePoints = record ? bonusPoints(record) : 0
  const voucher = currency === 'vouchers'

  function commit(next) {
    localStorage.setItem(ORDINARY_KEY, JSON.stringify(next))
    setSimulation({ record: next, error: '' })
  }
  function showError(problem) {
    setSimulation(previous => ({ ...previous, error: problem.message }))
    setPanel(null)
    setBatch(null)
  }
  function draw(kind, payment = currency) {
    if (batch && phase !== 'done') return
    try {
      const next = ordinaryRecruit(readOrdinaryRecord(localStorage), kind, recruitDay(), { currency: payment, bonusId: choice })
      commit(next.record)
      setPanel(null)
      setBatch({ serial: ++serial.current, pool: 'ordinary', kind, currency: payment, results: next.results, rewards: next.rewards })
      setPhase(kind === 'bonus' || recruitMotionReduced() ? 'done' : 'opening')
    } catch (problem) { showError(problem) }
  }
  function saveWishlist(wishlist) {
    try {
      commit(setOrdinaryWishlist(readOrdinaryRecord(localStorage), wishlist))
      setPanel(null)
    } catch (problem) { showError(problem) }
  }
  function reset() {
    try {
      localStorage.removeItem(ORDINARY_KEY)
      setSimulation({ record: emptyOrdinaryRecord(), error: '' })
      setPanel(null)
    } catch (problem) { showError(problem) }
  }

  return <>
    <RecruitmentHeader pool="ordinary" onRecord={() => setPanel('record')} onReset={() => setSimulation(loadOrdinary())} />
    {error && <p className="recruit-error" role="alert">{error}</p>}
    <section className="recruit-banner ordinary-banner" aria-labelledby="ordinary-title">
      <RecruitmentMovie src={assetUrl('recruitment/ordinary/banner.mp4')} poster={assetUrl('recruitment/ordinary/poster.webp')}
        label="国际服普通招募展示影片" suspended={Boolean(batch || panel)} />
      <RecruitmentPayment ordinary value={currency} onChange={setCurrency} />
      <div className="recruit-stage-controls ordinary-controls">
        <button className="ordinary-bonus-button" disabled={!record} onClick={() => { setChoice(''); setPanel('bonus') }}>
          <span className="ordinary-bonus-faces" aria-hidden="true">
            {bonusChoices.map(id => <img key={id} src={assetUrl(characters.get(id).avatar)} alt="" />)}
          </span>
          <img className="ordinary-bonus-title" src={assetUrl('recruitment/ordinary/bonus-title.webp')} alt="追加招募" /><small>{format(availablePoints)} 兑换点</small>
        </button>
        <div className="ordinary-options">
          <button type="button" className="recruit-probability" onClick={() => setPanel('rates')}>概率情报 <span aria-hidden="true">ⓘ</span></button>
          <button className="ordinary-wishlist-button" disabled={!record} onClick={() => setPanel('wishlist')}>
            {activeWishlist ? '编辑愿望清单' : '设置愿望清单'} <small>{wishCount} / 20</small>
          </button>
        </div>
        <div className="ordinary-heading">
          <h2 id="ordinary-title">普通招募</h2>
        </div>
        <div className="recruit-draw-actions" role="group" aria-label="普通招募操作">
          <button className="recruit-discount" disabled={!activeWishlist || record.lastDiscountDay === day} onClick={() => draw('discount', 'gems')}>
            <span>每日半价</span><small>{record?.lastDiscountDay === day ? '本日已使用' : <RecruitCost amount={150} />}</small>
          </button>
          <button className="recruit-one" disabled={!activeWishlist} onClick={() => draw('one')}>
            <span>招募 1 次</span><small><RecruitCost item={currency} amount={voucher ? 1 : 300} /></small>
          </button>
          <button className="recruit-ten" disabled={!activeWishlist} onClick={() => draw('ten')}>
            <span>招募 10 次</span><small><RecruitCost item={currency} amount={voucher ? 10 : 3000} /></small>
          </button>
        </div>
        {record && !activeWishlist && <p className="ordinary-wish-hint">招募前请先在愿望清单中为每组选择 5 名角色。</p>}
      </div>
    </section>
    <section className="recruit-console ordinary-console" aria-label="普通招募进度">
      <span>国际服常驻 · 自定义名单</span>
      <div className="ordinary-silver"><img src={assetUrl('recruitment/ordinary/silver-ticket.webp')} alt="" /><span>白银积分券</span><b>{format(record?.pulls ?? 0)}</b></div>
    </section>
    {batch && <RecruitmentResults key={batch.serial} batch={batch} phase={phase} onPhase={setPhase}
      onClose={() => { setBatch(null); setPhase('idle') }} onDraw={draw} />}
    {panel === 'wishlist' && <OrdinaryWishlist wishlist={record.wishlist} onSave={saveWishlist} onClose={() => setPanel(null)} />}
    {panel && panel !== 'wishlist' && <RecruitDialog title={panelTitles[panel]} onDismiss={() => setPanel(null)}>
      <div className="recruit-info">
        <header><h2>{panelTitles[panel]}</h2><button aria-label="关闭" onClick={() => setPanel(null)}>×</button></header>
        {panel === 'rates' && <>
          <p>名单以国际服 2026 年 11 月 19 日公示为基础，额外纳入思凯、玛丽安：女王和红莲：弑神。</p>
          {activeWishlist ? <RecruitPoolRates pools={ordinaryPools(record)} />
            : <p>招募前须先选满 20 名。朝圣者／超规格 5 人均分 0.5%，其余三家企业的 15 人均分 3.5%。SR 占 43%，R 占 53%。</p>}
          <p>每抽获得 1 张白银积分券。每日半价于北京时间 04:00 刷新。</p>
        </>}
        {panel === 'record' && <>
          {record && <dl>{[
            ['累计普通招募', format(record.pulls)],
            ['半价招募次数', format(record.discounts)], ['累计珠宝消耗', <RecruitCost amount={record.gemsSpent} />],
            ['累计普通招募券消耗', <RecruitCost amount={record.vouchersSpent} item="vouchers" />],
            ['白银积分券', format(record.pulls)], ['追加招募可用兑换点', format(availablePoints)],
            ['已追加招募', format(record.bonusClaims)],
          ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
          {record && <RecruitRecordStats record={record} poolName="常驻池 · 普通招募" featuredName={null} />}
          {record && <RecruitSsrHistory record={record} />}
          <button onClick={() => setPanel('reset')}>重置本池记录</button>
        </>}
        {panel === 'bonus' && <>
          <p>每次普通招募获得 1 兑换点，累计最多 1,000 点。每 100 点可从下列角色中任选一名。</p>
          <p>可用 <strong>{format(availablePoints)}</strong> 点，已兑换 <strong>{record.bonusClaims} / 10</strong> 次。</p>
          <fieldset className="ordinary-bonus-choices"><legend>选择兑换角色</legend>
            {bonusChoices.map(id => <label key={id}><input type="radio" name="ordinary-bonus" checked={choice === id} onChange={() => setChoice(id)} />
              <img src={assetUrl(characters.get(id).avatar)} alt="" />{characters.get(id).nameCn}
            </label>)}
          </fieldset>
          <footer><button onClick={() => setPanel(null)}>取消</button><button className="gold-action" disabled={!choice || availablePoints < 100} onClick={() => draw('bonus')}>使用 100 点兑换</button></footer>
        </>}
        {panel === 'reset' && <><p>清空普通招募的记录、愿望清单、白银积分券和追加招募进度？</p>
          <footer><button onClick={() => setPanel('record')}>取消</button><button className="gold-action" onClick={reset}>确认重置</button></footer></>}
      </div>
    </RecruitDialog>}
  </>
}
