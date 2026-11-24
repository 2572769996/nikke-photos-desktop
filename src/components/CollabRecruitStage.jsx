import preset from '../data/collab-preset.json'
import { assetUrl } from '../lib/roster.js'
import '../styles/collab-stage.css'

export const centered = { x: 50, y: 50, scale: 100 }

export function lineup(ids) {
  const columns = Math.max(1, Math.min(ids.length, 6))
  const rows = Math.ceil(ids.length / columns)
  return Object.fromEntries(ids.map((id, i) => {
    const row = Math.floor(i / columns)
    const inRow = Math.min(columns, ids.length - row * columns)
    return [id, { x: Math.round((i % columns + .5) / inRow * 84 + 8),
      y: Math.round((row + .5) * 100 / rows), scale: Math.round(98 / rows) }]
  }))
}

export function CollabScene({ layout, ids, byId, soloId, onChoose }) {
  const defaults = lineup(ids)
  const backdrop = layout.background
  return <div className="cs-view">
    <img className="cs-backdrop" src={layout.image?.src ?? assetUrl('recruitment/gate/wall.webp')} alt="" draggable={false}
      style={{ left: backdrop.x + '%', top: backdrop.y + '%', transform: 'translate(-50%, -50%) scale(' + backdrop.scale / 100 + ')' }} />
    {(soloId ? [soloId] : ids).map((id, index) => {
      const character = byId.get(id)
      const point = soloId ? layout.solo[id] ?? centered : layout.group[id] ?? defaults[id]
      return <button type="button" key={id} className="cs-figure" data-layer-id={id} aria-label={'指定 UP：' + character.nameCn}
        style={{ left: point.x + '%', top: point.y + '%', height: point.scale + '%', zIndex: index + 1 }}
        onClick={() => onChoose(id)}>
        <img src={assetUrl('ui-assets/nikke/character-artwork/' + character.artworks[0].file)} alt="" draggable={false} />
      </button>
    })}
  </div>
}

export default function CollabRecruitStage({ characters, featuredId, onSelect, children }) {
  const byId = new Map(characters.map(character => [character.resourceId, character]))
  const { memberIds } = preset
  return <section className="collab-stage" aria-label="联动自选招募">
    <header className="cs-stage-head"><div>
      <h2>{featuredId ? byId.get(featuredId).nameCn : '联动自选招募'}</h2>
      <span>{featuredId ? '当前 UP 角色' : memberIds.length ? '点击立绘指定 UP 角色' : '本期暂无联动角色'}</span>
    </div>
    <div className="cs-stage-tools">
      <select aria-label="指定 UP 角色" value={featuredId || ''} disabled={!memberIds.length} onChange={e => onSelect(e.target.value || null)}>
        <option value="">{featuredId ? '返回群像' : '选择 UP 角色'}</option>
        {memberIds.map(id => <option key={id} value={id}>{byId.get(id).nameCn}</option>)}
      </select>
    </div></header>
    <CollabScene layout={preset.layout} ids={memberIds} byId={byId} soloId={featuredId} onChoose={onSelect} />
    <div className="cs-actions">{children}</div>
  </section>
}
