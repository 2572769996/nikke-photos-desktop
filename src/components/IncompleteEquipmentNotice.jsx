import { Link } from 'react-router-dom'
import { CHARACTERS, displayName } from '../lib/roster.js'
import { SLOT_LABELS } from '../lib/cardModel.js'
import { isFullyRecorded } from '../lib/statsModel.js'

export default function IncompleteEquipmentNotice({ records }) {
  const incomplete = CHARACTERS.filter(character => records[character.nameCode] && !isFullyRecorded(records[character.nameCode]))
  return <div className="stats-paused">
    <p>每名角色的四件装备都至少录入一条词条后，才可加入统计表。</p>
    {incomplete.length ? <details>
      <summary>{incomplete.length} 名已录入角色待补齐装备</summary>
      <ul>{incomplete.map(character => {
        const equipment = records[character.nameCode].equipments || []
        const missing = SLOT_LABELS.filter((_, index) => !Array.isArray(equipment[index]) || !equipment[index].some(line => line?.functionType))
        return <li key={character.nameCode}>
          <span>{displayName(character)} · 缺少{missing.join('、')}</span>
          <Link to={`/data?code=${character.nameCode}`}>补齐装备</Link>
        </li>
      })}</ul>
    </details> : <Link to="/data">前往数据录入</Link>}
  </div>
}
