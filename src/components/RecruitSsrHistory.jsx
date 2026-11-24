import { assetUrl, BUILTIN_CHARACTERS } from '../lib/roster.js'
import { summarizeRecruitSSR } from '../lib/recruitment.js'

const characters = new Map(BUILTIN_CHARACTERS.map(character => [character.resourceId, character]))

export default function RecruitSsrHistory({ record, banner }) {
  const { total, rows, unattributed } = summarizeRecruitSSR(record, banner)
  return <section className="recruit-ssr-history" aria-label="SSR 抽获明细">
    <h3>SSR 抽获明细</h3>
    <p>{unattributed ? '已确认 ' : ''}<strong>{rows.length}</strong> 种角色 · 共抽中 <strong>{total}</strong> 次</p>
    {rows.length > 0 && <ul>{rows.map(({ id, count }) => {
      const character = characters.get(id)
      return <li key={id}><img src={assetUrl(character.avatar)} alt="" loading="lazy" />
        <span>{character.nameCn}</span><b>{count} 次</b></li>
    })}</ul>}
    {unattributed > 0 && <p>旧记录中另有 {unattributed} 次 SSR 抽取无法确认角色，已计入总次数。</p>}
  </section>
}
