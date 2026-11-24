import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { recruitMotionReduced, subscribeMotionPreference } from '../lib/motionPreference.js'
import { Link } from 'react-router-dom'
import { assetUrl, BUILTIN_CHARACTERS } from '../lib/roster.js'
import { specialRecruitBanners } from '../lib/recruitment.js'
import { resetAllRecruitment } from '../lib/resetRecruitment.js'
import { useRecruitMusic, playRecruitSound, stopRecruitSounds } from '../lib/recruitmentAudio.js'
import RecruitmentOpening from './RecruitmentOpening.jsx'
import RecruitmentReveal, { recruitCompanyLogo } from './RecruitmentReveal.jsx'
import '../styles/recruitment-result.css'

const characters = new Map(BUILTIN_CHARACTERS.map(character => [character.resourceId, character]))
const media = file => assetUrl('recruitment/' + file)

export function RecruitmentHeader({ pool, onRecord, onReset }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [didReset, setDidReset] = useState(false)

  useEffect(() => {
    if (!didReset) return
    const timer = setTimeout(() => setDidReset(false), 3500)
    return () => clearTimeout(timer)
  }, [didReset])

  function confirmReset() {
    try {
      resetAllRecruitment(localStorage)
      onReset()
      setConfirming(false)
      setDidReset(true)
    } catch (problem) {
      setError(problem.message)
    }
  }

  return <><header className="recruit-header"><h1>招募模拟</h1>
    <nav className="recruit-pools" aria-label="选择招募卡池">
      {Object.values(specialRecruitBanners).map(banner =>
        <Link key={banner.id} to={banner.id === 'marian' ? '/recruitment' : '/recruitment?pool=' + banner.id}
          aria-current={pool === banner.id ? 'page' : undefined}>{banner.name}</Link>)}
      <Link to="/recruitment?pool=ordinary" aria-current={pool === 'ordinary' ? 'page' : undefined}>常驻池 · 普通招募</Link>
      <Link to="/recruitment?pool=collab" aria-current={pool === 'collab' ? 'page' : undefined}>联动自选</Link>
    </nav>
    <button type="button" onClick={onRecord}>模拟记录</button>
    <button type="button" className="recruit-reset-all" onClick={() => {
      setError('')
      setDidReset(false)
      setConfirming(true)
    }}>全局重置</button>
  </header>
    {confirming && <RecruitDialog title="重置全部招募记录？" onDismiss={() => setConfirming(false)}>
      <div className="recruit-info">
        <h2>重置全部招募记录？</h2>
        <p>五个卡池的抽数、角色持有、消费和兑换记录将清空。黄金积分券、白银积分券和追加招募积分全部归零。确认后无法撤销。</p>
        <p>常驻愿望清单和联动 UP 选择会保留，每日免费与半价次数会重置。</p>
        {error && <p className="recruit-error" role="alert">{error}</p>}
        <footer><button type="button" onClick={() => setConfirming(false)}>取消</button>
          <button type="button" className="recruit-reset-confirm" onClick={confirmReset}>确认全局重置</button></footer>
      </div>
    </RecruitDialog>}
    {didReset && <p className="recruit-reset-status" role="status">全部招募记录和积分券已归零。</p>}
  </>
}

const costItems = {
  gems: { image: 'gem.webp', name: '模拟珠宝' },
  vouchers: { image: 'ordinary/voucher.webp', name: '普通招募券' },
  advanced: { image: 'advanced-voucher.webp', name: '高级招募券' },
}

export function RecruitCost({ amount, item = 'gems' }) {
  return <span className="recruit-gem-amount">
    <img src={media(costItems[item].image)} alt={costItems[item].name} /> × {amount.toLocaleString('zh-CN')}
  </span>
}

export function RecruitmentPayment({ value, onChange, ordinary = false }) {
  return <div className={'recruit-payment' + (ordinary ? ' ordinary-payment' : '')} role="group" aria-label="单抽与十连使用的道具">
    <button type="button" aria-pressed={value === 'gems'} onClick={() => onChange('gems')}>珠宝</button>
    <button type="button" aria-pressed={value === 'vouchers'} onClick={() => onChange('vouchers')}>{ordinary ? '普通招募券' : '高级招募券'}</button>
  </div>
}

export function RecruitPoolRates({ pools }) {
  return pools.map(({ label, percent, members }) => <details className="recruit-pool" key={label}>
    <summary>{members.length === 1 ? 'SSR · ' + characters.get(members[0]).nameCn : label}<small>{members.length} 名</small><b>{percent}%</b></summary>
    <p>组内均分 {percent}%，每名 {(percent / members.length).toFixed(4)}%（公示精度）。</p>
    <ul>{members.map(id => <li key={id}>{characters.get(id).nameCn}</li>)}</ul>
  </details>)
}

export function RecruitDialog({ title, onDismiss, className = '', children }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className={'recruit-dialog ' + className} aria-label={title}
    onCancel={event => { event.preventDefault(); onDismiss() }}>
    {children}
  </dialog>
}

// page_gacha_result_new, slot_rotation start frame and duration at 60 fps.
const resultSlots = [[10, 30], [15, 30], [20, 33], [25, 33], [30, 31], [38, 35], [43, 35], [48, 32], [53, 33], [61, 35]]

