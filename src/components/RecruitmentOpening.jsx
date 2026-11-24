import { useEffect, useMemo, useRef, useState } from 'react'
import { assetUrl, BUILTIN_CHARACTERS } from '../lib/roster.js'
import { stopRecruitSounds } from '../lib/recruitmentAudio.js'
import '../styles/recruitment-opening.css'

const rareById = new Map(BUILTIN_CHARACTERS.map(character => [character.resourceId, character.original_rare]))
const sprite = name => assetUrl('recruitment/gate/' + name + '.webp')
const lightCue = { R: 'gacha_light_green', SR: 'gacha_light_blue', SSR: 'gacha_light_red' }

// Audio track starts from page_gacha_intro_After and page_gacha_intro_AfterSSR, in milliseconds.
const doorCueTimes = { normal: [0, 1667, 2667, 4133], ssr: [0, 1550, 2733, 4963] }

function Units({ grades, final, revealed }) {
  return <div className={'rq-units ' + (final ? 'rq-final-units' : 'rq-loading-units')} aria-hidden="true">
    {grades.map((grade, index) => {
      const lit = !final || index < revealed
      const name = final && grade === 'SR' ? 'unit-sr' : 'unit-on'
      return <div key={index} style={{ '--slot': index }}>
        <img src={sprite('unit-off')} alt="" />
        {lit && (!final || grade !== 'R') && <img className="rq-unit-lit" src={sprite(name)} alt="" />}
      </div>
    })}
  </div>
}

export default function RecruitmentOpening({ batch, onComplete, onSkip, onCue, onRevealMusic }) {
  const [phase, setPhase] = useState('intro')
  const [revealed, setRevealed] = useState(0)
  const [pull, setPull] = useState(0)
  const surface = useRef(null)
  const drag = useRef(null)
  const grades = useMemo(() => batch.results.map(id => rareById.get(id)), [batch])
  const highest = grades.includes('SSR') ? 'SSR' : grades.includes('SR') ? 'SR' : 'R'
  const branch = highest === 'SSR' ? 'ssr' : 'normal'

  useEffect(() => {
    if (phase === 'ready') return onCue('gacha_ambient')
    const timers = []
    const at = (ms, fn) => timers.push(setTimeout(fn, ms))
    if (phase === 'intro') {
      at(0, () => onCue('gacha_intro'))
      at(7067, () => setPhase('ready'))
    }
    if (phase === 'release') {
      // PlayOpenBgm is on frame 278 in both door timelines.
      at(278 / 60 * 1000, onRevealMusic)
      doorCueTimes[branch].forEach((ms, i) => at(ms, () => onCue('gacha_open_' + (i + 1) + '_' + branch)))
      at(5199, () => onCue('gacha_open_finish'))
      grades.forEach((grade, index) => at(5833 + index * 100, () => {
        setRevealed(index + 1)
        if (grade !== 'R') onCue('gacha_icon_' + grade.toLowerCase())
      }))
      at(7217, onComplete)
    }
    return () => timers.forEach(clearTimeout)
  }, [phase, branch, grades, onComplete, onCue, onRevealMusic])

  function unlock() {
    drag.current = null
    setPull(1)
    onCue(lightCue[highest])
    onCue(highest === 'SSR' ? 'gacha_light_red_contact' : 'gacha_light_blue_contact')
    setPhase('release')
  }

  function startDrag(event) {
    if (!event.isPrimary || event.button !== 0) return
    event.preventDefault()
    const height = surface.current.clientHeight
    const wheel = event.currentTarget.getBoundingClientRect()
    // The red contact sits at 80% of the wheel. It meets the socket at 80% of the stage.
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, distance: height * .47 - wheel.height * .30 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveDrag(event) {
    const current = drag.current
    if (current?.id !== event.pointerId) return
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) >= 5) current.moved = true
    const progress = Math.max(0, (event.clientY - current.y) / current.distance)
    if (progress >= 1) unlock()
    else setPull(progress)
  }

  function endDrag(event) {
    const current = drag.current
    if (current?.id !== event.pointerId) return
    const dy = event.clientY - current.y
    const tapped = !current.moved && Math.hypot(event.clientX - current.x, dy) < 5
    if (dy >= current.distance || tapped) unlock()
    else cancelDrag()
  }

  function cancelDrag() {
    drag.current = null
    setPull(0)
  }

  function advance() {
    stopRecruitSounds()
    if (phase === 'intro') setPhase('ready')
    else onComplete()
  }

  const lightClass = phase === 'release' ? ' rq-light-' + highest : ''
  return <div ref={surface} className={'recruit-opening rq-gate rq-' + phase + lightClass}
    style={{ '--pull': pull }} onDragStart={event => event.preventDefault()} aria-label="招募闸门">
    <div className="rq-stage" aria-hidden="true" style={{ backgroundImage: 'url(' + sprite('wall') + ')' }}>
      <div className="rq-shaft" style={{ backgroundImage: 'url(' + sprite('shaft') + ')' }} />
      <div className="rq-core">
        <img className="rq-inner rq-inner-left" src={sprite('inner-left')} alt="" />
        <img className="rq-inner rq-inner-right" src={sprite('inner-right')} alt="" />
      </div>
      <div className="rq-leaves">
        <img className="rq-leaf rq-left" src={sprite('left')} alt="" />
        <img className="rq-leaf rq-right" src={sprite('right')} alt="" />
      </div>
      <div className="rq-laser" />
      <div className="rq-socket"><img src={sprite('socket')} alt="" /></div>
      <div className="rq-wheel"><img src={sprite('wheel')} alt="" /><i /></div>
      {phase === 'release' && <div className="rq-contact-flare"><i /></div>}
      <div className="rq-flash" />
    </div>
    {phase === 'intro' && <div className="rq-lift" aria-hidden="true">
      <div className="rq-lift-display"><img className="rq-arrow" src={sprite('arrow')} alt="" />
        <img className="rq-ascending" src={sprite('ascending')} alt="" />
        <img className="rq-recruitment" src={sprite('recruitment')} alt="" />
      </div><Units grades={grades} />
    </div>}
    {phase === 'release' && <Units grades={grades} final revealed={revealed} />}
    {phase !== 'ready' && <button key={phase} type="button" className="rq-advance" data-ui-sound="silent"
      aria-label={phase === 'intro' ? '快进到拉锁' : '快进到角色揭晓'} onClick={advance} />}
    {phase === 'ready' && <><button type="button" className="recruit-gate-trigger" data-ui-sound="silent"
      aria-label="开启闸门" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag}
      onPointerCancel={cancelDrag} onClick={event => { if (event.detail === 0) unlock() }} />
      <p className="rq-hint">向下拖动锁扣，或点击开启</p></>}
    <button type="button" className="rq-skip" onClick={onSkip}>跳过演出 ›</button>
  </div>
}

