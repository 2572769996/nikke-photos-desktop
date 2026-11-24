import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ordinaryWishlistGroups } from '../lib/ordinaryRecruitment.js'
import { BUILTIN_CHARACTERS, TAXONOMY, applyFilters, assetUrl, countActiveFilters } from '../lib/roster.js'
import CharacterSearchBox from './CharacterSearchBox.jsx'
import '../styles/ordinary-wishlist.css'

const characters = new Map(BUILTIN_CHARACTERS.map(character => [character.resourceId, character]))
const filterGroups = TAXONOMY.filters.filter(group => group.key === 'use_burst_skill' || group.key === 'element')

function ScrollingName({ name, className }) {
  const viewport = useRef(null)
  const text = useRef(null)
  const [overflow, setOverflow] = useState(0)

  useLayoutEffect(() => {
    const measure = () => setOverflow(Math.max(0, text.current.offsetWidth - viewport.current.clientWidth))
    const observer = new ResizeObserver(measure)
    observer.observe(viewport.current)
    observer.observe(text.current)
    return () => observer.disconnect()
  }, [])

  return <span ref={viewport} className={'ow-name ' + className} data-overflow={overflow > 0}
    style={overflow > 0 ? { '--ow-name-shift': -overflow + 'px', '--ow-name-duration': Math.max(4, overflow / 12) + 's' } : undefined}>
    <span ref={text} className="ow-name-text">{name}</span>
  </span>
}

export default function OrdinaryWishlist({ wishlist, onSave, onClose }) {
  const dialog = useRef(null)
  const roster = useRef(null)
  const [draft, setDraft] = useState(wishlist)
  const [group, setGroup] = useState(ordinaryWishlistGroups[0])
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({})
  const selected = draft[group.id]
  const total = ordinaryWishlistGroups.reduce((count, item) => count + draft[item.id].length, 0)
  const candidates = applyFilters(group.members.map(id => characters.get(id)), { search: query, selected: filters })

  useEffect(() => { roster.current.scrollTop = 0 }, [group, query, filters])

  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])

  function selectGroup(item) {
    setGroup(item)
    setQuery('')
  }

  function toggleFilter(key, value) {
    setFilters(current => {
      const values = current[key] || []
      return { ...current, [key]: values.includes(value) ? values.filter(item => item !== value) : [...values, value] }
    })
  }

  function toggleCharacter(id) {
    setDraft(current => {
      const ids = current[group.id]
      const next = ids.includes(id) ? ids.filter(member => member !== id) : [...ids, id]
      return { ...current, [group.id]: next }
    })
  }

  return <dialog ref={dialog} className="ordinary-wishlist" aria-labelledby="ordinary-wishlist-title"
    onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="ow-heading">
      <h2 id="ordinary-wishlist-title">招募愿望清单</h2>
      <span aria-live="polite">{total} / 20</span>
    </header>
    <div className="ow-content">
      <div className="ow-groups" role="group" aria-label="愿望清单分组">
        {ordinaryWishlistGroups.map(item => {
          const ids = draft[item.id]
          return <button key={item.id} type="button" className="ow-group" aria-pressed={group.id === item.id}
            aria-label={[item.label, '已选 ' + ids.length + ' 人，共 5 人', ...ids.map(id => characters.get(id).nameCn)].join('，')} onClick={() => selectGroup(item)}>
            <span className="ow-company">
              <img src={assetUrl('recruitment/reveal/corp-' + item.id + '.webp')} alt="" />
              <span>{item.label}</span>
            </span>
            <span className="ow-slots" aria-hidden="true">
              {Array.from({ length: 5 }, (_, index) => {
                const character = characters.get(ids[index])
                return character
                  ? <span key={character.resourceId} title={character.nameCn}><img src={assetUrl(character.avatar)} alt="" />
                      <ScrollingName name={character.nameCn} className="ow-slot-name" /></span>
                  : <span key={'empty-' + index} className="ow-empty">＋</span>
              })}
            </span>
          </button>
        })}
      </div>
      <section className="ow-choices" aria-label={group.label + '候选角色'}>
        <header>
          <h3>{group.label}<small>已选 {selected.length} / 5</small></h3>
          <small aria-live="polite">匹配 {candidates.length} / {group.members.length} 名</small>
        </header>
        <div className="ow-toolbar">
          <CharacterSearchBox value={query} onChange={setQuery} ariaLabel="搜索本组角色" />
          {countActiveFilters(filters) > 0 && <button type="button" className="ow-clear-filters" onClick={() => setFilters({})}>清空筛选</button>}
          <div className="ow-filters">{filterGroups.map(filter => <fieldset key={filter.key} className="ow-filter-row">
            <legend>{filter.label}</legend>
            <div className="ow-filter-options">{filter.options.map(option =>
              <button key={option.value} type="button" aria-pressed={Boolean(filters[filter.key]?.includes(option.value))}
                onClick={() => toggleFilter(filter.key, option.value)}>
                <img src={assetUrl(option.icon)} alt="" /><span>{option.label}</span>
              </button>)}</div>
          </fieldset>)}</div>
        </div>
        <div ref={roster} className="ow-roster">
          {candidates.map(character => {
            const id = character.resourceId
            const checked = selected.includes(id)
            return <button key={id} type="button" title={character.nameCn} aria-pressed={checked}
              disabled={!checked && selected.length === 5} onClick={() => toggleCharacter(id)}>
              <img src={assetUrl(character.avatar)} alt="" loading="lazy" />
              <ScrollingName name={character.nameCn} className="ow-card-name" />
            </button>
          })}
          {candidates.length === 0 && <p>没有找到匹配的角色</p>}
        </div>
      </section>
    </div>
    <footer className="ow-footer">
      <span>{total === 20 ? '已选满，保存后即可按这份清单招募。'
        : `每组须选满 5 名，还差 ${20 - total} 名才能保存。`}</span>
      <button type="button" onClick={onClose}>取消</button>
      <button type="button" className="ow-save" disabled={total !== 20} onClick={() => onSave(draft)}>保存清单</button>
    </footer>
  </dialog>
}
