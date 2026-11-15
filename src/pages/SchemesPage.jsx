// 录入模板页（「更多」里的入口）：与数据录入页的弹窗共用同一份管理界面，这里不提供「应用」
import { useLocation, useNavigate } from 'react-router-dom'
import SchemeManager from '../components/SchemeManager.jsx'
import { t } from '../lib/i18n.js'

export default function SchemesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const goBack = () => {
    if (location.key !== 'default') navigate(-1)
    else navigate('/my')
  }

  return (
    <main className="page">
      <button type="button" className="back" onClick={goBack}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M12.5 8h-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M7 4 3 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t('返回')}
      </button>

      <div className="page-head">
        <div>
          <h1>{t('录入模板')}</h1>
          <div className="desc">录入模板属于当前存档，可在数据录入页应用到角色。</div>
        </div>
      </div>

      <SchemeManager />
    </main>
  )
}