function ResultCard({ id, index, reward, animated, featured }) {
  const character = characters.get(id)
  const grade = character.original_rare
  const company = character.corporation.toLowerCase()
  const [start, duration] = resultSlots[index]
  const rewardText = reward === 'new' ? '首次获得' : reward === 'body' ? '备用躯体 ×1' : reward ? '躯体标签 ×' + reward : ''
  const label = [character.nameCn, grade, featured && '当期 UP', rewardText].filter(Boolean).join(' · ')
  return <li className={'recruit-card grade-' + grade} title={label}
    style={{ '--column': index % 5, '--slot-start': start / 60 + 's', '--slot-duration': duration / 60 + 's' }}>
    <div className="recruit-card-face">
      <img className="recruit-card-mark" src={media('result/back-' + grade.toLowerCase() + '.webp')} alt="" />
      <img className="recruit-portrait" src={media('result/portraits/' + id + '.webp')} alt="" />
      <img className="recruit-grade" src={media(grade.toLowerCase() + '.webp')} alt="" />
      {animated && <img className="recruit-result-logo" src={recruitCompanyLogo(company, 'result')} alt="" />}
    </div>
    {reward === 'new' && <img className="recruit-card-new" src={media('result/new.webp')} alt="" />}
    {reward && reward !== 'new' && <div className="recruit-card-reward" aria-hidden="true">
      <img src={reward === 'body' ? assetUrl(character.avatar) : media('result/body-label.webp')} alt="" />
      <b>×{reward === 'body' ? 1 : reward}</b>
    </div>}
    <span className="recruit-card-name">{label}</span>
  </li>
}

export default function RecruitmentResults({ batch, phase, onPhase, onClose, onDraw }) {
  const exchange = batch.kind === 'exchange'
  const ordinary = batch.pool === 'ordinary'
  const bonus = batch.kind === 'bonus'
  const title = exchange || bonus ? '兑换成功' : '招募结果'
  const drawCount = batch.kind === 'ten' ? 10 : 1
  const voucher = batch.currency === 'vouchers'
  const redrawItem = voucher ? (ordinary ? 'vouchers' : 'advanced') : 'gems'
  const ticketName = ordinary ? '白银积分券' : '黄金积分券'
  const [index, setIndex] = useState(0)
  const [gateMusic, setGateMusic] = useState('gate')
  const reduced = useSyncExternalStore(subscribeMotionPreference, recruitMotionReduced)
  useEffect(() => {
    if (reduced && phase !== 'done') {
      stopRecruitSounds()
      onPhase('done')
    }
  }, [reduced, phase, onPhase])
  const animatedSummary = phase === 'summary'
  const musicStage = phase === 'opening' ? gateMusic : phase === 'character' ? 'reveal' : 'result'
  useRecruitMusic(musicStage)
  const startRevealMusic = useCallback(() => setGateMusic('reveal'), [])
  const showCharacter = useCallback(() => onPhase('character'), [onPhase])
  useEffect(() => stopRecruitSounds, [])
  useEffect(() => {
    if (!animatedSummary) return
    const [start, duration] = resultSlots[batch.results.length - 1]
    const timers = [setTimeout(() => onPhase('done'), (start + duration) / 60 * 1000)]
    batch.results.forEach((id, slot) => {
      if (characters.get(id).original_rare === 'SSR') timers.push(setTimeout(
        () => playRecruitSound('gacha_characterslot_ssr'), resultSlots[slot][0] / 60 * 1000))
    })
    return () => timers.forEach(clearTimeout)
  }, [animatedSummary, batch, onPhase])

  function onSkip() {
    stopRecruitSounds()
    onPhase('done')
  }
  function nextCharacter() {
    if (index + 1 === batch.results.length) onPhase('summary')
    else setIndex(index + 1)
  }

  return <RecruitDialog title={title} onDismiss={phase === 'done' ? onClose : onSkip} className="recruit-results">
    {phase === 'opening' ? <RecruitmentOpening batch={batch} onCue={playRecruitSound}
      onRevealMusic={startRevealMusic} onComplete={showCharacter} onSkip={onSkip} />
    : phase === 'character' ? <RecruitmentReveal key={index} character={characters.get(batch.results[index])}
        index={index} count={batch.results.length} onNext={nextCharacter} onSkip={onSkip} />
    : <div className="recruit-result-body">
      <header className="recruit-result-title">
        <img src={media('result/title-mark.webp')} alt="" />
        <img src={media('result/title-caption.webp')} alt="NIKKE PROJECT · RECRUITMENT RESULT" />
        {(exchange || bonus) && <h2>{title}</h2>}
      </header>
      <ul className={'recruit-card-grid' + (batch.results.length === 1 ? ' single-card' : '') + (animatedSummary ? ' is-animated' : '')}>
        {batch.results.map((id, i) => <ResultCard key={i} id={id} index={i} reward={batch.rewards[i]} animated={animatedSummary} featured={id === batch.featuredId} />)}
      </ul>
      {animatedSummary ? <button type="button" className="recruit-summary-skip" data-ui-sound="silent" onClick={onSkip}>
        <span>立即显示全部</span>
      </button> : <div className="recruit-result-actions">
        <button type="button" className="recruit-confirm" onClick={onClose}>确认</button>
        {!exchange && !bonus && <div className="recruit-redraw-group">
          <button type="button" className="recruit-redraw" aria-describedby="recruit-redraw-cost"
            onClick={() => onDraw(batch.kind === 'ten' ? 'ten' : 'one', batch.currency)}>再次招募</button>
          <small id="recruit-redraw-cost"><RecruitCost amount={voucher ? drawCount : drawCount * 300} item={redrawItem} /></small>
        </div>}
      </div>}
      {batch.kind !== 'free' && !bonus && <small className="recruit-mileage-earned" title={ticketName}>
        <img src={media(ordinary ? 'ordinary/silver-ticket.webp' : 'result/gold-ticket.webp')} alt={ticketName} />
        <b>{exchange ? '−200' : '+' + batch.results.length}</b>
      </small>}
    </div>}
  </RecruitDialog>
}
