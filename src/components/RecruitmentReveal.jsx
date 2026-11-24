import { useEffect, useState } from 'react'
import { assetUrl } from '../lib/roster.js'
import { playRecruitSound, stopRecruitSounds } from '../lib/recruitmentAudio.js'
import '../styles/recruitment-reveal.css'

const graphic = name => assetUrl('recruitment/reveal/' + name + '.webp')

export function recruitCompanyLogo(company, variant) {
  if (company === 'abnormal') return assetUrl('ui-assets/nikke/metadata/native/manufacturer/abnormal.png')
  return graphic(variant + '-' + company)
}

export default function RecruitmentReveal({ character, index, count, onNext, onSkip }) {
  const [stage, setStage] = useState('company')
  const ssr = character.original_rare === 'SSR'
  const company = character.corporation.toLowerCase()
  const artwork = assetUrl('ui-assets/nikke/character-artwork/' + character.artworks[0].file)
  const grade = character.original_rare.toLowerCase()
  const last = index + 1 === count

  useEffect(() => {
    playRecruitSound(ssr ? 'gacha_corp_transition_ssr_1' : 'gacha_corp_transition_normal_1')
    return stopRecruitSounds
  }, [ssr])

  useEffect(() => {
    if (stage === 'ready') return
    const companyStage = stage === 'company'
    const frames = companyStage ? (ssr ? 210 : 59) : (ssr ? 185 : 25)
    const timer = setTimeout(() => setStage(companyStage ? 'entering' : 'ready'), frames / 60 * 1000)
    return () => clearTimeout(timer)
  }, [stage, ssr])

  function advance() {
    stopRecruitSounds()
    if (stage === 'ready') onNext()
    else setStage(stage === 'company' ? 'entering' : 'ready')
  }

  return <div className={'recruit-scene grade-' + grade} data-stage={stage}>
    <img className="recruit-figure" src={artwork} alt="" />
    {stage === 'company' ? <div className="recruit-company">
      <div className="recruit-company-mark">
        <img src={recruitCompanyLogo(company, 'corp')} alt="" />
        {character.overSpec && company !== 'pilgrim' && <img className="recruit-overspec" src={graphic('overspec')} alt="超规格" />}
      </div>
      <strong lang="en">{character.corporation}</strong>
    </div> : <>
      <strong className="recruit-maker" lang="en" aria-hidden="true">{character.corporation}</strong>
      {stage === 'ready' && <div className="recruit-nameplate" style={{ backgroundImage: 'url(' + graphic('nameplate') + ')' }}>
        <strong>{character.nameCn}</strong>
        <span><small>{character.weapon_type}</small><img src={graphic('grade-' + grade)} alt={character.original_rare} /></span>
      </div>}
    </>}
    <div className="recruit-scene-tools"><span>{index + 1} / {count}</span>
      <button type="button" onClick={onSkip}>跳过演出 ▸▸</button></div>
    <button type="button" className="recruit-scene-advance" data-ui-sound="silent" onClick={advance}
      aria-label={stage === 'company' ? '快进到角色出场' : stage === 'entering' ? '显示角色名牌' : last ? '查看招募结果' : '下一位'}>
      {stage === 'ready' && <span>{last ? '查看招募结果' : '下一位'} ▸</span>}
    </button>
  </div>
}
