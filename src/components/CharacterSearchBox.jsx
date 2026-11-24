import { t } from '../lib/i18n.js'

export default function CharacterSearchBox({ value, onChange, ariaLabel = t('搜索角色') }) {
  return (
    <label className="search">
      <span className="icon">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10.6 10.6L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </span>
      <input
        aria-label={ariaLabel}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={t('搜索：中文名 / 英文名 / 资源号 / 拼音首字母')}
        spellCheck={false}
      />
      {value && (
        <button type="button" className="search-clear" onClick={() => onChange('')} aria-label={t('清空搜索')}>×</button>
      )}
    </label>
  )
}
